/**
 * Annotation properties the model and editor needs, whatever the config lists. They will never removed automatically
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
 * Whether the data of annotations with a type that is not in the config are pruned before saving.
 *
 * - `false`: Saved with all the properties they carry. Data beat config.
 * - `true`: Pruned like all other annotations. config beats data.
 */
export const PRUNE_UNCONFIGURED_ANNOTATION_TYPES: boolean = false;

/**
 * Toolbar group of the structural annotation types: listed in the structure tab of the toolbar instead of the
 * annotation tab, and not offered in the annotation filter. Annotation types mapped to a built-in structural type are
 * always in this group, other types (e.g. block classifications) via their `ext.miso.group`.
 */
export const STRUCTURE_ANNOTATION_GROUP = "structure" as const;
