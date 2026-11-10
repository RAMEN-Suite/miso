import type { Diagnostic, ModelInstanceGraph, ModelInstanceNode, ModelInstanceRelation } from "@ramen-suite/core";
import type {
  ContentMedium,
  ElementDiagnostic,
  ElementGraph,
  ElementNode,
  ElementRelation,
  ModelContext,
  NodeStatus,
} from "../models/types.js";
import { BASE_NODE_REF } from "./ramen.js";
import { getBaseNodeRef, getContentMedium, isEmptyValue } from "./modelHelper.js";
import { checkSelector } from "./selector.js";

/**
 * Validation of data in the element format (see `ElementGraph` in `models/types.ts`) with RAMEN core: the elements are
 * mapped to RAMEN core's instance graph, validated with `validateInstances`, and the findings are mapped back to the
 * elements (uuid, property name, relation).
 *
 * - The state after a write is validated: deleted nodes and removed relations are left out.
 * - Empty values (see `isEmptyValue`) are left out, since RAMEN core only treats missing values as missing.
 * - The editor fields of text annotations ({@linkcode TEXT_ANNOTATION_EDITOR_FIELDS}) are not part of the model. They
 *   are left out of RAMEN core's validation and checked here instead.
 * - RAMEN core only checks that a `selector` has a `type`; whether annotations on a Content have one that fits the
 *   Content's medium is checked here (see `selector.ts`).
 * - Relations have no id of their own. RAMEN core needs one, so it is derived (`<from>_<relationId>_<to>`) and never
 *   stored.
 *
 * Mirrored on the client (`client/src/utils/helper/instanceMapper.ts`), keep both in sync.
 *
 * @packageDocumentation
 */

/** The value type of an editor field */
type EditorFieldType = "String" | "Boolean";

/**
 * The fields the text editor stores flat on annotations carried by a text Content, with their value types and whether
 * they are mandatory there. `isZeroPoint` is only set on zero-point annotations.
 */
export const TEXT_ANNOTATION_EDITOR_FIELDS: Readonly<Record<string, { type: EditorFieldType; required: boolean }>> = {
  text: { type: "String", required: true },
  isZeroPoint: { type: "Boolean", required: false },
};

/** Codes of the findings of the app's own checks */
export const ELEMENT_DIAGNOSTIC_CODE = {
  /** A node's labels couldn't be resolved to a node type, so it can't be validated */
  NODE_TYPE_UNRESOLVED: "MISO_NODE_TYPE_UNRESOLVED",
  /** The model has no relation definition (or several unrelated ones) for a relationship between these node types */
  RELATION_NOT_ALLOWED: "MISO_RELATION_NOT_ALLOWED",
  /** An editor field of a text annotation is missing */
  EDITOR_FIELD_REQUIRED: "MISO_EDITOR_FIELD_REQUIRED",
  /** An editor field of a text annotation has the wrong type */
  EDITOR_FIELD_INVALID: "MISO_EDITOR_FIELD_INVALID",
  /** An annotation on a Content has no selector */
  SELECTOR_REQUIRED: "MISO_SELECTOR_REQUIRED",
  /** The selector of an annotation on a Content doesn't fit the Content's medium or its selector type */
  SELECTOR_INVALID: "MISO_SELECTOR_INVALID",
} as const;

/** Statuses of elements that don't exist after a write */
const REMOVED_STATUSES: readonly NodeStatus[] = ["deleted", "removed"];

/** A relation resolved to its relation definition */
type ResolvedRelation = ElementRelation & { relationRef: string };

/** The instance ids RAMEN core accepts: at least 16 characters of `A-Z`, `a-z`, `0-9`, `_` and `-` */
const INSTANCE_ID_PATTERN = /^[A-Za-z0-9_-]{16,}$/;

/**
 * The id RAMEN core gets for a node: its uuid, or for uuids RAMEN core doesn't accept as id (legacy data, e.g. too
 * short) a prefixed hex encoding of it, which is valid, unique and long enough. Only used during validation; findings
 * name the uuid, and a uuid that isn't a UUID is still reported on the node (`uuid` property). The data is unaffected.
 *
 * @param {string} uuid - The node's uuid.
 * @returns {string} The instance id.
 */
