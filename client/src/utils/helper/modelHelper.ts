import { RAMEN_MODEL, Attribute, BuiltinType, Constraint, DataType, Node, RamenModel, Relation } from "@ramen-suite/core";
import {
  BASE_NODE_REF,
  BASE_NODE_REFS,
  BUILTIN_TYPES,
  VALUE_TYPE_BY_FORMAT,
  AttributeValueType,
  FormatValueType,
} from "../../config/ramen";
import type {
  AnnotationNode,
  AnnotationShapeConfig,
  AttributeConfig,
  BaseNodeData,
  BaseNodeLabel,
  CollectionNode,
  ContentMedium,
  ContentTypeConfig,
  EntityNode,
  ModelAnnotationShape,
  ModelAttribute,
  ModelContext,
  Node as DataNode,
  NodeStatusObject,
  NodeTypeOption,
  RefResolution,
  TextNode,
} from "../../models/types";
import type { ConfigBaseEntry, ConfigMapping, MisoConfig } from "../../schemas/misoConfig.schema";

/**
 * Accessors on the model and the config. Everything model-related and the app's settings of model elements are read
 * through these functions.
 *
 * - Model questions (lineage, attributes, data types, annotation shapes of a node, value validation) are answered by
 *   RAMEN core.
 * - The settings of an element come from its `ext.miso` block. For the RAMEN base level they are in `miso.base`, since
 *   RAMEN core allows no `ext` there. The editor's native types are mapped in `miso.mappings`.
 *
 * All functions take a `ModelContext` and work with RAMEN core's types; `ModelAttribute` only adds the declaring element
 * to an attribute (both in `models/types.ts`). The model constants are in `config/ramen.ts`. Elements are referenced by
 * qualified refs (`<modelId>:<id>`, see {@linkcode qualify}).
 *
 * Mirrored on the server (`server/src/utils/modelHelper.ts`), keep both in sync.
 *
 * @packageDocumentation
 */

/**
 * Qualifies a local ref (without model prefix) with the model of the element that holds it.
 *
 * @param {string} ref - A local or qualified ref.
 * @param {string} contextModelId - The model of the element that holds the ref.
 * @returns {string} The qualified ref (`<modelId>:<id>`).
 */
export function qualify(ref: string, contextModelId: string): string {
  if (ref.includes(":")) {
    return ref;
  } else {
    return `${contextModelId}:${ref}`;
  }
}

/**
 * The model ID of a qualified ref, i.e. the part before the colon.
 *
 * @param {string} qualifiedRef - A qualified ref (`<modelId>:<id>`).
 * @returns {string} The model ID.
 */
function modelIdOf(qualifiedRef: string): string {
  return qualifiedRef.split(":")[0];
}

/**
 * Whether a ref points into the RAMEN base level. RAMEN core doesn't allow `ext` there, so the config of these
 * elements lives in `miso.base`.
 *
 * @param {string} qualifiedRef - A qualified ref (`<modelId>:<id>`).
 * @returns {boolean} `true` if the ref belongs to the RAMEN base model.
 */
function isBaseLevel(qualifiedRef: string): boolean {
  return modelIdOf(qualifiedRef) === RAMEN_MODEL.id;
}

/**
 * Creates the context the accessors work on.
 *
 * @param {MisoConfig} config - The validated Miso config.
 * @param {RamenModel} model - The model of the config, imported by RAMEN core.
 * @returns {ModelContext} The context.
 */
export function createModelContext(config: MisoConfig, model: RamenModel): ModelContext {
  return { model, config };
}

/**
 * Looks up an annotation shape in the `annotations` list of the config's model, by comparing `<modelId>:<id>` of each
 * entry with the given ref. Also tells shapes and nodes apart: node refs never match, since nodes are classifiers.
 *
 * @param {ModelContext} context - The model context.
 * @param {string} ref - Qualified ref (`<modelId>:<id>`) of the shape. Local refs don't match, see {@linkcode qualify}.
 * @returns {ModelAnnotationShape | undefined} The shape as it is in the config (`ext.miso` included), `undefined` if
 *   there is none with that ref.
 */
export function findShape(context: ModelContext, ref: string): ModelAnnotationShape | undefined {
  return context.config.model.annotations.find((shape) => `${shape.modelId}:${shape.id}` === ref);
}

/**
 * Looks up the `miso.base` entry of a RAMEN base level element (e.g. the Collection node), by comparing
 * `<modelId>:<id>` of each entry with the given ref.
 *
 * @param {ModelContext} context - The model context.
 * @param {string} ref - Qualified ref (`<modelId>:<id>`) of the base level element.
 * @returns {ConfigBaseEntry | undefined} The entry, `undefined` if the element has no config.
 */
export function findBaseEntry(context: ModelContext, ref: string): ConfigBaseEntry | undefined {
  return (context.config.miso.base ?? []).find((entry) => `${entry.modelId}:${entry.id}` === ref);
}

// ----- Nodes -----

