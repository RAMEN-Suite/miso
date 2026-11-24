import type { AnnotationAppearance, AppearanceOverride, HighlightTextStyle } from "../external";

/**
 * Highlights of range annotations as inline CSS. Pure functions of the appearance and the annotation's properties, so
 * they can render outside the editor (e.g. a preview of a draft config).
 *
 * @packageDocumentation
 */

/**
 * Returns the inline style of a range annotation's decoration. The highlights of all variants matching the
 * annotation's property values are merged onto the highlight of the annotation type, in config order.
 *
 * @param {AnnotationAppearance | undefined} appearance The appearance of the annotation type, with property names in
 *   `variants` (see `toEditorAppearance`).
 * @param {Readonly<Record<string, unknown>>} properties The annotation's properties.
 * @returns {string} The inline style, or an empty string if no highlight is configured.
 *
 * @example
 * const appearance = {
 *   highlight: { kind: "properties", fontWeight: "bold" },
 *   variants: [
 *     {
 *       property: "subType",
 *       values: { i: { highlight: { kind: "properties", fontStyle: "italic" } } },
 *     },
 *   ],
 * };
 *
 * getHighlightStyle(appearance, { subType: "i", ... });
 *
 * // Returns
 *
 * "font-weight: bold; font-style: italic"
 */
export function getHighlightStyle(
  appearance: AnnotationAppearance | undefined,
  properties: Readonly<Record<string, unknown>>,
): string {
  let merged: HighlightTextStyle | undefined = appearance?.highlight;

  for (const variant of appearance?.variants ?? []) {
    const value: unknown = properties[variant.property];
    const override: AppearanceOverride | undefined =
      typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? variant.values[String(value)]
        : undefined;

    if (override?.highlight) {
      merged = { ...merged, ...override.highlight };
    }
  }

  return highlightToDeclarations(merged);
}

/**
 * Converts a highlight into CSS declarations. Values are not validated, since the configuration is trusted;
 * invalid values are simply ignored by the browser.
 *
 * @param {HighlightTextStyle | undefined} style The highlight to convert.
 * @returns {string} The CSS declarations, or an empty string if there is no highlight.
 *
 * @example
 * highlightToDeclarations({ kind: "properties", fontWeight: "bold", fontStyle: "italic" });
 *
 * // Returns
 *
 * "font-weight: bold; font-style: italic"
 */
function highlightToDeclarations(style: HighlightTextStyle | undefined): string {
  if (!style) {
    return "";
  }

  return Object.entries(style)
    .filter(([key, value]) => key !== "kind" && typeof value === "string")
    .map(([key, value]) => `${toKebabCase(key)}: ${value}`)
    .join("; ");
}

/**
 * Converts a camelCase style key into its CSS property name, e.g. `textDecorationColor` -> `text-decoration-color`.
 *
 * @param {string} key The camelCase style key.
 * @returns {string} The CSS property name in kebab-case.
 */
function toKebabCase(key: string): string {
  return key.replace(/[A-Z]/g, (char: string) => `-${char.toLowerCase()}`);
}
