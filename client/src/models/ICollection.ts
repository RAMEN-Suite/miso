import { BaseNodeProperties } from "./types";

export type ICollection = BaseNodeProperties & {
  [keyof: string]: unknown;
  label: string;
};
