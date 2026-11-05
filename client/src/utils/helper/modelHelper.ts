import {
  DataTypes,
  RAMEN_ELEMENT,
  RAMEN_MODEL,
  type AnnotationShape,
  type Attribute,
  type DataType,
  type Node,
  type Owned,
  type RamenModel,
  type Relation,
} from "@ramen-suite/core";
import type { AnnotationShapeMisoConfig, AttributeMisoConfig, ContentTypeMisoConfig } from "../../models/types";
import type { ConfigBaseEntry, ConfigMapping, MisoConfig } from "../../schemas/misoConfig.schema";

// Accessors on the RAMEN model and the Miso settings of its elements. Model questions are answered by RAMEN core, the
// Miso settings come from `ext.miso` of the elements (or `miso.base` for the RAMEN base level) and from `miso.mappings`.
//
// The same accessors exist on the server (`server/src/utils/modelHelper.ts`). Keep both in sync.

/** An attribute of a node, or a property of an annotation shape, with the element that declares it */
export interface ModelAttribute {
  /** The attribute as declared in the model */
  attribute: Attribute;
  /** Qualified ref (`<modelId>:<id>`) of the declaring node or annotation shape */
  ownerRef: string;
}

/**
 * An annotation shape as listed in a RamenFile: with the `modelId` of the model level it is declared in, since the file
 * flattens all levels into one `annotations` list.
 */
export type ModelAnnotationShape = Owned<AnnotationShape>;

/** The value type of an attribute as the editors need it. Lists are told apart by {@linkcode isList}. */
export type AttributeValueType = "String" | "Integer" | "Float" | "Boolean" | "Object" | "Date" | "DateTime";

/** The model and the config the accessors work on */
export interface ModelContext {
  /** The model, imported by RAMEN core */
  model: RamenModel;
  /** The validated Miso config */
  config: MisoConfig;
}

/** Qualified refs of the RAMEN base nodes */
export const BASE_NODE_REF = {
  Collection: `${RAMEN_MODEL.id}:${RAMEN_ELEMENT.COLLECTION}`,
  Content: `${RAMEN_MODEL.id}:${RAMEN_ELEMENT.CONTENT}`,
  Entity: `${RAMEN_MODEL.id}:${RAMEN_ELEMENT.ENTITY}`,
  Annotation: `${RAMEN_MODEL.id}:${RAMEN_ELEMENT.ANNOTATION}`,
} as const;

const BASE_NODE_REFS: readonly string[] = Object.values(BASE_NODE_REF);

const BUILTIN_TYPES: readonly string[] = Object.values(DataTypes);

/** RAMEN data types with a value type of their own. The other data types are edited as their base type. */
const VALUE_TYPE_BY_RAMEN_TYPE_REF: Record<string, AttributeValueType> = {
  [`${RAMEN_MODEL.id}:${RAMEN_ELEMENT.DATE}`]: "Date",
  [`${RAMEN_MODEL.id}:${RAMEN_ELEMENT.DATE_TIME}`]: "DateTime",
};

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
 * Whether a ref points into the RAMEN base level. RAMEN core doesn't allow `ext` there, so the Miso settings of these
 * elements live in `miso.base`.
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
 * @returns {ConfigBaseEntry | undefined} The entry, `undefined` if the element has no Miso settings.
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
    .map((node) => ({ ref: `${node.modelId}:${node.id}`, node: node as Node }))
    .filter(({ ref }) => !BASE_NODE_REFS.includes(ref) && getBaseNodeRef(context, ref) === baseNodeRef);
}

/**
 * The ref of the refinement of a base node with the given name (node label). Name matching, until the lookups use IDs.
 *
 * @param {ModelContext} context - The model context.
 * @param {string} baseNodeRef - One of {@linkcode BASE_NODE_REF}.
 * @param {string} label - The node label, i.e. the classifier name.
 * @returns {string | undefined} The qualified ref, `undefined` if there is no such refinement.
 */
export function findRefinementRef(context: ModelContext, baseNodeRef: string, label: string): string | undefined {
  return getRefinements(context, baseNodeRef).find(({ node }) => node.name === label)?.ref;
}

