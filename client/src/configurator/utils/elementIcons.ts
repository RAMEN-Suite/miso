import { BASE_NODE_ICONS, BUILTIN_STRUCTURAL_CONFIGS, normalizeIconSpec, type IconSpecInput, type ModelContext } from "../external";

/**
 * The icon a node classifier shows: the nearest icon along its lineage (itself first), otherwise the default of its
 * base node. Reads the context's config, so it follows the draft.
 *
 * @param {ModelContext} context - The model context.
 * @param {string} classifierRef - The classifier ref.
 * @returns {IconSpecInput | undefined} The icon, `undefined` if the classifier has no base node.
 */
export function classifierIconOf(context: ModelContext, classifierRef: string): IconSpecInput | undefined {
  const lineageRefs: string[] = context.model.getNodeLineage(classifierRef).map((item) => `${item.modelId}:${item.nodeId}`);
  const configured: IconSpecInput | undefined = lineageRefs
    .toReversed()
    .map((ref) => context.config.elements.classifiers[ref]?.appearance?.icon)
    .find((icon) => normalizeIconSpec(icon) !== null);

  return configured ?? BASE_NODE_ICONS[lineageRefs[0] ?? ""];
}

/**
 * The icon an annotation shape shows: the one of its native type when it is mapped, otherwise its own (shapes have no
 * fallback).
 *
 * @param {ModelContext} context - The model context.
 * @param {string} shapeRef - The shape ref.
 * @returns {IconSpecInput | undefined} The icon, `undefined` if none is set.
 */
export function shapeIconOf(context: ModelContext, shapeRef: string): IconSpecInput | undefined {
  const native = context.config.editors.text.mappings.find((mapping) => mapping.annotation === shapeRef)?.native;

  if (native) {
    return BUILTIN_STRUCTURAL_CONFIGS.find((config) => config.type === native)?.icon;
  }

  const icon: IconSpecInput | undefined = context.config.elements.annotations[shapeRef]?.appearance?.icon;

  return normalizeIconSpec(icon) !== null ? icon : undefined;
}