function instanceIdOf(uuid: string): string {
  if (INSTANCE_ID_PATTERN.test(uuid)) {
    return uuid;
  }

  const hex: string = Array.from(new TextEncoder().encode(uuid), (byte) => byte.toString(16).padStart(2, "0")).join("");

  return `miso-instance-id-${hex}`;
}

/** The instance graph of some elements, and where each instance came from */
interface InstanceMapping {
  graph: ModelInstanceGraph;
  /** The element of each instance node, by index (the index of `graph.nodes`) */
  nodes: ElementNode[];
  /** The element of each instance relation, by index (the index of `graph.relations`) */
  relations: ElementRelation[];
  /** The app's own findings while mapping */
  diagnostics: ElementDiagnostic[];
}

/**
 * The id RAMEN core gets for a relation, which has no id of its own.
 *
 * @param {ResolvedRelation} relation - The relation.
 * @returns {string} `<from>_<relationId>_<to>`, with the instance ids of the ends (see {@linkcode instanceIdOf}) and the
 *   relation definition's id without its model prefix.
 */
export function relationInstanceId(relation: ResolvedRelation): string {
  const relationId: string = relation.relationRef.split(":").at(-1) ?? relation.relationRef;

  return `${instanceIdOf(relation.from)}_${relationId}_${instanceIdOf(relation.to)}`;
}

/**
 * Whether a node is an annotation, from its classifier's lineage.
 *
 * @param {ModelContext} context - The model context.
 * @param {ElementNode} node - The node.
 * @returns {boolean} `true` for annotations.
 */
function isAnnotation(context: ModelContext, node: ElementNode): boolean {
  return node.classifierRef !== null && getBaseNodeRef(context, node.classifierRef) === BASE_NODE_REF.Annotation;
}

/**
 * The properties RAMEN core validates: the data without empty values, and for annotations without the editor fields.
 *
 * @param {ModelContext} context - The model context.
 * @param {ElementNode} node - The node.
 * @returns {Record<string, unknown>} The properties.
 */
function toInstanceProperties(context: ModelContext, node: ElementNode): Record<string, unknown> {
  const annotation: boolean = isAnnotation(context, node);

  return Object.fromEntries(
    Object.entries(node.data).filter(
      ([name, value]) => !isEmptyValue(value) && !(annotation && name in TEXT_ANNOTATION_EDITOR_FIELDS),
    ),
  );
}

/**
 * Maps elements to RAMEN core's instance graph. Nodes whose labels couldn't be resolved are left out (with a finding),
 * and so are the relations of left out nodes and relations without a relation definition (`relationRef: null`).
 *
 * @param {ModelContext} context - The model context.
 * @param {ElementGraph} elements - The elements, e.g. the scope of a write with the written elements applied.
 * @returns {InstanceMapping} The instance graph and the element of each instance.
 */
export function toInstanceGraph(context: ModelContext, elements: ElementGraph): InstanceMapping {
  const diagnostics: ElementDiagnostic[] = [];
  const nodes: ElementNode[] = [];
  const instanceNodes: ModelInstanceNode[] = [];

  for (const node of elements.nodes) {
    if (node.status && REMOVED_STATUSES.includes(node.status)) {
      continue;
    }

    if (node.classifierRef === null) {
      diagnostics.push({
        severity: "error",
        code: ELEMENT_DIAGNOSTIC_CODE.NODE_TYPE_UNRESOLVED,
        message: "The node type couldn't be resolved, so the node can't be validated.",
        uuid: node.data.uuid,
      });
      continue;
    }

    nodes.push(node);
    instanceNodes.push({
      id: instanceIdOf(node.data.uuid),
      typeId: node.classifierRef,
      properties: toInstanceProperties(context, node),
    });
  }

  const mappedUuids = new Set<string>(nodes.map((node) => node.data.uuid));
  const relations: ResolvedRelation[] = elements.relations.filter(
    (relation): relation is ResolvedRelation =>
      relation.relationRef !== null &&
      !(relation.status && REMOVED_STATUSES.includes(relation.status)) &&
      mappedUuids.has(relation.from) &&
      mappedUuids.has(relation.to),
  );
  const instanceRelations: ModelInstanceRelation[] = relations.map((relation) => ({
    id: relationInstanceId(relation),
    typeId: relation.relationRef,
    fromId: instanceIdOf(relation.from),
    toId: instanceIdOf(relation.to),
  }));

  return { graph: { nodes: instanceNodes, relations: instanceRelations }, nodes, relations, diagnostics };
}

