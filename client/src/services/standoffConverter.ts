import { LEAF_BLOCK_TYPES, VALID_SEMANTIC_BLOCK_TARGETS } from "../config/editor";
import {
  ApiJson,
  TiptapNode,
  TiptapJson,
  NodeStatusObject,
  AnnotationNode,
  AnnotationType,
  AnnotationRole,
  DocAnnotation,
  StandoffParseIssue,
} from "../models/types";
import { useGuidelinesStore } from "../store/guidelines";
import { createNodeStatusObjectFromRawData } from "../utils/helper/helper";
import { toDocAnnotation } from "../utils/helper/tiptapHelper";

type Anno = NodeStatusObject<AnnotationNode>;

/**
 * Helper for text ranges, used during creation of gap paragraphs when indices are orphaned
 * (not part of any block annotation)
 */
interface IndexRange {
  start: number;
  end: number;
}

const {
  getStructuralAnnotationConfigs,
  isZeroPoint,
  getEditorRole,
  getAnnotationType,
  getAnnotationRole,
  getAnnotationBehaviour,
  getPriorityForType,
  getEditorOwnedProperties,
  isConfiguredAnnotationType,
} = useGuidelinesStore();

export default class StandoffConverter {
  // Built-in structural annotations (paragraph, heading, table, …) — form the TipTap tree.
  private structuralAnnotations = new Map<string, Anno>();
  // Custom structural annotations (closer, address, addrLine, …) — attached as _semanticBlocks
  // Semantic blocks on the built-in nodes that contain them (e.g. closer, div, ...), never form tree nodes.
  private semanticBlockAnnotations = new Map<string, Anno>();
  // Content annotations (person, place, …) — rendered as decorations.
  private inlineAnnotations = new Map<string, Anno>();

  private standoffJson: ApiJson;
  private tiptapJson: TiptapJson | null = null;
  private usedUuids = new Set<string>();
  /** Problems found during parsing, handed to the editor setup to be further processed there. */
  private issues: StandoffParseIssue[] = [];

  // Types that are always handled inline and must never appear as block children.
  private static readonly EXCLUDED_FROM_BLOCK_CHILDREN = new Set(["hardBreak"]);

  constructor(newStandoffJson: ApiJson) {
    this.standoffJson = newStandoffJson;

    this.convertStandoffToTipTap();
  }

  public getData(): {
    annotations: Map<string, Anno>;
    issues: StandoffParseIssue[];
    structuralAnnotations: Map<string, Anno>;
    tipTapJson: TiptapJson;
  } {
    // Merge built-in structural + label annotations so the annotation panel can display and
    // edit all structural annotations regardless of whether they form tree nodes or labels.
    const allStructural = new Map<string, Anno>([...this.structuralAnnotations, ...this.semanticBlockAnnotations]);

    return {
      annotations: this.inlineAnnotations,
      issues: this.issues,
      structuralAnnotations: allStructural,
      tipTapJson: this.tiptapJson,
    };
  }

  /**
   * Sets up the stores for the different annotation categories (structural, inline, semantic block) and validates the document.
   *
   * The stores are used for all the subsequent parsing steps and will be exported to the editor setup afterwards. The issues
   * are also exported to the editor setup for further processing.
   *
   * @returns {void} - This function does not return a value. All the data are set directly into the variables.
   */
  private createAnnotationUuidMaps(): void {
    const statusObjects: Anno[] = this.standoffJson.annotations.map((a) => createNodeStatusObjectFromRawData(a) as Anno);
    const unconfiguredTypes = new Map<string, number>();

    for (const a of statusObjects) {
      const documentRole: AnnotationRole = getAnnotationRole(a.node.data.type);

      if (!isConfiguredAnnotationType(a.node.data.type)) {
        unconfiguredTypes.set(a.node.data.type, (unconfiguredTypes.get(a.node.data.type) ?? 0) + 1);
      }

      if (documentRole === "structure") {
        // Built-in scaffolding (paragraph, heading, table, hardBreak, ...) — forms the TipTap tree.
        this.structuralAnnotations.set(a.node.data.uuid, a);
      } else if (documentRole === "semanticBlock") {
        // Whole-block label (opener, closer, addrLine, ...) — attached as _semanticBlocks, never a tree node.
        this.semanticBlockAnnotations.set(a.node.data.uuid, a);
      } else {
        // Inline annotation — rendered as a range decoration or a zero-point atom.
        this.inlineAnnotations.set(a.node.data.uuid, a);
      }
    }

    for (const [type, count] of unconfiguredTypes) {
      this.issues.push({
        severity: "error",
        reason: "unconfiguredType",
        message: `${count} annotation(s) of type "${type}" are not configured.`,
      });
    }
  }

