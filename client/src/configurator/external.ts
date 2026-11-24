/**
 * The only module through which the configurator uses code of the app: the config format and its checks, the model
 * accessors, and the editor's pure rendering. Nothing here touches the app's stores, so the configurator runs without
 * the backend and without a loaded config.
 */

export {
  checkConfig,
  formatFinding,
  type ConfigFinding,
  type ConfigMapping,
  type MisoConfig,
} from "../schemas/misoConfig.schema";
export { collectConfigWarnings } from "../utils/helper/configChecks";
export {
  createModelContext,
  findAttribute,
  findShape,
  getBaseNodeRef,
  getContentCarrierRefs,
  getOptions,
  getShapeProperties,
  getShapesForNode,
  getTypeRef,
  shapeRefOf,
  toEditorAppearance,
} from "../utils/helper/modelHelper";
export { BASE_NODE_REF, BASE_NODE_REFS } from "../config/ramen";
export { BUILTIN_STRUCTURAL_CONFIGS } from "../editors/text/src/config/constants";
export { getHighlightStyle } from "../editors/text/src/rendering/highlight";
export { renderMarker } from "../editors/text/src/rendering/marker";
export { default as IconView } from "../components/RAMENNodeIcon.vue";

export type {
  AnnotationAppearance,
  AppearanceOverride,
  AppearanceVariant,
  AttributeOwner,
  HighlightTextStyle,
  IconSpecInput,
  MarkerStyle,
  ModelAnnotationShape,
  ModelContext,
  PropertiesTextStyle,
} from "../models/types";
