/**
 * The only module through which the configurator uses code of the app: the config format and its checks, the model
 * accessors, and the editor's pure rendering. Nothing here touches the app's stores, so the configurator runs without
 * the backend and without a loaded config.
 */

export {
  CONFIG_SCHEMA_URL,
  checkConfig,
  formatFinding,
  type ConfigFinding,
  type ConfigMapping,
  type MisoConfig,
} from "../schemas/misoConfig.schema";
export {
  ANNOTATION_EXTENT_DESCRIPTIONS,
  ANNOTATION_EXTENTS,
  CONTENT_MEDIA,
  TEXT_ANNOTATION_REPRESENTATION_DESCRIPTIONS,
  HIGHLIGHT_STYLE_KEYS,
  ICON_KINDS,
  MARKER_KINDS,
  TEXT_ANNOTATION_REPRESENTATIONS,
  describeConfigTerm,
  type ConfigTerm,
} from "../schemas/configBlocks.schema";
export { collectConfigWarnings } from "../utils/helper/configChecks";
export {
  createModelContext,
  findAttribute,
  findShape,
  getBaseNodeRef,
  getContentCarrierRefs,
  getContentMedium,
  getOptions,
  getShapeProperties,
  getShapesForNode,
  getTypeRef,
  shapeRefOf,
} from "../utils/helper/modelHelper";
export { toEditorAppearance } from "../utils/helper/appearance";
export { BASE_NODE_REF, BASE_NODE_REFS } from "../config/ramen";
export { NATIVE_TYPES, getNativeTypeConfig, nativeTypeIcon } from "../editors/text/src/config/constants";
export { getHighlightStyle } from "../editors/text/src/rendering/highlight";
export { renderMarker } from "../editors/text/src/rendering/marker";
export { default as IconView } from "../components/RAMENNodeIcon.vue";
export { BASE_NODE_ICONS, normalizeIconSpec } from "../config/icons";

export type {
  AnnotationAppearance,
  AppearanceOverride,
  AppearanceVariant,
  AttributeOwner,
  ContentMedium,
  HighlightTextStyle,
  IconSpecInput,
  MarkerStyle,
  ModelAnnotationShape,
  ModelContext,
  NativeType,
} from "../models/types";
