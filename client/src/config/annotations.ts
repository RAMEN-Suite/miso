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