  /**
   * Returns the list of annotation types allowed as structural children of the given annotation type as
   * configured in the given annotation type's `contains` field.
   * `Null` means "no filter" - the node either has no declared children or is a leaf.
   *
   * Even though technically all annotations can have a `contains` field, this function is only used
   * for built-in block types (e.g. `table` -> `tableRow`, `bulletList` -> `listItem`).
   *
   * @param {string} type The annotation type
   * @returns {string[] | null} The list of allowed child types or `null` if list is empty or non-existent
   */
  private getContainsList(type: string): string[] | null {
    const config: AnnotationType | undefined = getStructuralAnnotationConfigs().find((c) => c.type === type);
    const list: string[] | undefined = config?.contains;

    return list && list.length > 0 ? list : null;
  }

  /**
   * Checks if a node should contain another node in the final tree, based on ther `startIndex` and `endIndex` properties.
   *
   * For ranges of different size the larger wraps the smaller. Co-equal ranges (e.g. a single-item list
   * where bulletList, listItem and paragraph all share [29,33]) where a symmetric
   * `contains`-based test would make each "contain" the other are resolved deterministically: higher `priority` number wins
   * (outer container types have higher priority, e.g. bulletList 60 > listItem 50 > paragraph 20), then the annotation's uuid
   * as a final tiebreak so identical-range duplicates resolve to exactly one survivor instead of mutually annihilating.
   * The uuid tie break also ensures that the same document is created every time the same standoff is parsed.
   *
   * @param {Anno} outer: The Annotation whose node might contain `inner`
   * @param {Anno} inner: The Annotation whose node might be contained by `outer`
   * @returns {boolean}: `true` if `outer` contains `inner`, `false` otherwise
   */
  private contains(outer: Anno, inner: Anno): boolean {
    if (outer.node.data.uuid === inner.node.data.uuid) {
      return false;
    }

    const outerStart: number = outer.node.data.startIndex;
    const outerEnd: number = outer.node.data.endIndex;
    const innerStart: number = inner.node.data.startIndex;
    const innerEnd: number = inner.node.data.endIndex;

    // `outer` must cover `inner`.
    if (outerStart > innerStart || outerEnd < innerEnd) {
      return false;
    }

    // Strictly larger range -> unambiguously the ancestor.
    if (outerStart < innerStart || outerEnd > innerEnd) {
      return true;
    }

    // Co-equal range: order by priority (higher = more outer / further up the tree)
    const outerPrio: number = getPriorityForType(outer.node.data.type);
    const innerPrio: number = getPriorityForType(inner.node.data.type);

    if (outerPrio !== innerPrio) {
      return outerPrio > innerPrio;
    }

    // Final tiebreak: uuid for a stable strict order.
    return outer.node.data.uuid < inner.node.data.uuid;
  }

  /**
   * Returns the immediate structural children within given range for the parent type.
   * When the parent type has a `contains` list, only types in that list are candidates.
   * This resolves co-equal built-in ranges (e.g. `tableCell` and `paragraph` both at [40,60]):
   * If `tableRow.contains` = [`'tableCell'`] -> only `tableCell` is a candidate for `tableRow`.
   *
   * Note that this function does not build any tree/tiptap elements; it is only a lookup function for the flattened
   * annotation list.
   *
   * @param {string} parentType Type of the parent annotation
   * @param {number} startIndex The start index of the parent annotation's range
   * @param {number} endIndex The end index of the parent annotation's range
   * @param {Anno[]} allStructural The list of all structural annotations
   * @returns {Anno[]} The immediate structural children, sorted by start index
   */
  private findDirectChildren(parentType: string, startIndex: number, endIndex: number, allStructural: Anno[]): Anno[] {
    const containsList: string[] | null = this.getContainsList(parentType);

    const candidates: Anno[] = allStructural.filter(
      (a) =>
        !this.usedUuids.has(a.node.data.uuid) &&
        !this.isStructuralZeroPoint(a.node.data.type) &&
        a.node.data.startIndex >= startIndex &&
        a.node.data.endIndex <= endIndex &&
        (containsList === null || containsList.includes(getEditorRole(a.node.data.type))),
    );

    return candidates
      .filter((child) => !candidates.some((b) => this.contains(b, child)))
      .sort((a, b) => a.node.data.startIndex - b.node.data.startIndex);
  }

