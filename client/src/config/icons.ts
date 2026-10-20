import { AnnotationType, BaseNodeLabel, IconSpec, IconSpecInput } from "../models/types";
import { filterBaseNodeLabels } from "./ramen";

/** Used when a node matches none of the known base labels. */
const FALLBACK_NODE_ICON: IconSpec = { kind: "lucide", name: "circle-question-mark" };

/** Default icons specs for each RAMEN base node label. */
export const BASE_NODE_ICONS: Record<BaseNodeLabel, IconSpec> = {
  Collection: { kind: "lucide", name: "folder" },
  Content: { kind: "lucide", name: "file-text" },
  Annotation: { kind: "lucide", name: "pencil" },
  Entity: { kind: "lucide", name: "user" },
};

/**
 * Map for refined RAMEN node icons (e.g.`{ Letter: { kind: "lucide", name: "mail" } }`).
 *
 * Contains defaults that are extended with the icons configured in the guidelines via {@link registerNodeIcon}.
 * Configured icons for base labels (e.g. `Collection`) are stored here as well and take precedence over {@link BASE_NODE_ICONS}.
 */
export const NODE_ICONS_BY_LABEL: Record<string, IconSpec> = {
  Event: { kind: "lucide", name: "calendar-days" },
  Person: { kind: "lucide", name: "user" },
  Place: { kind: "lucide", name: "map-pinned" },
  Role: { kind: "lucide", name: "award" },
  Thing: { kind: "lucide", name: "box" },
  Regesta: { kind: "lucide", name: "scroll-text" },
  Volume: { kind: "lucide", name: "book" },
};

/**
 * Resolves the configured icon of an annotation type. The icon identifies the type itself and doesn't depend on the
 * property values of an annotation.
 *
 * @param {AnnotationType | undefined} config - The configuration of the annotation type.
 * @returns {IconSpecInput | undefined} The configured icon, or `undefined` if there is none.
 */
export function resolveAnnotationIcon(config: AnnotationType | undefined): IconSpecInput | undefined {
  return config?.miso?.appearance?.icon;
}

/**
 * Registers a configured node icon for a (base or refined) node label. Overrides the default icon of that label.
 * Does nothing if no valid icon is given.
 *
 * @param {string} label - The node label, e.g. `Letter` or `Collection`.
 * @param {IconSpecInput | undefined} icon - The configured icon.
 * @returns {void} This function does not return anything.
 */
export function registerNodeIcon(label: string, icon: IconSpecInput | undefined): void {
  const spec: IconSpec | null = normalizeIconSpec(icon);

  if (spec) {
    NODE_ICONS_BY_LABEL[label] = spec;
  }
}

/**
 * Normalizes the possible icon configurations (lucide icon name, raw SVG or external URL) into the canonical {@link IconSpec}.
 *
 * @param {IconSpecInput | undefined} input - The raw value, e.g. from a configuration file.
 * @returns {IconSpec | null} The normalized spec, or `null` when the input is missing or malformed.
 */
export function normalizeIconSpec(input: IconSpecInput | undefined): IconSpec | null {
  if (input === undefined || input === null) {
    return null;
  }

  if (typeof input === "string") {
    const name: string = input.trim();

    if (name === "") {
      return null;
    }

    return { kind: "lucide", name };
  }

  if (typeof input !== "object") {
    console.warn("Invalid icon spec, ignoring:", input);
    return null;
  }

  if (input.kind === "lucide" && typeof input.name === "string" && input.name.trim() !== "") {
    return { kind: "lucide", name: input.name.trim() };
  }

  if (input.kind === "url" && typeof input.url === "string" && input.url.trim() !== "") {
    return { kind: "url", url: input.url.trim() };
  }

  if (input.kind === "svg" && typeof input.svg === "string" && input.svg.trim() !== "") {
    return { kind: "svg", svg: input.svg };
  }

  console.warn("Invalid icon spec, ignoring:", input);

  return null;
}

/**
 * Resolves the icon for a node from its labels.
 *
 * Projects will be able to override the RAMEN base node's icons. Defaults to a generic "file" icon.
 *
 * @param {string[]} nodeLabels - The node's full label list.
 * @returns {IconSpec} The icon to render, for example `{ kind: "lucide", name: "folder" }`.
 */
export function resolveNodeIcon(nodeLabels: string[]): IconSpec {
  const additionalLabels: string[] = filterBaseNodeLabels(nodeLabels);

  for (const label of additionalLabels) {
    if (NODE_ICONS_BY_LABEL[label]) {
      return NODE_ICONS_BY_LABEL[label];
    }
  }

  for (const baseLabel of ["Collection", "Content", "Entity", "Annotation"] as const) {
    if (nodeLabels.includes(baseLabel)) {
      return NODE_ICONS_BY_LABEL[baseLabel] ?? BASE_NODE_ICONS[baseLabel];
    }
  }

  return FALLBACK_NODE_ICON;
}
