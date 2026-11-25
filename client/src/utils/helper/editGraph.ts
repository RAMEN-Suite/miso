import type { EditGraph, EditNode, EditRelation, ElementNode, ElementRelation, ModelContext } from "../../models/types";
import { findRelation } from "./modelHelper";

/**
 * Operations and selectors on an {@linkcode EditGraph}. Operations change the graph in place and keep the statuses
 * consistent: a node's status describes the node, a relation's status the link.
 *
 * @packageDocumentation
 */

/** The relationship types of RAMEN's base relations */
export type RelationType = "HAS_ANNOTATION" | "REFERS_TO" | "PART_OF";

/** The identity of a relation: its ends and its relation definition */
type RelationKey = Pick<ElementRelation, "from" | "relationRef" | "to">;

/**
 * Adds a stored node (e.g. one picked in a search) as `unchanged`, unless the graph already contains it.
 *
 * @param {EditGraph} graph - The graph, changed in place.
 * @param {ElementNode} node - The stored node.
 */
export function addExistingNode(graph: EditGraph, node: ElementNode): void {
  if (!findNode(graph, node.properties.uuid)) {
    graph.nodes.push({ ...node, status: "unchanged" });
  }
}

/**
 * Links two nodes: a new relation is `added`, a `removed` one becomes `unchanged` again.
 *
 * @param {EditGraph} graph - The graph, changed in place.
 * @param {ElementRelation} relation - The relation.
 */
export function addRelation(graph: EditGraph, relation: ElementRelation): void {
  const current: EditRelation | undefined = graph.relations.find((candidate) => isSameRelation(candidate, relation));

  if (!current) {
    graph.relations.push({ ...relation, status: "added" });
  } else if (current.status === "removed") {
    current.status = "unchanged";
  }
}

/**
 * The annotations of a node (outgoing `HAS_ANNOTATION`).
 *
 * @param {ModelContext} context - The model context.
 * @param {EditGraph} graph - The graph.
 * @param {string} uuid - The uuid of the carrier.
 * @returns {EditNode[]} The annotations.
 */
export function annotationsOf(context: ModelContext, graph: EditGraph, uuid: string): EditNode[] {
  return linkedNodes(context, graph, uuid, "HAS_ANNOTATION", "outgoing");
}

/**
 * Brings the graph in line with the database after a save: deleted nodes, deleted orphans, removed relations and the
 * relations of dropped nodes are dropped, everything else becomes `unchanged`.
 *
 * @param {EditGraph} graph - The saved graph, changed in place.
 * @param {string[]} deletedOrphans - uuids of the annotations the server deleted as orphans.
 */
export function applySaveResult(graph: EditGraph, deletedOrphans: string[]): void {
  const droppedUuids = new Set<string>([
    ...graph.nodes.filter((node) => node.status === "deleted").map((node) => node.properties.uuid),
    ...deletedOrphans,
  ]);

  graph.nodes = graph.nodes.filter((node) => !droppedUuids.has(node.properties.uuid));
  graph.relations = graph.relations.filter(
    (relation) => relation.status !== "removed" && !droppedUuids.has(relation.from) && !droppedUuids.has(relation.to),
  );

  for (const element of [...graph.nodes, ...graph.relations]) {
    element.status = "unchanged";
  }
}

/**
 * The carriers of an annotation (incoming `HAS_ANNOTATION`).
 *
 * @param {ModelContext} context - The model context.
 * @param {EditGraph} graph - The graph.
 * @param {string} uuid - The uuid of the annotation.
 * @returns {EditNode[]} The carriers.
 */
export function carriersOf(context: ModelContext, graph: EditGraph, uuid: string): EditNode[] {
  return linkedNodes(context, graph, uuid, "HAS_ANNOTATION", "incoming");
}

/**
 * Adds a new node as `created`.
 *
 * @param {EditGraph} graph - The graph, changed in place.
 * @param {ElementNode} node - The node, with its refs.
 * @throws {Error} If the graph already contains the node.
 */
export function createNode(graph: EditGraph, node: ElementNode): void {
  if (findNode(graph, node.properties.uuid)) {
    throw new Error(`The graph already contains the node ${node.properties.uuid}`);
  }

  graph.nodes.push({ ...node, status: "created" });
}

/**
 * Deletes a node. A `created` node is dropped with its relations. A stored node becomes `deleted` and keeps its stored
 * relations (the server detaches them); its `added` relations are dropped.
 *
 * @param {EditGraph} graph - The graph, changed in place.
 * @param {string} uuid - The uuid of the node.
 */
export function deleteNode(graph: EditGraph, uuid: string): void {
  const node: EditNode | undefined = findNode(graph, uuid);

  if (!node) {
    return;
  }

  const touchesNode = (relation: EditRelation): boolean => relation.from === uuid || relation.to === uuid;

  if (node.status === "created") {
    graph.nodes.splice(graph.nodes.indexOf(node), 1);
    graph.relations = graph.relations.filter((relation) => !touchesNode(relation));
  } else {
    node.status = "deleted";
    graph.relations = graph.relations.filter((relation) => !(touchesNode(relation) && relation.status === "added"));
  }
}

/**
 * The node with the given uuid, deleted ones included.
 *
 * @param {EditGraph} graph - The graph.
 * @param {string} uuid - The uuid.
 * @returns {EditNode | undefined} The node, `undefined` if the graph doesn't contain it.
 */
