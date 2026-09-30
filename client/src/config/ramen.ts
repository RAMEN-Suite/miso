import { AnnotationNode, BaseNodeLabel, CollectionNode, EntityNode, NodeStatusObject, TextNode } from "../models/types";

/** The RAMEN base node labels. */
const BASE_NODE_LABELS: readonly BaseNodeLabel[] = ["Annotation", "Character", "Collection", "Content", "Entity"];

/**
 * Creates a new Collection object with default values.
 *
 * This function is used to generate a new Collection object with default values for the node labels and data properties.
 *
 * @return {CollectionNode} A new Collection object with default values.
 */
export function createCollectionNode(): CollectionNode {
  return {
    nodeLabels: ["Collection"],
    data: {
      uuid: crypto.randomUUID(),
      label: "",
    },
  };
}

/**
 * Creates a new Text object with default values.
 *
 * This function is used to generate a new Text object with default values for the node labels and data properties.
 * The additional (domain) labels are applied on creation so that the node never needs its labels mutated later.
 *
 * @param {Object} params - The optional parameters for the new node.
 * @param {string[]} params.additionalNodeLabels - The additional labels to append to the "Content" base label.
 *   Defaults to none, leaving the node with the base label only.
 * @return {TextNode} A new Text object with default values.
 */
export function createTextNode(params?: { additionalNodeLabels: string[] }): TextNode {
  return {
    nodeLabels: ["Content", ...(params?.additionalNodeLabels ?? [])],
    data: {
      uuid: crypto.randomUUID(),
      text: "",
    },
  };
}

/**
 * Creates a new Entity object with default values.
 *
 * There are no guidelines for Entities yet, so a new Entity only consists of a UUID and an (empty) label.
 *
 * @param {Object} params - The optional parameters for the new node.
 * @param {string[]} params.additionalNodeLabels - The additional labels to append to the "Entity" base label.
 *   Defaults to none, leaving the node with the base label only.
 * @return {EntityNode} A new Entity object with default values.
 */
export function createEntityNode(params?: { additionalNodeLabels: string[] }): EntityNode {
  return {
    nodeLabels: ["Entity", ...(params?.additionalNodeLabels ?? [])],
    data: {
      uuid: crypto.randomUUID(),
      label: "",
    },
  };
}

/**
 * Filters out the RAMEN base node labels from the given array, returning only the domain-specific labels.
 *
 * Mainly used for visual purposes (base node labels do not need to be displayed), e.g. in node previews,
 * tooltips or icon resolution.
 *
 * @param {string[]} nodeLabels - The full list of node labels to filter.
 * @returns {string[]} The labels with all base node labels removed.
 */
export function filterBaseNodeLabels(nodeLabels: string[]): string[] {
  return nodeLabels.filter((l: string) => !BASE_NODE_LABELS.includes(l as BaseNodeLabel));
}

/**
 * Returns the RAMEN base node label for a node from its full list of labels.
 *
 * @param {string[]} labels - All Node labels of a RAMEN-valid node
 * @returns {BaseNodeLabel} The node's base label
 * @throws {Error} If none of the base labels is present
 */
export function getBaseNodeLabel(labels: string[]): BaseNodeLabel {
  if (labels.includes("Entity")) {
    return "Entity";
  } else if (labels.includes("Collection")) {
    return "Collection";
  } else if (labels.includes("Content")) {
    return "Content";
  } else if (labels.includes("Annotation")) {
    return "Annotation";
  } else {
    throw new Error("Node does not have a valid base label");
  }
}

// TODO: These functions should actually check the node, not the status object...refactor later
export function isAnnotationNode(node: NodeStatusObject): node is NodeStatusObject<AnnotationNode> {
  return node.node.nodeLabels.includes("Annotation");
}

export function isCollectionNode(node: NodeStatusObject): node is NodeStatusObject<CollectionNode> {
  return node.node.nodeLabels.includes("Collection");
}

export function isContentNode(node: NodeStatusObject): node is NodeStatusObject<TextNode> {
  return node.node.nodeLabels.includes("Content");
}

export function isEntityNode(node: NodeStatusObject): node is NodeStatusObject<EntityNode> {
  return node.node.nodeLabels.includes("Entity");
}
