import type {
  Annotation,
  BaseNodeProperties,
  BaseNodeLabel,
  EditGraph,
  EditNode,
  ElementGraph,
  ElementNode,
  ElementRelation,
  ModelAnnotationShape,
  ModelContext,
  Node as DataNode,
  RefResolution,
} from "../../models/types";
import { BASE_NODE_REF, type RelationType } from "../../config/ramen";
import {
  familyRefOf,
  findShape,
  getBaseNodeLabel,
  getBaseNodeRef,
  getClassifierRef,
  resolveRelationRef,
  resolveShapeRef,
} from "./modelHelper";
import { findNode } from "./editGraph";

/**
 * Converts the client's editing state into the flat write payload (`ElementGraph` with statuses): nodes with
 * `classifierRef`/`shapeRef`, relations with `relationRef`. {@linkcode toWritePayload} takes an `EditGraph`,
 * {@linkcode toContentSaveGraph} builds one from the text editor's annotations.
 *
 * @packageDocumentation
 */

/**
 * The refs of a node. Annotations are resolved from their carrier and `type` on every save, since the editor rebuilds
 * structural annotations and may change their type. Nodes whose type can't be resolved get the RAMEN base node, so the
 * write still goes through and the server reports them.
 *
 * @param {ModelContext} context - The model context.
 * @param {DataNode<BaseNodeProperties>} node - The node.
 * @param {BaseNodeLabel} baseLabel - The base node of the node.
 * @param {string | null} carrierRef - For annotations: the classifier of the carrier.
 * @returns {Pick<ElementNode, "classifierRef" | "shapeRef">} The refs.
 */
function resolveNodeRefs(
  context: ModelContext,
  node: DataNode<BaseNodeProperties>,
  baseLabel: BaseNodeLabel,
  carrierRef: string | null,
): { classifierRef: string; shapeRef?: string | null } {
  const fallbackRef: string = getClassifierRef(context, node) ?? BASE_NODE_REF[baseLabel];

  if (baseLabel !== "Annotation") {
    return { classifierRef: fallbackRef };
  }

  const type: unknown = (node.properties as BaseNodeProperties & { type?: unknown }).type;
  const resolution: RefResolution | null =
    carrierRef && typeof type === "string" ? resolveShapeRef(context, carrierRef, type) : null;
  const shapeRef: string | null = resolution?.ref ?? null;
  const shape: ModelAnnotationShape | undefined = shapeRef ? findShape(context, shapeRef) : undefined;

  if (shape) {
    return { classifierRef: familyRefOf(shape), shapeRef };
  } else {
    return { classifierRef: fallbackRef, shapeRef: node.shapeRef ?? null };
  }
}

/**
 * The relation definition of a relationship: the most specific one between the two classifiers, otherwise RAMEN's base
 * relation between their base nodes. The server writes the relationship by the definition's name and reports it if the
 * model doesn't allow it between these classifiers.
 *
 * @param {ModelContext} context - The model context.
 * @param {string} fromRef - Classifier ref of the start node.
 * @param {RelationType} type - The relationship type.
 * @param {string} toRef - Classifier ref of the end node.
 * @returns {string} The qualified ref of the relation definition.
 * @throws {Error} If not even the base nodes have such a relation.
 */
export function relationRefOf(context: ModelContext, fromRef: string, type: RelationType, toRef: string): string {
  const resolution: RefResolution = resolveRelationRef(context, fromRef, type, toRef);

  if (resolution.ref) {
    return resolution.ref;
  }

  const baseFromRef: string | undefined = getBaseNodeRef(context, fromRef);
  const baseToRef: string | undefined = getBaseNodeRef(context, toRef);
  const baseResolution: RefResolution | null =
    baseFromRef && baseToRef ? resolveRelationRef(context, baseFromRef, type, baseToRef) : null;

  if (baseResolution?.ref) {
    return baseResolution.ref;
  } else {
    throw new Error(resolution.problem);
  }
}

/**
 * The graph of a Content's save: the Content as `modified` and the text editor's annotations. The Content's annotations
 * get their refs from the Content's classifier and their type, created ones a `HAS_ANNOTATION` relation from the Content.
 * A node in several annotations is taken once, a changed copy over an unchanged one.
 *
 * @param {ModelContext} context - The model context.
 * @param {DataNode<BaseNodeProperties>} content - The Content with its current text.
 * @param {Annotation[]} annotations - The annotations to save, deleted ones included.
 * @returns {EditGraph} The graph.
 */
export function toContentSaveGraph(
  context: ModelContext,
  content: DataNode<BaseNodeProperties>,
  annotations: Annotation[],
): EditGraph {
  const contentRef: string = getClassifierRef(context, content) ?? BASE_NODE_REF.Content;
  const graph: EditGraph = {
    nodes: [
      {
        status: "modified",
        classifierRef: contentRef,
        nodeLabels: [...content.nodeLabels],
        properties: content.properties as EditNode["properties"],
      },
    ],
    relations: [],
  };

  /** Adds a node, or replaces an unchanged copy of it with a changed one */
  function addNode(node: EditNode): void {
    const current: EditNode | undefined = findNode(graph, node.properties.uuid);

    if (!current) {
      graph.nodes.push(node);
    } else if (current.status === "unchanged" && node.status !== "unchanged") {
      graph.nodes[graph.nodes.indexOf(current)] = node;
    }
  }

  for (const annotation of annotations) {
    const refs = resolveNodeRefs(context, annotation.node, "Annotation", contentRef);

    addNode({
      status: annotation.status,
      ...refs,
      nodeLabels: [...annotation.node.nodeLabels],
      properties: annotation.node.properties,
    });

    if (annotation.status === "created") {
      graph.relations.push({
        status: "added",
        relationRef: relationRefOf(context, contentRef, "HAS_ANNOTATION", refs.classifierRef),
        type: "HAS_ANNOTATION",
        from: content.properties.uuid,
        to: annotation.node.properties.uuid,
      });
    }

    annotation.nodes.forEach(addNode);
    graph.relations.push(...annotation.relations);
  }

  return graph;
}

/**
 * The write payload of an {@linkcode EditGraph}: every node and relation that isn't `unchanged`, without stored labels.
 * Nodes without a resolved classifier get their RAMEN base node, so the server reports them.
 *
 * @param {ModelContext} context - The model context.
 * @param {EditGraph} graph - The editing state.
 * @returns {ElementGraph} The nodes and relations to write.
 * @throws {Error} If a changed node has neither a classifier nor a base node label.
 */
export function toWritePayload(context: ModelContext, graph: EditGraph): ElementGraph {
  const nodes: ElementNode[] = graph.nodes
    .filter((node) => node.status !== "unchanged")
    .map(({ nodeLabels, ...node }) => {
      if (node.classifierRef !== null) {
        return node;
      }

      const baseLabel: BaseNodeLabel | undefined = getBaseNodeLabel(context, { ...node, nodeLabels });

      if (!baseLabel) {
        throw new Error(`The node ${node.properties.uuid} has no RAMEN base node`);
      }

      return { ...node, classifierRef: BASE_NODE_REF[baseLabel] };
    });
  const relations: ElementRelation[] = graph.relations
    .filter((relation) => relation.status !== "unchanged")
    .map((relation) => ({ ...relation }));

  return { nodes, relations };
}
