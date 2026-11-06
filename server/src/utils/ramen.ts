import { DataTypes, RAMEN_ELEMENT, RAMEN_MODEL, BuiltinType } from "@ramen-suite/core";
import { BaseNodeData, BaseNodeLabel, EdgeDescriptor, Node } from "../models/types.js";

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

/**
 * Given a parent and child node from a node tree, returns the Neo4j relationship type
 * and the correctly-directed `startUuid`/`endUuid` for that edge. Used for creating flat update information
 * when passing data of unknown tree-depth into the cypher query.
 *
 * The tree is always ownership-ordered: a Content owns its Annotations, a Collection owns its Content
 * and Annotations, and an Annotation owns its sub-annotations and referenced nodes. The relationship
 * type follows from the label pair, and the edge direction matches Neo4j conventions — which for
 * `PART_OF` means the child points to the parent: `(Content|Collection)-[:PART_OF]->(Collection)`.
 *
 * This function is only valid when called with trees structured in that ownership order. Passing
 * an inverted or flat structure will produce incorrect results. Currently this is only used when updating content via Editor.
 *
 * @param parent - The owner node (closer to the tree root).
 * @param child - The owned node (further from the tree root).
 * @returns An {@link EdgeDescriptor} with the relationship type and correctly-oriented UUIDs.
 *
 * @throws If the label combination has no known relationship rule.
 */
export function inferRelationship(parent: Node<BaseNodeData>, child: Node<BaseNodeData>): EdgeDescriptor {
  const parentUuid: string = parent.data.uuid;
  const childUuid: string = child.data.uuid;

  const p: string[] = parent.nodeLabels;
  const c: string[] = child.nodeLabels;

  // Annotation → Annotation: sub-annotation (e.g. commentary text)
  if (p.includes("Annotation") && c.includes("Annotation")) {
    return { type: "HAS_ANNOTATION", startUuid: parentUuid, endUuid: childUuid };
  }

  // Annotation → Entity | Collection | Content: referenced nodes
  if (p.includes("Annotation")) {
    return { type: "REFERS_TO", startUuid: parentUuid, endUuid: childUuid };
  }

  // Content | Collection → Annotation
  if (c.includes("Annotation")) {
    return { type: "HAS_ANNOTATION", startUuid: parentUuid, endUuid: childUuid };
  }

  // Collection → Content | Collection → Collection: edge runs (Content|Collection)-[:PART_OF]->(Collection)
  if (p.includes("Collection") && (c.includes("Content") || c.includes("Collection"))) {
    return { type: "PART_OF", startUuid: childUuid, endUuid: parentUuid };
  }

  throw new Error(`Cannot infer relationship between [${p.join(", ")}] and [${c.join(", ")}]`);
}
