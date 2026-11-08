/**
 * The only module through which the text editor uses code of the host app. Everything exported here is either part of
 * the RAMEN model and its configuration (to come from ramen-core) or has to be injected on construction once the
 * editor is its own package.
 */

export { useConfigStore } from "../../../store/config";
export {
  cloneDeep,
  createNodeStatusObjectFromRawData,
  pruneDeletedNodes,
  pruneUnconfiguredProperties,
  setNodeTreeStatus,
} from "../../../utils/helper/helper";
export { INTRINSIC_ANNOTATION_PROPERTIES, PRUNE_UNCONFIGURED_ANNOTATION_TYPES } from "../../../config/annotations";
export { createTextPositionSelector } from "../../../utils/helper/selector";

export type { IAnnotation } from "../../../models/IAnnotation";
export type { TextPositionSelector } from "../../../utils/helper/selector";
export type {
  Annotation,
  AnnotationAppearance,
  AnnotationExtent,
  AnnotationNode,
  AppearanceOverride,
  BuiltinStructuralType,
  HighlightTextStyle,
  IconSpecInput,
  MarkerStyle,
  MathTextStyle,
  NodeDto,
  NodeStatus,
  NodeStatusObject,
  TextAnnotationRepresentation,
} from "../../../models/types";
