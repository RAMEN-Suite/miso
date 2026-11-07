import type {
  BaseNodeData,
  BaseNodeLabel,
  ElementGraph,
  ElementNode,
  ElementRelation,
  ModelAnnotationShape,
  ModelContext,
  Node as DataNode,
  NodeStatus,
  NodeStatusObject,
  RefResolution,
} from "../../models/types";
import { BASE_NODE_REF } from "../../config/ramen";
import {
  familyRefOf,
  findShape,
  getBaseNodeLabel,
  getBaseNodeRef,
  getClassifierRef,
  resolveRelationRef,
  resolveShapeRef,
} from "./modelHelper";

/**
 * Converts the client's `NodeStatusObject` trees into the flat write payload (`ElementGraph` with statuses): nodes with
 * `classifierRef`/`shapeRef`, relations with `relationRef`. The tree stays the editing state of the components; this is
 * the only place where parent/child pairs become relations.
 *
 * @packageDocumentation
 */

/** Statuses of nodes that are sent: unchanged nodes and nodes whose relation to the parent changes are not */
const SENT_NODE_STATUSES: readonly NodeStatus[] = ["created", "modified", "deleted"];

/** The relationship between a parent and a child in the tree, by the RAMEN base nodes of both */
interface TreeRelation {
  type: "HAS_ANNOTATION" | "REFERS_TO" | "PART_OF";
  /** Whether the relation points from the parent to the child (`PART_OF` points from the child to the parent) */
  fromParent: boolean;
}

/** A converted node of the tree, as parent of its children */
interface ConvertedParent {
  uuid: string;
  status: NodeStatus;
  classifierRef: string;
  baseLabel: BaseNodeLabel;
}

/**
 * The relationship between a parent and a child in the tree. The tree is ownership-ordered: a Content or Collection
 * owns its annotations and parts, an annotation its sub-annotations and the nodes it refers to.
 *
 * @param {BaseNodeLabel} parent - The base node of the parent.
 * @param {BaseNodeLabel} child - The base node of the child.
 * @returns {TreeRelation} The relationship type and its direction.
 * @throws {Error} If the pair has no relationship in the tree.
 */
function treeRelationOf(parent: BaseNodeLabel, child: BaseNodeLabel): TreeRelation {
  if (child === "Annotation") {
    return { type: "HAS_ANNOTATION", fromParent: true };
  } else if (parent === "Annotation") {
    return { type: "REFERS_TO", fromParent: true };
  } else if (parent === "Collection" && (child === "Content" || child === "Collection")) {
    return { type: "PART_OF", fromParent: false };
  } else {
    throw new Error(`A ${child} can't be a child of a ${parent} in the tree`);
  }
}

/**
 * The refs of a node. Annotations are resolved from their carrier and `type` on every save, since the editor rebuilds
 * structural annotations and may change their type. Nodes whose type can't be resolved get the RAMEN base node, so the
 * write still goes through and the server reports them.
 *
 * @param {ModelContext} context - The model context.
 * @param {DataNode<BaseNodeData>} node - The node.
 * @param {BaseNodeLabel} baseLabel - The base node of the node.
 * @param {string | null} carrierRef - For annotations: the classifier of the parent, which carries the annotation.
 * @returns {Pick<ElementNode, "classifierRef" | "shapeRef">} The refs.
 */
function resolveNodeRefs(
  context: ModelContext,
  node: DataNode<BaseNodeData>,
  baseLabel: BaseNodeLabel,
  carrierRef: string | null,
): { classifierRef: string; shapeRef?: string | null } {
  const fallbackRef: string = getClassifierRef(context, node) ?? BASE_NODE_REF[baseLabel];

  if (baseLabel !== "Annotation") {
    return { classifierRef: fallbackRef };
  }

  const type: unknown = (node.data as BaseNodeData & { type?: unknown }).type;
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
 * The relation definition of a relationship in the tree: the most specific one between the two classifiers, otherwise
 * RAMEN's base relation between their base nodes. The server writes the relationship by the definition's name and
 * reports it if the model doesn't allow it between these classifiers.
 *
 * @param {ModelContext} context - The model context.
 * @param {string} fromRef - Classifier ref of the start node.
 * @param {TreeRelation["type"]} type - The relationship type.
 * @param {string} toRef - Classifier ref of the end node.
 * @returns {string} The qualified ref of the relation definition.
 * @throws {Error} If not even the base nodes have such a relation.
 */
function relationRefOf(context: ModelContext, fromRef: string, type: TreeRelation["type"], toRef: string): string {
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
 * What happens to the relation between a child and its parent: added with a created or added child, removed with a
 * removed child, unless the parent is deleted (its relations disappear with it).
 *
 * @param {NodeStatus} childStatus - The status of the child.
 * @param {NodeStatus} parentStatus - The status of the parent.
 * @returns {NodeStatus | null} `added`, `removed`, or `null` if the relation doesn't change.
 */
function relationStatusOf(childStatus: NodeStatus, parentStatus: NodeStatus): NodeStatus | null {
  if (childStatus === "created" || childStatus === "added") {
    return "added";
  } else if (childStatus === "removed" && parentStatus !== "deleted") {
    return "removed";
  } else {
    return null;
  }
}

/**
 * Converts a `NodeStatusObject` tree into the write payload.
 *
 * - Nodes are sent with status `created`, `modified` or `deleted`.
 * - Relations to the parent are sent as `added` or `removed`, see {@linkcode relationStatusOf}.
 *
 * @param {ModelContext} context - The model context.
 * @param {NodeStatusObject} root - The root of the tree, e.g. a Content with its annotations as `connectedNodes`.
 * @returns {ElementGraph} The nodes and relations to write.
 * @throws {Error} If a node has no base node, or a parent/child pair has no relation.
 */
export function toWritePayload(context: ModelContext, root: NodeStatusObject): ElementGraph {
  const nodes: ElementNode[] = [];
  const relations: ElementRelation[] = [];

  /** Converts a node and its children */
  function visit(entry: NodeStatusObject, parent: ConvertedParent | null): void {
    const { node, meta } = entry;
    const uuid: string = node.data.uuid;
    const baseLabel: BaseNodeLabel | undefined = getBaseNodeLabel(context, node);

    if (!baseLabel) {
      throw new Error(`The node ${uuid} has no RAMEN base node`);
    }

    const treeRelation: TreeRelation | null = parent ? treeRelationOf(parent.baseLabel, baseLabel) : null;
    const carrierRef: string | null = treeRelation?.type === "HAS_ANNOTATION" && parent ? parent.classifierRef : null;
    const refs = resolveNodeRefs(context, node, baseLabel, carrierRef);

    if (SENT_NODE_STATUSES.includes(meta.status)) {
      nodes.push({ status: meta.status, ...refs, data: node.data as ElementNode["data"] });
    }

    const relationStatus: NodeStatus | null = parent ? relationStatusOf(meta.status, parent.status) : null;

    if (parent && treeRelation && relationStatus) {
      const [from, to] = treeRelation.fromParent ? [parent, { uuid, ...refs }] : [{ uuid, ...refs }, parent];

      relations.push({
        status: relationStatus,
        relationRef: relationRefOf(context, from.classifierRef, treeRelation.type, to.classifierRef),
        from: from.uuid,
        to: to.uuid,
      });
    }

    for (const child of entry.connectedNodes) {
      visit(child, { uuid, status: meta.status, classifierRef: refs.classifierRef, baseLabel });
    }
  }

  visit(root, null);

  return { nodes, relations };
}