  /**
   * Creates a text node with the given range of standoff text.
   *
   * @param startIndex The start index of the text node
   * @param endIndex The end index of the text node
   * @returns {TiptapNode[]} A single-element array with the text node, or an empty array when the
   *   range is empty (ProseMirror forbids empty text nodes, so they must never be emitted).
   */
  private createTextNode(startIndex: number, endIndex: number): TiptapNode[] {
    const text: string = this.standoffJson.text.slice(startIndex, endIndex + 1);

    return text ? [{ type: "text", text }] : [];
  }

  /**
   * Checks whether a zero-point annotation is within a given text range, taking into account zero-point annotations
   * that are at the end of the text (after the last character).
   *
   * A zero-point annotation's `startIndex` is an offset (`startIndex === endIndex === N` rather than the index
   * of the first annotated character (there is no "range" to be covered by a zero-point annotation). Therefore,
   * the rule is "insert before the character at index N", and its valid range is [0..standoffText.length]. If the annotation is
   * at the very end of the text, its `startIndex` is would technically never be contained in a range. So in this case,
   * the range to be checked is incremented by one.
   *
   * @param {Anno} a The zero-point (including hardBreak) annotation to test.
   * @param {{ startIndex: number; endIndex: number }} range The leaf's inclusive char range.
   * @returns {boolean} `true` if the annotation's offset belongs to this leaf, `false` otherwise
   */
  private inRange(a: Anno, range: { startIndex: number; endIndex: number }): boolean {
    const rangeEnd: number = range.endIndex === this.standoffJson.text.length - 1 ? range.endIndex + 1 : range.endIndex;

    return a.node.data.startIndex >= range.startIndex && a.node.data.startIndex <= rangeEnd;
  }

  /**
   * Builds the inline content of a leaf structural node, interweaving text with zero-point atom nodes
   * and hard breaks, all sorted by position, and returns the resulting array of Tiptap inline nodes.
   *
   * Only used when the parent allows leaf content (only`paragraph` or `heading`, not `bulletList` or `listItem`).
   *
   * @param {number} startIndex The start index of the leaf node
   * @param {number} endIndex The end index of the leaf node
   * @returns {TiptapNode[]} An array of Tiptap inline nodes (hard breaks, zero point annotations, text nodes)
   */
  private createLeafContent(startIndex: number, endIndex: number): TiptapNode[] {
    interface InlineEntry {
      pos: number;
      node: TiptapNode;
    }

    // Resolve to atom nodes as configured in the custom `ZeroPointAnnotation` extension
    const zeroPointEntries: InlineEntry[] = [...this.inlineAnnotations.values()]
      .filter((a) => isZeroPoint(a.node) && this.inRange(a, { startIndex, endIndex }))
      .map((a) => ({
        pos: a.node.data.startIndex,
        node: {
          type: "zeroPointAnnotation",
          attrs: {
            uuid: a.node.data.uuid,
            _annotation: toDocAnnotation(a),
          },
        },
      }));

    // Resolve to hardBreaks (the only built-in type configured the way below)
    const hardBreakEntries: InlineEntry[] = [...this.structuralAnnotations.values()]
      .filter((a) => getAnnotationBehaviour(a.node.data.type) === "zeroPoint" && this.inRange(a, { startIndex, endIndex }))
      .map((a) => ({
        pos: a.node.data.startIndex,
        node: {
          type: "hardBreak",
          attrs: {
            uuid: a.node.data.uuid,
            _annotation: toDocAnnotation(a),
          },
        },
      }));

    const inlineNodes: InlineEntry[] = [...zeroPointEntries, ...hardBreakEntries].sort((a, b) => a.pos - b.pos);

    if (inlineNodes.length === 0) {
      return this.createTextNode(startIndex, endIndex);
    }

    const nodes: TiptapNode[] = [];

    let cursor: number = startIndex;

    for (const { pos, node } of inlineNodes) {
      // Zero-point/hard-break offset semantics: `pos` (the annotation's startIndex) is the offset
      // BEFORE which the atom sits. Emit the text up to (but excluding) `pos`, then the atom, so the
      // character at `pos` follows it. Co-located atoms stay adjacent before that character.
      if (cursor < pos) {
        nodes.push(...this.createTextNode(cursor, pos - 1));
      }
      nodes.push(node);

      cursor = pos;
    }

    if (cursor <= endIndex) {
      nodes.push(...this.createTextNode(cursor, endIndex));
    }

    return nodes;
  }