/**
 * The qualified ref of the RAMEN base node a node refines, from its base-first lineage.
 *
 * @param {ModelContext} context - The model context.
 * @param {string} nodeRef - Qualified ref of the node.
 * @returns {string | undefined} One of {@linkcode BASE_NODE_REF}, or `undefined` for unknown nodes.
 */
export function getBaseNodeRef(context: ModelContext, nodeRef: string): string | undefined {
  const root = context.model.getNodeLineage(nodeRef)[0];

  return root ? `${root.modelId}:${root.nodeId}` : undefined;
}

/** The labels of the RAMEN base nodes, by their qualified refs */
const BASE_NODE_LABEL_BY_REF: Readonly<Record<string, BaseNodeLabel>> = {
  [BASE_NODE_REF.Collection]: "Collection",
  [BASE_NODE_REF.Content]: "Content",
  [BASE_NODE_REF.Entity]: "Entity",
  [BASE_NODE_REF.Annotation]: "Annotation",
};

/** The base labels in the order they are checked when a node's labels can't be resolved */
const BASE_NODE_LABEL_PRIORITY: readonly BaseNodeLabel[] = ["Entity", "Collection", "Content", "Annotation"];

/**
 * The RAMEN base node a node refines, as its label: from the lineage of its classifier. For nodes whose labels can't be
 * resolved, the base label among their labels is taken (RAMEN's base labels are fixed, every node is stored with one).
 *
 * @param {ModelContext} context - The model context.
 * @param {DataNode<BaseNodeData>} node - The node.
 * @returns {BaseNodeLabel | undefined} The base node label, `undefined` if the node has none.
 */
export function getBaseNodeLabel(context: ModelContext, node: DataNode<BaseNodeData>): BaseNodeLabel | undefined {
  const classifierRef: string | null = getClassifierRef(context, node);
  const baseNodeRef: string | undefined = classifierRef ? getBaseNodeRef(context, classifierRef) : undefined;

  if (baseNodeRef) {
    return BASE_NODE_LABEL_BY_REF[baseNodeRef];
  } else {
    return BASE_NODE_LABEL_PRIORITY.find((label) => node.nodeLabels.includes(label));
  }
}

/** Whether a node is an Annotation, see {@linkcode getBaseNodeLabel} */
export function isAnnotationNode(context: ModelContext, node: NodeStatusObject): node is NodeStatusObject<AnnotationNode> {
  return getBaseNodeLabel(context, node.node) === "Annotation";
}

/** Whether a node is a Collection, see {@linkcode getBaseNodeLabel} */
export function isCollectionNode(context: ModelContext, node: NodeStatusObject): node is NodeStatusObject<CollectionNode> {
  return getBaseNodeLabel(context, node.node) === "Collection";
}

/** Whether a node is a Content, see {@linkcode getBaseNodeLabel} */
export function isContentNode(context: ModelContext, node: NodeStatusObject): node is NodeStatusObject<TextNode> {
  return getBaseNodeLabel(context, node.node) === "Content";
}

/** Whether a node is an Entity, see {@linkcode getBaseNodeLabel} */
export function isEntityNode(context: ModelContext, node: NodeStatusObject): node is NodeStatusObject<EntityNode> {
  return getBaseNodeLabel(context, node.node) === "Entity";
}

/**
 * The refinements of a RAMEN base node (base nodes themselves excluded), in model order.
 *
 * @param {ModelContext} context - The model context.
 * @param {string} baseNodeRef - One of {@linkcode BASE_NODE_REF}.
 * @returns {{ ref: string; node: Node }[]} The refinements with their qualified refs.
 */
export function getRefinements(context: ModelContext, baseNodeRef: string): { ref: string; node: Node }[] {
  return context.config.model.classifiers
    .filter((classifier): classifier is Node & { modelId: string } => classifier.kind === "Node")
    .map((node) => ({ ref: `${node.modelId}:${node.id}`, node: node }))
    .filter(({ ref }) => !BASE_NODE_REFS.includes(ref) && getBaseNodeRef(context, ref) === baseNodeRef);
}

/**
 * A node type as an option for creating nodes: its classifier, name, the labels its nodes are stored with (the names
 * of its lineage, base first, e.g. `Collection, Letter`) and the values new nodes start with.
 *
 * @param {ModelContext} context - The model context.
 * @param {string} classifierRef - Qualified ref of the node type.
 * @returns {NodeTypeOption} The option.
 */
export function getNodeTypeOption(context: ModelContext, classifierRef: string): NodeTypeOption {
  const nodeLabels: string[] = context.model.getNodeLineage(classifierRef).map((item) => item.name);
  const initialData: Record<string, unknown> = Object.fromEntries(
    getNodeAttributes(context, classifierRef)
      .filter((entry) => isRequired(entry) && !isList(entry) && getValueType(context, entry) === "Boolean")
      .map((entry) => [entry.attribute.name, false]),
  );

  return {
    classifierRef,
    name: context.model.getNode(classifierRef)?.name ?? nodeLabels.at(-1) ?? classifierRef,
    nodeLabels,
    initialData,
  };
}

