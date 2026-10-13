import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Annotation, DocAnnotation, NodeStatus, Range } from "../../models/types";
import { Fragment, Node, Schema, Slice } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { cloneDeep, pruneDeletedNodes, setNodeTreeStatus } from "./helper";
import { ANNOTATION_DECORATION_KEY, type AnnotationDecorationSpec } from "../../editors/text/extensions/annotationDecoration";

/**
 * Converts an annotation into the object that is stored in tiptap node attributes
 * (`_annotation`, entries of `_semanticBlocks`) by dropping its top-level status.
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
 * Collects all unique semantic block annotations from the given document.
 *
 * @param {Node} doc - The ProseMirror document node to traverse.
 * @returns {Map<string, DocAnnotation>} A map of semantic block annotations keyed by their UUID.
 */
export function collectSemanticBlocks(doc: Node): Map<string, DocAnnotation> {
  const map = new Map<string, DocAnnotation>();

  doc.descendants((node: Node) => {
    if (node.isText) {
      return;
    }

    const semanticBlocks: DocAnnotation[] = node.attrs?._semanticBlocks ?? [];

    for (const block of semanticBlocks) {
      const uuid: string = block.node.data.uuid;

      if (!map.has(uuid)) {
        map.set(uuid, block);
      }
    }
  });

  return map;
}

/**
 * Finds the annotation decoration matching the given uuid from the given decoration set and returns its range.
 *
 * If multiple decorations share the uuid, the first one's range is returned.
 *
 * @param {DecorationSet} decorationSet The decoration set to search
 * @param {string} uuid The uuid of the annotation to look up
 * @returns {Range | null} The range of the matching decoration, or null if none is found
 */
export function findDecorationBoundariesByUuid(decorationSet: DecorationSet, uuid: string): Range | null {
  const annotationDecos: Decoration[] =
    decorationSet.find(undefined, undefined, (spec: AnnotationDecorationSpec) => spec._uuid === uuid) ?? [];

  if (annotationDecos.length === 0) {
    return null;
  }

  if (annotationDecos.length > 1) {
    // Even if multiple decorations exist, a highlight should happen. Errors should be handles somewhere else
    console.warn(
      `Multiple decorations (${annotationDecos.length}) of annotation with uuid ${uuid} found. 
      The first one found is highlighted.
      `,
    );
  }

  return {
    from: annotationDecos[0].from,
    to: annotationDecos[0].to,
  };
}

/**
 * Finds the last node carrying the given uuid attribute and returns its document range.
 *
 * @param {Node} doc The root document node to search
 * @param {string} uuid The uuid to match against each node's `uuid` attribute
 * @returns {Range | null} The from/to range of the matching node, or null if not found
 */
export function findNodeBoundariesByUuid(doc: Node, uuid: string): Range | null {
  let result: Range | null = null;

  doc.descendants((node, pos) => {
    if (node.attrs.uuid === uuid) {
      result = {
        from: pos,
        to: pos + node.nodeSize,
      };
    }
  });

  return result;
}

/**
 * Finds all semantic blocks carrying the given uuid and returns their combined document range.
 *
 * Scans the document tree for nodes containing the uuid in their `_semanticBlocks` attribute,
 * accumulating the range from the first matching block to the last.
 *
 * @param {Node} doc The root document node to search
 * @param {string} uuid The uuid to match within each node's `_semanticBlocks` array
 * @returns {Range | null} The from/to range spanning all matching blocks, or null if none found
 */
export function findSemanticBlockBoundariesByUuid(doc: Node, uuid: string): Range | null {
  let result: Range | null = null;

  doc.descendants((node, pos) => {
    const semanticBlocks: DocAnnotation[] = node.attrs._semanticBlocks ?? [];

    const found: DocAnnotation | undefined = semanticBlocks.find((block) => block.node.data.uuid === uuid);

    if (found) {
      if (result) {
        result.to = pos + (node.nodeSize - 1);
      } else {
        result = {
          from: pos,
          to: pos + (node.nodeSize - 1),
        };
      }
    }
  });

  return result;
}

/**
 * Collapses a pasted slice down to its raw plain text.
 *
 * Replaces block boundaries (paragraph) and line breaks with spaces. Currently used since handling paragraphs, line breaks etc.
 * would be too complicated for now. Implement later maybe.
 *
 * @param {Slice} slice - The parsed clipboard slice handed to `transformPasted`.
 * @param {Schema} schema - The active editor schema (from `view.state.schema`).
 * @returns {Slice} A bare inline-text slice, or `Slice.empty` when there is no text to insert.
 */
export function pastedSliceToRawText(slice: Slice, schema: Schema): Slice {
  const NON_BREAKING_SPACE: string = String.fromCharCode(0xa0);

  const text: string = slice.content.textBetween(0, slice.content.size, " ").replaceAll(NON_BREAKING_SPACE, " ");

  if (text.length === 0) {
    return Slice.empty;
  }

  // Open depth 0 on both ends -> the text merges into the current textblock at the cursor.
  return new Slice(Fragment.from(schema.text(text)), 0, 0);
}
