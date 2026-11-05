import {
  DataTypes,
  RAMEN_ELEMENT,
  RAMEN_MODEL,
  type AnnotationShape,
  type Attribute,
  type DataType,
  type Node,
  type RamenModel,
  type Relation,
} from "@ramen-suite/core";
import { ConfigBaseEntry, IMisoConfig } from "../models/IMisoConfig.js";

// Accessors on the RAMEN model and the Miso settings of its elements. Model questions are answered by RAMEN core, the
// Miso settings come from `ext.miso` of the elements (or `miso.base` for the RAMEN base level). The native mappings
// are only read by the client.
//
// The same accessors exist on the client (`client/src/utils/helper/modelHelper.ts`). Keep both in sync.

/** An `ext.miso` block. The server passes the Miso settings through, the client validates them. */
type MisoBlock = Record<string, unknown> | undefined;

/** An attribute of a node, or a property of an annotation shape, with the element that declares it */
export interface ModelAttribute {
  /** The attribute as declared in the model */
  attribute: Attribute;
  /** Qualified ref (`<modelId>:<id>`) of the declaring node or annotation shape */
  ownerRef: string;
}

/** An annotation shape with the model it is declared in */
export type ModelAnnotationShape = AnnotationShape & { modelId: string };

/** The value type of an attribute. Lists are told apart by {@linkcode isList}. */
export type AttributeValueType = "String" | "Integer" | "Float" | "Boolean" | "Object" | "Date" | "DateTime";

