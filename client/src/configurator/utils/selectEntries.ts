/**
 * The empty first entry of the configurator's dropdowns, which unsets the value (instead of a clear button), like the
 * attribute dropdowns of the app. An unset dropdown shows its placeholder (the default).
 *
 * @packageDocumentation
 */

/** The label of the empty entry: a non-breaking space, so it keeps the line height */
export const EMPTY_LABEL = "\xa0";

/** An entry of a dropdown; `null` is the empty entry */
export interface SelectEntry<T> {
  label: string;
  value: T | null;
}

/**
 * The entries of a dropdown after an empty one.
 *
 * @param {SelectEntry<T>[]} entries - The entries.
 * @returns {SelectEntry<T>[]} The empty entry, then the entries.
 */
export function withEmptyEntry<T>(entries: SelectEntry<T>[]): SelectEntry<T>[] {
  return [{ label: EMPTY_LABEL, value: null }, ...entries];
}

/**
 * The suggestions of an editable dropdown (its value is the text) after an empty one. Choosing it gives
 * {@linkcode EMPTY_LABEL}, which is blank after `trim()`.
 *
 * @param {string[]} suggestions - The suggested values.
 * @returns {string[]} The empty entry, then the suggestions.
 */
export function withEmptySuggestion(suggestions: string[]): string[] {
  return [EMPTY_LABEL, ...suggestions];
}

/** Whether an option of a dropdown is the empty entry */
function isEmptyEntry(option: unknown): boolean {
  return option === EMPTY_LABEL || (typeof option === "object" && option !== null && "value" in option && option.value === null);
}

/** Pass-through options of the dropdowns: a tooltip on the empty entry */
export const EMPTY_ENTRY_PT = {
  option: ({ context }: { context: { option: unknown } }) => ({ title: isEmptyEntry(context.option) ? "Select no value" : undefined }),
};
