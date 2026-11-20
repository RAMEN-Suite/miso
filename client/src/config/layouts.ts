import { Component } from "vue";
import { LayoutName } from "../models/types";
import DefaultLayout from "../layouts/DefaultLayout.vue";
import BlankLayout from "../layouts/BlankLayout.vue";

/** Maps the `layout` route meta field to its layout component. */
export const layouts: Record<LayoutName, Component> = {
  default: DefaultLayout,
  blank: BlankLayout,
};

/** Layout used when a route does not declare one. */
export const DEFAULT_LAYOUT: LayoutName = "default";

/**
 * Resolve the layout component for a layout name.
 *
 * @param {LayoutName | undefined} name - The name taken from the route's `meta.layout` field.
 * @returns {Component} The matching layout component, or the default layout if the name is unknown or missing.
 */
export function resolveLayout(name: LayoutName | undefined): Component {
  if (name && name in layouts) {
    return layouts[name];
  } else {
    return layouts[DEFAULT_LAYOUT];
  }
}