export function findNode(graph: EditGraph, uuid: string): EditNode | undefined {
  return graph.nodes.find((node) => node.properties.uuid === uuid);
}

/**
 * Whether the graph has unsaved changes.
 *
 * @param {EditGraph} graph - The graph.
 * @returns {boolean} `true` if a node or relation isn't `unchanged`.
 */
export function hasChanges(graph: EditGraph): boolean {
  return (
    graph.nodes.some((node) => node.status !== "unchanged") || graph.relations.some((relation) => relation.status !== "unchanged")
  );
}

/**
 * Whether a relation is part of the current state: not `removed` and no end `deleted`.
 *
 * @param {EditGraph} graph - The graph.
 * @param {EditRelation} relation - The relation.
 * @returns {boolean} `true` if the relation is current.
 */
function isCurrentRelation(graph: EditGraph, relation: EditRelation): boolean {
  if (relation.status === "removed") {
    return false;
  }

  const ends: (EditNode | undefined)[] = [findNode(graph, relation.from), findNode(graph, relation.to)];

  return ends.every((end) => end !== undefined && end.status !== "deleted");
}

/**
 * Whether a relation's definition has the given type as name.
 *
 * @param {ModelContext} context - The model context.
 * @param {EditRelation} relation - The relation.
 * @param {RelationType} type - The relationship type.
 * @returns {boolean} `true` if the type matches.
 */
function isOfType(context: ModelContext, relation: EditRelation, type: RelationType): boolean {
  return relation.relationRef !== null && findRelation(context, relation.relationRef)?.name === type;
}

/**
 * Whether two relations are the same relation.
 *
 * @param {RelationKey} a - A relation.
 * @param {RelationKey} b - Another relation.
 * @returns {boolean} `true` if ends and relation definition match.
 */
function isSameRelation(a: RelationKey, b: RelationKey): boolean {
  return a.from === b.from && a.relationRef === b.relationRef && a.to === b.to;
}

/**
 * The nodes a node is linked to by current relations of a type.
 *
 * @param {ModelContext} context - The model context.
 * @param {EditGraph} graph - The graph.
 * @param {string} uuid - The uuid of the node.
 * @param {RelationType} type - The relationship type.
 * @param {"outgoing" | "incoming"} direction - Whether the node is the start (`outgoing`) or the end (`incoming`).
 * @returns {EditNode[]} The linked nodes.
 */
export function linkedNodes(
  context: ModelContext,
  graph: EditGraph,
  uuid: string,
  type: RelationType,
  direction: "outgoing" | "incoming",
): EditNode[] {
  return graph.relations
    .filter((relation) => (direction === "outgoing" ? relation.from : relation.to) === uuid)
    .filter((relation) => isOfType(context, relation, type) && isCurrentRelation(graph, relation))
    .map((relation) => findNode(graph, direction === "outgoing" ? relation.to : relation.from))
    .filter((node): node is EditNode => node !== undefined);
}

/**
 * The parts of a Collection (incoming `PART_OF`).
 *
 * @param {ModelContext} context - The model context.
 * @param {EditGraph} graph - The graph.
 * @param {string} uuid - The uuid of the Collection.
 * @returns {EditNode[]} The parts.
 */
export function partsOf(context: ModelContext, graph: EditGraph, uuid: string): EditNode[] {
  return linkedNodes(context, graph, uuid, "PART_OF", "incoming");
}

/**
 * The nodes an annotation refers to (outgoing `REFERS_TO`).
 *
 * @param {ModelContext} context - The model context.
 * @param {EditGraph} graph - The graph.
 * @param {string} uuid - The uuid of the annotation.
 * @returns {EditNode[]} The referenced nodes.
 */
export function referencesOf(context: ModelContext, graph: EditGraph, uuid: string): EditNode[] {
  return linkedNodes(context, graph, uuid, "REFERS_TO", "outgoing");
}

/**
 * Unlinks two nodes, both nodes stay: an `added` relation is dropped, a stored one becomes `removed`.
 *
 * @param {EditGraph} graph - The graph, changed in place.
 * @param {ElementRelation} relation - The relation.
 */
export function removeRelation(graph: EditGraph, relation: ElementRelation): void {
  const current: EditRelation | undefined = graph.relations.find((candidate) => isSameRelation(candidate, relation));

  if (!current) {
    return;
  }

  if (current.status === "added") {
    graph.relations.splice(graph.relations.indexOf(current), 1);
  } else {
    current.status = "removed";
  }
}

/**
 * Replaces the data of a node: `unchanged` becomes `modified`, `created` stays `created`.
 *
 * @param {EditGraph} graph - The graph, changed in place.
 * @param {ElementNode} node - The node with its new data.
 * @throws {Error} If the graph has no such node or it is deleted.
 */
export function updateNode(graph: EditGraph, node: ElementNode): void {
  const current: EditNode | undefined = findNode(graph, node.properties.uuid);

  if (!current || current.status === "deleted") {
    throw new Error(`The graph has no node ${node.properties.uuid} to update`);
  }

  const status: EditNode["status"] = current.status === "created" ? "created" : "modified";

  Object.assign(current, { ...node, status });
}
