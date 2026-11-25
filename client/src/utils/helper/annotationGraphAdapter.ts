import type {
  Annotation,
  EditGraph,
  EditNode,
  EditRelation,
  ElementNodeStatus,
  ElementRelationStatus,
  ModelContext,
  NodeStatus,
  NodeStatusObject,
} from "../../models/types";
import { BASE_NODE_REF } from "../../config/ramen";
import { cloneDeep } from "./helper";
import { EditNodeData, findNode, toGraphNode } from "./editGraph";
import { getBaseNodeLabel } from "./modelHelper";
import { relationRefOf } from "./writePayload";

/**
 * Converts the text editor's annotation trees to and from the graph the reference components work on, until the
 * editor keeps graphs itself.
 *
 * @packageDocumentation
 */

/**
 * The graph of an annotation and its direct children, with the statuses of the tree split into node and relation statuses.
 *
 * @param {ModelContext} context - The model context.
 * @param {Annotation} annotation - The annotation tree. Is not changed.
 * @returns {EditGraph} The graph.
 */
export function annotationToGraph(context: ModelContext, annotation: Annotation): EditGraph {
  const copy: Annotation = cloneDeep(annotation);
  const root: EditNodeData = toGraphNode(context, copy.node);
  const rootRef: string = root.classifierRef ?? BASE_NODE_REF.Annotation;
  const graph: EditGraph = { nodes: [{ ...root, status: nodeStatusOf(copy.meta.status) }], relations: [] };

  for (const child of copy.connectedNodes) {
    const node: EditNodeData = toGraphNode(context, child.node);
    const isAnnotation: boolean = getBaseNodeLabel(context, child.node) === "Annotation";
    const childRef: string = node.classifierRef ?? (isAnnotation ? BASE_NODE_REF.Annotation : BASE_NODE_REF.Entity);

    graph.nodes.push({ ...node, status: nodeStatusOf(child.meta.status) });
    graph.relations.push({
      status: relationStatusOf(child.meta.status),
      relationRef: relationRefOf(context, rootRef, isAnnotation ? "HAS_ANNOTATION" : "REFERS_TO", childRef),
      from: root.properties.uuid,
      to: node.properties.uuid,
    });
  }

  return graph;
}

/**
 * The annotation tree of a graph made by {@linkcode annotationToGraph}: the annotation's data and its children from
 * the graph, the nested children and the annotation's own status from the original tree.
 *
 * @param {EditGraph} graph - The graph.
 * @param {Annotation} original - The tree the graph was made from.
 * @returns {Annotation} The tree.
 */
export function graphToAnnotation(graph: EditGraph, original: Annotation): Annotation {
  const uuid: string = original.node.properties.uuid;
  const root: EditNode | undefined = findNode(graph, uuid);
  const originalChildren = new Map<string, NodeStatusObject>(
    original.connectedNodes.map((child) => [child.node.properties.uuid, child]),
  );

  const connectedNodes: NodeStatusObject[] = graph.relations
    .filter((relation) => relation.from === uuid)
    .flatMap((relation) => {
      const child: EditNode | undefined = findNode(graph, relation.to);

      if (!child) {
        return [];
      }

      return [
        {
          node: toTreeNode(child),
          connectedNodes: cloneDeep(originalChildren.get(child.properties.uuid)?.connectedNodes ?? []),
          meta: { status: treeStatusOf(child, relation) },
        },
      ];
    });

  return {
    node: { ...cloneDeep(original.node), properties: cloneDeep(root?.properties ?? original.node.properties) },
    connectedNodes,
    meta: { ...original.meta },
  } as Annotation;
}

/**
 * The node status in a tree status: the node's own change, if any.
 *
 * @param {NodeStatus} status - The tree status.
 * @returns {ElementNodeStatus} The node status.
 */
function nodeStatusOf(status: NodeStatus): ElementNodeStatus {
  if (status === "created" || status === "modified" || status === "deleted") {
    return status;
  } else {
    return "unchanged";
  }
}

/**
 * The relation status in a child's tree status: the change of its link to the parent, if any.
 *
 * @param {NodeStatus} status - The tree status of the child.
 * @returns {ElementRelationStatus} The relation status.
 */
function relationStatusOf(status: NodeStatus): ElementRelationStatus {
  if (status === "created" || status === "added") {
    return "added";
  } else if (status === "removed") {
    return "removed";
  } else {
    return "unchanged";
  }
}

/**
 * The tree node of a graph node, without the status.
 *
 * @param {EditNode} node - The graph node.
 * @returns {NodeStatusObject["node"]} The tree node.
 */
function toTreeNode(node: EditNode): NodeStatusObject["node"] {
  const { nodeLabels, classifierRef, shapeRef, properties } = cloneDeep(node);

  return {
    nodeLabels,
    classifierRef,
    ...(shapeRef !== undefined ? { shapeRef } : {}),
    properties,
  } as unknown as NodeStatusObject["node"];
}

/**
 * The tree status of a child: unlinking first, then its creation, its link, its own change.
 *
 * @param {EditNode} child - The child node.
 * @param {EditRelation} relation - The relation from the parent.
 * @returns {NodeStatus} The tree status.
 */
function treeStatusOf(child: EditNode, relation: EditRelation): NodeStatus {
  if (relation.status === "removed") {
    return "removed";
  } else if (child.status === "created") {
    return "created";
  } else if (relation.status === "added") {
    return "added";
  } else {
    return child.status;
  }
}
