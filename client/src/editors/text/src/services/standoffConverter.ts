import { Schema } from "@tiptap/pm/model";
import { VALID_BLOCK_CLASSIFICATION_TARGETS } from "../config/editor";
import { getNativeTypeConfig } from "../config/constants";
import { ApiJson, TiptapNode, TiptapNodeAttrs, TiptapJson, DocAnnotation, StandoffParseIssue, TextRange } from "../models/types";
import {
  Annotation,
  AnnotationNode,
  IAnnotation,
  ModelAnnotationShape,
  NativeType,
  TextAnnotationRepresentation,
  cloneDeep,
  createTextPositionSelector,
  familyRefOf,
  shapeRefOf,
  useConfigStore,
} from "../external";
import { toDocAnnotation } from "../utils/helper/annotationHelper";

const {
  isZeroPoint,
  getAnnotationShape,
  getNativeType,
  getShapeOfNative,
  getAnnotationRepresentation,
  getAnnotationExtent,
  getPriority,
  getEditorOwnedProperties,
} = useConfigStore();

export default class StandoffConverter {
  // Built-in structural annotations (paragraph, heading, table, ...) — form the TipTap tree.
  private structuralAnnotations = new Map<string, Annotation>();
  // Custom structural annotations (closer, address, addrLine, ...) — attached as _blockClassifications
  // Block classifications on the built-in nodes that contain them (e.g. closer, div, ...), never form tree nodes.
  private blockClassificationAnnotations = new Map<string, Annotation>();
  // Content annotations (person, place, ...) — rendered as decorations.
  private inlineAnnotations = new Map<string, Annotation>();

  private standoffJson: ApiJson;
  // Schema of the editor the document is built for. Tells which node types hold text and which are inline.
  private schema: Schema;
  private tiptapJson: TiptapJson | null = null;
  private usedUuids = new Set<string>();
  /** Problems found during parsing, handed to the editor setup to be further processed there. */
  private issues: StandoffParseIssue[] = [];

  constructor(newStandoffJson: ApiJson, schema: Schema) {
    this.standoffJson = newStandoffJson;
    this.schema = schema;

    this.convertStandoffToTipTap();
  }

  public getData(): {
    annotations: Map<string, Annotation>;
    issues: StandoffParseIssue[];
    structuralAnnotations: Map<string, Annotation>;
    tipTapJson: TiptapJson;
  } {
    // Merge built-in structural + label annotations so the annotation panel can display and
    // edit all structural annotations regardless of whether they form tree nodes or labels.
    const allStructural = new Map<string, Annotation>([...this.structuralAnnotations, ...this.blockClassificationAnnotations]);

    // Set by the conversion in the constructor, so this only guards against a conversion that ended early
    if (!this.tiptapJson) {
      throw new Error("Standoff conversion did not produce a TipTap document.");
    }

    return {
      annotations: this.inlineAnnotations,
      issues: this.issues,
      structuralAnnotations: allStructural,
      tipTapJson: this.tiptapJson,
    };
  }

  /**
   * Sets up the stores for the different annotation categories (structural, inline, block classification) and validates the document.
   *
   * The stores are used for all the subsequent parsing steps and will be exported to the editor setup afterwards. The issues
   * are also exported to the editor setup for further processing.
   *
   * @returns {void} - This function does not return a value. All the data are set directly into the variables.
   */
  private createAnnotationUuidMaps(): void {
    const annotations: Annotation[] = cloneDeep(this.standoffJson.annotations);
    const unconfiguredTypes = new Map<string, number>();

    for (const a of annotations) {
      const shape: ModelAnnotationShape | undefined = getAnnotationShape(a.node);
      // Annotations without a shape are kept as inline annotations, so their text positions survive
      const representation: TextAnnotationRepresentation = shape ? getAnnotationRepresentation(shape) : "inline";

      if (!shape) {
        unconfiguredTypes.set(a.node.properties.type, (unconfiguredTypes.get(a.node.properties.type) ?? 0) + 1);
      }

      if (representation === "structure") {
        // Built-in scaffolding (paragraph, heading, table, hardBreak, ...) — forms the TipTap tree.
        this.structuralAnnotations.set(a.node.properties.uuid, a);
      } else if (representation === "blockClassification") {
        // Whole-block label (opener, closer, addrLine, ...) — attached as _blockClassifications, never a tree node.
        this.blockClassificationAnnotations.set(a.node.properties.uuid, a);
      } else {
        // Inline annotation — rendered as a range decoration or a zero-point atom.
        this.inlineAnnotations.set(a.node.properties.uuid, a);
      }
    }

    for (const [type, count] of unconfiguredTypes) {
      this.issues.push({
        severity: "error",
        reason: "unconfiguredType",
        message: `${count} annotation(s) of type "${type}" have no annotation shape in the model.`,
      });
    }
  }