/**
 * The config of a node. Base level nodes have theirs in `miso.base`.
 *
 * @param {ModelContext} context - The model context.
 * @param {string} nodeRef - Qualified ref of the node.
 * @returns {ContentTypeConfig | undefined} The `ext.miso` block.
 */
export function getNodeConfig(context: ModelContext, nodeRef: string): ContentTypeConfig | undefined {
  if (isBaseLevel(nodeRef)) {
    return findBaseEntry(context, nodeRef)?.ext?.miso;
  } else {
    return context.model.getNode(nodeRef)?.ext?.miso as ContentTypeConfig | undefined;
  }
}

/**
 * The medium of a Content type: the nearest configured `medium` along its lineage.
 *
 * @param {ModelContext} context - The model context.
 * @param {string} contentRef - Qualified ref of the Content type.
 * @returns {ContentMedium} The configured medium, `text` if none is configured.
 */
export function getContentMedium(context: ModelContext, contentRef: string): ContentMedium {
  // The lineage is base-first, the nearest configuration wins
  for (const item of [...context.model.getNodeLineage(contentRef)].reverse()) {
    const medium: ContentMedium | undefined = getNodeConfig(context, `${item.modelId}:${item.nodeId}`)?.medium;

    if (medium) {
      return medium;
    }
  }

  return "text";
}

// ----- Attributes -----

/**
 * The attributes visible on a node (own and inherited), without identity attributes like `uuid`.
 *
 * @param {ModelContext} context - The model context.
 * @param {string} nodeRef - Qualified ref of the node.
 * @param {boolean} [withoutBaseNode] - Leave out the attributes declared by the RAMEN base node (e.g. `label`).
 * @returns {ModelAttribute[]} The attributes, most general first.
 */
export function getNodeAttributes(context: ModelContext, nodeRef: string, withoutBaseNode: boolean = false): ModelAttribute[] {
  return context.model
    .getAttributes(nodeRef)
    .map((info) => {
      const ownerRef: string = `${info.declaredBy.modelId}:${info.declaredBy.nodeId}`;
      const attribute: Attribute | undefined = context.model
        .getNode(ownerRef)
        ?.attributes.find((candidate) => candidate.id === info.attributeId);

      return attribute ? { attribute, ownerRef } : undefined;
    })
    .filter((entry): entry is ModelAttribute => entry !== undefined && entry.attribute.isKey !== true)
    .filter((entry) => !withoutBaseNode || !BASE_NODE_REFS.includes(entry.ownerRef));
}

/**
 * The value type of an attribute (of a single value, for lists the item type).
 * A String data type with a `date` or `date-time` format constraint (RAMEN's `Date`/`DateTime` or a project's own)
 * is `Date`/`DateTime`, any other data type its base type.
 *
 * @param {ModelContext} context - The model context.
 * @param {ModelAttribute} entry - The attribute.
 * @returns {AttributeValueType} The value type. Unknown data types are treated as `String`.
 */
export function getValueType(context: ModelContext, entry: ModelAttribute): AttributeValueType {
  const typeRef: string = getTypeRef(entry);

  if (BUILTIN_TYPES.includes(typeRef)) {
    return typeRef as BuiltinType;
  }

  const dataType: DataType | undefined = context.model.getDataType(typeRef);

  if (!dataType) {
    return "String";
  }

  if (dataType.baseType === "String") {
    return formatValueType(dataType) ?? dataType.baseType;
  }

  return dataType.baseType;
}

/**
 * The value type of a data type by its `format` constraint.
 *
 * @param {DataType} dataType - The data type.
 * @returns {FormatValueType | undefined} The value type, `undefined` if it has no format of {@linkcode VALUE_TYPE_BY_FORMAT}.
 */
function formatValueType(dataType: DataType): FormatValueType | undefined {
  const byFormat: Readonly<Record<string, FormatValueType | undefined>> = VALUE_TYPE_BY_FORMAT;

  for (const constraint of dataType.constraints ?? []) {
    if (constraint.language === "format" && typeof constraint.expression === "string") {
      const valueType: FormatValueType | undefined = byFormat[constraint.expression];

      if (valueType) {
        return valueType;
      }
    }
  }

  return undefined;
}

/**
 * The type ref of an attribute: a built-in type name, or the qualified ref of a DataType.
 *
 * @param {ModelAttribute} entry - The attribute.
 * @returns {string} The type ref.
 */
export function getTypeRef(entry: ModelAttribute): string {
  const typeId: string = entry.attribute.typeId;

  if (BUILTIN_TYPES.includes(typeId)) {
    return typeId;
  } else {
    return qualify(typeId, modelIdOf(entry.ownerRef));
  }
}

/**
 * The declared DataType of an attribute, `undefined` for built-in types.
 *
 * @param {ModelContext} context - The model context.
 * @param {ModelAttribute} entry - The attribute.
 * @returns {DataType | undefined} The data type.
 */
