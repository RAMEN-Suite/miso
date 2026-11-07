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
 * `getValueType` in `utils/modelHelper.ts`). Lists are told apart by `isList`.
 */
export type AttributeValueType = BuiltinType | FormatValueType;
