import type { Attribute, Constraint } from "@ramen-suite/core";
import type {
  Annotation,
  AnnotationExtent,
  IconSpecInput,
  ModelAnnotationShape,
  NativeType,
  TextPositionSelector,
} from "../external";

/**
 * An attribute of a native type that the editor itself sets (e.g. the level of a heading), in RAMEN terms:
 * the type name, the cardinality (`lowerBound` 1 = required) and value rules as constraints. The constraints get their
 * IDs when they are declared in a model.
 */
export type NativeTypeAttribute = Pick<Attribute, "name" | "typeId" | "bounds"> & {
  constraints?: Omit<Constraint, "id">[];
};

/**
 * A structural type the editor implements natively (paragraph, heading, table ...), with the values the editor fixes.
 * Not a RAMEN annotation shape: the project's shape for it (named via `editors.text.mappings`) is a normal shape with its own
 * properties and settings (appearance, shortcut ...). Only the values here can't be changed by it.
 */
export interface NativeTypeConfig {
  /** The native type, i.e. the tiptap node type, e.g. `paragraph` */
  native: NativeType;
  /** How annotations of the type extend in the text */
  extent: AnnotationExtent;
  /** The attributes the editor sets itself, in RAMEN terms */
  attributes: NativeTypeAttribute[];
  /** The icon of the type, e.g. `pilcrow` (Lucide shorthand); a mapped shape shows it instead of an icon of its own */
  icon: IconSpecInput;
}

/** A native type of the editor and the project's annotation shape mapped to it */
export interface NativeShape {
  /** The native type, e.g. `paragraph` */
  native: NativeType;
  /** The annotation shape, e.g. the one with the type `p` */
  shape: ModelAnnotationShape;
}

/** Makes all properties of `T` readonly, recursively. */
type DeepReadonly<T> = { readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K] };

/**
 * An annotation as stored in the tiptap document's node attributes: `_annotation` on structural nodes
 * and each entry of `_blockClassifications`.
 *
 * The annotation's own status is omitted since it gets recalculated before save for every block of the document.
 * The statuses of the nodes and relations below it are kept.
 */
export type DocAnnotation = Omit<Annotation, "status">;

/** A standoff document as fetched from the API: the plain text and its annotations. */
export interface ApiJson {
  text: string;
  annotations: Annotation[];
}

/**
 * Mapping between the editor's native types/attributes and the project's annotation shapes/properties, e.g.
 * a shape with the type ["p"](https://www.tei-c.org/release/doc/tei-p5-doc/en/html/ref-p.html) for paragraphs, or
 * [`rows`](https://www.tei-c.org/release/doc/tei-p5-doc/en/html/ref-att.tableDecoration.html#tei_att.rows)
 * and [`cols`](https://www.tei-c.org/release/doc/tei-p5-doc/en/html/ref-att.tableDecoration.html#tei_att.cols)
 * as rowspan/colspan properties of table rows and cells.
 *
 * Built from the `editors.text.mappings` of the Miso config, whose attribute refs are resolved to the property names.
 *
 * @example
 * // Entry of editors.text.mappings
 * { "native": "tableCell", "annotation": "<modelId>:<cell id>", "type": "cell", "attributes": { "colspan": "<modelId>:<cols id>", "rowspan": "<modelId>:<rows id>" } }
 *
 * // Resulting mapping
 * shapeByNative: {
 *    tableCell: <the shape "<modelId>:<cell id>">,
 * },
 * attrByNative: {
 *    tableCell: {
 *        colspan: 'cols',
 *        rowspan: 'rows',
 *    },
 * },
 */
export interface AnnotationMapping {
  /** The annotation shape of each native type */
  shapeByNative: Partial<Record<NativeType, ModelAnnotationShape>>;
  /** Mapping from native types to project-specific property names. The keys are the editor-owned
   * attributes of the type, i.e. the attribute names in its native config (`NATIVE_TYPE_CONFIGS`). Attributes
   * without a mapped property keep their native name.
   * @example
   * attrByNative: {
   *    tableCell: {
   *        colspan: 'cols',
   *        rowspan: 'rows',
   *        role: 'role',
   *    },
   * },
   */
  attrByNative: DeepReadonly<Partial<Record<NativeType, Record<string, string>>>>;
}

export interface TiptapMark {
  type: string;
  attrs: Record<string, unknown>;
}

export interface TiptapNodeAttrs {
  [key: string]: unknown;
  uuid?: string;
  _annotation?: DocAnnotation;
  _blockClassifications?: DocAnnotation[];
}

export interface TiptapNode {
  type: string;
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

/** A character offered by the special characters picker */
export interface SpecialCharacter {
  /** The character, e.g. `ſ` */
  character: string;
  /** What the character is, e.g. its Unicode name `LATIN SMALL LETTER LONG S`. Shown as tooltip and searched. */
  name: string;
}

/** A group of special characters, shown as one category of the picker */
export interface SpecialCharacterGroup {
  /** Identifies the group. Built-in groups use the Unicode block alias, e.g. `Latin_Extended_A`. */
  id: string;
  /** Shown in the picker, e.g. "Latin Extended-A" */
  label: string;
  /** The characters in the group */
  characters: SpecialCharacter[];
}

/**
 * An entry of the special characters config: the id of a built-in group, or a group of its own. A group with an id that
 * is already there (built-in or listed before) is merged into that group (its characters are added, its label replaces
 * the previous one if given).
 */
export type SpecialCharacterGroupConfig = string | (Omit<SpecialCharacterGroup, "label"> & { label?: string });

/** The live char positions of annotations by uuid, as in their `TextPositionSelector` (see `start`/`end` there) */
export type IndexMap = Map<string, TextRange>;

/** A char range of the plain text: `start` and `end` of a `TextPositionSelector`, without its `type` */
export type TextRange = Pick<TextPositionSelector, "start" | "end">;

export interface Range {
  from: number;
  to: number;
}

export interface BlockClassificationRange {
  startPos: number;
  endPos: number;
  /** The annotation's type, for display */
  type: string;
  uuid: string;
}

/**
 * A problem found while a standoff document is parsed into a tiptap document.
 * - `warning`: the document was repaired while parsing (e.g. orphaned text merged into a neighbouring node). No data
 *    are lost, the repaired state is written to the database on the next save.
 * - `error`: the parsed document does not match the stored data, or contains annotations without an annotation shape
 *    in the model. Saving it can corrupt the stored data, so the user should be asked before continuing.
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
    /** Type of the annotation shape mapped to the live node's native type (not read from _annotation), for display. */
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
