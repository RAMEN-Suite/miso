import { FilterComparator, FilterTarget, PropertyConfig, PropertyConfigDataType } from "../models/types";

/**
 * Which comparators make sense for which datatype.
 *
 * Mirrors `COMPARATORS_BY_DATATYPE` in `server/src/utils/filter.ts`. The server is the authority — it
 * rejects anything outside its own table with a 400 — so this copy exists only to keep the UI from
 * offering a combination that would be refused. Keep the two in sync.
 */
export const COMPARATORS_BY_DATATYPE: Record<PropertyConfigDataType, FilterComparator[]> = {
  String: ["contains", "notContains", "startsWith", "endsWith", "equals", "notEquals", "in", "isEmpty", "isNotEmpty"],
  Integer: ["equals", "notEquals", "lt", "lte", "gt", "gte", "between", "in", "isEmpty", "isNotEmpty"],
  Float: ["equals", "notEquals", "lt", "lte", "gt", "gte", "between", "in", "isEmpty", "isNotEmpty"],
  Boolean: ["equals", "notEquals", "isEmpty", "isNotEmpty"],
  Date: ["dateIs", "dateBefore", "dateAfter", "between", "isEmpty", "isNotEmpty"],
  DateTime: ["dateIs", "dateBefore", "dateAfter", "between", "isEmpty", "isNotEmpty"],
  Time: ["dateIs", "dateBefore", "dateAfter", "between", "isEmpty", "isNotEmpty"],
  Array: ["in", "isEmpty", "isNotEmpty"],
  Object: ["isEmpty", "isNotEmpty"],
};

/** Comparators allowed on a property declaring `options`. Mirrors `ENUM_COMPARATORS` server-side. */
export const ENUM_COMPARATORS: FilterComparator[] = ["equals", "notEquals", "in", "isEmpty", "isNotEmpty"];

/** Comparators that ignore their value — the row renders no input for them. */
export const VALUELESS_COMPARATORS: FilterComparator[] = ["isEmpty", "isNotEmpty"];

/** Comparators whose value is a two-element range. */
export const RANGE_COMPARATORS: FilterComparator[] = ["between"];

/** What the comparator dropdown shows. */
export const COMPARATOR_LABELS: Record<FilterComparator, string> = {
  contains: "Contains",
  notContains: "Does not contain",
  startsWith: "Starts with",
  endsWith: "Ends with",
  equals: "Equals",
  notEquals: "Does not equal",
  lt: "Less than",
  lte: "Less than or equal",
  gt: "Greater than",
  gte: "Greater than or equal",
  between: "Between",
  in: "Is one of",
  dateIs: "Is",
  dateBefore: "Is before",
  dateAfter: "Is after",
  isEmpty: "Is empty",
  isNotEmpty: "Is not empty",
};

/**
 * The comparators offered for a property.
 *
 * Narrower than what the server accepts, on purpose: `in` is only offered when the property declares
 * `options`, because without a closed set to pick from there is no sensible input for a list.
 *
 * @param {Partial<PropertyConfig> | undefined} config - The property's config. Compared as text when absent.
 * @returns {FilterComparator[]} The comparators to offer.
 */
export function availableComparators(config: Partial<PropertyConfig> | undefined): FilterComparator[] {
  const supported: FilterComparator[] = COMPARATORS_BY_DATATYPE[config?.type ?? "String"] ?? [];

  if (config?.options?.length) {
    return supported.filter((comparator: FilterComparator) => ENUM_COMPARATORS.includes(comparator));
  }

  return supported.filter((comparator: FilterComparator) => comparator !== "in");
}

/**
 * A stable key for a target, used to group rows back into rules and to drive the target dropdown.
 *
 * @param {FilterTarget} target - The target.
 * @returns {string} The property name, or `distinct`.
 */
export function targetKey(target: FilterTarget): string {
  return target.kind === "property" ? target.field : target.kind;
}
