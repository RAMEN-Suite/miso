/**
 * Public entry point of the text editor. Code outside of `editors/text` imports the editor only from here, or from
 * `config/*` (which only holds constants and is safe to import from modules the editor itself depends on).
 *
 * Interim surface: it exports what the app uses today. It gets narrowed down to the editor class, its commands,
 * queries and events once the editor is extracted into its own package.
 */

export { createExtensions, type ExtensionOptions } from "./extensions";
export { ANNOTATION_DECORATION_KEY } from "./extensions/annotationDecoration";

export { default as StandoffConverter } from "./services/standoffConverter";
export { default as AnnotationRangeError } from "./utils/errors/annotationRange.error";

export {
  collectBlockClassifications,
  collectInlineAnnotations,
  getAnnotationRevision,
  normalizeAnnotation,
  toAnnotation,
} from "./utils/helper/annotationHelper";
export { createAnnotationChangeCollector } from "./utils/helper/annotationChangesHelper";
export { pastedSliceToRawText } from "./utils/helper/clipboardHelper";
export {
  findDecorationBoundariesByUuid,
  findNodeBoundariesByUuid,
  findNodePosByUuid,
  getVisibleDocRange,
} from "./utils/helper/positionHelper";
export { validateSelection } from "./utils/helper/selectionHelper";
export { buildDocStructure, getBlockClassificationRanges } from "./utils/helper/structureHelper";

export type {
  AnnotationMapping,
  BlockClassificationRange,
  DocAnnotation,
  EditorSettings,
  Range,
  StandoffParseIssue,
  ToCItem,
} from "./models/types";
