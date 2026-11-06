import type { AttributeValueType } from "./ramen.js";

/*
 * Checks on the value type of an attribute (see `getValueType` in `modelHelper.ts`). Lists are told apart by `isList`
 * there, these checks are about a single value. Mirrors `client/src/utils/helper/propertyTypeHelper.ts`.
 */

/** Whether a value type is a boolean */
export function isBoolean(type: AttributeValueType | undefined): boolean {
  return type === "Boolean";
}

/** Whether a value type is a calendar date (`YYYY-MM-DD`) */
export function isDate(type: AttributeValueType | undefined): boolean {
  return type === "Date";
}

/** Whether a value type is a point in time (ISO 8601, UTC) */
export function isDateTime(type: AttributeValueType | undefined): boolean {
  return type === "DateTime";
}

/** Whether a value type is a floating point number */
export function isFloat(type: AttributeValueType | undefined): boolean {
  return type === "Float";
}

/** Whether a value type is a whole number */
export function isInteger(type: AttributeValueType | undefined): boolean {
  return type === "Integer";
}

/** Whether a value type is a JSON object */
export function isObject(type: AttributeValueType | undefined): boolean {
  return type === "Object";
}

/** Whether a value type is plain text */
export function isString(type: AttributeValueType | undefined): boolean {
  return type === "String";
}

/** Whether a value type is a number of any kind */
export function isNumeric(type: AttributeValueType | undefined): boolean {
  return isInteger(type) || isFloat(type);
}

/** Whether a value type is a date or a date-time */
export function isTemporal(type: AttributeValueType | undefined): boolean {
  return isDate(type) || isDateTime(type);
}
