import { DataTypes, RAMEN_ELEMENT, RAMEN_MODEL, BuiltinType } from "@ramen-suite/core";
import { BaseNodeLabel } from "../models/types.js";

/**
 * The qualified ref of a RAMEN base node. Its label in the database is its name in RAMEN's reference model, which is
 * checked here, so a renamed base node fails on startup instead of silently matching no stored node.
 *
 * @param {BaseNodeLabel} label - The label the node is stored with.
 * @param {string} id - The node's id in RAMEN's reference model, see `RAMEN_ELEMENT`.
 * @returns {string} The qualified ref.
 * @throws {Error} If the reference model names the node differently.
 */
function baseNodeRefOf(label: BaseNodeLabel, id: string): string {
  const name: string | undefined = RAMEN_MODEL.classifiers.find((classifier) => classifier.id === id)?.name;

  if (name !== label) {
    throw new Error(`RAMEN's base node ${id} is named "${name}", not "${label}"`);
  }

  return `${RAMEN_MODEL.id}:${id}`;
}

/** Qualified refs of the RAMEN base nodes, by their label */
export const BASE_NODE_REF = {
  Annotation: baseNodeRefOf("Annotation", RAMEN_ELEMENT.ANNOTATION),
  Collection: baseNodeRefOf("Collection", RAMEN_ELEMENT.COLLECTION),
  Content: baseNodeRefOf("Content", RAMEN_ELEMENT.CONTENT),
  Entity: baseNodeRefOf("Entity", RAMEN_ELEMENT.ENTITY),
} as const satisfies Record<BaseNodeLabel, string>;

/** The RAMEN base node labels */
export const BASE_NODE_LABELS = Object.keys(BASE_NODE_REF) as readonly BaseNodeLabel[];

/** The labels of the RAMEN base nodes, by their qualified refs */
export const BASE_NODE_LABEL_BY_REF: Readonly<Record<string, BaseNodeLabel>> = Object.fromEntries(
  BASE_NODE_LABELS.map((label) => [BASE_NODE_REF[label], label]),
);

/** The qualified refs of {@linkcode BASE_NODE_REF} as a list */
export const BASE_NODE_REFS: readonly string[] = Object.values(BASE_NODE_REF);

/**
 * A Cypher node pattern matching any RAMEN base node, e.g. `(n:Annotation|Collection|Content|Entity {uuid: $uuid})`.
 *
 * @param {string} variable - The node variable, empty for an anonymous node.
 * @param {string} [properties] - The property map, without braces, e.g. `uuid: $uuid`.
 * @returns {string} The pattern.
 */
export function baseNodePattern(variable: string, properties?: string): string {
  return `(${variable}:${BASE_NODE_LABELS.join("|")}${properties ? ` {${properties}}` : ""})`;
}

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
