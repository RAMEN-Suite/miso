import { Node } from "@tiptap/pm/model";
import { BlockClassificationRange, DocAnnotation, ToCItem } from "../../models/types";
import { useGuidelinesStore } from "../../external";

const { getAnnotationType } = useGuidelinesStore();

/**
 * Recursively builds a tree of {@link ToCItem} nodes from a ProseMirror node's block children.
 *
 * Items are frozen, so Vue (and other proxy-based reactivity) never wraps them.
 *
 * @param node - The ProseMirror node whose block children to traverse.
 * @param contentStartPos - Absolute document position where `node`'s content begins.
 *   For the document root this is `0`; for any other block node it is `nodePos + 1`
 *   (skipping the opening token). Only used as fallback key for nodes without a uuid.
 * @param cache - ToC items by the ProseMirror node they were built from. ProseMirror reuses unchanged node objects
 *   across transactions, so a cache hit returns the identical item (and subtree), which lets the ToC skip
 *   re-rendering it. Filled with the newly built items.
 */
export function buildDocChildren(node: Node, contentStartPos: number, cache: WeakMap<Node, ToCItem>): ToCItem[] {
  const result: ToCItem[] = [];

  node.forEach((child: Node, offset: number) => {
    if (!child.isBlock) {
      return;
    }

    const cached: ToCItem | undefined = cache.get(child);

    if (cached) {
      result.push(cached);
      return;
    }

    const childPos: number = contentStartPos + offset;

    const item: ToCItem = Object.freeze({
      key: child.attrs.uuid ?? childPos.toString(),
      data: {
        text: child.textContent ?? "",
        nodeType: child.type.name,
        type: getAnnotationType(child.type.name),
        level: child.attrs.level ?? null,
        _annotation: child.attrs._annotation,
        _blockClassifications: child.attrs._blockClassifications ?? [],
      },
      children: buildDocChildren(child, childPos + 1, cache),
    });

    cache.set(child, item);
    result.push(item);
  });

  return result;
}

/**
 * Builds a nested {@link ToCItem} tree representing the full block structure of a ProseMirror document.
 *
 * Items carry no positions; use `findNodePosByUuid` with the item's key to navigate to a node.
 *
 * @param doc - The ProseMirror document node (`editor.state.doc`).
 * @param cache - Items of previous builds, see {@link buildDocChildren}.
 */
export function buildDocStructure(doc: Node, cache: WeakMap<Node, ToCItem>): ToCItem[] {
  // doc has no opening token, so its content starts at position 0
  const structure: ToCItem[] = buildDocChildren(doc, 0, cache);

  return structure;
}

/**
 * Collects the document range of every block classification, from the first block it wraps to the last.
 *
 * @param {Node} doc - The ProseMirror document node (`editor.state.doc`).
 * @returns {BlockClassificationRange[]} One range per block classification uuid.
 */
export function getBlockClassificationRanges(doc: Node): BlockClassificationRange[] {
  const uuidMap = new Map<string, BlockClassificationRange>();

  doc.descendants((node, pos) => {
    const blockClassifications: DocAnnotation[] = node.attrs._blockClassifications ?? [];

    blockClassifications.forEach((block) => {
      const { type, uuid } = block.node.data;

      const existing: BlockClassificationRange | undefined = uuidMap.get(uuid);

      if (existing) {
        existing.endPos = pos + (node.nodeSize - 1);
      } else {
        uuidMap.set(uuid, { startPos: pos, endPos: pos + (node.nodeSize - 1), type, uuid });
      }
    });
  });

  return [...uuidMap.values()];
}
