import type {
  Annotation,
  AnnotationNode,
  CollectionNode,
  ContentNode,
  EditGraph,
  EditNode,
  EditRelation,
  ElementGraph,
  ElementNode,
  EntityNode,
  NodeAncestry,
} from "../../models/types";

/**
 * Turns reads in the element format (every read that returns nodes) into the client's formats: the editing graph, plain
 * nodes, annotations and ancestries. The counterpart of `writePayload.ts`.
 *
 * @packageDocumentation
 */

/**
 * The annotations of a Content from its annotation graph, each with the nodes below it along outgoing relations and
 * these relations. Only annotations (reached via `HAS_ANNOTATION`) are followed further, referenced nodes are leaves.
 *
 * @param {EditGraph} graph - The annotation graph of the Content, as read.
 * @param {string} carrierUuid - The uuid of the annotated Content.
 * @returns {Annotation[]} The annotations, in the order of the relations from the Content, values copied.
 */
export function toAnnotations(graph: EditGraph, carrierUuid: string): Annotation[] {
  const nodesByUuid = new Map<string, EditNode>(graph.nodes.map((node) => [node.properties.uuid, node]));

  return graph.relations
    .filter((relation) => relation.from === carrierUuid && relation.type === "HAS_ANNOTATION")
    .flatMap((carrierRelation) => {
      const root: EditNode | undefined = nodesByUuid.get(carrierRelation.to);

      if (!root) {
        return [];
      }

      const visited = new Set<string>([root.properties.uuid]);
      const queue: string[] = [root.properties.uuid];
      const nodes: EditNode[] = [];
      const relations: EditRelation[] = [];

      for (let from: string | undefined = queue.shift(); from !== undefined; from = queue.shift()) {
        for (const relation of graph.relations.filter((candidate) => candidate.from === from)) {
          const target: EditNode | undefined = nodesByUuid.get(relation.to);

          if (!target) {
            continue;
          }

          relations.push(structuredClone(relation));

          if (visited.has(target.properties.uuid)) {
            continue;
          }

          visited.add(target.properties.uuid);
          nodes.push(structuredClone(target));

          if (relation.type === "HAS_ANNOTATION") {
            queue.push(target.properties.uuid);
          }
        }
      }

      const { status, ...rootNode } = structuredClone(root);

      return [{ node: rootNode as unknown as AnnotationNode, status, nodes, relations }];
    });
}

/**
 * The editing graph of a read: every node once, everything `unchanged`, values copied.
 *
 * @param {ElementGraph} elements - The nodes and relations of the read.
 * @returns {EditGraph} The graph, in the order of the read.
 */
export function toEditGraph(elements: ElementGraph): EditGraph {
  const nodes = new Map<string, EditNode>();

  for (const element of elements.nodes) {
    if (!nodes.has(element.properties.uuid)) {
      nodes.set(element.properties.uuid, {
        ...structuredClone(element),
        nodeLabels: [...(element.nodeLabels ?? [])],
        status: "unchanged",
      });
    }
  }

  return {
    nodes: [...nodes.values()],
    relations: elements.relations.map((relation) => ({ ...relation, status: "unchanged" })),
  };
}

/** A node of the client's types */
type ClientNode = AnnotationNode | CollectionNode | ContentNode | EntityNode;

/**
 * The client node of an element, with its properties copied.
 *
 * @param {ElementNode} element - The element.
 * @returns {ClientNode} The node with its stored labels and refs.
 */
function copyNode(element: ElementNode): ClientNode {
  const node = {
    properties: structuredClone(element.properties),
    nodeLabels: [...(element.nodeLabels ?? [])],
    classifierRef: element.classifierRef,
    ...(element.shapeRef !== undefined ? { shapeRef: element.shapeRef } : {}),
  };

  return node as ClientNode;
}

/**
 * One node of a read, e.g. the response of a single-node read.
 *
 * @param {ElementGraph} elements - The nodes and relations of the read.
 * @param {string} uuid - The uuid of the node.
 * @returns {ClientNode} The node with its stored labels and refs.
 * @throws {Error} If the read doesn't contain the node.
 */
export function toNode(elements: ElementGraph, uuid: string): ClientNode {
  const element: ElementNode | undefined = elements.nodes.find((node) => node.properties.uuid === uuid);

  if (!element) {
    throw new Error(`The response doesn't contain the node ${uuid}`);
  }

  return copyNode(element);
}

/**
 * The nodes of a read, in the order of the response (listings keep their sort order).
 *
 * @param {ElementGraph} elements - The nodes and relations of the read.
 * @returns {T[]} The nodes with their stored labels and refs.
 */
export function toNodes<T extends ClientNode>(elements: ElementGraph): T[] {
  return elements.nodes.map((element) => copyNode(element) as T);
}

/**
 * Rebuilds the ancestries of a node from the read of its ancestry: every path from the node along the relations (child
 * to parent, `PART_OF`) up to a node without a parent in the read. A node already on the path ends it (cycle guard).
 *
 * @param {ElementGraph} elements - The node, the Collections above it and the relations between them.
 * @param {string} uuid - The uuid of the node.
 * @returns {NodeAncestry[]} One path per ancestry, top-level Collection first, without the node itself. A single empty
 * path for a top-level node, none if the read doesn't contain the node.
 */
export function toAncestryPaths(elements: ElementGraph, uuid: string): NodeAncestry[] {
  const elementsByUuid = new Map<string, ElementNode>(elements.nodes.map((element) => [element.properties.uuid, element]));
  const parentsByUuid = new Map<string, ElementNode[]>();

  for (const relation of elements.relations) {
    const parent: ElementNode | undefined = elementsByUuid.get(relation.to);

    if (parent) {
      parentsByUuid.set(relation.from, [...(parentsByUuid.get(relation.from) ?? []), parent]);
    }
  }

  if (!elementsByUuid.has(uuid)) {
    return [];
  }

  /** The paths from a node upwards, each starting with the node's parent */
  function walk(current: string, visited: ReadonlySet<string>): ElementNode[][] {
    const parents: ElementNode[] = (parentsByUuid.get(current) ?? []).filter((parent) => !visited.has(parent.properties.uuid));

    if (parents.length === 0) {
      return [[]];
    }

    return parents.flatMap((parent) =>
      walk(parent.properties.uuid, new Set([...visited, parent.properties.uuid])).map((above) => [parent, ...above]),
    );
  }

  return walk(uuid, new Set([uuid])).map((path) => path.toReversed().map((element) => copyNode(element) as CollectionNode));
}
