import type { AnnotationMapping } from "../models/types";

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