export function getDataType(context: ModelContext, entry: ModelAttribute): DataType | undefined {
  const typeRef: string = getTypeRef(entry);

  return BUILTIN_TYPES.includes(typeRef) ? undefined : context.model.getDataType(typeRef);
}

/**
 * The allowed values of an attribute: the literals of its data type, otherwise the `enum` of a `json-schema` constraint
 * on the attribute or its data type.
 *
 * @param {ModelContext} context - The model context.
 * @param {ModelAttribute} entry - The attribute.
 * @returns {string[] | number[] | undefined} The values, `undefined` if the attribute is not an enum.
 */
export function getOptions(context: ModelContext, entry: ModelAttribute): string[] | number[] | undefined {
  const dataType: DataType | undefined = getDataType(context, entry);
  const literals = dataType?.literals ?? [];

  if (literals.length === 0) {
    return enumConstraintValues([...(entry.attribute.constraints ?? []), ...(dataType?.constraints ?? [])]);
  } else if (dataType?.baseType === "Integer" || dataType?.baseType === "Float") {
    return literals.map((literal) => literal.value ?? Number(literal.literal ?? literal.name));
  } else {
    return literals.map((literal) => literal.literal ?? literal.name);
  }
}

/**
 * The values of the first `json-schema` constraint with an `enum` of only strings or only numbers.
 *
 * @param {Constraint[]} constraints - The constraints to search.
 * @returns {string[] | number[] | undefined} The values, `undefined` if there is no such constraint.
 */
function enumConstraintValues(constraints: Constraint[]): string[] | number[] | undefined {
  for (const constraint of constraints) {
    const values: unknown =
      constraint.language === "json-schema" && typeof constraint.expression === "object" ? constraint.expression.enum : undefined;

    if (Array.isArray(values) && values.length > 0) {
      if (values.every((value) => typeof value === "string")) {
        return values;
      } else if (values.every((value) => typeof value === "number")) {
        return values;
      }
    }
  }

  return undefined;
}

/**
 * Whether an attribute holds a list of values, from the upper bound of its cardinality.
 *
 * @param {ModelAttribute} entry - The attribute.
 * @returns {boolean} `true` if more than one value is allowed (`-1` = unbounded).
 */
export function isList(entry: ModelAttribute): boolean {
  const { upperBound } = entry.attribute.bounds;

  return upperBound === -1 || upperBound > 1;
}

/**
 * Whether an attribute must have a value, from the lower bound of its cardinality.
 *
 * @param {ModelAttribute} entry - The attribute.
 * @returns {boolean} `true` if at least one value is required.
 */
export function isRequired(entry: ModelAttribute): boolean {
  return entry.attribute.bounds.lowerBound >= 1;
}

/**
 * The config of an attribute. Attributes of the RAMEN base level have theirs in `miso.base`.
 *
 * @param {ModelContext} context - The model context.
 * @param {ModelAttribute} entry - The attribute.
 * @returns {AttributeConfig | undefined} The `ext.miso` block.
 */
export function getAttributeConfig(context: ModelContext, entry: ModelAttribute): AttributeConfig | undefined {
  if (isBaseLevel(entry.ownerRef)) {
    return findBaseEntry(context, entry.ownerRef)?.attributes?.find((a) => a.id === entry.attribute.id)?.ext?.miso;
  } else {
    return entry.attribute.ext?.miso as AttributeConfig | undefined;
  }
}

/**
 * Whether a value counts as missing in a form: nothing, a blank text or an empty list. RAMEN core only treats
 * `undefined` as missing, so form values are normalized with this before they are validated.
 *
 * @param {unknown} value - The value of an input.
 * @returns {boolean} `true` if the value is missing.
 */
export function isEmptyValue(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim().length === 0) ||
    (Array.isArray(value) && value.length === 0)
  );
}

/**
 * Validates a value of an attribute with RAMEN core: cardinality, data type, literals and the model's constraints.
 * Missing values (see {@linkcode isEmptyValue}) are only an error for required attributes.
 *
 * @param {ModelContext} context - The model context.
 * @param {ModelAttribute} entry - The attribute (of a node, or of an annotation shape).
 * @param {unknown} value - The value to check.
 * @returns {string[]} The error messages, empty if the value is valid.
 */
export function validateValue(context: ModelContext, entry: ModelAttribute, value: unknown): string[] {
  const normalized: unknown = isEmptyValue(value) ? undefined : value;
  const shape: ModelAnnotationShape | undefined = findShape(context, entry.ownerRef);

  try {
    const result = shape
      ? context.model.validateAnnotationValue(familyRefOf(shape), shape.type, entry.attribute.name, normalized)
      : context.model.validateAttributeValue(entry.ownerRef, entry.attribute.name, normalized);

    return result.diagnostics.filter((diagnostic) => diagnostic.severity === "error").map((diagnostic) => diagnostic.message);
  } catch (error: unknown) {
    // RAMEN core throws if the attribute is not on the node or shape, which would be a broken config
    return [(error as Error).message];
  }
}

