import type { Node } from "@ramen-suite/core";
import {
  BASE_NODE_REF,
  BASE_NODE_REFS,
  findShape,
  getBaseNodeRef,
  getShapesForNode,
  shapeRefOf,
  type ModelContext,
} from "../external";
import type { Selection } from "../state/useConfigDraft";
import type { ChangeKind } from "./modelDiff";

/**
 * The model elements as the configurator lists them: classifiers nested by lineage, annotation shapes grouped by the
 * base node of their carriers.
 *
 * @packageDocumentation
 */

/** A classifier and its refinements */
export interface ClassifierItem {
  ref: string;
  name: string;
  children: ClassifierItem[];
}

/** A group of annotation shapes */
export interface ShapeGroup {
  label: string;
  shapes: { ref: string; name: string }[];
}

/** A line of the element tree, with the lines nested under it (refinements) */
export interface TreeRow {
  key: string;
  label: string;
  depth: number;
  selection: Selection;
  ref?: string;
  children: TreeRow[];
}

/** What a line shows next to its label */
export interface RowStatus {
  problems: number;
  warnings: number;
  change?: ChangeKind;
  configured: boolean;
  /** The native type an annotation shape is mapped to */
  native?: string;
}

/** Height of a line and of a section header; the sticky offsets are multiples of it */
export const TREE_LINE_HEIGHT_REM = 1.75;

/** The base nodes in the order they are listed */
const BASE_ORDER: readonly string[] = [BASE_NODE_REF.Collection, BASE_NODE_REF.Content, BASE_NODE_REF.Entity, BASE_NODE_REF.Annotation];

/**
 * The node classifiers as trees, one per RAMEN base node: each refinement under the last but one node of its lineage.
 *
 * @param {ModelContext} context - The model context.
 * @returns {ClassifierItem[]} The base nodes with their refinements, children sorted by name.
 */
export function buildClassifierTree(context: ModelContext): ClassifierItem[] {
  const items = new Map<string, ClassifierItem>(
    BASE_ORDER.map((ref) => [ref, { ref, name: context.model.getNode(ref)?.name ?? ref, children: [] }]),
  );
  const refinements: (Node & { modelId: string })[] = context.config.model.classifiers.filter(
    (classifier): classifier is Node & { modelId: string } =>
      classifier.kind === "Node" && !BASE_NODE_REFS.includes(`${classifier.modelId}:${classifier.id}`),
  );

  for (const node of refinements) {
    const ref: string = `${node.modelId}:${node.id}`;

    items.set(ref, { ref, name: node.name, children: [] });
  }

  for (const node of refinements) {
    const ref: string = `${node.modelId}:${node.id}`;
    const lineage = context.model.getNodeLineage(ref);
    const parent = lineage.at(-2);
    const parentItem: ClassifierItem | undefined = parent ? items.get(`${parent.modelId}:${parent.nodeId}`) : undefined;

    parentItem?.children.push(items.get(ref)!);
  }

  for (const item of items.values()) {
    item.children.sort((a, b) => a.name.localeCompare(b.name));
  }

  return BASE_ORDER.map((ref) => items.get(ref)!);
}

/**
 * The annotation shapes, grouped by the base node of the nodes that may carry them (a shape on several kinds of nodes
 * is in several groups). Shapes no node may carry are in a group of their own.
 *
 * @param {ModelContext} context - The model context.
 * @returns {ShapeGroup[]} The groups that have shapes, shapes sorted by type.
 */
export function buildShapeGroups(context: ModelContext): ShapeGroup[] {
  const carriedRefs = new Set<string>();
  const nodeRefs: string[] = context.config.model.classifiers
    .filter((classifier) => classifier.kind === "Node")
    .map((node) => `${node.modelId}:${node.id}`);
  const groups: ShapeGroup[] = BASE_ORDER.map((baseRef) => {
    const carrierRefs: string[] = [
      baseRef,
      ...nodeRefs.filter((ref) => ref !== baseRef && getBaseNodeRef(context, ref) === baseRef),
    ];
    const shapes = new Map<string, string>();

    for (const shape of carrierRefs.flatMap((ref) => getShapesForNode(context, ref))) {
      shapes.set(shapeRefOf(shape), shape.type);
      carriedRefs.add(shapeRefOf(shape));
    }

    return { label: `On ${context.model.getNode(baseRef)?.name ?? baseRef}`, shapes: toSortedShapes(shapes) };
  });

  const uncarried = new Map<string, string>(
    context.config.model.annotations
      .filter((shape) => !carriedRefs.has(shapeRefOf(shape)))
      .map((shape) => [shapeRefOf(shape), shape.type]),
  );

  return [...groups, { label: "Without carrier", shapes: toSortedShapes(uncarried) }].filter((group) => group.shapes.length > 0);
}

/**
 * What a ref of the model is, for selecting it.
 *
 * @param {ModelContext} context - The model context.
 * @param {string} ref - A qualified ref.
 * @returns {"classifier" | "annotation" | undefined} The kind, `undefined` if the model has no node or shape with it.
 */
export function elementKindOf(context: ModelContext, ref: string): "classifier" | "annotation" | undefined {
  if (findShape(context, ref)) {
    return "annotation";
  } else if (context.model.getNode(ref)) {
    return "classifier";
  }

  return undefined;
}

function toSortedShapes(shapes: Map<string, string>): ShapeGroup["shapes"] {
  return [...shapes].map(([ref, name]) => ({ ref, name })).sort((a, b) => a.name.localeCompare(b.name));
}
