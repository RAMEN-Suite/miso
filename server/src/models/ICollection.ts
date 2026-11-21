import { BaseNodeProperties } from "./types.js";

export type ICollection = BaseNodeProperties & {
  [keyof: string]: unknown;
  label: string;
};
