import ValidationError from "../errors/validation.error.js";
import {
  ElementGraph,
  ElementNode,
  ElementRelation,
  ModelAnnotationShape,
  ModelAttribute,
  ModelContext,
  Node,
  NodeUpdateObject,
} from "../models/types.js";
import { toNeo4jTypes, toStoredSelector } from "./helper.js";
import { findRelation, findShape, getBaseNodeRef, getNodeAttributes, getShapeProperties } from "./modelHelper.js";
import { BASE_NODE_REF } from "./ramen.js";

/**
 * Converts a node for the write query: only labels and data (the refs are not stored), with the values converted to
 * Neo4j types by the attributes of its classifier (Collections) or its annotation shape (annotations), and the selector
 * of an annotation as JSON string (see `toStoredSelector`). The values of Contents and Entities are stored as sent.
 */
function convertNodeToNeo4jFormat(node: Node<object>, context: ModelContext): Node<object> {
  const baseNodeRef: string | undefined = node.classifierRef ? getBaseNodeRef(context, node.classifierRef) : undefined;

  if (baseNodeRef === BASE_NODE_REF.Collection && node.classifierRef) {
    return { nodeLabels: node.nodeLabels, data: toNeo4jTypes(context, node.data, getNodeAttributes(context, node.classifierRef)) };
  } else if (baseNodeRef === BASE_NODE_REF.Annotation) {
    const shape: ModelAnnotationShape | undefined = node.shapeRef ? findShape(context, node.shapeRef) : undefined;
    const fields: ModelAttribute[] = shape ? getShapeProperties(shape) : [];

    return { nodeLabels: node.nodeLabels, data: toStoredSelector(toNeo4jTypes(context, node.data, fields)) };
  } else {
    return { nodeLabels: node.nodeLabels, data: node.data };
  }
}

/**
 * The labels a node is stored with: the names of its classifier's lineage, RAMEN base node first.
 *
 * @param {ModelContext} context - The model context.
 * @param {ElementNode} node - The node of the payload.
 * @returns {string[]} The labels.
 * @throws {ValidationError} If the classifier is missing or not in the model.
 */
function nodeLabelsOf(context: ModelContext, node: ElementNode): string[] {
  if (!node.classifierRef || !context.model.getNode(node.classifierRef)) {
    throw new ValidationError(`Node ${node.data.uuid} has an unknown node type: ${String(node.classifierRef)}.`);
  }

  if (node.shapeRef && !findShape(context, node.shapeRef)) {
    throw new ValidationError(`Node ${node.data.uuid} has an unknown annotation type: ${node.shapeRef}.`);
  }

  return context.model.getNodeLineage(node.classifierRef).map((item) => item.name);
}

/**
 * The relationship of a payload relation as the write query takes it: its type is the name of its relation definition.
 *
 * @param {ModelContext} context - The model context.
 * @param {ElementRelation} relation - The relation of the payload.
 * @returns {NodeUpdateObject["attach"][number]} The relationship.
 * @throws {ValidationError} If the relation definition is missing (`null` is only allowed on reads) or not in the model.
 */
function toEdge(context: ModelContext, relation: ElementRelation): NodeUpdateObject["attach"][number] {
  const type: string | undefined = relation.relationRef ? findRelation(context, relation.relationRef)?.name : undefined;

  if (!type) {
    throw new ValidationError(`Unknown relation ${String(relation.relationRef)} from ${relation.from} to ${relation.to}.`);
  }

  return { type, startUuid: relation.from, endUuid: relation.to };
}

/**
 * Converts a write payload into the changes of the write, with the values as sent. The labels of created and updated
 * nodes come from their `classifierRef`, the relationship types from the `relationRef`s; the client sends no labels.
 *
 * @param {ModelContext} context - The model context.
 * @param {ElementGraph} payload - The nodes (`created`, `modified`, `deleted`) and relations (`added`, `removed`), as
 *   parsed by `parseWritePayload` in `utils/helper.ts`.
 * @returns {NodeUpdateObject} The changes, grouped by operation.
 * @throws {ValidationError} If a node or relation is malformed or references unknown model elements.
 */
