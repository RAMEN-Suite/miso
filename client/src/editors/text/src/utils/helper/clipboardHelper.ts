import { Fragment, Schema, Slice } from "@tiptap/pm/model";

/**
 * Collapses a pasted slice down to its raw plain text.
 *
 * Replaces block boundaries (paragraph) and line breaks with spaces. Currently used since handling paragraphs, line breaks etc.
 * would be too complicated for now. Implement later maybe.
 *
 * @param {Slice} slice - The parsed clipboard slice handed to `transformPasted`.
 * @param {Schema} schema - The active editor schema (from `view.state.schema`).
 * @returns {Slice} A bare inline-text slice, or `Slice.empty` when there is no text to insert.
 */
export function pastedSliceToRawText(slice: Slice, schema: Schema): Slice {
  const NON_BREAKING_SPACE: string = String.fromCharCode(0xa0);

  const text: string = slice.content.textBetween(0, slice.content.size, " ").replaceAll(NON_BREAKING_SPACE, " ");

  if (text.length === 0) {
    return Slice.empty;
  }

  // Open depth 0 on both ends -> the text merges into the current textblock at the cursor.
  return new Slice(Fragment.from(schema.text(text)), 0, 0);
}
