import { Node } from "@tiptap/pm/model";
import { Decoration, DecorationSet, EditorView } from "@tiptap/pm/view";
import { DocAnnotation, Range } from "../../models/types";
import { type AnnotationDecorationSpec } from "../../extensions/annotationDecoration";

/**
 * Converts a plain-text character index into the ProseMirror document position before that character.
 *
 * @param {Node} doc - The document to search.
 * @param {number} index - The character index in the plain text of the document.
 * @returns {number} The document position.
 */
export function indexToPosition(doc: Node, index: number): number {
  let pos: number = 0;
  let remaining: number = index;

  doc.descendants((node: Node, nodePos: number) => {
    // Position already found, do not further descend into the node subtree
    if (remaining < 0) {
      return false;
    }

    if (node.isText) {
      // Count characters in text node. If annotation index is inside it, return its position. Else,
      // subtract the number of characters in the text node from the remaining index.
      if (remaining <= node.nodeSize) {
        pos = nodePos + remaining;
        remaining = -1;

        return false;
      }

      remaining -= node.nodeSize;
    }
  });

  return pos;
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
 * Finds all block classifications carrying the given uuid and returns their combined document range.
 *
 * Scans the document tree for nodes containing the uuid in their `_blockClassifications` attribute,
 * accumulating the range from the first matching block to the last.
 *
 * @param {Node} doc The root document node to search
 * @param {string} uuid The uuid to match within each node's `_blockClassifications` array
 * @returns {Range | null} The from/to range spanning all matching blocks, or null if none found
 */
export function findBlockClassificationBoundariesByUuid(doc: Node, uuid: string): Range | null {
  let result: Range | null = null;

  doc.descendants((node, pos) => {
    const blockClassifications: DocAnnotation[] = node.attrs._blockClassifications ?? [];

    const found: DocAnnotation | undefined = blockClassifications.find((block) => block.node.data.uuid === uuid);

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
 * Finds the absolute position of the first node carrying the given `uuid` attribute.
 *
 * @param doc - The ProseMirror document node (`editor.state.doc`).
 * @param uuid - The uuid to look for.
 * @returns The node's position, or `null` when no node carries the uuid.
 */
export function findNodePosByUuid(doc: Node, uuid: string): number | null {
  let result: number | null = null;

  doc.descendants((node: Node, pos: number) => {
    if (result !== null) {
      return false;
    }

    if (node.attrs.uuid === uuid) {
      result = pos;
      return false;
    }
  });

  return result;
}

/**
 * Returns the ProseMirror document positions that correspond to the top and bottom edges
 * of the editor's scroll container (i.e. the currently visible range of the document).
 *
 * Requires the editor element to be as tall as its content, otherwise `posAtCoords` returns `null`.
 *
 * Falls back to `0` for `from` and `doc.content.size` for `to` when `posAtCoords` returns
 * `null` — which happens when the editor content does not yet fill the container or the
 * coordinates land outside the rendered document.
 *
 * @param {EditorView} editorView - The ProseMirror EditorView instance.
 * @returns {{ from: number; to: number }} The start and end document positions of the visible range.
 */
export function getVisibleDocRange(editorView: EditorView): { from: number; to: number } {
  // TODO: Add viewport buffer so that annotation directly above/below are included...
  const scrollPaneRect: DOMRect | undefined = editorView.dom.parentElement?.getBoundingClientRect();

  if (!scrollPaneRect) {
    return { from: 0, to: editorView.state.doc.content.size };
  }

  const contentRect: DOMRect = editorView.dom.getBoundingClientRect();

  const left: number = contentRect.left + 1;
  const top: number = Math.max(scrollPaneRect.top, contentRect.top) + 1;
  const bottom: number = Math.min(scrollPaneRect.bottom, contentRect.bottom) - 1;

  const startPos = editorView.posAtCoords({ left, top });
  const endPos = editorView.posAtCoords({ left, top: bottom });

  // Catch edge cases
  const from: number = startPos?.pos ?? 0;
  const to: number = endPos?.pos ?? editorView.state.doc.content.size;

  return { from, to };
}