/**
 * Checks the annotations carried by a Content (an incoming relation from a Content node) for what RAMEN core leaves to
 * the app: their selector on every Content, and their editor fields on text Contents.
 *
 * @param {ModelContext} context - The model context.
 * @param {InstanceMapping} mapping - The mapped elements.
 * @returns {ElementDiagnostic[]} The findings.
 */
function checkContentAnnotations(context: ModelContext, mapping: InstanceMapping): ElementDiagnostic[] {
  const mediumByContent = new Map<string, ContentMedium>(
    mapping.nodes.flatMap((node): [string, ContentMedium][] =>
      node.classifierRef && getBaseNodeRef(context, node.classifierRef) === BASE_NODE_REF.Content
        ? [[node.data.uuid, getContentMedium(context, node.classifierRef)]]
        : [],
    ),
  );
  const carrierMediumByUuid = new Map<string, ContentMedium>();

  for (const relation of mapping.relations) {
    const medium: ContentMedium | undefined = mediumByContent.get(relation.from);

    if (medium) {
      carrierMediumByUuid.set(relation.to, medium);
    }
  }

  const diagnostics: ElementDiagnostic[] = [];

  for (const node of mapping.nodes) {
    const medium: ContentMedium | undefined = carrierMediumByUuid.get(node.data.uuid);

    if (!medium || !isAnnotation(context, node)) {
      continue;
    }

    diagnostics.push(...checkAnnotationSelector(node, medium));

    if (medium === "text") {
      diagnostics.push(...checkEditorFields(node));
    }
  }

  return diagnostics;
}

/**
 * Checks the selector of an annotation on a Content: it is required and must be valid for the Content's medium (see
 * `checkSelector` in `selector.ts`).
 *
 * @param {ElementNode} node - The annotation.
 * @param {ContentMedium} medium - The medium of the annotated Content.
 * @returns {ElementDiagnostic[]} The findings.
 */
function checkAnnotationSelector(node: ElementNode, medium: ContentMedium): ElementDiagnostic[] {
  const selector: unknown = node.data.selector;

  if (selector === undefined || selector === null) {
    return [
      {
        severity: "error",
        code: ELEMENT_DIAGNOSTIC_CODE.SELECTOR_REQUIRED,
        message: "Annotations on a Content need a selector.",
        uuid: node.data.uuid,
        attribute: "selector",
      },
    ];
  }

  return checkSelector(selector, medium).map((message) => ({
    severity: "error",
    code: ELEMENT_DIAGNOSTIC_CODE.SELECTOR_INVALID,
    message,
    uuid: node.data.uuid,
    attribute: "selector",
  }));
}

/**
 * Checks the editor fields of an annotation on a text Content: the mandatory ones must be present, and all present ones
 * must have their type, see {@linkcode TEXT_ANNOTATION_EDITOR_FIELDS}.
 *
 * @param {ElementNode} node - The annotation.
 * @returns {ElementDiagnostic[]} The findings.
 */
function checkEditorFields(node: ElementNode): ElementDiagnostic[] {
  const diagnostics: ElementDiagnostic[] = [];

  for (const [name, { type: valueType, required }] of Object.entries(TEXT_ANNOTATION_EDITOR_FIELDS)) {
    const value: unknown = node.data[name];

    if (value === undefined || value === null) {
      if (!required) {
        continue;
      }

      diagnostics.push({
        severity: "error",
        code: ELEMENT_DIAGNOSTIC_CODE.EDITOR_FIELD_REQUIRED,
        message: `Property '${name}' is required on text annotations.`,
        uuid: node.data.uuid,
        attribute: name,
      });
    } else if (!hasValueType(value, valueType)) {
      diagnostics.push({
        severity: "error",
        code: ELEMENT_DIAGNOSTIC_CODE.EDITOR_FIELD_INVALID,
        message: `Property '${name}' must be of type ${valueType}.`,
        uuid: node.data.uuid,
        attribute: name,
      });
    }
  }

  return diagnostics;
}