/** The model of a Miso config, its settings and the lookups the accessors need */
export interface ModelContext {
  /** The model, imported by RAMEN core */
  model: RamenModel;
  config: IMisoConfig;
  /** `miso.base` entries by qualified ref */
  baseEntries: Map<string, ConfigBaseEntry>;
  /** Annotation shapes by qualified ref */
  shapes: Map<string, ModelAnnotationShape>;
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

/** RAMEN data types with a value type of their own. The other data types are handled as their base type. */
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

/** The model ID of a qualified ref */
function modelIdOf(qualifiedRef: string): string {
  return qualifiedRef.split(":")[0];
}

/** Whether a ref points into the RAMEN base level, whose Miso settings live in `miso.base` */
function isBaseLevel(qualifiedRef: string): boolean {
  return modelIdOf(qualifiedRef) === RAMEN_MODEL.id;
}

/**
 * Creates the context the accessors work on.
 *
 * @param {IMisoConfig} config - The Miso config.
 * @param {RamenModel} model - The model of the config, imported by RAMEN core.
 * @returns {ModelContext} The context.
 */
export function createModelContext(config: IMisoConfig, model: RamenModel): ModelContext {
  return {
    model,
    config,
    baseEntries: new Map((config.miso.base ?? []).map((entry) => [`${entry.modelId}:${entry.id}`, entry])),
    shapes: new Map(config.model.annotations.map((shape) => [`${shape.modelId}:${shape.id}`, shape])),
  };
}

// ----- Nodes -----

/** The qualified ref of the RAMEN base node a node refines, from its base-first lineage */
export function getBaseNodeRef(context: ModelContext, nodeRef: string): string | undefined {
  const root = context.model.getNodeLineage(nodeRef)[0];

  return root ? `${root.modelId}:${root.nodeId}` : undefined;
}

/** The refinements of a RAMEN base node (base nodes themselves excluded), in model order */
export function getRefinements(context: ModelContext, baseNodeRef: string): { ref: string; node: Node }[] {
  return context.config.model.classifiers
    .filter((classifier): classifier is Node & { modelId: string } => classifier.kind === "Node")
    .map((node) => ({ ref: `${node.modelId}:${node.id}`, node: node as Node }))
    .filter(({ ref }) => !BASE_NODE_REFS.includes(ref) && getBaseNodeRef(context, ref) === baseNodeRef);
}

/** The ref of the refinement of a base node with the given name (node label). Name matching, until the lookups use IDs. */
export function findRefinementRef(context: ModelContext, baseNodeRef: string, label: string): string | undefined {
  return getRefinements(context, baseNodeRef).find(({ node }) => node.name === label)?.ref;
}

/** The Miso settings of a node. Base level nodes have theirs in `miso.base`. */
export function getNodeMiso(context: ModelContext, nodeRef: string): MisoBlock {
  if (isBaseLevel(nodeRef)) {
    return context.baseEntries.get(nodeRef)?.ext?.miso;
  } else {
    return context.model.getNode(nodeRef)?.ext?.miso as MisoBlock;
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

/** The type ref of an attribute: a built-in type name, or the qualified ref of a DataType */
export function getTypeRef(entry: ModelAttribute): string {
  const typeId: string = entry.attribute.typeId;

  if (BUILTIN_TYPES.includes(typeId)) {
    return typeId;
  } else {
    return qualify(typeId, modelIdOf(entry.ownerRef));
  }
}

/** The value type of an attribute (of a single value, for lists the item type). Unknown data types count as `String`. */
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

/** The declared DataType of an attribute, `undefined` for built-in types */
export function getDataType(context: ModelContext, entry: ModelAttribute): DataType | undefined {
  const typeRef: string = getTypeRef(entry);

  return BUILTIN_TYPES.includes(typeRef) ? undefined : context.model.getDataType(typeRef);
}

/** The allowed values of an attribute, from the literals of its data type. `undefined` if it is no enum. */
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

/** Whether an attribute holds a list of values */
export function isList(entry: ModelAttribute): boolean {
  const { upperBound } = entry.attribute.bounds;

  return upperBound === -1 || upperBound > 1;
}

/** Whether an attribute must have a value */
export function isRequired(entry: ModelAttribute): boolean {
  return entry.attribute.bounds.lowerBound >= 1;
}

/** The Miso settings of an attribute. Attributes of the RAMEN base level have theirs in `miso.base`. */
export function getAttributeMiso(context: ModelContext, entry: ModelAttribute): MisoBlock {
  if (isBaseLevel(entry.ownerRef)) {
    return context.baseEntries.get(entry.ownerRef)?.attributes?.find((a) => a.id === entry.attribute.id)?.ext?.miso;
  } else {
    return entry.attribute.ext?.miso as MisoBlock;
  }
}

/** Whether the user can edit an attribute: not read-only in the model and not switched off in `ext.miso` */
export function isEditable(context: ModelContext, entry: ModelAttribute): boolean {
  return entry.attribute.isReadOnly !== true && getAttributeMiso(context, entry)?.editable !== false;
}

/** Whether an attribute is shown to the user (default `true`) */
export function isVisible(context: ModelContext, entry: ModelAttribute): boolean {
  return getAttributeMiso(context, entry)?.visible !== false;
}

// ----- Annotation shapes -----

/** The annotation shapes a node may carry, from the model's relations */
export function getShapesForNode(context: ModelContext, nodeRef: string): ModelAnnotationShape[] {
  return context.model
    .suggestAnnotationShapesForNode(nodeRef)
    .map((suggestion) => context.shapes.get(`${suggestion.modelId}:${suggestion.annotationId}`))
    .filter((shape): shape is ModelAnnotationShape => shape !== undefined);
}

/** The qualified ref of an annotation shape */
export function shapeRefOf(shape: ModelAnnotationShape): string {
  return `${shape.modelId}:${shape.id}`;
}

/** The qualified ref of the Annotation node (family) an annotation shape belongs to */
export function familyRefOf(shape: ModelAnnotationShape): string {
  return qualify(shape.annotationId, shape.modelId);
}

/** The properties of an annotation shape (without the shared properties of the Annotation node) */
export function getShapeProperties(shape: ModelAnnotationShape): ModelAttribute[] {
  return shape.properties.map((attribute) => ({ attribute, ownerRef: shapeRefOf(shape) }));
}

/** The Miso settings of an annotation shape */
export function getShapeMiso(shape: ModelAnnotationShape): MisoBlock {
  return shape.ext?.miso as MisoBlock;
}

/** Whether an annotation shape may refer to an Entity, from the targets of its outgoing relation rules */
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