  /**
   * Checks if the given range contains only whitespace text.
   *
   * Used in {@linkcode appendGapParagraphs} to determine how the gap content should be treated
   * (create separate paragraph or merge into the previous/next node).
   *
   * @param {number} startIndex The start index of the range
   * @param {number} endIndex The end index of the range
   * @returns `true` if the range contains only whitespace, `false` otherwise
   */
  private isOnlyWhitespaces(startIndex: number, endIndex: number): boolean {
    return this.standoffJson.text.slice(startIndex, endIndex + 1).trim().length === 0;
  }

  /**
   * Creates a synthetic paragraph node with the given content.
   *
   * Used to create a paragraph node that contains the gap content
   * for orphaned text ranges (= ranges that are not part of any structure annotation).
   *
   * @param {number} startIndex The start index of the gap
   * @param {number} endIndex The end index of the gap
   * @param {TiptapNode[]} content The content that should be passed into the paragraph node
   * @returns {TiptapNode} The synthetic paragraph node
   */
  private syntheticParagraph(startIndex: number, endIndex: number, content: TiptapNode[]): TiptapNode {
    const uuid: string = crypto.randomUUID();
    const paragraphType: string = getAnnotationType("paragraph");

    const docAnnotation: DocAnnotation = {
      node: {
        data: { type: paragraphType, uuid, startIndex, endIndex } as AnnotationNode["data"],
        nodeLabels: ["Annotation"],
      },
      connectedNodes: [],
    };

    return {
      type: "paragraph",
      attrs: {
        uuid,
        _annotation: docAnnotation,
      },
      content,
    };
  }

  /**
   * Splits a gap range [gapStart, gapEnd] at semantic block annotation boundaries (opener, closer etc.)
   * so that each resulting sub-range can become its own synthetic paragraph and receive the correct labels. Needed
   * to created the flat structure of built-in blocks that have the semantic block labels on them.
   * Without this, a single large synthetic paragraph would span the entire gap and no semantic block annotation
   * (which starts mid-gap) would satisfy the "semantic block fully contains node" filter.
   *
   * @param {number} gapStart The start index of the gap
   * @param {number} gapEnd The end index of the gap
   * @returns {IndexRange[]} An array of sub-ranges for this gap
   */
  private splitGapBySemanticBlocks(gapStart: number, gapEnd: number): IndexRange[] {
    const boundaries = new Set<number>([gapStart, gapEnd + 1]);

    for (const anno of this.semanticBlockAnnotations.values()) {
      const { startIndex, endIndex } = anno.node.data;

      if (startIndex <= gapEnd && endIndex >= gapStart) {
        if (startIndex >= gapStart) {
          boundaries.add(startIndex);
        }

        if (endIndex + 1 <= gapEnd + 1) {
          boundaries.add(endIndex + 1);
        }
      }
    }

    const sorted: number[] = [...boundaries].sort((a, b) => a - b);
    const ranges: IndexRange[] = [];

    for (let i = 0; i < sorted.length - 1; i++) {
      ranges.push({ start: sorted[i], end: sorted[i + 1] - 1 });
    }

    return ranges;
  }

  // Whether the given (built-in) container type may hold a `paragraph` as a direct child.
  // Drives gap handling: containers like listItem/tableCell accept synthetic paragraphs,
  // while tableRow/table/bulletList do NOT (their content is restricted to cells/rows/items),
  // so orphan gap text inside them must be clamped into an adjacent child instead.
  private parentAllowsParagraph(parentType: string): boolean {
    const containsList: string[] | null = this.getContainsList(parentType);

    // No declared children → treated as permissive (leaf types never reach gap-filling anyway).
    if (containsList === null) {
      return true;
    }

    return containsList.includes("paragraph");
  }

