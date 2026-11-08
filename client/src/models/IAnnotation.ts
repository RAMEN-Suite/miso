import { BaseNodeData } from "./types";
import type { SelectorByMedium, SelectorMedium } from "../utils/helper/selector";

/**
 * The data of an annotation on a Content of the medium `M`, which decides its selector (see `SelectorByMedium`). Text
 * is the default, used by the text editor and everything built on `AnnotationNode`; annotations on images will be
 * `IAnnotation<"image">`.
 */
export type IAnnotation<M extends SelectorMedium = "text"> = BaseNodeData & {
  [keyof: string]: unknown;
  /** The part of the annotated Content the annotation covers */
  selector: SelectorByMedium[M];
  subType?: string | number;
  text: string;
  type: string;
  /** Only present and `true` for zero-point annotations (omitted otherwise)*/
  isZeroPoint?: true;
};
