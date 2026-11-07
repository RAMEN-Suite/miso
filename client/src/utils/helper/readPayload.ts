import type { CollectionNode, ElementGraph, ElementNode, NodeAncestry, NodeDto } from "../../models/types";

/**
 * Turns reads in the element format (every read that returns nodes) into the client's formats: plain nodes, `NodeDto`
 * trees and ancestries. The counterpart of `writePayload.ts`; the tree stays the format of the components until they
 * work on the flat list.
 *
 * @packageDocumentation
 */

/**
 * The tree node of an element. The data is copied, so a node that appears in several places of the tree (e.g. a person
 * referred to by several annotations) can be edited in one place without changing the others, as before.
 *
 * @param {ElementNode} element - The element.
 * @returns {NodeDto["node"]} The node with its stored labels and refs.
 */
function toTreeNode(element: ElementNode): NodeDto["node"] {
  const node = {
    data: structuredClone(element.data),
    nodeLabels: [...(element.nodeLabels ?? [])],
    classifierRef: element.classifierRef,
    ...(element.shapeRef !== undefined ? { shapeRef: element.shapeRef } : {}),
  };

  return node as NodeDto["node"];
}

/**
 * Rebuilds the trees below a node: each relation from a node makes its end node a child (`HAS_ANNOTATION` to nested
 * annotations, `REFERS_TO` to referenced nodes). A node that is already on the path from the root (a cycle, e.g. an
 * annotation that refers to its own carrier) is added once more without children, like a referenced node.
 *
 * @param {ElementGraph} elements - The nodes and relations of the read.
 * @param {string} rootUuid - The uuid of the node whose relations start the trees, e.g. the annotated Content.
 * @returns {NodeDto[]} One tree per relation from the root, in the order of the relations.
 */
export function toNodeDtoTrees(elements: ElementGraph, rootUuid: string): NodeDto[] {
  const elementsByUuid = new Map<string, ElementNode>(elements.nodes.map((element) => [element.data.uuid, element]));
  const childUuids = new Map<string, string[]>();

  for (const relation of elements.relations) {
    childUuids.set(relation.from, [...(childUuids.get(relation.from) ?? []), relation.to]);
  }

  /** The tree of a node, `undefined` if the read doesn't contain it */
  function build(uuid: string, path: ReadonlySet<string>): NodeDto | undefined {
    const element: ElementNode | undefined = elementsByUuid.get(uuid);

    if (!element) {
      return undefined;
    }

    if (path.has(uuid)) {
      return { node: toTreeNode(element), connectedNodes: [] };
    }

    const childPath = new Set<string>([...path, uuid]);
    const connectedNodes: NodeDto[] = (childUuids.get(uuid) ?? [])
      .map((childUuid) => build(childUuid, childPath))
      .filter((child): child is NodeDto => child !== undefined);

    return { node: toTreeNode(element), connectedNodes };
  }

  return (childUuids.get(rootUuid) ?? [])
    .map((uuid) => build(uuid, new Set([rootUuid])))
    .filter((tree): tree is NodeDto => tree !== undefined);
}

/**
 * The nodes of a read, in the order of the response (listings keep their sort order).
 *
 * @param {ElementGraph} elements - The nodes and relations of the read.
 * @returns {T[]} The nodes with their stored labels and refs.
 */
export function toNodes<T extends NodeDto["node"]>(elements: ElementGraph): T[] {
  return elements.nodes.map((element) => toTreeNode(element) as T);
}

/**
 * One node of a read, without connected nodes, e.g. the response of a single-node read or write.
 *
 * @param {ElementGraph} elements - The nodes and relations of the read.
 * @param {string} uuid - The uuid of the node.
 * @returns {NodeDto<T>} The node.
 * @throws {Error} If the read doesn't contain the node.
 */
export function toNodeDto<T extends NodeDto["node"]>(elements: ElementGraph, uuid: string): NodeDto<T> {
  const element: ElementNode | undefined = elements.nodes.find((node) => node.data.uuid === uuid);

  if (!element) {
    throw new Error(`The response doesn't contain the node ${uuid}`);
  }

  return { node: toTreeNode(element) as T, connectedNodes: [] };
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
  const elementsByUuid = new Map<string, ElementNode>(elements.nodes.map((element) => [element.data.uuid, element]));
  const parentUuids = new Map<string, string[]>();

  for (const relation of elements.relations) {
    if (elementsByUuid.has(relation.to)) {
      parentUuids.set(relation.from, [...(parentUuids.get(relation.from) ?? []), relation.to]);
    }
  }

  if (!elementsByUuid.has(uuid)) {
    return [];
  }

  /** The paths from a node upwards, each starting with the node's parent */
  function walk(current: string, visited: ReadonlySet<string>): string[][] {
    const parents: string[] = (parentUuids.get(current) ?? []).filter((parent) => !visited.has(parent));

    if (parents.length === 0) {
      return [[]];
    }

    return parents.flatMap((parent) =>
      walk(parent, new Set([...visited, parent])).map((above) => [parent, ...above]),
    );
  }

  return walk(uuid, new Set([uuid])).map((path) =>
    path.toReversed().map((pathUuid) => ({
      node: toTreeNode(elementsByUuid.get(pathUuid)!) as CollectionNode,
      connectedNodes: [],
    })),
  );
}