  /**
   * Emits paragraphs for a gap into given `content`, preserving EVERY character of [gapStart, gapEnd].
   * The gap is split at semantic-block boundaries so each text run becomes its own paragraph and
   * receives the correct semantic labels. Used only when the parent accepts paragraphs (e.g. `bulletList` can not
   * contain paragraphs, only `tableRows`).
   *
   * Main reason for this function is to catch orphaned text indices that are not contained by any structural annotation
   * -> tiptap needs a paragraph to render the text.
   *
   * @param {TiptapNode[]} content The content to append to
   * @param {number} gapStart The start index of the gap
   * @param {number} gapEnd The end index of the gap
   * @returns {void} This function does not return any value
   */
  private appendGapParagraphs(content: TiptapNode[], gapStart: number, gapEnd: number): void {
    if (gapStart > gapEnd) {
      return;
    }

    const subRanges: IndexRange[] = this.splitGapBySemanticBlocks(gapStart, gapEnd);

    let leadingWhitespaceBuffer: IndexRange[] = [];
    let lastParagraph: TiptapNode | null = null;

    for (const { start, end } of subRanges) {
      // If only whitespace, merge it into the adjacent node since it is likely a gap
      // between two semantic structure blocks (`addrLine`, `addrLine`)
      if (this.isOnlyWhitespaces(start, end)) {
        // Append to the last paragraph if there is one. Otherwise, keep it in the leading buffer
        if (lastParagraph) {
          this.clampTextIntoNode(lastParagraph, start, end, "append");
        } else {
          leadingWhitespaceBuffer.push({ start, end });
        }

        continue;
      }

      const paragraph: TiptapNode = this.syntheticParagraph(start, end, this.createLeafContent(start, end));

      // Flush buffered leading whitespace into the front of this paragraph (ascending order).
      for (let i = leadingWhitespaceBuffer.length - 1; i >= 0; i--) {
        this.clampTextIntoNode(paragraph, leadingWhitespaceBuffer[i].start, leadingWhitespaceBuffer[i].end, "prepend");
      }

      content.push(paragraph);

      leadingWhitespaceBuffer = [];
      lastParagraph = paragraph;
    }

    // buffer holds elements -> The gap held no real text at all (e.g. inter-block whitespace).
    if (leadingWhitespaceBuffer.length > 0) {
      if (content.length > 0) {
        const prev: TiptapNode = content[content.length - 1];

        for (const range of leadingWhitespaceBuffer) {
          this.clampTextIntoNode(prev, range.start, range.end, "append");
        }
      } else {
        // Leading whitespace at the very start with no siblings: keep it in its own paragraph.
        const first: IndexRange = leadingWhitespaceBuffer[0];
        const last: IndexRange = leadingWhitespaceBuffer[leadingWhitespaceBuffer.length - 1];

        content.push(this.syntheticParagraph(first.start, last.end, this.createLeafContent(first.start, last.end)));
      }
    }
  }

  /**
   * Places the text + atoms of given range into a single existing block node (or its deepest text-accepting leaf) by appending or prepending it.
   * Used as one solution for handling orphaned indices (the other being {@linkcode appendGapParagraphs}),
   * where the gap is not allowed to be a paragraph node and a merge must happen instead
   * (e.g. inside `tableRow` only `tableCell`s are possible, everything else would break the document).
   *
   * It works by descending into the deepest text-accepting leaf of the passed node (e.g. into a `tableCell`'s last/first paragraph)
   * and updating the range in the `_annotation` of every node on the path. Since the passed node
   * is a already fully build tiptap node, the descending is guaranteed to succeed.
   *
   * @param {TiptapNode} content The node to append the text range to
   * @param {Number} start The start index of the orphaned range
   * @param {number} end The end index of the orphaned range
   * @param {'append' | 'prepend'} mode Whether to append or prepend the orphaned content to the given node
   * @returns {void} This function does not return any value (the passed node is modified in-place)
   */
  private clampTextIntoNode(content: TiptapNode, start: number, end: number, mode: "append" | "prepend" = "append"): void {
    if (start > end) {
      return;
    }

    if (content.attrs?._annotation) {
      const data: Record<string, any> = (content.attrs._annotation as DocAnnotation).node.data;

      if (mode === "append") {
        data.endIndex = Math.max(data.endIndex ?? end, end);
      } else {
        data.startIndex = Math.min(data.startIndex ?? start, start);
      }
    }

    const leaf: TiptapNode[] = this.createLeafContent(start, end);

    // Leaf block (paragraph/heading): the text lives here directly.
    if (this.isLeafContainer(content.type)) {
      content.content = content.content ?? [];

      if (mode === "append") {
        content.content.push(...leaf);
      } else {
        content.content.unshift(...leaf);
      }

      return;
    }

    // Container: descend into the appropriate block child.
    const blockChildren: TiptapNode[] = (content.content ?? []).filter(
      (c) => c.type !== "text" && c.type !== "hardBreak" && c.type !== "zeroPointAnnotation",
    );

    // Nothing to descend into (degenerate), meaning that there is no more valid block child.
    // Attach directly as a last resort.
    if (blockChildren.length === 0) {
      content.content = content.content ?? [];

      if (mode === "append") {
        content.content.push(...leaf);
      } else {
        content.content.unshift(...leaf);
      }

      return;
    }

    // If there are valid block children, descend further down the tree
    const target: TiptapNode = mode === "append" ? blockChildren[blockChildren.length - 1] : blockChildren[0];

    this.clampTextIntoNode(target, start, end, mode);
  }

