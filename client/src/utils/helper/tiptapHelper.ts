import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Annotation, DocAnnotation, NodeStatus, Range } from "../../models/types";
import { Fragment, Node, Schema, Slice } from "@tiptap/pm/model";
import { cloneDeep, pruneDeletedNodes, setNodeTreeStatus } from "./helper";
import type { AnnotationDecorationSpec } from "../../editors/text/extensions/annotationDecoration";

/**
 * Converts an annotation into the object that is stored in tiptap node attributes
 * (`_annotation`, entries of `_semanticBlocks`) by dropping its top-level status.
 *
 * Deep cloneed, so the document never shares object references with the annotation stores.
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
 * Brings an annotation from the node attributes in line with the database state after a successful save:
 * connected nodes that were deleted or removed are dropped, all remaining ones are set to "unchanged".
 *
 * @param {DocAnnotation} docAnnotation - The annotation read from the node attributes.
 * @returns {DocAnnotation} A cleaned deep clone of the annotation.
 */
export function normalizeDocAnnotation(docAnnotation: DocAnnotation): DocAnnotation {
  const annotation: Annotation = toAnnotation(docAnnotation, "unchanged");

  pruneDeletedNodes(annotation);
  setNodeTreeStatus(annotation, "unchanged");

  return { node: annotation.node, connectedNodes: annotation.connectedNodes };
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