/**
 * The value a new required attribute starts with.
 *
 * @param {ModelContext} context - The model context.
 * @param {ModelAttribute} entry - The attribute.
 * @param {boolean} [asItem] - The value of one item of a list attribute, instead of the whole list.
 * @returns {unknown} The default value.
 */
export function getDefaultValue(context: ModelContext, entry: ModelAttribute, asItem: boolean = false): unknown {
  const valueType: AttributeValueType = getValueType(context, entry);

  if (isList(entry) && !asItem) {
    return [];
  } else if (valueType === "Boolean") {
    return false;
  } else if (valueType === "Date") {
    // Today (UTC) as YYYY-MM-DD
    return new Date().toISOString().slice(0, 10);
  } else if (valueType === "DateTime") {
    // Now (UTC), cut to whole seconds like the values the inputs produce
    return `${new Date().toISOString().slice(0, 19)}.000Z`;
  } else if (valueType === "Integer" || valueType === "Float") {
    return 0;
  } else if (valueType === "String") {
    return "";
  } else {
    return null;
  }
}

/**
 * Whether the user can edit an attribute.
 *
 * @param {ModelContext} context - The model context.
 * @param {ModelAttribute} entry - The attribute.
 * @returns {boolean} `false` if it is read-only in the model or `ext.miso.editable` is `false`, otherwise `true`.
 */
export function isEditable(context: ModelContext, entry: ModelAttribute): boolean {
  return entry.attribute.isReadOnly !== true && getAttributeConfig(context, entry)?.editable !== false;
}

/**
 * Whether an attribute is shown to the user.
 *
 * @param {ModelContext} context - The model context.
 * @param {ModelAttribute} entry - The attribute.
 * @returns {boolean} `false` if `ext.miso.visible` is `false`, otherwise `true`.
 */
export function isVisible(context: ModelContext, entry: ModelAttribute): boolean {
  return getAttributeConfig(context, entry)?.visible !== false;
}

// ----- Annotation shapes -----

/**
 * The annotation shapes a node may carry, from the model's relations.
 *
 * @param {ModelContext} context - The model context.
 * @param {string} nodeRef - Qualified ref of the carrier.
 * @returns {ModelAnnotationShape[]} The shapes, in the order of the advisor.
 */
export function getShapesForNode(context: ModelContext, nodeRef: string): ModelAnnotationShape[] {
  return context.model
    .suggestAnnotationShapesForNode(nodeRef)
    .map((suggestion) => findShape(context, `${suggestion.modelId}:${suggestion.annotationId}`))
    .filter((shape): shape is ModelAnnotationShape => shape !== undefined);
}

/**
 * The qualified ref of an annotation shape. The counterpart of {@linkcode findShape}.
 *
 * @param {ModelAnnotationShape} shape - The annotation shape.
 * @returns {string} `<modelId>:<id>` of the shape.
 */
export function shapeRefOf(shape: ModelAnnotationShape): string {
  return `${shape.modelId}:${shape.id}`;
}

/**
 * The qualified ref of the Annotation node (family) an annotation shape belongs to, e.g. a TextAnnotation refinement.
 * Annotations of the shape are stored as nodes of that family, with the shape's name in their `type` property.
 *
 * @param {ModelAnnotationShape} shape - The annotation shape.
 * @returns {string} The qualified ref of the family node.
 */
export function familyRefOf(shape: ModelAnnotationShape): string {
  return qualify(shape.annotationId, shape.modelId);
}

/**
 * The properties of an annotation shape, without the shared attributes of its family node (`uuid`, `selector` ...).
 *
 * @param {ModelAnnotationShape} shape - The annotation shape.
 * @returns {ModelAttribute[]} The properties, each owned by the shape.
 */
export function getShapeProperties(shape: ModelAnnotationShape): ModelAttribute[] {
  return shape.properties.map((attribute) => ({ attribute, ownerRef: shapeRefOf(shape) }));
}

/**
 * The config of an annotation shape (group, controls, appearance, editing). The native mapping is not part of
 * it, see {@linkcode getMappingForShape}.
 *
 * @param {ModelAnnotationShape} shape - The annotation shape.
 * @returns {AnnotationShapeConfig | undefined} The `ext.miso` block.
 */
export function getShapeConfig(shape: ModelAnnotationShape): AnnotationShapeConfig | undefined {
  return shape.ext?.miso as AnnotationShapeConfig | undefined;
}

/**
 * Whether an annotation shape may refer to an Entity, from the targets of its outgoing relation rules.
 *
 * @param {ModelContext} context - The model context.
 * @param {ModelAnnotationShape} shape - The annotation shape.
 * @returns {boolean} `true` if one of its outgoing relations leads to an Entity.
 */
export function refersToEntities(context: ModelContext, shape: ModelAnnotationShape): boolean {
  return shape.relations
    .filter((rule) => rule.direction === "outgoing")
    .flatMap((rule) => rule.relationIds.map((relationId) => qualify(relationId, shape.modelId)))
    .some((relationRef) => {
      const relation: Relation | undefined = context.model.getRelation(relationRef);

      return (
        relation !== undefined &&
        getBaseNodeRef(context, qualify(relation.to.nodeId, modelIdOf(relationRef))) === BASE_NODE_REF.Entity
      );
    });
}

