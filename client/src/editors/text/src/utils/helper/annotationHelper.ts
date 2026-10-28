import { Decoration } from "@tiptap/pm/view";
import { Node } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { DocAnnotation, Range } from "../../models/types";
import { Annotation, NodeStatus, cloneDeep, pruneDeletedNodes, setNodeTreeStatus } from "../../external";
import { ANNOTATION_DECORATION_KEY, type AnnotationDecorationSpec } from "../../extensions/annotationDecoration";

/**
 * Creates the annotation of a structural node that is new in the editor (stored in its `_annotation` attribute). It
 * only carries the type; uuid, indices etc. are added on the first save.
 *
 * @param {string} type - The configured annotation type of the node (e.g. `p` for a paragraph).
 * @returns {DocAnnotation} The new annotation.
 */
export function createDefaultDocAnnotation(type: string): DocAnnotation {
  return {
    node: { data: { type }, nodeLabels: ["Annotation"] } as DocAnnotation["node"],
    connectedNodes: [],
  };
}

/**
 * Converts an annotation into the object that is stored in tiptap node attributes
 * (`_annotation`, entries of `_blockClassifications`) by dropping its top-level status.
 *
 * Deep cloneed, so the document never shares object references with the caller.
 *
 * @param {Annotation} annotation - The annotation to convert.
 * @returns {DocAnnotation} The annotation to store in the node attributes.
 */
export function toDocAnnotation(annotation: Annotation): DocAnnotation {
  const { node, connectedNodes } = cloneDeep(annotation);

  return { node, connectedNodes };
}

/**
 * Converts an annotation read from tiptap node attributes back into a full annotation with the given status.
 *
 * @param {DocAnnotation} docAnnotation - The annotation read from the node attributes.
 * @param {NodeStatus} status - The status of the annotation.
 * @returns {Annotation} A deep-cloned annotation with the given status.
 */
export function toAnnotation(docAnnotation: DocAnnotation, status: NodeStatus): Annotation {
  const { node, connectedNodes } = cloneDeep(docAnnotation);

  return { node, connectedNodes, meta: { status } };
}

/**
 * Brings an annotation in line with the database state after a successful save:
 * connected nodes that were deleted or removed are dropped, the annotation and all remaining
 * connected nodes are set to "unchanged".
 *
 * @param {Annotation} annotation - The annotation as stored in the editor or as sent to the backend. Is not mutated.
 * @returns {Annotation} A cleaned deep clone of the annotation.
 */
export function normalizeAnnotation(annotation: Annotation): Annotation {
  const normalized: Annotation = cloneDeep(annotation);

  pruneDeletedNodes(normalized);
  setNodeTreeStatus(normalized, "unchanged");

  return normalized;
}

/**
 * Brings an annotation from the node attributes in line with the database state after a successful save:
 * connected nodes that were deleted or removed are dropped, all remaining ones are set to "unchanged".
 *
 * Same as {@link normalizeAnnotation}, for annotations that are stored without their top-level status.
 *
 * @param {DocAnnotation} docAnnotation - The annotation read from the node attributes.
 * @returns {DocAnnotation} A cleaned deep clone of the annotation.
 */
export function normalizeDocAnnotation(docAnnotation: DocAnnotation): DocAnnotation {
  const { node, connectedNodes } = normalizeAnnotation({ ...docAnnotation, meta: { status: "unchanged" } });

  return { node, connectedNodes };
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
      const uuid: string = block.node.data.uuid;

      if (!map.has(uuid)) {
        map.set(uuid, block);
      }
    }
  });

  return map;
}