/**
 * Whether a value has one of the editor fields' value types.
 *
 * @param {unknown} value - The value.
 * @param {EditorFieldType} valueType - The expected type.
 * @returns {boolean} `true` if the value fits.
 */
function hasValueType(value: unknown, valueType: EditorFieldType): boolean {
  if (valueType === "String") {
    return typeof value === "string";
  } else {
    return typeof value === "boolean";
  }
}

/**
 * Maps one of RAMEN core's findings back to the element it belongs to: by its path (`/nodes/<index>/properties/<name>`,
 * `/relations/<index>`), otherwise by the affected instance (relation counts only name the node).
 *
 * @param {Diagnostic} diagnostic - RAMEN core's finding.
 * @param {InstanceMapping} mapping - The mapped elements.
 * @returns {ElementDiagnostic} The finding with the element it belongs to, if it could be found.
 */
function toElementDiagnostic(diagnostic: Diagnostic, mapping: InstanceMapping): ElementDiagnostic {
  const result: ElementDiagnostic = { severity: diagnostic.severity, code: diagnostic.code, message: diagnostic.message };
  const nodeMatch: RegExpMatchArray | null = /^\/nodes\/(\d+)(?:\/properties\/([^/]+))?/.exec(diagnostic.path ?? "");
  const relationMatch: RegExpMatchArray | null = /^\/relations\/(\d+)/.exec(diagnostic.path ?? "");
  const node: ElementNode | undefined = nodeMatch ? mapping.nodes[Number(nodeMatch[1])] : undefined;
  const relation: ElementRelation | undefined = relationMatch ? mapping.relations[Number(relationMatch[1])] : undefined;

  if (node) {
    result.uuid = node.data.uuid;

    if (nodeMatch?.[2]) {
      result.attribute = nodeMatch[2];
    }
  } else if (relation) {
    result.relation = { relationRef: relation.relationRef, from: relation.from, to: relation.to };
  } else {
    const instanceId: string | undefined = diagnostic.instanceId ?? diagnostic.ref;
    const byInstance: ElementNode | undefined = mapping.nodes.find(
      (candidate) => instanceIdOf(candidate.data.uuid) === instanceId,
    );

    if (byInstance) {
      result.uuid = byInstance.data.uuid;
    }
  }

  return result;
}

/**
 * Validates elements with RAMEN core and the app's own checks. Validates the whole graph, so pass every element the
 * rules need (e.g. an annotation's carrier); with `touched`, only the findings of those elements are returned, since
 * the edges of a partial graph (e.g. a carrier without its parent) produce findings that don't belong to the write.
 *
 * @param {ModelContext} context - The model context.
 * @param {ElementGraph} elements - The elements.
 * @param {Set<string>} [touched] - uuids of the nodes whose findings are wanted. Findings of relations count if one of
 *   their ends is touched. All findings if omitted.
 * @returns {ElementDiagnostic[]} The findings.
 */
export function validateElements(context: ModelContext, elements: ElementGraph, touched?: Set<string>): ElementDiagnostic[] {
  const mapping: InstanceMapping = toInstanceGraph(context, elements);
  const result = context.model.validateInstances(mapping.graph);
  const diagnostics: ElementDiagnostic[] = [
    ...mapping.diagnostics,
    ...result.diagnostics.map((diagnostic) => toElementDiagnostic(diagnostic, mapping)),
    ...checkContentAnnotations(context, mapping),
  ];

  if (!touched) {
    return diagnostics;
  }

  return diagnostics.filter(
    (diagnostic) =>
      (diagnostic.uuid !== undefined && touched.has(diagnostic.uuid)) ||
      (diagnostic.relation !== undefined && (touched.has(diagnostic.relation.from) || touched.has(diagnostic.relation.to))),
  );
}