  /**
   * Returns the native type of an annotation's shape.
   *
   * @param {Annotation} annotation The annotation
   * @returns {NativeType | undefined} The native type, `undefined` if the annotation has no shape mapped to one
   */
  private nativeTypeOf(annotation: Annotation): NativeType | undefined {
    const shape: ModelAnnotationShape | undefined = getAnnotationShape(annotation.node);

    return shape ? getNativeType(shape) : undefined;
  }

  /**
   * Returns the native types allowed as structural children of the given native type, from its nesting rules
   * (e.g. `table` -> `tableRow`, `bulletList` -> `listItem`).
   * `Null` means "no filter" - the node either has no declared children or is a leaf.
   *
   * @param {NativeType} native The native type
   * @returns {readonly string[] | null} The list of allowed child native types or `null` if list is empty
   */
  private getContainsList(native: NativeType): readonly string[] | null {
    const list: readonly string[] = getNativeTypeConfig(native).contains;

    return list.length > 0 ? list : null;
  }

  /**
   * Checks if a node should contain another node in the final tree, based on the `start` and `end` of their selectors.
   *
   * For ranges of different size the larger wraps the smaller. Co-equal ranges (e.g. a single-item list
   * where bulletList, listItem and paragraph all share [29,33]) where a symmetric
   * `contains`-based test would make each "contain" the other are resolved deterministically: higher `priority` number wins
   * (outer container types have higher priority, e.g. bulletList 60 > listItem 50 > paragraph 20), then the annotation's uuid
   * as a final tiebreak so identical-range duplicates resolve to exactly one survivor instead of mutually annihilating.
   * The uuid tie break also ensures that the same document is created every time the same standoff is parsed.
   *
   * @param {Annotation} outer: The Annotation whose node might contain `inner`
   * @param {Annotation} inner: The Annotation whose node might be contained by `outer`
   * @returns {boolean}: `true` if `outer` contains `inner`, `false` otherwise
   */
  private contains(outer: Annotation, inner: Annotation): boolean {
    if (outer.node.properties.uuid === inner.node.properties.uuid) {
      return false;
    }

    const outerStart: number = outer.node.properties.selector.start;
    const outerEnd: number = outer.node.properties.selector.end;
    const innerStart: number = inner.node.properties.selector.start;
    const innerEnd: number = inner.node.properties.selector.end;

    // `outer` must cover `inner`.
    if (outerStart > innerStart || outerEnd < innerEnd) {
      return false;
    }

    // Strictly larger range -> unambiguously the ancestor.
    if (outerStart < innerStart || outerEnd > innerEnd) {
      return true;
    }

    // Co-equal range: order by priority (higher = more outer / further up the tree)
    const outerShape: ModelAnnotationShape | undefined = getAnnotationShape(outer.node);
    const innerShape: ModelAnnotationShape | undefined = getAnnotationShape(inner.node);
    const outerPrio: number = outerShape ? getPriority(outerShape) : 0;
    const innerPrio: number = innerShape ? getPriority(innerShape) : 0;

    if (outerPrio !== innerPrio) {
      return outerPrio > innerPrio;
    }

    // Final tiebreak: uuid for a stable strict order.
    return outer.node.properties.uuid < inner.node.properties.uuid;
  }