export function toNodeChanges(context: ModelContext, payload: ElementGraph): NodeUpdateObject {
  const changes: NodeUpdateObject = { create: [], update: [], delete: [], remove: [], attach: [] };

  for (const node of payload.nodes) {
    if (typeof node?.data?.uuid !== "string") {
      throw new ValidationError("Every node needs `data.uuid`.");
    }

    if (node.status === "deleted") {
      changes.delete.push({ nodeLabels: [], data: { uuid: node.data.uuid } });
    } else if (node.status === "created" || node.status === "modified") {
      const stored: Node<object> = {
        nodeLabels: nodeLabelsOf(context, node),
        classifierRef: node.classifierRef,
        shapeRef: node.shapeRef,
        data: node.data,
      };

      (node.status === "created" ? changes.create : changes.update).push(stored);
    } else {
      throw new ValidationError(`Node ${node.data.uuid} has the status "${String(node.status)}", expected created, modified or deleted.`);
    }
  }

  for (const relation of payload.relations) {
    if (relation.status === "added") {
      changes.attach.push(toEdge(context, relation));
    } else if (relation.status === "removed") {
      changes.remove.push(toEdge(context, relation));
    } else {
      throw new ValidationError(`A relation has the status "${String(relation.status)}", expected added or removed.`);
    }
  }

  return changes;
}

/**
 * Converts the values of created and updated nodes to Neo4j types, using the attributes of the model, for
 * {@link buildSubgraphUpdateQuery}.
 *
 * @param changes - The changes, as returned by {@link toNodeChanges}.
 * @param context - The model context, used to resolve the attributes of Annotation and Collection nodes.
 * @returns The changes with converted values.
 */
export function toNeo4jChanges(changes: NodeUpdateObject, context: ModelContext): NodeUpdateObject {
  return {
    ...changes,
    create: changes.create.map((node) => convertNodeToNeo4jFormat(node, context)),
    update: changes.update.map((node) => convertNodeToNeo4jFormat(node, context)),
  };
}

/**
 * Returns a Cypher query string that executes a full CRUD update cycle for a node subgraph. Returns the root node after
 * all changes are applied (`node`) and the uuids of the neighbours the deleted nodes had (`neighboursOfDeleted`).
 *
 * Expected parameters: `$uuid`, `$delete`, `$create`, `$update`, `$remove`, `$attach` —
 * as produced by {@link toNodeChanges} and {@link toNeo4jChanges}. The root is a Content or a Collection.
 */
export function buildSubgraphUpdateQuery(): string {
  return `
  // Delete nodes and their relationships; the aggregation keeps one row when nothing is deleted
  CALL () {
      UNWIND $delete AS nodeToDelete

      MATCH (n:Annotation|Content|Collection|Entity {uuid: nodeToDelete.data.uuid})
      OPTIONAL MATCH (n)--(m:Annotation|Content|Collection|Entity)

      WITH collect(DISTINCT n) AS deleted, collect(DISTINCT m.uuid) AS neighbours
      FOREACH (d IN deleted | DETACH DELETE d)

      RETURN neighbours AS neighboursOfDeleted
  }

  // Create new nodes with dynamic labels
  CALL () {
      UNWIND $create AS nodeToCreate

      CREATE (n)
      SET n = nodeToCreate.data
      WITH n, nodeToCreate
      CALL apoc.create.addLabels(n, nodeToCreate.nodeLabels) YIELD node

      RETURN count(node) AS created
  }

  // Update properties and labels of existing nodes
  CALL () {
      UNWIND $update AS nodeToUpdate

      MATCH (n:Annotation|Content|Collection|Entity {uuid: nodeToUpdate.data.uuid})
      SET n = nodeToUpdate.data
      WITH n, nodeToUpdate, labels(n) AS currentLabels
      CALL apoc.create.removeLabels(n, currentLabels) YIELD node
      CALL apoc.create.addLabels(node, nodeToUpdate.nodeLabels) YIELD node AS updatedNode
      RETURN count(updatedNode) AS updated
  }

  // Remove relationships
  CALL () {
      UNWIND $remove AS edge

      MATCH (start:Annotation|Content|Collection|Entity {uuid: edge.startUuid})-[r]->(end:Annotation|Content|Collection|Entity {uuid: edge.endUuid})
      WHERE type(r) = edge.type

      DELETE r
  }

  // Create relationships with dynamic type
  CALL () {
      UNWIND $attach AS edge

      MATCH (start:Annotation|Content|Collection|Entity {uuid: edge.startUuid})
      MATCH (end:Annotation|Content|Collection|Entity {uuid: edge.endUuid})
      CALL apoc.merge.relationship(start, edge.type, {}, {}, end) YIELD rel

      RETURN count(rel) AS attached
  }

  // Return the root node
  MATCH (root:Content|Collection {uuid: $uuid})

  RETURN {
      nodeLabels: labels(root),
      data: root {.*}
  } AS node, neighboursOfDeleted
  `;
}
