import type { AnnotationAppearance, MarkerStyle, ModelAnnotationShape } from "../../models/types";
import { findAttribute } from "./modelHelper";

/**
 * Converts the configured appearance of an annotation shape to the one the text editor reads: the attribute refs of
 * the variants and of a math marker resolved to the property names the annotation data are keyed by. Variants whose
 * ref can't be resolved are left out (the config check warns about them).
 *
 * @param {ModelAnnotationShape} shape - The annotation shape.
 * @param {AnnotationAppearance} appearance - Its configured appearance.
 * @returns {AnnotationAppearance} The appearance for the editor.
 */
export function toEditorAppearance(shape: ModelAnnotationShape, appearance: AnnotationAppearance): AnnotationAppearance {
  const toPropertyName = (attributeRef: string): string | undefined => findAttribute(shape, attributeRef)?.name;
  const resolveMarker = (marker: MarkerStyle | undefined): MarkerStyle | undefined => {
    if (marker?.kind === "math") {
      return { ...marker, property: toPropertyName(marker.property) ?? marker.property };
    } else {
      return marker;
    }
  };

  return {
    ...appearance,
    marker: resolveMarker(appearance.marker),
    variants: appearance.variants?.flatMap((variant) => {
      const property: string | undefined = toPropertyName(variant.property);
      const values = Object.fromEntries(
        Object.entries(variant.values).map(([value, override]) => [value, { ...override, marker: resolveMarker(override.marker) }]),
      );

      return property ? [{ property, values }] : [];
    }),
  };
}
