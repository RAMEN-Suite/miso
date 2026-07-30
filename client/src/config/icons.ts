import { BaseNodeLabel } from "../models/types";
import { filterDefaultLabels } from "../utils/helper/helper";

/**
 * Default icons for each RAMEN base node label. Used across the hierarchy view (columns,
 * breadcrumbs, focus pane) to give nodes recognisable, type-distinct icons.
 */
export const BASE_NODE_ICONS: Record<BaseNodeLabel, string> = {
  Collection: "pi pi-folder",
  Content: "pi pi-file",
  Annotation: "pi pi-pencil",
  Entity: "pi pi-user",
  Character: "pi pi-stop",
};

/**
 * Project overrides keyed by additional (domain) node label, e.g. `{ Letter: "pi pi-envelope" }`.
 *
 * Currently empty. When icons become user-configurable (via guidelines/config), this map is populated
 * from there and {@link resolveNodeIcon} picks it up without any other change.
 */
export const NODE_ICONS_BY_LABEL: Record<string, string> = {};

/**
 * Resolves the icon for a node from its labels.
 *
 * Projects will be able to override the RAMEN bse node's icons. Defaults to a generic "file" icon.
 *
 * @param {string[]} nodeLabels - The node's full label list.
 * @returns {string} A PrimeIcons class string (e.g. `"pi pi-folder"`).
 */
export function resolveNodeIcon(nodeLabels: string[]): string {
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

  return "pi pi-file";
}