/**
 * The node types an annotation shape may (still) refer to: the targets of its outgoing `REFERS_TO` relation rules. A
 * target also allows its refinements, see {@linkcode isAllowedTarget}.
 *
 * A rule's upper bound counts all its relations together: once as many references to its targets exist (e.g. one for
 * `0..1`), its targets are left out, unless another rule with room allows them too.
 *
 * @param {ModelContext} context - The model context.
 * @param {ModelAnnotationShape} shape - The annotation shape.
 * @param {string[]} [referencedRefs] - Classifier refs of the nodes the annotation already refers to, one per reference.
 * @returns {string[]} Qualified refs of the target node types.
 */
export function getReferenceTargetRefs(
  context: ModelContext,
  shape: ModelAnnotationShape,
  referencedRefs: string[] = [],
): string[] {
  const targetRefs: string[] = getReferenceRules(context, shape).flatMap((rule) => {
    const count: number = countReferences(context, rule, referencedRefs);
    const isFull: boolean = rule.bounds.upperBound !== -1 && count >= rule.bounds.upperBound;

    return isFull ? [] : rule.targetRefs;
  });

  return [...new Set(targetRefs)];
}

/** A `REFERS_TO` rule of an annotation shape that isn't fulfilled yet, see {@linkcode getMissingReferences} */
export interface MissingReference {
  /** Qualified refs of the node types that fulfil the rule (or their refinements) */
  targetRefs: string[];
  /** How many references to them are still missing */
  missing: number;
}

/**
 * The `REFERS_TO` rules of an annotation shape whose lower bound isn't reached yet, e.g. a required Person.
 *
 * @param {ModelContext} context - The model context.
 * @param {ModelAnnotationShape} shape - The annotation shape.
 * @param {string[]} referencedRefs - Classifier refs of the nodes the annotation refers to, one per reference.
 * @returns {MissingReference[]} The unfulfilled rules, empty if the references are complete.
 */
export function getMissingReferences(
  context: ModelContext,
  shape: ModelAnnotationShape,
  referencedRefs: string[],
): MissingReference[] {
  return getReferenceRules(context, shape).flatMap((rule) => {
    const missing: number = rule.bounds.lowerBound - countReferences(context, rule, referencedRefs);

    return missing > 0 ? [{ targetRefs: rule.targetRefs, missing }] : [];
  });
}

/**
 * Whether an annotation shape requires at least one reference (a `REFERS_TO` rule with a lower bound above 0).
 *
 * @param {ModelContext} context - The model context.
 * @param {ModelAnnotationShape} shape - The annotation shape.
 * @returns {boolean} `true` if an annotation of the shape is incomplete without references.
 */
export function requiresReferences(context: ModelContext, shape: ModelAnnotationShape): boolean {
  return getReferenceRules(context, shape).some((rule) => rule.bounds.lowerBound > 0);
}

/** An outgoing relation rule of an annotation shape with the targets of its `REFERS_TO` relations */
interface ReferenceRule {
  targetRefs: string[];
  bounds: ModelAnnotationShape["relations"][number]["bounds"];
}

/**
 * The outgoing relation rules of an annotation shape that contain `REFERS_TO` relations. Each rule's bounds count all
 * its relations together.
 */
function getReferenceRules(context: ModelContext, shape: ModelAnnotationShape): ReferenceRule[] {
  return shape.relations
    .filter((rule) => rule.direction === "outgoing")
    .map((rule) => ({
      bounds: rule.bounds,
      targetRefs: rule.relationIds.flatMap((relationId) => {
        const relationRef: string = qualify(relationId, shape.modelId);
        const relation: Relation | undefined = context.model.getRelation(relationRef);

        return relation?.name === "REFERS_TO" ? [qualify(relation.to.nodeId, modelIdOf(relationRef))] : [];
      }),
    }))
    .filter((rule) => rule.targetRefs.length > 0);
}

/** How many of the references count for a rule: those to its targets or their refinements */
function countReferences(context: ModelContext, rule: ReferenceRule, referencedRefs: string[]): number {
  return referencedRefs.filter((ref) => isAllowedTarget(context, ref, rule.targetRefs)).length;
}

/**
 * Whether a node type is one of the target types or refines one of them.
 *
 * @param {ModelContext} context - The model context.
 * @param {string} nodeRef - Qualified ref of the node type.
 * @param {string[]} targetRefs - Qualified refs of the target types, e.g. from {@linkcode getReferenceTargetRefs}.
 * @returns {boolean} `true` if the node type's lineage contains a target type.
 */
export function isAllowedTarget(context: ModelContext, nodeRef: string, targetRefs: string[]): boolean {
  return context.model.getNodeLineage(nodeRef).some((item) => targetRefs.includes(`${item.modelId}:${item.nodeId}`));
}

// ----- Resolution of stored names -----

