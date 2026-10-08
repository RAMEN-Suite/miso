import { useTiptapStore } from "../store/tiptap";
import { ANNOTATION_DECORATION_KEY } from "../editors/text/extensions/annotationDecoration";
import { DocAnnotation, IndexMap } from "../models/types";
import { Decoration } from "@tiptap/pm/view";
import { Node } from "@tiptap/pm/model";

/**
 * Composable that builds standoff-annotation index maps from the current ProseMirror document.
 *
 * Each map translates a node or decoration UUID to `{ startIndex, endIndex }` offsets in the
 * plain-text representation of the document (i.e. character positions, not ProseMirror doc
 * positions). The maps are used when serialising annotations to standoff format for the backend.
 *
 * Three maps are produced, one per place the annotations are stored in:
 * - `inlineIndexMap`        – inline annotations from the annotation store: range decorations (from/to in
 *                             plain-text chars) and `zeroPointAnnotation` inline atoms (position between two chars)
 * - `structureIndexMap`     – structural nodes: block nodes that carry a `uuid` attr (paragraphs, headings, …)
 *                             and `hardBreak` inline atoms (position between two chars)
 * - `semanticBlockIndexMap` – semantic blocks stored in the `_semanticBlocks` attribute of the block nodes they wrap
 */
export function useCreateIndexMaps() {
  const { tiptap } = useTiptapStore();

  if (!tiptap.value) {
    throw new Error("useCreateIndexMaps() requires an initialised tiptap editor.");
  }

  const doc: Node = tiptap.value.state.doc;

  const decorations: Decoration[] = ANNOTATION_DECORATION_KEY.getState(tiptap.value.state)?.all.find() ?? [];

  /**
   * Builds all index maps from the current document. Call this once per save cycle.
   *
   * Range and zero-point annotations are stored in the same store and therefore share one map,
   * just as blocks and hardBreaks do.
   *
   * @returns {{ inlineIndexMap: IndexMap; structureIndexMap: IndexMap; semanticBlockIndexMap: IndexMap }} The index maps.
   */
  function buildIndexMaps(): { inlineIndexMap: IndexMap; structureIndexMap: IndexMap; semanticBlockIndexMap: IndexMap } {
    return {
      inlineIndexMap: new Map([...buildDecorationIndexMap(), ...buildZeroPointIndexMap()]),
      structureIndexMap: new Map([...buildStructureIndexMap(), ...buildHardBreakIndexMap()]),
      semanticBlockIndexMap: buildSemanticBlockIndexMap(),
    };
  }

  /**
   * Traverses the document and maps every uuid-bearing block node to its plain-text char range.
   *
   * @returns The populated `IndexMap`.
   */
  function buildStructureIndexMap(): IndexMap {
    const map: IndexMap = new Map();
    traverseNode(doc, 0, map);

    return map;
  }

  /**
   * Walks the document and builds a map of label annotation UUIDs → their live char range.
   *
   * Label annotations (e.g. `closer`, `address`) are not block nodes themselves; instead, their
   * annotation data are stored in the `_semanticBlocks` attribute on the built-in block nodes that
   * fall within their range. For each UUID found, this function accumulates the union of all
   * contributing nodes' char ranges, giving the annotation's current `startIndex`/`endIndex`.
   *
   * @returns The populated `IndexMap`.
   */
  function buildSemanticBlockIndexMap(): IndexMap {
    const map: IndexMap = new Map();

    function walk(node: Node, charIndex: number): number {
      if (node.isText) {
        return charIndex + node.nodeSize;
      }

      const start: number = charIndex;
      let current = charIndex;

      node.forEach((child: Node) => {
        current = walk(child, current);
      });

      const semanticBlocks: DocAnnotation[] = node.attrs?._semanticBlocks ?? [];

      semanticBlocks.forEach((block) => {
        const { uuid } = block.node.data;

        const existing = map.get(uuid);

        if (!existing) {
          map.set(uuid, { startIndex: start, endIndex: current - 1 });
        } else {
          existing.startIndex = Math.min(existing.startIndex, start);
          existing.endIndex = Math.max(existing.endIndex, current - 1);
        }
      });

      return current;
    }

    walk(doc, 0);

    return map;
  }

  /**
   * Maps each `zeroPointAnnotation` node (by uuid) to the gap it occupies between two chars.
   *
   * @returns The populated `IndexMap`.
   */
  function buildZeroPointIndexMap(): IndexMap {
    const map: IndexMap = new Map();
    traverseForInlineNode(doc, 0, "zeroPointAnnotation", map);

    return map;
  }

  /**
   * Maps each `hardBreak` node (by uuid) to the gap it occupies between two chars.
   *
   * @returns The populated `IndexMap`.
   */
  function buildHardBreakIndexMap(): IndexMap {
    const map: IndexMap = new Map();
    traverseForInlineNode(doc, 0, "hardBreak", map);

    return map;
  }

  /**
   * Converts ProseMirror doc positions for every decoration's `from`/`to` into plain-text char
   * indices by walking only text nodes and counting characters. The endIndex is stored as
   * `to - 1` so both start and end are inclusive char offsets.
   *
   * @returns The populated `IndexMap` keyed by decoration `_uuid`.
   */
  function buildDecorationIndexMap(): IndexMap {
    // All available decoration positions that need remapping
    const sortedPositions: number[] = [...new Set(decorations.flatMap((d) => [d.from, d.to]))].sort((a, b) => a - b);
    const positionMap = new Map<number, number>();

    // The index of the character in the plain text (counts only char positions, not doc positions)
    let charIndex: number = 0;

    // Loop index for sortedPositions array
    let i: number = 0;

    doc.descendants((node: Node, nodePos: number) => {
      if (i >= sortedPositions.length) {
        return false;
      }

      if (node.isText) {
        const nodeEnd: number = nodePos + node.nodeSize;

        // For each doc position inside the current text node, the same mapping can be applied
        while (i < sortedPositions.length && sortedPositions[i] <= nodeEnd) {
          const curr: number = sortedPositions[i];
          i++;
          positionMap.set(curr, charIndex + (curr - nodePos));
        }

        charIndex += node.nodeSize;
      }
    });

    const map: IndexMap = new Map();

    for (const deco of decorations) {
      const startIndex: number | undefined = positionMap.get(deco.from);
      const endIndex: number | undefined = positionMap.get(deco.to);

      if (startIndex === undefined || endIndex === undefined) {
        console.error("Decoration position not found in position map:", deco);
        continue;
      }
      map.set(deco.spec._uuid, {
        startIndex,
        endIndex: endIndex - 1,
      });
    }

    return map;
  }

  /**
   * Recursively walks `node`, accumulating plain-text char count in `charIndex`.
   * Block nodes with a `uuid` attr are recorded in `map` as `[startIndex, endIndex]` (inclusive).
   * Inline atoms are intentionally skipped here; they are handled by `traverseForInlineNode`.
   *
   * @param node - The ProseMirror node to walk.
   * @param charIndex - Plain-text char offset at the start of this node.
   * @param map - Accumulator map; entries are added in place.
   * @returns The updated `charIndex` after all text inside `node` has been counted.
   */
  function traverseNode(node: Node, charIndex: number, map: IndexMap): number {
    if (node.isText) {
      return charIndex + node.nodeSize;
    }

    const startIndex: number = charIndex;
    let current: number = charIndex;

    node.forEach((child) => {
      current = traverseNode(child, current, map);
    });

    // Only block nodes map to standoff ranges; inline atoms (zeroPointAnnotation, hardBreak)
    // are handled separately by traverseForInlineNode.
    if (node.attrs.uuid && node.type.isBlock) {
      map.set(node.attrs.uuid, { startIndex, endIndex: current - 1 });
    }

    return current;
  }

  /**
   * Recursively walks `node` and records the standoff position of every inline node of
   * `nodeTypeName` that carries a `uuid` attr. Zero-point annotations (including hardBreaks) use offset semantics:
   * the atom sits before the character at plain-text offset `charIndex`, so it has no range and both bounds equal
   * that offset (`startIndex === endIndex === charIndex`). The char counter is NOT advanced for the
   * inline atom itself.
   *
   * @param node - The ProseMirror node to walk.
   * @param charIndex - Plain-text char offset at the start of this node.
   * @param nodeTypeName - ProseMirror node type name to match (e.g. `'hardBreak'`).
   * @param map - Accumulator map; entries are added in place.
   * @returns The updated `charIndex` (unchanged when the current node is the target inline atom).
   */
  function traverseForInlineNode(node: Node, charIndex: number, nodeTypeName: string, map: IndexMap): number {
    // Collect character count recursively
    if (node.isText) {
      return charIndex + node.nodeSize;
    }

    if (node.type.name === nodeTypeName && node.attrs.uuid) {
      map.set(node.attrs.uuid, { startIndex: charIndex, endIndex: charIndex });
      return charIndex;
    }

    let current = charIndex;
    node.forEach((child) => {
      current = traverseForInlineNode(child, current, nodeTypeName, map);
    });

    return current;
  }

  return {
    buildIndexMaps,
  };
}
