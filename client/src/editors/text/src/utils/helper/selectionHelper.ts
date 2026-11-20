import { Selection } from "@tiptap/pm/state";
import { AnnotationExtent, TextAnnotationRepresentation, useConfigStore } from "../../external";
import AnnotationRangeError from "../errors/annotationRange.error";

/**
 * Checks if the currently selected text is valid for creating an annotation of the given type.
 * If the text selection is not valid, it throws an `AnnotationRangeError` with a descriptive error message.
 *
 * @param {Selection | undefined} selection - The current Selection of the editor.
 * @param {string} type - The annotation type to validate against.
 * @returns {boolean} True if the text selection is valid, false otherwise.
 * @throws {AnnotationRangeError} If the text selection is not valid.
 */
export function validateSelection(selection: Selection | undefined, type: string): boolean {
  const { getAnnotationRepresentation, getAnnotationExtent } = useConfigStore();

  if (!selection) {
    throw new AnnotationRangeError("No valid text selected.");
  }

  const isCaret: boolean = selection.empty;
  const representation: TextAnnotationRepresentation = getAnnotationRepresentation(type);
  const extent: AnnotationExtent = getAnnotationExtent(type);

  if (isCaret && extent === "range" && representation === "inline") {
    throw new AnnotationRangeError("Select some text to annotate.");
  }

  if (!isCaret && extent === "zeroPoint") {
    throw new AnnotationRangeError("To create zero-point annotations, place the caret between two characters");
  }

  return true;
}
