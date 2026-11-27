/**
 * The only module through which the text editor uses code of the host app. Everything exported here is either part of
 * the RAMEN model and its configuration (to come from ramen-core) or has to be injected on construction once the
 * editor is its own package.
 */

export { useConfigStore } from "../../../store/config";
export { cloneDeep, pruneUnconfiguredProperties } from "../../../utils/helper/helper";
export { applySaveResult, findNode } from "../../../utils/helper/editGraph";
export { createTextPositionSelector } from "../../../utils/helper/selector";
export { familyRefOf, findShape, getShapeProperties, shapeRefOf } from "../../../utils/helper/modelHelper";

export type { IAnnotation } from "../../../models/IAnnotation";
export type { TextPositionSelector } from "../../../utils/helper/selector";
export type {
  Annotation,
  AnnotationAppearance,
  AnnotationExtent,
  AnnotationNode,
  AppearanceOverride,
  EditGraph,
  EditNode,
  EditRelation,
  ElementNodeStatus,
  HighlightTextStyle,
  IconSpecInput,
  MarkerStyle,
  MathTextStyle,
  ModelAnnotationShape,
  NativeType,
  TextAnnotationRepresentation,
} from "../../../models/types";
