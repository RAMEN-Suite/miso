/**
 * Preset colours offered when creating or editing a tag. A custom colour can still be picked, so
 * this is a convenience palette, not an allowed-values list.
 */
export const TAG_COLORS: string[] = ["#e11d48", "#ea580c", "#ca8a04", "#16a34a", "#0891b2", "#2563eb", "#7c3aed", "#db2777"];

/** Colour for a tag with no `appearance.color`. Deliberately neutral, so it reads as "unset". */
export const DEFAULT_TAG_COLOR: string = "#64748b";

/**
 * Normalizes a colour value into a CSS-usable string.
 *
 * PrimeVue's `ColorPicker` emits hex without the leading `#` (e.g. `6466f1`), which is not a
 * valid CSS colour. Everything that renders a tag colour drops it straight into a style binding,
 * so the prefix is restored here rather than at every call site.
 *
 * @param {string | undefined} color - A colour with or without a leading `#`.
 * @returns {string} A CSS colour string, falling back to {@link DEFAULT_TAG_COLOR}.
 */
export function normalizeTagColor(color: string | undefined): string {
  if (!color) {
    return DEFAULT_TAG_COLOR;
  }

  return color.startsWith("#") || !/^[0-9a-f]{3,8}$/i.test(color) ? color : `#${color}`;
}
