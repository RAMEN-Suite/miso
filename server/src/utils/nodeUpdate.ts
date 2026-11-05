import { IAnnotation } from "../models/IAnnotation.js";
import {
  AnnotationNode,
  CollectionNode,
  EntityNode,
  Node,
  NodeStatusObject,
  NodeUpdateObject,
  ContentNode,
} from "../models/types.js";
import { toNeo4jTypes } from "./helper.js";
import {
  getCollectionAttributes,
  getTextAnnotationProperties,
  type ModelAttribute,
  type ModelContext,
} from "./modelHelper.js";
import { inferRelationship } from "./ramen.js";

function convertNodeToNeo4jFormat(
  node: EntityNode | AnnotationNode | CollectionNode | ContentNode,
  context: ModelContext,
): Node<object> {
  let fields: ModelAttribute[];

  if (node.nodeLabels.includes("Content") || node.nodeLabels.includes("Entity")) {
    return node;
  } else if (node.nodeLabels.includes("Collection")) {
    fields = getCollectionAttributes(context, node.nodeLabels);
  } else if (node.nodeLabels.includes("Annotation")) {
    fields = getTextAnnotationProperties(context, (node.data as IAnnotation).type);
  } else {
    return node;
  }

  return {
    nodeLabels: node.nodeLabels,
    data: toNeo4jTypes(context, node.data, fields),
  };
}

function insertNodeIntoObject(
  parent: NodeStatusObject | null,
  node: NodeStatusObject,
  obj: NodeUpdateObject,
  context: ModelContext,
): NodeUpdateObject {
  node.connectedNodes.forEach((child) => insertNodeIntoObject(node, child, obj, context));

  if (node.meta.status === "deleted") {
    obj.delete.push(node.node);
  }

  if (node.meta.status === "created") {
    obj.create.push(convertNodeToNeo4jFormat(node.node, context));
  }

  if (node.meta.status === "modified") {
    obj.update.push(convertNodeToNeo4jFormat(node.node, context));
  }

  if (parent && (node.meta.status === "created" || node.meta.status === "added")) {
    obj.attach.push(inferRelationship(parent.node, node.node));
  }

  if (parent && node.meta.status === "removed" && parent.meta.status !== "deleted") {
    obj.remove.push(inferRelationship(parent.node, node.node));
  }

  return obj;
}

/**
 * Flattens a {@link NodeStatusObject} tree into a {@link NodeUpdateObject} ready for database execution.
 *
 * Traverses the tree depth-first, classifying each node into the appropriate CRUD bucket
 * (`create`, `update`, `delete`) and deriving the relationship changes (`attach`, `remove`)
 * from the parent–child status pairs. Type conversion to Neo4j-compatible values is applied
 * using the attributes of the model.
 *
 * @param root - Root of the ownership tree (e.g. a Content or Collection node with its children already set as `connectedNodes`).
 * @param context - The model context, used to resolve the attributes of Annotation and Collection nodes.
 * @returns A flat {@link NodeUpdateObject} with separate lists for each operation category.
 */
export function flattenNodeTree(root: NodeStatusObject, context: ModelContext): NodeUpdateObject {
  const obj: NodeUpdateObject = {
    create: [],
    delete: [],
    update: [],
    remove: [],
    attach: [],
  };

  insertNodeIntoObject(null, root, obj, context);

  return obj;
}

/**
 * Returns a Cypher query string that executes a full CRUD update cycle for a node subgraph
 * and returns the root node after all changes are applied.
 *
 * Expected parameters: `$uuid`, `$delete`, `$create`, `$update`, `$remove`, `$attach` —
 * as produced by {@link flattenNodeTree}.
 *
 * @param rootLabel - `'Content'` or `'Collection'` — the label of the root node that is matched and returned.
 */
export function buildSubgraphUpdateQuery(rootLabel: "Content" | "Collection"): string {
  return `
  // Delete nodes and their relationships
  CALL () {
      UNWIND $delete AS nodeToDelete

      MATCH (n:Annotation|Content|Collection|Entity {uuid: nodeToDelete.data.uuid})

      DETACH DELETE n
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
  MATCH (root:${rootLabel} {uuid: $uuid})

  RETURN {
      nodeLabels: labels(root),
      data: root {.*}
  } AS node
  `;
}