  /**
   * Returns the immediate structural children within given range for the parent's native type.
   * When the parent type has a `contains` list, only types in that list are candidates.
   * This resolves co-equal built-in ranges (e.g. `tableCell` and `paragraph` both at [40,60]):
   * If `tableRow.contains` = [`'tableCell'`] -> only `tableCell` is a candidate for `tableRow`.
   *
   * Note that this function does not build any tree/tiptap elements; it is only a lookup function for the flattened
   * annotation list.
   *
   * @param {NativeType} parentNative Native type of the parent annotation
   * @param {number} start The start index of the parent annotation's range
   * @param {number} end The end index of the parent annotation's range
   * @param {Annotation[]} allStructural The list of all structural annotations
   * @returns {Annotation[]} The immediate structural children, sorted by start index
   */
  private findDirectChildren(parentNative: NativeType, start: number, end: number, allStructural: Annotation[]): Annotation[] {
    const containsList: readonly string[] | null = this.getContainsList(parentNative);

    const candidates: Annotation[] = allStructural.filter(
      (a) =>
        !this.usedUuids.has(a.node.properties.uuid) &&
        !this.isStructuralZeroPoint(a) &&
        a.node.properties.selector.start >= start &&
        a.node.properties.selector.end <= end &&
        (containsList === null || containsList.includes(this.nativeTypeOf(a) ?? "")),
    );

    return candidates
      .filter((child) => !candidates.some((b) => this.contains(b, child)))
      .sort((a, b) => a.node.properties.selector.start - b.node.properties.selector.start);
  }

  /**
   * Creates a text node with the given range of standoff text.
   *
   * @param start The start index of the text node
   * @param end The end index of the text node
   * @returns {TiptapNode[]} A single-element array with the text node, or an empty array when the
   *   range is empty (ProseMirror forbids empty text nodes, so they must never be emitted).
   */
  private createTextNode(start: number, end: number): TiptapNode[] {
    const text: string = this.standoffJson.text.slice(start, end + 1);

    return text ? [{ type: "text", text }] : [];
  }

  /**
   * Whether a zero-point annotation lies in a leaf's range. A zero point stands before the char at `start`
   * (`start === end`), so one at the end of the text (offset `text.length`) belongs to the last leaf.
   *
   * @param {Annotation} a The zero-point (including hardBreak) annotation.
   * @param {TextRange} range The leaf's inclusive char range.
   * @returns {boolean} `true` if the annotation's offset belongs to this leaf.
   */
  private inRange(a: Annotation, range: TextRange): boolean {
    const rangeEnd: number = range.end === this.standoffJson.text.length - 1 ? range.end + 1 : range.end;

    return a.node.properties.selector.start >= range.start && a.node.properties.selector.start <= rangeEnd;
  }

  /**
   * Builds the inline content of a leaf structural node, interweaving text with zero-point atom nodes
   * and hard breaks, all sorted by position, and returns the resulting array of Tiptap inline nodes.
   *
   * Only used when the parent allows leaf content (only`paragraph` or `heading`, not `bulletList` or `listItem`).
   *
   * @param {number} start The start index of the leaf node
   * @param {number} end The end index of the leaf node
   * @returns {TiptapNode[]} An array of Tiptap inline nodes (hard breaks, zero point annotations, text nodes)
   */
  private createLeafContent(start: number, end: number): TiptapNode[] {
    interface InlineEntry {
      pos: number;
      node: TiptapNode;
    }

    // Resolve to atom nodes as configured in the custom `ZeroPointAnnotation` extension
    const zeroPointEntries: InlineEntry[] = [...this.inlineAnnotations.values()]
      .filter((a) => isZeroPoint(a.node) && this.inRange(a, { start, end }))
      .map((a) => ({
        pos: a.node.properties.selector.start,
        node: {
          type: "zeroPointAnnotation",
          attrs: {
            uuid: a.node.properties.uuid,
            _annotation: cloneDeep(a),
          },
        },
      }));

    // Resolve to hardBreaks (the only built-in type configured the way below)
    const hardBreakEntries: InlineEntry[] = [...this.structuralAnnotations.values()]
      .filter((a) => this.isStructuralZeroPoint(a) && this.inRange(a, { start, end }))
      .map((a) => ({
        pos: a.node.properties.selector.start,
        node: {
          type: "hardBreak",
          attrs: {
            uuid: a.node.properties.uuid,
            _annotation: toDocAnnotation(a),
          },
        },
      }));

    const inlineNodes: InlineEntry[] = [...zeroPointEntries, ...hardBreakEntries].sort((a, b) => a.pos - b.pos);

    if (inlineNodes.length === 0) {
      return this.createTextNode(start, end);
    }

    const nodes: TiptapNode[] = [];

    let cursor: number = start;

    for (const { pos, node } of inlineNodes) {
      // Zero-point/hard-break offset semantics: `pos` (the annotation's selector start) is the offset
      // BEFORE which the atom sits. Emit the text up to (but excluding) `pos`, then the atom, so the
      // character at `pos` follows it. Co-located atoms stay adjacent before that character.
      if (cursor < pos) {
        nodes.push(...this.createTextNode(cursor, pos - 1));
      }
      nodes.push(node);

      cursor = pos;
    }

    if (cursor <= end) {
      nodes.push(...this.createTextNode(cursor, end));
    }

    return nodes;
  }