  /**
   * Warning function to log out if any invalid indices required clamping, and to record it as a parse issue
   * with severity `warning` (the clamp repairs the document, it is fixed in the database on the next save).
   *
   * @param {number} startIndex The start index of the orphaned range
   * @param {number} endIndex The end index of the orphaned range
   * @param {string} parentType Type of the parent annotation
   * @param {'previous' | 'next'} where Whether the clamp prepended or appended the range into the adjacent node
   */
  private warnClamp(startIndex: number, endIndex: number, parentType: string, where: "previous" | "next"): void {
    this.issues.push({
      severity: "warning",
      reason: "clampedGap",
      message: `Text at [${startIndex},${endIndex}] belonged to no child of <${parentType}> and was merged into the ${where} one.`,
    });

    console.warn(
      `[standoffConverter] Clamped orphan gap [${startIndex},${endIndex}] into the ${where} child of ` +
        `<${parentType}>. This text belongs to no structural child — likely incorrect source ` +
        `indices in the imported data. (Candidate for a future refactor.)`,
    );
  }

  /**
   * Main building function to create the tiptap document. Called recursively for all structural annotations, uses their standoff
   * indices.
   *
   * Takes into account orphaned indices (= indices that aren't covered by any structure annotation)
   * and ensures a valid tiptap/prosemirror document is created by creating synthetic paragraph nodes or merging orphaned
   * text into their previous/next neighbour.
   *
   * @param {Anno} annotation The annotation that should be converted into a tiptap node
   * @param {Anno[]} allStructural Annotations that need to be considered for all operations)
   * @returns {TiptapNode} The built tiptap node
   */
  private buildStructuralNode(annotation: Anno, allStructural: Anno[]): TiptapNode {
    const { startIndex, endIndex, type } = annotation.node.data;
    const editorRole: string = getEditorRole(type);

    const attrs: Record<string, any> = {
      uuid: annotation.node.data.uuid,
      _annotation: toDocAnnotation(annotation),
    };

    // Apply editor attributes (level/colspan/rowspan) from the node's value under its project property name
    for (const { property, attribute } of getEditorOwnedProperties(type)) {
      attrs[attribute] = (annotation.node.data as Record<string, any>)[property] ?? 1;
    }

    // Is heading or paragraph -> can only hold text
    if (this.isLeafContainer(editorRole)) {
      return { type: editorRole, attrs, content: this.createLeafContent(startIndex, endIndex) };
    }

    const directChildren: Anno[] = this.findDirectChildren(type, startIndex, endIndex, allStructural);

    directChildren.forEach((c) => this.usedUuids.add(c.node.data.uuid));

    // Does this container accept paragraphs directly? If not (tableRow, table, bulletList), gap
    // text cannot become a synthetic paragraph and must be clamped into an adjacent child.
    const allowsParagraph: boolean = this.parentAllowsParagraph(type);

    const childNodes: TiptapNode[] = [];

    let cursor: number = startIndex;
    // Holds a leading gap that has no previous sibling yet, so it can be prepended to the next child.
    let pendingLeadingGap: IndexRange | null = null;

    for (const child of directChildren) {
      const gapEnd: number = child.node.data.startIndex - 1;

      if (cursor <= gapEnd) {
        if (allowsParagraph) {
          this.appendGapParagraphs(childNodes, cursor, gapEnd);
        } else if (childNodes.length > 0) {
          this.clampTextIntoNode(childNodes[childNodes.length - 1], cursor, gapEnd, "append");
          this.warnClamp(cursor, gapEnd, type, "previous");
        } else {
          // No previous sibling to clamp into — defer until the next child is built.
          pendingLeadingGap = { start: cursor, end: gapEnd };
        }
      }

      const childNode: TiptapNode = this.buildStructuralNode(child, allStructural);

      if (pendingLeadingGap) {
        this.clampTextIntoNode(childNode, pendingLeadingGap.start, pendingLeadingGap.end, "prepend");
        this.warnClamp(pendingLeadingGap.start, pendingLeadingGap.end, type, "next");
        pendingLeadingGap = null;
      }

      childNodes.push(childNode);

      cursor = child.node.data.endIndex + 1;
    }

    if (cursor <= endIndex) {
      if (allowsParagraph) {
        this.appendGapParagraphs(childNodes, cursor, endIndex);
      } else if (childNodes.length > 0) {
        this.clampTextIntoNode(childNodes[childNodes.length - 1], cursor, endIndex, "append");
        this.warnClamp(cursor, endIndex, type, "previous");
      } else {
        // Degenerate container with text but no children: keep the text rather than drop it.
        this.warnClamp(cursor, endIndex, type, "next");
        childNodes.push(this.syntheticParagraph(cursor, endIndex, this.createLeafContent(cursor, endIndex)));
      }
    }

    if (childNodes.length === 0) {
      // Zero-width container (no text, no children). Emit a minimal empty paragraph.
      childNodes.push(this.syntheticParagraph(startIndex, endIndex, []));
    }

    return { type: editorRole, attrs, content: childNodes };
  }