/**
 * The Miso settings of a node. Base level nodes have theirs in `miso.base`.
 *
 * @param {ModelContext} context - The model context.
 * @param {string} nodeRef - Qualified ref of the node.
 * @returns {ContentTypeMisoConfig | undefined} The `ext.miso` block.
 */
export function getNodeMiso(context: ModelContext, nodeRef: string): ContentTypeMisoConfig | undefined {
  if (isBaseLevel(nodeRef)) {
    return findBaseEntry(context, nodeRef)?.ext?.miso;
  } else {
    return context.model.getNode(nodeRef)?.ext?.miso as ContentTypeMisoConfig | undefined;
  }
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
 *
 * @param {ModelContext} context - The model context.
 * @param {ModelAttribute} entry - The attribute.
 * @returns {AttributeValueType} The value type. Unknown data types are treated as `String`.
 */
export function getValueType(context: ModelContext, entry: ModelAttribute): AttributeValueType {
  const typeRef: string = getTypeRef(entry);

  if (BUILTIN_TYPES.includes(typeRef)) {
    return typeRef as AttributeValueType;
  }

  if (VALUE_TYPE_BY_RAMEN_TYPE_REF[typeRef]) {
    return VALUE_TYPE_BY_RAMEN_TYPE_REF[typeRef];
  }

  return (context.model.getDataType(typeRef)?.baseType as AttributeValueType | undefined) ?? "String";
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
 * The allowed values of an attribute, from the literals of its data type.
 *
 * @param {ModelContext} context - The model context.
 * @param {ModelAttribute} entry - The attribute.
 * @returns {string[] | number[] | undefined} The values, `undefined` if the attribute is not an enum.
 */
export function getOptions(context: ModelContext, entry: ModelAttribute): string[] | number[] | undefined {
  const dataType: DataType | undefined = getDataType(context, entry);
  const literals = dataType?.literals ?? [];

  if (literals.length === 0) {
    return undefined;
  } else if (dataType?.baseType === "Integer" || dataType?.baseType === "Float") {
    return literals.map((literal) => literal.value ?? Number(literal.literal ?? literal.name));
  } else {
    return literals.map((literal) => literal.literal ?? literal.name);
  }
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
 * The Miso settings of an attribute. Attributes of the RAMEN base level have theirs in `miso.base`.
 *
 * @param {ModelContext} context - The model context.
 * @param {ModelAttribute} entry - The attribute.
 * @returns {AttributeMisoConfig | undefined} The `ext.miso` block.
 */
export function getAttributeMiso(context: ModelContext, entry: ModelAttribute): AttributeMisoConfig | undefined {
  if (isBaseLevel(entry.ownerRef)) {
    return findBaseEntry(context, entry.ownerRef)?.attributes?.find((a) => a.id === entry.attribute.id)?.ext?.miso;
  } else {
    return entry.attribute.ext?.miso as AttributeMisoConfig | undefined;
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
  return entry.attribute.isReadOnly !== true && getAttributeMiso(context, entry)?.editable !== false;
}

/**
 * Whether an attribute is shown to the user.
 *
 * @param {ModelContext} context - The model context.
 * @param {ModelAttribute} entry - The attribute.
 * @returns {boolean} `false` if `ext.miso.visible` is `false`, otherwise `true`.
 */
export function isVisible(context: ModelContext, entry: ModelAttribute): boolean {
  return getAttributeMiso(context, entry)?.visible !== false;
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
 * The properties of an annotation shape, without the shared attributes of its family node (`uuid`, `selector` …).
 *
 * @param {ModelAnnotationShape} shape - The annotation shape.
 * @returns {ModelAttribute[]} The properties, each owned by the shape.
 */
export function getShapeProperties(shape: ModelAnnotationShape): ModelAttribute[] {
  return shape.properties.map((attribute) => ({ attribute, ownerRef: shapeRefOf(shape) }));
}

/**
 * The Miso settings of an annotation shape (group, controls, appearance, editing). The native mapping is not part of
 * it, see {@linkcode getMappingForShape}.
 *
 * @param {ModelAnnotationShape} shape - The annotation shape.
 * @returns {AnnotationShapeMisoConfig | undefined} The `ext.miso` block.
 */
export function getShapeMiso(shape: ModelAnnotationShape): AnnotationShapeMisoConfig | undefined {
  return shape.ext?.miso as AnnotationShapeMisoConfig | undefined;
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
