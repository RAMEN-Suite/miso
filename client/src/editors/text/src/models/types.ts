import type { Annotation, BuiltinStructuralType, NodeDto } from "../external";

/** Makes all properties of `T` readonly, recursively. */
type DeepReadonly<T> = { readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K] };

/**
 * An annotation as stored in the tiptap document's node attributes: `_annotation` on structural nodes
 * and each entry of `_blockClassifications`.
 *
 * The `meta` field that contains the status is omitted since it gets recalculated before save
 * for every block of the document.
 */
export type DocAnnotation = Omit<Annotation, "meta">;

/** A standoff document as fetched from the API: the plain text and its annotations. */
export interface ApiJson {
  text: string;
  annotations: NodeDto[];
}

/**
 * Mapping between built-in structural annotation types/attributes and their (optional) project-specific override.
 * Exists because a project might want to use names from a namespace like TEI for the built-in elements, like
 * ["p"](https://www.tei-c.org/release/doc/tei-p5-doc/en/html/ref-p.html) for paragraph annotations
 * or [`rows`](https://www.tei-c.org/release/doc/tei-p5-doc/en/html/ref-att.tableDecoration.html#tei_att.rows)
 * and [`cols`](https://www.tei-c.org/release/doc/tei-p5-doc/en/html/ref-att.tableDecoration.html#tei_att.cols)
 * as rowspan/colspan properties in tableRow and tableCell annotations.
 *
 * Built from `DEFAULT_ANNOTATION_MAPPING` and the `miso.editing.native` keys of the guidelines.
 *
 * @example
 * // Guidelines entry
 * { "type": "cell", "miso": { "editing": { "native": { "type": "tableCell", "attributes": { "colspan": "cols", "rowspan": "rows" } } } } }
 *
 * // Resulting mapping: tiptap defaults as keys, project-specific overrides as values
 * typeByRole: {
 *    tableCell: 'cell',
 * },
 * attrByRole: {
 *    tableCell: {
 *        colspan: 'cols',
 *        rowspan: 'rows',
 *    },
 * },
 */
export type AnnotationMapping = DeepReadonly<{
  /** Mapping from built-in structural types to project-specific types
   * @example
   * { paragraph: 'p', hardBreak: 'lb' }
   */
  typeByRole: Partial<Record<BuiltinStructuralType, string>>;
  /** Mapping from built-in structural types to project-specific attributes. The keys are the editor-owned
   * attributes of the type, i.e. the property names in its built-in config (`BUILTIN_STRUCTURAL_CONFIGS`).
   * @example
   * attrByRole: {
   *    tableCell: {
   *        colspan: 'cols',
   *        rowspan: 'rows',
   *        role: 'role',
   *    },
   * },
   */
  attrByRole: Partial<Record<BuiltinStructuralType, Record<string, string>>>;
}>;

export interface TiptapMark {
  type: string;
  attrs: Record<string, unknown>;
}

export type AllowedTiptapNodeTypes = string;

export interface TiptapNodeAttrs {
  [key: string]: unknown;
  uuid?: string;
  _annotation?: DocAnnotation;
  _blockClassifications?: DocAnnotation[];
}

export interface TiptapNode {
  type: AllowedTiptapNodeTypes;
  attrs?: TiptapNodeAttrs;
  content?: TiptapNode[];
  marks?: TiptapMark[];
  text?: string;
}

export type TiptapJson = TiptapNode;

export interface EditorSettings {
  blockDecorations: {
    outline: boolean;
    baseType: boolean;
    semanticTypes: boolean;
  };
  documentStructures: boolean;
}

export type IndexMap = Map<string, { startIndex: number; endIndex: number }>;

export interface Range {
  from: number;
  to: number;
}

export interface BlockClassificationRange {
  startPos: number;
  endPos: number;
  type: string;
  uuid: string;
}

/**
 * A problem found while a standoff document is parsed into a tiptap document.
 * - `warning`: the document was repaired while parsing (e.g. orphaned text merged into a neighbouring node). No data
 *    are lost, the repaired state is written to the database on the next save.
 * - `error`: the parsed document does not match the stored data, or contains annotations of a type that is not
 *    configured in the guidelines. Saving it can corrupt the stored data, so the user should be asked before continuing.
 */
export interface StandoffParseIssue {
  severity: "warning" | "error";
  reason: "clampedGap" | "textMismatch" | "unconfiguredType";
  message: string;
}

/**
 * One block node of the document outline. Items of unchanged ProseMirror nodes are reused across transactions,
 * so they deliberately carry no document position (which shifts with every edit before the node).
 */
export interface ToCItem {
  /** The node's `uuid` attribute, or its position at build time as a fallback for nodes without one. */
  key: string;
  data: {
    nodeType: string;
    /** Canonical (project-configured) annotation type, derived from the live node, not _annotation. */
    type: string;
    /** Heading level when the node is a heading; read from the live native attr. */
    level?: number;
    text: string;
    /** Annotation of the node itself, as stored in its `_annotation` attribute. */
    _annotation: DocAnnotation;
    /** Block classifications wrapping the node, as stored in its `_blockClassifications` attribute. Empty when none. */
    _blockClassifications: DocAnnotation[];
  };
  children: ToCItem[];
}
