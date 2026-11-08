import { BaseNodeData } from "./types.js";
import type { Selector } from "../utils/selector.js";

export type IAnnotation = BaseNodeData & {
  [keyof: string]: unknown;
  /** The part of the annotated Content the annotation covers. Only annotations on a Content have one. */
  selector?: Selector;
  subType?: string | number;
  text: string;
  type: string;
  /** Only present and `true` for zero-point annotations (omitted otherwise)*/
  isZeroPoint?: true;
};