/**
 * The resolutions of {@linkcode resolveClassifierRef}, {@linkcode resolveShapeRef} and {@linkcode resolveRelationRef},
 * per context
 */
interface ResolutionCache {
  /** By the sorted node labels */
  classifiers: Map<string, RefResolution>;
  /** By carrier ref and annotation type */
  shapes: Map<string, RefResolution>;
  /** By start node ref, relationship type and end node ref */
  relations: Map<string, RefResolution>;
}

/**
 * Resolutions per context. The database stores names, and the same label sets and types occur on many nodes, so each
 * is resolved once.
 */
const resolutionCache = new WeakMap<ModelContext, ResolutionCache>();

/** The resolution cache of a context, created on first use */
function getResolutionCache(context: ModelContext): ResolutionCache {
  let cache: ResolutionCache | undefined = resolutionCache.get(context);

  if (!cache) {
    cache = { classifiers: new Map(), shapes: new Map(), relations: new Map() };
    resolutionCache.set(context, cache);
  }

  return cache;
}

/** The name of a node for problem messages, the ref if it is unknown */
function nodeNameOf(context: ModelContext, nodeRef: string): string {
  return context.model.getNode(nodeRef)?.name ?? nodeRef;
}

/**
 * Resolves the stored labels of a node to its classifier: the most specific of the node types the labels name. Labels
 * that name no node type (e.g. leftovers of an import) are ignored. Cached per context.
 *
 * @param {ModelContext} context - The model context.
 * @param {string[]} nodeLabels - The labels of the node in the database.
 * @returns {RefResolution} The qualified ref of the classifier, or `null` if no label names a node type, or the labels
 *   name node types on separate branches.
 */
export function resolveClassifierRef(context: ModelContext, nodeLabels: string[]): RefResolution {
  const cache: Map<string, RefResolution> = getResolutionCache(context).classifiers;
  const key: string = [...nodeLabels].sort().join(",");
  let resolution: RefResolution | undefined = cache.get(key);

  if (!resolution) {
    resolution = findClassifierRef(context, nodeLabels);
    cache.set(key, resolution);
  }

  return resolution;
}

/**
 * The classifier of a node: the `classifierRef` the server resolved, otherwise resolved here from the labels. Client
 * only: nodes the client creates itself have no `classifierRef` until node creation works with refs.
 *
 * @param {ModelContext} context - The model context.
 * @param {DataNode<BaseNodeData>} node - The node.
 * @returns {string | null} The qualified ref of the classifier, `null` if the labels can't be resolved.
 */
export function getClassifierRef(context: ModelContext, node: DataNode<BaseNodeData>): string | null {
  if (node.classifierRef !== undefined) {
    return node.classifierRef;
  } else {
    return resolveClassifierRef(context, node.nodeLabels).ref;
  }
}

/** Uncached {@linkcode resolveClassifierRef} */
function findClassifierRef(context: ModelContext, nodeLabels: string[]): RefResolution {
  const candidateRefs: string[] = context.config.model.classifiers
    .filter((classifier): classifier is Node & { modelId: string } => classifier.kind === "Node")
    .filter((node) => nodeLabels.includes(node.name))
    .map((node) => `${node.modelId}:${node.id}`);

  if (candidateRefs.length === 0) {
    return { ref: null, problem: `No node type matches the labels ${nodeLabels.join(", ")}` };
  }

  const mostSpecific = context.model.getAdvisor().getMostSpecificNode(context.model.getModel().id, candidateRefs);

  if (mostSpecific) {
    return { ref: `${mostSpecific.modelId}:${mostSpecific.nodeId}` };
  } else {
    return { ref: null, problem: `The labels ${nodeLabels.join(", ")} name node types on separate branches` };
  }
}

/**
 * Resolves the stored `type` of an annotation to its annotation shape, among the shapes its carrier may have. The
 * carrier decides the family, since stored annotations only have the `Annotation` label: a `commentary` on a text and
 * a `commentary` on an annotation are different shapes. Cached per context.
 *
 * @param {ModelContext} context - The model context.
 * @param {string} carrierRef - Classifier ref of the node that has the annotation: a Content or Collection, or for
 *   annotations on annotations the family of the annotated annotation.
 * @param {string} type - The `type` of the annotation in the database.
 * @returns {RefResolution} The qualified ref of the shape, or `null` if the carrier may have no shape or several shapes
 *   of that type. The annotation's own classifier is the shape's family, see {@linkcode familyRefOf}.
 */
export function resolveShapeRef(context: ModelContext, carrierRef: string, type: string): RefResolution {
  const cache: Map<string, RefResolution> = getResolutionCache(context).shapes;
  const key: string = `${carrierRef}|${type}`;
  let resolution: RefResolution | undefined = cache.get(key);

  if (!resolution) {
    resolution = findShapeRef(context, carrierRef, type);
    cache.set(key, resolution);
  }

  return resolution;
}

