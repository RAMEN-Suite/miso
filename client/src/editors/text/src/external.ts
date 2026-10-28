/**
 * The only module through which the text editor uses code of the host app. Everything exported here is either part of
 * the RAMEN model and its configuration (to come from ramen-core) or has to be injected on construction once the
 * editor is its own package.
 */

export { useGuidelinesStore } from "../../../store/guidelines";
export {
  cloneDeep,
  createNodeStatusObjectFromRawData,
  pruneDeletedNodes,
  pruneUnconfiguredProperties,
  setNodeTreeStatus,
} from "../../../utils/helper/helper";
export { INTRINSIC_ANNOTATION_PROPERTIES, PRUNE_UNCONFIGURED_ANNOTATION_TYPES } from "../../../config/annotations";

export type { IAnnotation } from "../../../models/IAnnotation";
export type {
  Annotation,
  AnnotationAppearance,
  AnnotationExtent,
  AnnotationNode,
  AnnotationType,
  AppearanceOverride,
  BuiltinStructuralType,
  HighlightTextStyle,
  IconSpecInput,
  MarkerStyle,
  MathTextStyle,
  NodeDto,
  NodeStatus,
  NodeStatusObject,
  PropertyConfig,
  TextAnnotationRepresentation,
} from "../../../models/types";
