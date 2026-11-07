import { DataTypes, RAMEN_ELEMENT, RAMEN_MODEL, BuiltinType } from "@ramen-suite/core";
import { BaseNodeLabel, CollectionNode, EntityNode, NodeTypeOption, TextNode } from "../models/types";

/** The RAMEN base node labels. */
const BASE_NODE_LABELS: readonly BaseNodeLabel[] = ["Annotation", "Collection", "Content", "Entity"];

/** Qualified refs of the RAMEN base nodes */
export const BASE_NODE_REF = {
  Collection: `${RAMEN_MODEL.id}:${RAMEN_ELEMENT.COLLECTION}`,
  Content: `${RAMEN_MODEL.id}:${RAMEN_ELEMENT.CONTENT}`,
  Entity: `${RAMEN_MODEL.id}:${RAMEN_ELEMENT.ENTITY}`,
  Annotation: `${RAMEN_MODEL.id}:${RAMEN_ELEMENT.ANNOTATION}`,
} as const;

/** The qualified refs of {@linkcode BASE_NODE_REF} as a list */
export const BASE_NODE_REFS: readonly string[] = Object.values(BASE_NODE_REF);

/** RAMEN core's built-in type refs (`String`, `Integer` ...), which need no data type declaration in the model */
export const BUILTIN_TYPES: readonly string[] = Object.values(DataTypes);

// prettier-ignore
/**
 * Value types of String data types by their `format` constraint, in addition to RAMEN core's built-in types. Other
 * formats (`uri`, `email` etc.) stay `String`.
 */
export const VALUE_TYPE_BY_FORMAT = {
  "date": "Date",
  "date-time": "DateTime",
} as const;

/** A value type of a String data type with a format, see {@linkcode VALUE_TYPE_BY_FORMAT} */
export type FormatValueType = (typeof VALUE_TYPE_BY_FORMAT)[keyof typeof VALUE_TYPE_BY_FORMAT];

/**
 * The value type of an attribute as the editors need it: RAMEN core's built-in types, plus the types of strings with a
 * format (see `getValueType` in `modelHelper.ts`). Lists are told apart by `isList`.
 */
export type AttributeValueType = BuiltinType | FormatValueType;

/**
 * Creates a new Collection of the given type, with an empty label and the type's initial values. The type's labels and
 * classifier are set on creation, so the node never needs its labels changed later.
 *
 * @param {NodeTypeOption} type - The node type, see `getNodeTypeOptions` in the config store.
 * @return {CollectionNode} The new Collection.
 */
export function createCollectionNode(type: NodeTypeOption): CollectionNode {
  return {
    nodeLabels: [...type.nodeLabels],
    classifierRef: type.classifierRef,
    data: {
      ...type.initialData,
      uuid: crypto.randomUUID(),
      label: "",
    },
  };
}

/**
 * Creates a new Content of the given type, with an empty text and the type's initial values. The type's labels and
 * classifier are set on creation, so the node never needs its labels changed later.
 *
 * @param {NodeTypeOption} type - The node type, see `getNodeTypeOptions` in the config store.
 * @return {TextNode} The new Content.
 */
export function createTextNode(type: NodeTypeOption): TextNode {
  return {
    nodeLabels: [...type.nodeLabels],
    classifierRef: type.classifierRef,
    data: {
      ...type.initialData,
      uuid: crypto.randomUUID(),
      text: "",
    },
  };
}

/**
 * Creates a new Entity of the given type, with an empty label and the type's initial values. The type's labels and
 * classifier are set on creation, so the node never needs its labels changed later.
 *
 * @param {NodeTypeOption} type - The node type, see `getNodeTypeOptions` in the config store.
 * @return {EntityNode} The new Entity.
 */
export function createEntityNode(type: NodeTypeOption): EntityNode {
  return {
    nodeLabels: [...type.nodeLabels],
    classifierRef: type.classifierRef,
    data: {
      ...type.initialData,
      uuid: crypto.randomUUID(),
      label: "",
    },
  };
}

/**
 * Filters out the RAMEN base node labels from the given array, returning only the domain-specific labels.
 *
 * Mainly used for visual purposes (base node labels do not need to be displayed), e.g. in node previews,
 * tooltips or icon resolution.
 *
 * @param {string[]} nodeLabels - The full list of node labels to filter.
 * @returns {string[]} The labels with all base node labels removed.
 */
export function filterBaseNodeLabels(nodeLabels: string[]): string[] {
  return nodeLabels.filter((l: string) => !BASE_NODE_LABELS.includes(l as BaseNodeLabel));
}
