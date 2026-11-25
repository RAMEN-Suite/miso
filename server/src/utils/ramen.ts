import { DataTypes, RAMEN_ELEMENT, RAMEN_MODEL, BuiltinType } from "@ramen-suite/core";
import { BaseNodeLabel } from "../models/types.js";

/** The RAMEN base node labels. */
export const BASE_NODE_LABELS: readonly BaseNodeLabel[] = ["Annotation", "Collection", "Content", "Entity"];

/** Qualified refs of the RAMEN base nodes */
export const BASE_NODE_REF = {
  Collection: `${RAMEN_MODEL.id}:${RAMEN_ELEMENT.COLLECTION}`,
  Content: `${RAMEN_MODEL.id}:${RAMEN_ELEMENT.CONTENT}`,
  Entity: `${RAMEN_MODEL.id}:${RAMEN_ELEMENT.ENTITY}`,
  Annotation: `${RAMEN_MODEL.id}:${RAMEN_ELEMENT.ANNOTATION}`,
} as const;

/** The qualified refs of {@linkcode BASE_NODE_REF} as a list */
export const BASE_NODE_REFS: readonly string[] = Object.values(BASE_NODE_REF);

/** The relationship types of RAMEN's base relations */
export const RAMEN_RELATION_TYPES = ["HAS_ANNOTATION", "PART_OF", "REFERS_TO"] as const;

/** A relationship type of RAMEN's base relations, see {@linkcode RAMEN_RELATION_TYPES} */
export type RelationType = (typeof RAMEN_RELATION_TYPES)[number];

/**
 * Whether a stored relationship type is one of RAMEN's base relations.
 *
 * @param {string} type - The relationship type.
 * @returns {boolean} `true` for the types in {@linkcode RAMEN_RELATION_TYPES}.
 */
export function isRelationType(type: string): type is RelationType {
  return (RAMEN_RELATION_TYPES as readonly string[]).includes(type);
}

/** RAMEN core's built-in type refs (`String`, `Integer` ...), which need no data type declaration in the model */
export const BUILTIN_TYPES: readonly string[] = Object.values(DataTypes);

/**
 * Value types of String data types by their `format` constraint, in addition to RAMEN core's built-in types. Other
 * formats (`uri`, `email` etc.) stay `String`.
 */
export const VALUE_TYPE_BY_FORMAT = {
  date: "Date",
  "date-time": "DateTime",
} as const;

/** A value type of a String data type with a format, see {@linkcode VALUE_TYPE_BY_FORMAT} */
export type FormatValueType = (typeof VALUE_TYPE_BY_FORMAT)[keyof typeof VALUE_TYPE_BY_FORMAT];

/**
 * The value type of an attribute: RAMEN core's built-in types, plus the types of strings with a format (see
 * `getValueType`). Lists are told apart by `isList`.
 */
export type AttributeValueType = BuiltinType | FormatValueType;