  /**
   * A structure annotation with zero-point behaviour (currently only `hardBreak`): an inline atom that must never
   * appear as a block child or a top-level node.
   *
   * @param {string} annotationType - The type of the annotation.
   * @returns {boolean} `true` if the type is a structural zero-point, `false` otherwise.
   */
  private isStructuralZeroPoint(annotationType: string): boolean {
    return getAnnotationRole(annotationType) === "structure" && getAnnotationBehaviour(annotationType) === "zeroPoint";
  }

  /** Checks if annotation of given type can be a top-level document node. Excludes structural zero-points
   * (currently only `hardBreak`).
   *
   * @param {string} type - The type of the annotation.
   * @returns {boolean} `true` if the annotation can be a top-level node, `false` otherwise.
   */
  private isAllowedAtTopLevel(type: string): boolean {
    return !this.isStructuralZeroPoint(type);
  }

  /**
   * Checks if the node is a leaf container, i.e. a node that cannot have any children. Reads from the class attribute that
   * holds all the leaf-container-only types (currently only `heading` and `paragraph`).
   *
   * @param {string} editorRole - The internal type of the Tiptap node (`heading`, `bulletList` etc.)
   * @returns {boolean} `true` if the node is a leaf container, `false` otherwise
   */
  private isLeafContainer(editorRole: string): boolean {
    return LEAF_BLOCK_TYPES.includes(editorRole);
  }

  /**
   * Finds top-level built-in structural annotations - those not wrapped by any other built-in annotation.
   * Used for creating the top document level from where the recursive children creation will start.
   *
   * @param allStructural - All built-in structural annotations
   * @returns {Anno[]} Top-level built-in structural annotations, sorted by their start index
   */
  private findTopLevelAnnotations(allStructural: Anno[]): Anno[] {
    const topLevelBlocks: Anno[] = allStructural.filter(
      (a) => this.isAllowedAtTopLevel(a.node.data.type) && !allStructural.some((b) => this.contains(b, a)),
    );

    return topLevelBlocks.sort((a, b) => a.node.data.startIndex - b.node.data.startIndex);
  }

  /**
   * Attaches semantic block annotations to the whole tiptap document after it was created
   * (= all built-in blocks are in place). Starting point for the recursive {@linkcode attachLabelsToNodes} function
   * that is called for level of the tree.
   *
   * @param {TiptapNode[]} nodes Sibling nodes of the tiptap document
   * @returns {void} This function does not return any value.
   */
  private attachSemanticBlockLabels(nodes: TiptapNode[]): void {
    const semanticBlockAnnotations: Anno[] = [...this.semanticBlockAnnotations.values()];

    if (semanticBlockAnnotations.length === 0) {
      return;
    }

    this.attachLabelsToNodes(nodes, semanticBlockAnnotations);
  }

