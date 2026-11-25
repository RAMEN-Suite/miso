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
import { HAS_ANNOTATION } from "./storedGraph.js";

/**
 * Converts a node for the write query: only labels and properties (the refs are not stored), with the values converted to
 * Neo4j types by the attributes of its classifier (Collections) or its annotation shape (annotations), and the selector
 * of an annotation as JSON string (see `toStoredSelector`). The values of Contents and Entities are stored as sent.
 */
function convertNodeToNeo4jFormat(node: Node<object>, context: ModelContext): Node<object> {
  const baseNodeRef: string | undefined = node.classifierRef ? getBaseNodeRef(context, node.classifierRef) : undefined;

  if (baseNodeRef === BASE_NODE_REF.Collection && node.classifierRef) {
    return {
      nodeLabels: node.nodeLabels,
      properties: toNeo4jTypes(context, node.properties, getNodeAttributes(context, node.classifierRef)),
    };
  } else if (baseNodeRef === BASE_NODE_REF.Annotation) {
    const shape: ModelAnnotationShape | undefined = node.shapeRef ? findShape(context, node.shapeRef) : undefined;
    const fields: ModelAttribute[] = shape ? getShapeProperties(shape) : [];

    return { nodeLabels: node.nodeLabels, properties: toStoredSelector(toNeo4jTypes(context, node.properties, fields)) };
  } else {
    return { nodeLabels: node.nodeLabels, properties: node.properties };
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
    throw new ValidationError(`Node ${node.properties.uuid} has an unknown node type: ${String(node.classifierRef)}.`);
  }

  if (node.shapeRef && !findShape(context, node.shapeRef)) {
    throw new ValidationError(`Node ${node.properties.uuid} has an unknown annotation type: ${node.shapeRef}.`);
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
 *   parsed by `parseWritePayload`.
 * @returns {NodeUpdateObject} The changes, grouped by operation.
 * @throws {ValidationError} If a node or relation is malformed or references unknown model elements.
 */
export function toNodeChanges(context: ModelContext, payload: ElementGraph): NodeUpdateObject {
  const changes: NodeUpdateObject = { create: [], update: [], delete: [], remove: [], attach: [] };

  for (const node of payload.nodes) {
    if (typeof node?.properties?.uuid !== "string") {
      throw new ValidationError("Every node needs `properties.uuid`.");
    }

    if (node.status === "deleted") {
      changes.delete.push({ nodeLabels: [], properties: { uuid: node.properties.uuid } });
    } else if (node.status === "created" || node.status === "modified") {
      const stored: Node<object> = {
        nodeLabels: nodeLabelsOf(context, node),
        classifierRef: node.classifierRef,
        shapeRef: node.shapeRef,
        properties: node.properties,
      };

      (node.status === "created" ? changes.create : changes.update).push(stored);
    } else {
      throw new ValidationError(
        `Node ${node.properties.uuid} has the status "${String(node.status)}", expected created, modified or deleted.`,
      );
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
 * A Cypher subquery that finds the annotations losing their last carrier when the given nodes are deleted: the annotations
 * below them along `HAS_ANNOTATION`, except those with another carrier and everything below those. Deleting is left to
 * the caller.
 *
 * @param {string} rootsVariable - Name of the variable with the nodes to delete (a list of nodes).
 * @param {string} orphansVariable - Name of the variable the orphans (a list of nodes, without the roots) are returned in.
 * @returns {string} The `CALL` subquery.
 */
export function orphanedAnnotationsCypher(rootsVariable: string, orphansVariable: string): string {
  return `
      CALL (${rootsVariable}) {
        // Candidates: all annotations carried by the roots, including sub-annotations
        CALL (${rootsVariable}) {
          UNWIND ${rootsVariable} AS root

          CALL apoc.path.subgraphNodes(root, {
            relationshipFilter: '${HAS_ANNOTATION}>',
            labelFilter: '+Annotation',
            minLevel: 1,
            maxLevel: -1
          }) YIELD node

          RETURN collect(DISTINCT node) AS candidates
        }

        // Shared roots: candidates that also have a carrier which is not deleted
        WITH candidates, [a IN candidates WHERE EXISTS {
          MATCH (carrier)-[:${HAS_ANNOTATION}]->(a)
          WHERE NOT carrier IN ${rootsVariable} + candidates
        }] AS sharedRoots

        // Shared roots and everything below them are kept
        CALL (sharedRoots) {
          UNWIND sharedRoots AS sharedRoot

          CALL apoc.path.subgraphNodes(sharedRoot, {
            relationshipFilter: '${HAS_ANNOTATION}>',
            labelFilter: '+Annotation',
            maxLevel: -1
          }) YIELD node

          RETURN collect(DISTINCT node) AS kept
        }

        RETURN [a IN candidates WHERE NOT a IN kept] AS ${orphansVariable}
      }
`;
}

/**
 * Returns a Cypher query string that executes a full CRUD update cycle for a node subgraph. Returns the root node after
 * all changes are applied (`node`), the uuids of the neighbours the deleted nodes and orphans had (`neighboursOfDeleted`)
 * and the uuids of the deleted orphans (`deletedOrphans`).
 *
 * Orphans are annotations that lost their last carrier in the write, and the annotations below them (see
 * {@link orphanedAnnotationsCypher}). They are deleted last, so an annotation moved to another carrier is kept.
 *
 * Expected parameters: `$uuid`, `$delete`, `$create`, `$update`, `$remove`, `$attach` —
 * as produced by {@link toNodeChanges} and {@link toNeo4jChanges}. The root is a Content or a Collection.
 */
export function buildSubgraphUpdateQuery(): string {
  return `
  // Delete nodes and their relationships; the aggregation keeps one row when nothing is deleted
  CALL () {
      UNWIND $delete AS nodeToDelete

      MATCH (n:Annotation|Content|Collection|Entity {uuid: nodeToDelete.properties.uuid})
      OPTIONAL MATCH (n)--(m:Annotation|Content|Collection|Entity)
      OPTIONAL MATCH (n)-[:${HAS_ANNOTATION}]->(c:Annotation)

      WITH collect(DISTINCT n) AS deleted, collect(DISTINCT m.uuid) AS neighbours, collect(DISTINCT c.uuid) AS carried
      FOREACH (d IN deleted | DETACH DELETE d)

      RETURN neighbours AS neighboursOfDeleted, carried AS carriedByDeleted
  }

  // Create new nodes with dynamic labels
  CALL () {
      UNWIND $create AS nodeToCreate

      CREATE (n)
      SET n = nodeToCreate.properties
      WITH n, nodeToCreate
      CALL apoc.create.addLabels(n, nodeToCreate.nodeLabels) YIELD node

      RETURN count(node) AS created
  }

  // Update properties and labels of existing nodes
  CALL () {
      UNWIND $update AS nodeToUpdate

      MATCH (n:Annotation|Content|Collection|Entity {uuid: nodeToUpdate.properties.uuid})
      SET n = nodeToUpdate.properties
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

  // Delete the orphans: candidates are the annotations that lost a carrier in this write
  WITH *, carriedByDeleted + [edge IN $remove WHERE edge.type = '${HAS_ANNOTATION}' | edge.endUuid] AS orphanCandidates

  CALL (orphanCandidates) {
      UNWIND orphanCandidates AS candidateUuid

      MATCH (a:Annotation {uuid: candidateUuid})
      WHERE NOT EXISTS { MATCH ()-[:${HAS_ANNOTATION}]->(a) }

      WITH collect(DISTINCT a) AS roots
      ${orphanedAnnotationsCypher("roots", "orphans")}
      WITH roots + orphans AS deletedOrphans

      CALL (deletedOrphans) {
        UNWIND deletedOrphans AS orphan

        MATCH (orphan)--(m:Annotation|Content|Collection|Entity)

        RETURN collect(DISTINCT m.uuid) AS neighbours
      }

      WITH deletedOrphans, neighbours, [o IN deletedOrphans | o.uuid] AS deletedOrphanUuids
      FOREACH (o IN deletedOrphans | DETACH DELETE o)

      RETURN deletedOrphanUuids, neighbours AS neighboursOfOrphans
  }

  // Return the root node
  MATCH (root:Content|Collection {uuid: $uuid})

  RETURN {
      nodeLabels: labels(root),
      properties: root {.*}
  } AS node, neighboursOfDeleted + neighboursOfOrphans AS neighboursOfDeleted, deletedOrphanUuids AS deletedOrphans
  `;
}
