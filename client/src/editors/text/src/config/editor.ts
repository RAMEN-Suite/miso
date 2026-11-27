import type { NativeType } from "../external";
import { isNativeType } from "./constants";

/**
 * Allowed levels for the `heading` annotation type.
 */
export const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;

/**
 * Native types on which block classification annotations can be attached. During document parsing
 * and annotation cration this prevents structural parents to be annotated, too, when their leaf child is annotated.
 * E.g., in table -> tableRow -> tableCell -> paragraph, only the paragraph is annotated, not the tableRow or table,
 * even though they have a bigger range.
 *
 * Used during initial document creation in {@linkcode StandoffConverter} and on setting block classification annotations.
 */
export const VALID_BLOCK_CLASSIFICATION_TARGETS: readonly NativeType[] = ["paragraph", "heading"];

/**
 * Checks if a node type is one of the {@linkcode VALID_BLOCK_CLASSIFICATION_TARGETS}.
 *
 * @param {string} nodeType - The type name of a tiptap node.
 * @returns {boolean} `true` if block classifications can be attached to it, `false` otherwise.
 */
export function isBlockClassificationTarget(nodeType: string): boolean {
  return isNativeType(nodeType) && VALID_BLOCK_CLASSIFICATION_TARGETS.includes(nodeType);
}