  /**
   * Recursively attaches information of semantic block annotations (opener, closer etc.) to document building blocks that have an
   * intersecting range, therefore "tainting" these building blocks with a semantic meaning.
   *
   * Performs the operation for every node in the given list and all of its children.
   *
   * @param {TiptapNode[]} nodes Sibling nodes of the tiptap document
   * @param {Anno[]} annotations All semantic block annotations
   */
  private attachLabelsToNodes(nodes: TiptapNode[], annotations: Anno[]): void {
    for (const node of nodes) {
      const docAnnotation: DocAnnotation | undefined = node.attrs?._annotation;
      const nodeStart: number | undefined = docAnnotation?.node.data.startIndex;
      const nodeEnd: number | undefined = docAnnotation?.node.data.endIndex;
      const isValidBlockTarget: boolean = VALID_SEMANTIC_BLOCK_TARGETS.includes(getEditorRole(node.type));

      if (nodeStart !== undefined && nodeEnd !== undefined && isValidBlockTarget) {
        // Converted (= cloned) per node so the document never shares references with the annotation stores
        const semanticBlocks: DocAnnotation[] = annotations
          .filter((a) => a.node.data.startIndex <= nodeEnd && a.node.data.endIndex >= nodeStart)
          .sort((a, b) => b.node.data.endIndex - b.node.data.startIndex - (a.node.data.endIndex - a.node.data.startIndex))
          .map((a) => toDocAnnotation(a));

        node.attrs = { ...node.attrs, _semanticBlocks: semanticBlocks };
      }

      if (node.content?.length) {
        this.attachLabelsToNodes(node.content, annotations);
      }
    }
  }

  /**
   * Recursively collects and concatenates text content of the built document in order.
   *
   * @param {TiptapNode[]} nodes Sibling nodes of the tiptap document
   * @param {string} acc Currently accumulated text content
   * @returns {string} The accumulated text content
   */
  private collectDocText(nodes: TiptapNode[], acc: string): string {
    let text: string = acc;

    for (const node of nodes) {
      if (node.type === "text") {
        text += node.text ?? "";
      } else if (node.content?.length) {
        text = this.collectDocText(node.content, text);
      }
    }

    return text;
  }

  /**
   * Post-parse function that checks if the built tiptap document's text exactly equals the standoff text.
   *
   * If it doesn't, decorations and saved indices (silently) drift and on save the document is polluted
   * so the drift is made explicit: it is logged and recorded as a parse issue with severity `error`, so
   * the user can be asked before continuing.
   *
   * @returns {void} This function does not return any value.
   */
  private assertTextInvariant(): void {
    const docText: string = this.collectDocText(this.tiptapJson?.content ?? [], "");

    if (docText !== this.standoffJson.text) {
      const expected: string = this.standoffJson.text;

      let i = 0;

      while (i < expected.length && i < docText.length && expected[i] === docText[i]) {
        i++;
      }

      this.issues.push({
        severity: "error",
        reason: "textMismatch",
        message:
          `The text of the document (${docText.length} characters) does not match the stored text ` +
          `(${expected.length} characters). First difference at index ${i}.`,
      });

      console.error(
        `[standoffConverter] TEXT INVARIANT VIOLATED: document text (len ${docText.length}) ` +
          `does not match standoff text (len ${expected.length}). First divergence at index ${i}: ` +
          `expected ${JSON.stringify(expected.slice(i, i + 30))} ` +
          `but got ${JSON.stringify(docText.slice(i, i + 30))}. ` +
          `Decorations and saved annotation indices will be misaligned.`,
      );
    }
  }

  public convertStandoffToTipTap(): void {
    this.createAnnotationUuidMaps();

    const allStructural: Anno[] = [...this.structuralAnnotations.values()];
    const topLevelAnnos: Anno[] = this.findTopLevelAnnotations(allStructural);

    topLevelAnnos.forEach((a) => this.usedUuids.add(a.node.data.uuid));

    const docContent: TiptapNode[] = [];
    let cursor: number = 0;

    for (const node of topLevelAnnos) {
      const gapEnd: number = node.node.data.startIndex - 1;

      // Document root always accepts paragraphs.
      if (cursor <= gapEnd) {
        this.appendGapParagraphs(docContent, cursor, gapEnd);
      }

      docContent.push(this.buildStructuralNode(node, allStructural));

      cursor = node.node.data.endIndex + 1;
    }

    const textEnd: number = this.standoffJson.text.length - 1;

    if (cursor <= textEnd) {
      this.appendGapParagraphs(docContent, cursor, textEnd);
    }

    this.attachSemanticBlockLabels(docContent);

    this.tiptapJson = { type: "doc", content: docContent };

    this.assertTextInvariant();
  }
}
