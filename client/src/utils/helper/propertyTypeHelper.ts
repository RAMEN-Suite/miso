import type { AttributeValueType } from "./modelHelper";

/*
 * Checks on the value type of an attribute (see `getValueType` in `modelHelper.ts`). Lists are told apart by `isList`
 * there, these checks are about a single value.
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

/**
 * Returns the `type` of the native input a temporal value is edited with.
 *
 * @param {AttributeValueType | undefined} type - The value type.
 * @returns {"date" | "datetime-local"} The input type.
 */
export function getTemporalInputType(type: AttributeValueType | undefined): "date" | "datetime-local" {
  if (isDate(type)) {
    return "date";
  } else {
    return "datetime-local";
  }
}

/**
 * Converts the stored string of a temporal value (`YYYY-MM-DD`, `YYYY-MM-DDTHH:mm:ss.000Z`) into the value of its
 * native input.
 *
 * @param {string | null | undefined} stored - The stored value.
 * @param {AttributeValueType | undefined} type - The value type.
 * @returns {string} The value for the input, empty when there is none.
 */
export function toTemporalInputValue(stored: string | null | undefined, type: AttributeValueType | undefined): string {
  if (!stored) {
    return "";
  }

  // `datetime-local` takes no milliseconds or timezone suffix
  return isDateTime(type) ? stored.slice(0, 19) : stored;
}

/**
 * Converts the value of a native temporal input into the string to store. Browsers leave out the seconds when they
 * are zero, so they are filled in here.
 *
 * The date and time of a date-time are taken as entered and marked as UTC.
 *
 * @param {string | null | undefined} value - The value of the input (`YYYY-MM-DD` or `YYYY-MM-DDTHH:mm[:ss]`).
 * @param {AttributeValueType | undefined} type - The value type.
 * @returns {string | null} The string to store, or null when the input was cleared.
 */
export function toStoredTemporal(value: string | null | undefined, type: AttributeValueType | undefined): string | null {
  if (!value) {
    return null;
  }

  if (isDate(type)) {
    return value;
  } else {
    return `${value.length === 16 ? `${value}:00` : value}.000Z`;
  }
}