  /**
   * Checks if the given range contains only whitespace text.
   *
   * Used in {@linkcode appendGapParagraphs} to determine how the gap content should be treated
   * (create separate paragraph or merge into the previous/next node).
   *
   * @param {number} start The start index of the range
   * @param {number} end The end index of the range
   * @returns `true` if the range contains only whitespace, `false` otherwise
   */
  private isOnlyWhitespaces(start: number, end: number): boolean {
    return this.standoffJson.text.slice(start, end + 1).trim().length === 0;
  }

  /**
   * Creates a synthetic paragraph node with the given content.
   *
   * Used to create a paragraph node that contains the gap content
   * for orphaned text ranges (= ranges that are not part of any structure annotation).
   *
   * @param {number} start The start index of the gap
   * @param {number} end The end index of the gap
   * @param {TiptapNode[]} content The content that should be passed into the paragraph node
   * @returns {TiptapNode} The synthetic paragraph node
   * @throws {Error} If no annotation shape is mapped to paragraphs (the config check prevents it)
   */
  private syntheticParagraph(start: number, end: number, content: TiptapNode[]): TiptapNode {
    const uuid: string = crypto.randomUUID();
    const paragraphShape: ModelAnnotationShape | undefined = getShapeOfNative("paragraph");

    if (!paragraphShape) {
      throw new Error("No annotation shape is mapped to paragraphs.");
    }

    const docAnnotation: DocAnnotation = {
      node: {
        properties: {
          type: paragraphShape.type,
          uuid,
          selector: createTextPositionSelector(start, end),
        } as AnnotationNode["properties"],
        nodeLabels: ["Annotation"],
        shapeRef: shapeRefOf(paragraphShape),
        classifierRef: familyRefOf(paragraphShape),
      },
      nodes: [],
      relations: [],
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
   * Splits a gap range [gapStart, gapEnd] at block classification annotation boundaries (opener, closer etc.)
   * so that each resulting sub-range can become its own synthetic paragraph and receive the correct labels. Needed
   * to created the flat structure of built-in blocks that have the block classification labels on them.
   * Without this, a single large synthetic paragraph would span the entire gap and no block classification annotation
   * (which starts mid-gap) would satisfy the "block classification fully contains node" filter.
   *
   * @param {number} gapStart The start index of the gap
   * @param {number} gapEnd The end index of the gap
   * @returns {TextRange[]} An array of sub-ranges for this gap
   */
  private splitGapByBlockClassifications(gapStart: number, gapEnd: number): TextRange[] {
    const boundaries = new Set<number>([gapStart, gapEnd + 1]);

    for (const anno of this.blockClassificationAnnotations.values()) {
      const { start, end } = anno.node.properties.selector;

      if (start <= gapEnd && end >= gapStart) {
        if (start >= gapStart) {
          boundaries.add(start);
        }

        if (end + 1 <= gapEnd + 1) {
          boundaries.add(end + 1);
        }
      }
    }

    const sorted: number[] = [...boundaries].sort((a, b) => a - b);
    const ranges: TextRange[] = [];

    for (let i = 0; i < sorted.length - 1; i++) {
      ranges.push({ start: sorted[i], end: sorted[i + 1] - 1 });
    }

    return ranges;
  }

  // Whether the given native container type may hold a `paragraph` as a direct child.
  // Drives gap handling: containers like listItem/tableCell accept synthetic paragraphs,
  // while tableRow/table/bulletList do NOT (their content is restricted to cells/rows/items),
  // so orphan gap text inside them must be clamped into an adjacent child instead.
  private parentAllowsParagraph(parentNative: NativeType): boolean {
    const containsList: readonly string[] | null = this.getContainsList(parentNative);

    // No declared children → treated as permissive (leaf types never reach gap-filling anyway).
    if (containsList === null) {
      return true;
    }

    return containsList.includes("paragraph");
  }

  /**
   * Emits paragraphs for a gap into given `content`, preserving EVERY character of [gapStart, gapEnd].
   * The gap is split at block-classification boundaries so each text run becomes its own paragraph and
   * receives the correct semantic labels. Used only when the parent accepts paragraphs (e.g. not in `bulletList`,
   * which only contains `listItem`s).
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

    const subRanges: TextRange[] = this.splitGapByBlockClassifications(gapStart, gapEnd);

    let leadingWhitespaceBuffer: TextRange[] = [];
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
        const first: TextRange = leadingWhitespaceBuffer[0];
        const last: TextRange = leadingWhitespaceBuffer[leadingWhitespaceBuffer.length - 1];

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
      const properties: IAnnotation = content.attrs._annotation.node.properties;

      if (mode === "append") {
        properties.selector = createTextPositionSelector(
          properties.selector?.start ?? start,
          Math.max(properties.selector?.end ?? end, end),
        );
      } else {
        properties.selector = createTextPositionSelector(
          Math.min(properties.selector?.start ?? start, start),
          properties.selector?.end ?? end,
        );
      }
    }

    const leaf: TiptapNode[] = this.createLeafContent(start, end);

    // Leaf block (paragraph/heading): the text lives here directly.
    if (this.isTextBlock(content.type)) {
      content.content = content.content ?? [];

      if (mode === "append") {
        content.content.push(...leaf);
      } else {
        content.content.unshift(...leaf);
      }

      return;
    }

    // Container: descend into the appropriate block child.
    const blockChildren: TiptapNode[] = (content.content ?? []).filter((c) => !this.isInlineNode(c.type));

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
   * @param {number} start The start index of the orphaned range
   * @param {number} end The end index of the orphaned range
   * @param {string} parentType Type of the parent annotation
   * @param {'previous' | 'next'} where Whether the clamp prepended or appended the range into the adjacent node
   */
  private warnClamp(start: number, end: number, parentType: string, where: "previous" | "next"): void {
    this.issues.push({
      severity: "warning",
      reason: "clampedGap",
      message: `Text at [${start},${end}] belonged to no child of <${parentType}> and was merged into the ${where} one.`,
    });

    console.warn(
      `[standoffConverter] Clamped orphan gap [${start},${end}] into the ${where} child of ` +
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
   * @param {Annotation} annotation The annotation that should be converted into a tiptap node
   * @param {Annotation[]} allStructural Annotations that need to be considered for all operations)
   * @returns {TiptapNode} The built tiptap node
   * @throws {Error} If the annotation's shape isn't mapped to a native type (only those are sorted in as structural)
   */
  private buildStructuralNode(annotation: Annotation, allStructural: Annotation[]): TiptapNode {
    const { start, end } = annotation.node.properties.selector;
    const native: NativeType | undefined = this.nativeTypeOf(annotation);

    if (!native) {
      throw new Error(`Structural annotation ${annotation.node.properties.uuid} has no native type.`);
    }

    const attrs: TiptapNodeAttrs = {
      uuid: annotation.node.properties.uuid,
      _annotation: toDocAnnotation(annotation),
    };

    // Apply editor attributes (level/colspan/rowspan/role) from the node's value under its project property name.
    // Missing values are left out, so the node's defaults apply (e.g. colspan 1 on cells, no role).
    for (const { property, attribute } of getEditorOwnedProperties(native)) {
      const value: unknown = annotation.node.properties[property];

      if (value !== undefined && value !== null) {
        attrs[attribute] = value;
      }
    }

    // Is heading or paragraph -> can only hold text
    if (this.isTextBlock(native)) {
      return { type: native, attrs, content: this.createLeafContent(start, end) };
    }

    const directChildren: Annotation[] = this.findDirectChildren(native, start, end, allStructural);

    directChildren.forEach((c) => this.usedUuids.add(c.node.properties.uuid));

    // Does this container accept paragraphs directly? If not (tableRow, table, bulletList), gap
    // text cannot become a synthetic paragraph and must be clamped into an adjacent child.
    const allowsParagraph: boolean = this.parentAllowsParagraph(native);
    const type: string = annotation.node.properties.type;

    const childNodes: TiptapNode[] = [];

    let cursor: number = start;
    // Holds a leading gap that has no previous sibling yet, so it can be prepended to the next child.
    let pendingLeadingGap: TextRange | null = null;

    for (const child of directChildren) {
      const gapEnd: number = child.node.properties.selector.start - 1;

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

      cursor = child.node.properties.selector.end + 1;
    }

    if (cursor <= end) {
      if (allowsParagraph) {
        this.appendGapParagraphs(childNodes, cursor, end);
      } else if (childNodes.length > 0) {
        this.clampTextIntoNode(childNodes[childNodes.length - 1], cursor, end, "append");
        this.warnClamp(cursor, end, type, "previous");
      } else {
        // Degenerate container with text but no children: keep the text rather than drop it.
        this.warnClamp(cursor, end, type, "next");
        childNodes.push(this.syntheticParagraph(cursor, end, this.createLeafContent(cursor, end)));
      }
    }

    if (childNodes.length === 0) {
      // Zero-width container (no text, no children). Emit a minimal empty paragraph.
      childNodes.push(this.syntheticParagraph(start, end, []));
    }

    return { type: native, attrs, content: childNodes };
  }

  /**
   * A structure annotation with zero-point extent (currently only `hardBreak`): an inline atom that must never
   * appear as a block child or a top-level node.
   *
   * @param {Annotation} annotation - The annotation.
   * @returns {boolean} `true` if the annotation is a structural zero-point, `false` otherwise.
   */
  private isStructuralZeroPoint(annotation: Annotation): boolean {
    const shape: ModelAnnotationShape | undefined = getAnnotationShape(annotation.node);

    return (
      shape !== undefined && getAnnotationRepresentation(shape) === "structure" && getAnnotationExtent(shape) === "zeroPoint"
    );
  }

  /** Checks if an annotation can be a top-level document node. Excludes structural zero-points
   * (currently only `hardBreak`).
   *
   * @param {Annotation} annotation - The annotation.
   * @returns {boolean} `true` if the annotation can be a top-level node, `false` otherwise.
   */
  private isAllowedAtTopLevel(annotation: Annotation): boolean {
    return !this.isStructuralZeroPoint(annotation);
  }

  /**
   * Checks if the node is a text block, i.e. a block that only contains inline content (text, zero-point annotations,
   * hardBreaks) and never structural children.
   *
   * Reads from the prosemirror schema, where such a node is a textblock (only `heading` and `paragraph`).
   *
   * @param {string} nodeType - The type of the Tiptap node (`heading`, `bulletList` etc.)
   * @returns {boolean} `true` if the node is a text block, `false` otherwise
   */
  private isTextBlock(nodeType: string): boolean {
    return this.schema.nodes[nodeType]?.isTextblock ?? false;
  }

  /**
   * Checks if the node is an inline node, i.e. a node that lives inside a leaf container and can never hold structural
   * children.
   *
   * Reads from the prosemirror schema (currently `text`, `hardBreak` and `zeroPointAnnotation`).
   *
   * @param {string} nodeType - The Tiptap node type (`text`, `hardBreak`, `bulletList` etc.)
   * @returns {boolean} `true` if the node is an inline node, `false` otherwise (also for types unknown to the schema)
   */
  private isInlineNode(nodeType: string): boolean {
    return this.schema.nodes[nodeType]?.isInline ?? false;
  }

  /**
   * Finds top-level built-in structural annotations - those not wrapped by any other built-in annotation.
   * Used for creating the top document level from where the recursive children creation will start.
   *
   * @param allStructural - All built-in structural annotations
   * @returns {Annotation[]} Top-level built-in structural annotations, sorted by their start index
   */
  private findTopLevelAnnotations(allStructural: Annotation[]): Annotation[] {
    const topLevelBlocks: Annotation[] = allStructural.filter(
      (a) => this.isAllowedAtTopLevel(a) && !allStructural.some((b) => this.contains(b, a)),
    );

    return topLevelBlocks.sort((a, b) => a.node.properties.selector.start - b.node.properties.selector.start);
  }

  /**
   * Attaches block classification annotations to the whole tiptap document after it was created
   * (= all built-in blocks are in place). Starting point for the recursive {@linkcode attachLabelsToNodes} function
   * that is called for level of the tree.
   *
   * @param {TiptapNode[]} nodes Sibling nodes of the tiptap document
   * @returns {void} This function does not return any value.
   */
  private attachBlockClassificationLabels(nodes: TiptapNode[]): void {
    const blockClassificationAnnotations: Annotation[] = [...this.blockClassificationAnnotations.values()];

    if (blockClassificationAnnotations.length === 0) {
      return;
    }

    this.attachLabelsToNodes(nodes, blockClassificationAnnotations);
  }

  /**
   * Recursively attaches information of block classification annotations (opener, closer etc.) to document building blocks that have an
   * intersecting range, therefore "tainting" these building blocks with a semantic meaning.
   *
   * Performs the operation for every node in the given list and all of its children.
   *
   * @param {TiptapNode[]} nodes Sibling nodes of the tiptap document
   * @param {Annotation[]} annotations All block classification annotations
   */
  private attachLabelsToNodes(nodes: TiptapNode[], annotations: Annotation[]): void {
    for (const node of nodes) {
      const docAnnotation: DocAnnotation | undefined = node.attrs?._annotation;
      const nodeStart: number | undefined = docAnnotation?.node.properties.selector?.start;
      const nodeEnd: number | undefined = docAnnotation?.node.properties.selector?.end;
      const isValidBlockTarget: boolean = VALID_BLOCK_CLASSIFICATION_TARGETS.includes(node.type);

      if (nodeStart !== undefined && nodeEnd !== undefined && isValidBlockTarget) {
        // Converted (= cloned) per node so the document never shares references with the annotation stores
        const blockClassifications: DocAnnotation[] = annotations
          .filter((a) => a.node.properties.selector.start <= nodeEnd && a.node.properties.selector.end >= nodeStart)
          .sort(
            (a, b) =>
              b.node.properties.selector.end -
              b.node.properties.selector.start -
              (a.node.properties.selector.end - a.node.properties.selector.start),
          )
          .map((a) => toDocAnnotation(a));

        node.attrs = { ...node.attrs, _blockClassifications: blockClassifications };
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

    const allStructural: Annotation[] = [...this.structuralAnnotations.values()];
    const topLevelAnnos: Annotation[] = this.findTopLevelAnnotations(allStructural);

    topLevelAnnos.forEach((a) => this.usedUuids.add(a.node.properties.uuid));

    const docContent: TiptapNode[] = [];
    let cursor: number = 0;

    for (const node of topLevelAnnos) {
      const gapEnd: number = node.node.properties.selector.start - 1;

      // Document root always accepts paragraphs.
      if (cursor <= gapEnd) {
        this.appendGapParagraphs(docContent, cursor, gapEnd);
      }

      docContent.push(this.buildStructuralNode(node, allStructural));

      cursor = node.node.properties.selector.end + 1;
    }

    const textEnd: number = this.standoffJson.text.length - 1;

    if (cursor <= textEnd) {
      this.appendGapParagraphs(docContent, cursor, textEnd);
    }

    this.attachBlockClassificationLabels(docContent);

    this.tiptapJson = { type: "doc", content: docContent };

    this.assertTextInvariant();
  }
}
