import "vue-router";
import { LayoutName } from "./models/types";

declare module "vue-router" {
  /**
   * Extended type for vue-router's `meta` field.
   */
  interface RouteMeta {
    /** Name of the layout wrapping this route's view. Defaults to "default" when omitted. */
    layout?: LayoutName;
  }
}
