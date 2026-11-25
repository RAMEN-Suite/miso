import { Decoration } from "@tiptap/pm/view";
import { Node } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { DocAnnotation, Range } from "../../models/types";
import {
  Annotation,
  AnnotationNode,
  EditGraph,
  EditNode,
  ElementNodeStatus,
  applySaveResult,
  cloneDeep,
  findNode,
} from "../../external";
import { ANNOTATION_DECORATION_KEY, type AnnotationDecorationSpec } from "../../extensions/annotationDecoration";

/**
 * The graph of an annotation: its node with its status, the nodes below it and all relations. Values copied.
 *
 * @param {Annotation} annotation - The annotation.
 * @returns {EditGraph} The graph.
 */
export function annotationToGraph(annotation: Annotation): EditGraph {
  const { node, status, nodes, relations } = cloneDeep(annotation);
  const root: EditNode = {
    ...node,
    classifierRef: node.classifierRef ?? null,
    properties: node.properties,
    status,
  };

  return { nodes: [root, ...nodes], relations };
}

/**
 * Creates the annotation of a structural node that is new in the editor (stored in its `_annotation` attribute). It
 * only carries the type; uuid, indices etc. are added on the first save.
 *
 * @param {string} type - The configured annotation type of the node (e.g. `p` for a paragraph).
 * @returns {DocAnnotation} The new annotation.
 */
export function createDefaultDocAnnotation(type: string): DocAnnotation {
  return {
    node: { properties: { type }, nodeLabels: ["Annotation"] } as DocAnnotation["node"],
    nodes: [],
    relations: [],
  };
}

/**
 * The annotation of a graph made by {@linkcode annotationToGraph}. Values copied.
 *
 * @param {EditGraph} graph - The graph.
 * @param {string} uuid - The uuid of the annotation.
 * @returns {Annotation} The annotation.
 * @throws {Error} If the graph doesn't contain the annotation.
 */
export function graphToAnnotation(graph: EditGraph, uuid: string): Annotation {
  const root: EditNode | undefined = findNode(graph, uuid);

  if (!root) {
    throw new Error(`The graph has no annotation ${uuid}`);
  }

  const { status, ...node } = cloneDeep(root);

  return {
    node: node as unknown as AnnotationNode,
    status,
    nodes: cloneDeep(graph.nodes.filter((candidate) => candidate.properties.uuid !== uuid)),
    relations: cloneDeep(graph.relations),
  };
}

/**
 * Brings an annotation in line with the database after a successful save: deleted nodes, the orphans the server
 * deleted, removed relations and nodes no longer reached from the annotation are dropped, everything else becomes
 * `unchanged`.
 *
 * @param {Annotation} annotation - The annotation as stored in the editor or as sent to the backend. Is not mutated.
 * @param {string[]} [deletedOrphans] - uuids of the annotations the server deleted as orphans.
 * @returns {Annotation} A cleaned deep clone of the annotation.
 */
export function normalizeAnnotation(annotation: Annotation, deletedOrphans: string[] = []): Annotation {
  const normalized: Annotation = cloneDeep(annotation);
  const below: EditGraph = { nodes: normalized.nodes, relations: normalized.relations };

  applySaveResult(below, deletedOrphans);

  const reachable = new Set<string>([normalized.node.properties.uuid]);
  let added: boolean = true;

  while (added) {
    added = false;

    for (const relation of below.relations) {
      if (reachable.has(relation.from) && !reachable.has(relation.to)) {
        reachable.add(relation.to);
        added = true;
      }
    }
  }

  return {
    node: normalized.node,
    status: "unchanged",
    nodes: below.nodes.filter((node) => reachable.has(node.properties.uuid)),
    relations: below.relations.filter((relation) => reachable.has(relation.from)),
  };
}

/**
 * Brings an annotation from the node attributes in line with the database after a successful save, see
 * {@link normalizeAnnotation}.
 *
 * @param {DocAnnotation} docAnnotation - The annotation read from the node attributes.
 * @param {string[]} [deletedOrphans] - uuids of the annotations the server deleted as orphans.
 * @returns {DocAnnotation} A cleaned deep clone of the annotation.
 */
