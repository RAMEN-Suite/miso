import "vue-router";
import { CollectionNode, LayoutName, NodeAncestry, NodeDto } from "./models/types";

declare module "vue-router" {
  /**
   * Extended type for vue-router's `meta` field.
   */
  interface RouteMeta {
    collection?: NodeDto<CollectionNode>;
    ancestryPaths?: NodeAncestry[];
    /** Name of the layout wrapping this route's view. Defaults to "default" when omitted. */
    layout?: LayoutName;
  }
}