/** Uncached {@linkcode resolveShapeRef} */
function findShapeRef(context: ModelContext, carrierRef: string, type: string): RefResolution {
  const matchingRefs: string[] = [
    ...new Set(
      getShapesForNode(context, carrierRef)
        .filter((shape) => shape.type === type)
        .map(shapeRefOf),
    ),
  ];

  if (matchingRefs.length === 1) {
    return { ref: matchingRefs[0] };
  } else if (matchingRefs.length === 0) {
    return { ref: null, problem: `No annotation type "${type}" is allowed on ${nodeNameOf(context, carrierRef)}` };
  } else {
    return {
      ref: null,
      problem: `Several annotation types "${type}" are allowed on ${nodeNameOf(context, carrierRef)}: ${matchingRefs.join(", ")}`,
    };
  }
}

/**
 * Resolves a stored relationship to its relation definition: among the definitions between the classifiers of its ends
 * with the relationship's type as name, the most specific one (e.g. `HAS_ANNOTATION` Text → TextAnnotation rather than
 * RAMEN's Content → Annotation, which it refines). Cached per context.
 *
 * @param {ModelContext} context - The model context.
 * @param {string} fromRef - Classifier ref of the start node.
 * @param {string} type - The relationship type in the database (`HAS_ANNOTATION`, `REFERS_TO`, `PART_OF`).
 * @param {string} toRef - Classifier ref of the end node.
 * @returns {RefResolution} The qualified ref of the relation definition, or `null` if none or several unrelated ones
 *   match.
 */
export function resolveRelationRef(context: ModelContext, fromRef: string, type: string, toRef: string): RefResolution {
  const cache: Map<string, RefResolution> = getResolutionCache(context).relations;
  const key: string = `${fromRef}|${type}|${toRef}`;
  let resolution: RefResolution | undefined = cache.get(key);

  if (!resolution) {
    resolution = findRelationRef(context, fromRef, type, toRef);
    cache.set(key, resolution);
  }

  return resolution;
}

/**
 * The relation definition of a qualified ref.
 *
 * @param {ModelContext} context - The model context.
 * @param {string} ref - Qualified ref of the relation definition.
 * @returns {(Relation & { modelId: string }) | undefined} The definition, `undefined` if the model has none.
 */
export function findRelation(context: ModelContext, ref: string): (Relation & { modelId: string }) | undefined {
  return context.config.model.relations.find((relation) => `${relation.modelId}:${relation.id}` === ref);
}

/** Qualified refs of all relation definitions a relation definition refines, directly or indirectly */
function relationSuperRefsOf(context: ModelContext, ref: string, seen = new Set<string>()): Set<string> {
  const relation: (Relation & { modelId: string }) | undefined = findRelation(context, ref);

  if (!relation) {
    return seen;
  }

  for (const superRef of relation.superTypes.map((superType) => qualify(superType, relation.modelId))) {
    if (!seen.has(superRef)) {
      seen.add(superRef);
      relationSuperRefsOf(context, superRef, seen);
    }
  }

  return seen;
}

/** Uncached {@linkcode resolveRelationRef} */
function findRelationRef(context: ModelContext, fromRef: string, type: string, toRef: string): RefResolution {
  const modelId: string = context.model.getModel().id;
  const candidateRefs: string[] = [
    ...new Set(
      context.model
        .getAdvisor()
        .getRelations(modelId, fromRef, toRef)
        .map((selection) => qualify(selection.ref, modelId))
        .filter((ref) => findRelation(context, ref)?.name === type),
    ),
  ];
  const mostSpecificRefs: string[] = candidateRefs.filter((ref) => {
    const superRefs: Set<string> = relationSuperRefsOf(context, ref);

    return candidateRefs.every((other) => other === ref || superRefs.has(other));
  });
  const description: string = `${type} from ${nodeNameOf(context, fromRef)} to ${nodeNameOf(context, toRef)}`;

  if (mostSpecificRefs.length === 1) {
    return { ref: mostSpecificRefs[0] };
  } else if (candidateRefs.length === 0) {
    return { ref: null, problem: `No relation ${description} is allowed` };
  } else {
    return { ref: null, problem: `Several relations ${description} are allowed: ${candidateRefs.join(", ")}` };
  }
}

// ----- Native mappings -----

/**
 * The mapping of a native editor type, from `miso.mappings`.
 *
 * @param {ModelContext} context - The model context.
 * @param {string} native - The native type (e.g. `paragraph`).
 * @returns {ConfigMapping | undefined} The first mapping of that native type.
 */
export function getNativeMapping(context: ModelContext, native: string): ConfigMapping | undefined {
  return context.config.miso.mappings.find((mapping) => mapping.native === native);
}

/**
 * The mapping of an annotation shape to a native editor type, from `miso.mappings`.
 *
 * @param {ModelContext} context - The model context.
 * @param {string} shapeRef - Qualified ref of the annotation shape.
 * @returns {ConfigMapping | undefined} The mapping, `undefined` if the shape is not mapped.
 */
export function getMappingForShape(context: ModelContext, shapeRef: string): ConfigMapping | undefined {
  return context.config.miso.mappings.find((mapping) => mapping.annotation === shapeRef);
}
