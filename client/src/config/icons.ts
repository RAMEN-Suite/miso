import { BaseNodeLabel, IconSpec, IconSpecInput } from "../models/types";
import { filterDefaultLabels } from "../utils/helper/helper";

/** Used when a node matches none of the known base labels. */
const FALLBACK_NODE_ICON: IconSpec = { kind: "lucide", name: "circle-question-mark" };

/** Default icons specs for each RAMEN base node label. */
export const BASE_NODE_ICONS: Record<BaseNodeLabel, IconSpec> = {
  Collection: { kind: "lucide", name: "folder" },
  Content: { kind: "lucide", name: "file" },
  Annotation: { kind: "lucide", name: "pencil" },
  Entity: { kind: "lucide", name: "user" },
  Character: { kind: "lucide", name: "square" },
};

/**
 * Map for refined RAMEN node icons (e.g.`{ Letter: { kind: "lucide", name: "mail" } }`).
 *
 * Icon specifications Can be a base string (which leas to an Lucide icon name) or an {@link IconSpec} object.
 *
 * TODO: Currently empty. When icons become user-configurable (via guidelines/config), this map is populated
 * from there and {@link resolveNodeIcon} picks it up without any other change.
 */
export const NODE_ICONS_BY_LABEL: Record<string, IconSpec> = {};

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
  const additionalLabels: string[] = filterDefaultLabels(nodeLabels);

  for (const label of additionalLabels) {
    if (NODE_ICONS_BY_LABEL[label]) {
      return NODE_ICONS_BY_LABEL[label];
    }
  }

  if (nodeLabels.includes("Collection")) {
    return BASE_NODE_ICONS.Collection;
  }

  if (nodeLabels.includes("Content")) {
    return BASE_NODE_ICONS.Content;
  }

  if (nodeLabels.includes("Entity")) {
    return BASE_NODE_ICONS.Entity;
  }

  if (nodeLabels.includes("Annotation")) {
    return BASE_NODE_ICONS.Annotation;
  }

  return FALLBACK_NODE_ICON;
}