export function normalizeDocAnnotation(docAnnotation: DocAnnotation, deletedOrphans: string[] = []): DocAnnotation {
  return toDocAnnotation(normalizeAnnotation({ ...docAnnotation, status: "unchanged" }, deletedOrphans));
}

/**
 * Converts an annotation read from tiptap node attributes back into a full annotation with the given status.
 *
 * @param {DocAnnotation} docAnnotation - The annotation read from the node attributes.
 * @param {ElementNodeStatus} status - The status of the annotation.
 * @returns {Annotation} A deep-cloned annotation with the given status.
 */
export function toAnnotation(docAnnotation: DocAnnotation, status: ElementNodeStatus): Annotation {
  const { node, nodes, relations } = cloneDeep(docAnnotation);

  return { node, status, nodes, relations };
}

/**
 * Converts an annotation into the object that is stored in tiptap node attributes
 * (`_annotation`, entries of `_blockClassifications`) by dropping its own status.
 *
 * Deep cloned, so the document never shares object references with the caller.
 *
 * @param {Annotation} annotation - The annotation to convert.
 * @returns {DocAnnotation} The annotation to store in the node attributes.
 */
export function toDocAnnotation(annotation: Annotation): DocAnnotation {
  const { node, nodes, relations } = cloneDeep(annotation);

  return { node, nodes, relations };
}

/**
 * Collects the inline annotations (range annotations and zero-point annotations) from the given editor state,
 * which is their source of truth: range annotations are stored in their decoration, zero-point annotations
 * in the `_annotation` attribute of their node.
 *
 * @param {EditorState} state - The editor state to read from.
 * @param {Range} range - Optional document range. If given, only the annotations touching it are collected.
 * @returns {Map<string, Annotation>} The annotations keyed by their UUID, range annotations first.
 */
export function collectInlineAnnotations(state: EditorState, range?: Range): Map<string, Annotation> {
  const map = new Map<string, Annotation>();

  const decorations: Decoration[] = ANNOTATION_DECORATION_KEY.getState(state)?.all.find(range?.from, range?.to) ?? [];

  for (const decoration of decorations) {
    const { _uuid, _annotation } = decoration.spec as AnnotationDecorationSpec;

    map.set(_uuid, _annotation);
  }

  const start: number = range?.from ?? 0;
  const end: number = range?.to ?? state.doc.content.size;

  state.doc.nodesBetween(start, end, (node: Node) => {
    if (node.type.name === "zeroPointAnnotation" && node.attrs._annotation) {
      map.set(node.attrs.uuid, node.attrs._annotation);
    }
  });

  return map;
}

/**
 * Returns a counter that increases whenever a range annotation is added, removed or its data replaced.
 * Text edits do not affect it. Can be watched to react to annotation changes without comparing the annotations
 * themselves.
 *
 * @param {EditorState} state - The editor state to read from.
 * @returns {number} The current revision of the range annotations.
 */
export function getAnnotationRevision(state: EditorState): number {
  return ANNOTATION_DECORATION_KEY.getState(state)?.revision ?? 0;
}

/**
 * Collects all unique block classification annotations from the given document.
 *
 * @param {Node} doc - The ProseMirror document node to traverse.
 * @returns {Map<string, DocAnnotation>} A map of block classification annotations keyed by their UUID.
 */
export function collectBlockClassifications(doc: Node): Map<string, DocAnnotation> {
  const map = new Map<string, DocAnnotation>();

  doc.descendants((node: Node) => {
    if (node.isText) {
      return;
    }

    const blockClassifications: DocAnnotation[] = node.attrs?._blockClassifications ?? [];

    for (const block of blockClassifications) {
      const uuid: string = block.node.properties.uuid;

      if (!map.has(uuid)) {
        map.set(uuid, block);
      }
    }
  });

  return map;
}
