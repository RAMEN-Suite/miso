import { DeepReadonly } from "vue";
import type { BuiltinStructuralType } from "../models/types";

/**
 * Mapping between built-in structural annotation types/attributes and their (optional) project-specific override.
 * Exists because a project might want to use names from a namespace like TEI for the built-in elements, like
 * ["p"](https://www.tei-c.org/release/doc/tei-p5-doc/en/html/ref-p.html) for paragraph annotations
 * or [`rows`](https://www.tei-c.org/release/doc/tei-p5-doc/en/html/ref-att.tableDecoration.html#tei_att.rows)
 * and [`cols`](https://www.tei-c.org/release/doc/tei-p5-doc/en/html/ref-att.tableDecoration.html#tei_att.cols)
 * as rowspan/colspan properties in tableRow and tableCell annotations.
 *
 * Built from {@link DEFAULT_ANNOTATION_MAPPING} and the `miso.editing.native` keys of the guidelines.
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

/**
 * Annotation properties the model and editor needs, whatever the guidelines list. They will never removed automatically
 * when the data of an annotation are pruned to the configured properties before saving.
 *
 * TODO: Should come from the Nori export in the future.
 */
export const INTRINSIC_ANNOTATION_PROPERTIES: readonly string[] = [
  "uuid",
  "type",
  "startIndex",
  "endIndex",
  "text",
  "isZeroPoint",
];

/**
 * Whether the data of annotations with a type that is not configured in the guidelines are pruned before saving.
 *
 * - `false`: Saved with all the properties they carry. Data beat config.
 * - `true`: Pruned like all other annotations. config beats data.
 */
export const PRUNE_UNCONFIGURED_ANNOTATION_TYPES: boolean = false;

/**
 * Allowed levels for the `heading` annotation type.
 */
export const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;

/**
 * Built-in structural annotation types on which block classification annotations can be attached. During document parsing
 * and annotation cration this prevents structural parents to be annotated, too, when their leaf child is annotated.
 * E.g., in table -> tableRow -> tableCell -> paragraph, only the paragraph is annotated, not the tableRow or table,
 * even though they have a bigger range.
 *
 * Used during initial document creation in {@linkcode StandoffConverter} and on setting block classification annotations.
 */
export const VALID_BLOCK_CLASSIFICATION_TARGETS: string[] = ["paragraph", "heading"];

/**
 * Default mapping between builtin structural annotations and their project-specific names.
 * Overridden per type by the `miso.editing.native` keys of the guidelines.
 */
export const DEFAULT_ANNOTATION_MAPPING: AnnotationMapping = {
  typeByRole: {
    paragraph: "p",
    heading: "head",
    hardBreak: "lb",
    tableRow: "row",
    tableCell: "cell",
    bulletList: "list",
    listItem: "item",
  },
  attrByRole: {
    heading: {
      level: "level",
    },
    tableRow: {
      colspan: "cols",
      rowspan: "rows",
      role: "role",
    },
    tableCell: {
      colspan: "cols",
      rowspan: "rows",
      role: "role",
    },
  },
};
