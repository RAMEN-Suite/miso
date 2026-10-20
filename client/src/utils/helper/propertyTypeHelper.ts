import { PropertyConfig } from "../../models/types";

/*
 * Datatype checks for property configurations. Mirrors `server/src/utils/propertyType.ts`.
 *
 * Every check takes the whole config instead of the bare type name: the guideline format is likely to
 * change (e.g. a date becoming `String` + a `format` key), and then only the bodies in this file have
 * to follow.
 */

/**
 * Checks whether a property holds a list of values.
 *
 * @param {Partial<PropertyConfig> | undefined} config - The config of the property.
 * @returns {boolean} `true` if the property is an array.
 */
export function isArray(config: Partial<PropertyConfig> | undefined): boolean {
  return config?.type === "Array";
}

/**
 * Checks whether a property holds a boolean.
 *
 * @param {Partial<PropertyConfig> | undefined} config - The config of the property.
 * @returns {boolean} `true` if the property is a boolean.
 */
export function isBoolean(config: Partial<PropertyConfig> | undefined): boolean {
  return config?.type === "Boolean";
}

/**
 * Checks whether a property holds a calendar date (`YYYY-MM-DD`).
 *
 * @param {Partial<PropertyConfig> | undefined} config - The config of the property.
 * @returns {boolean} `true` if the property is a date.
 */
export function isDate(config: Partial<PropertyConfig> | undefined): boolean {
  return config?.type === "Date";
}

/**
 * Checks whether a property holds a point in time (ISO 8601, UTC).
 *
 * @param {Partial<PropertyConfig> | undefined} config - The config of the property.
 * @returns {boolean} `true` if the property is a date-time.
 */
export function isDateTime(config: Partial<PropertyConfig> | undefined): boolean {
  return config?.type === "DateTime";
}

/**
 * Checks whether a property holds a floating point number.
 *
 * @param {Partial<PropertyConfig> | undefined} config - The config of the property.
 * @returns {boolean} `true` if the property is a float.
 */
export function isFloat(config: Partial<PropertyConfig> | undefined): boolean {
  return config?.type === "Float";
}

/**
 * Checks whether a property holds a whole number.
 *
 * @param {Partial<PropertyConfig> | undefined} config - The config of the property.
 * @returns {boolean} `true` if the property is an integer.
 */
export function isInteger(config: Partial<PropertyConfig> | undefined): boolean {
  return config?.type === "Integer";
}

/**
 * Checks whether a property holds plain text.
 *
 * @param {Partial<PropertyConfig> | undefined} config - The config of the property.
 * @returns {boolean} `true` if the property is a string.
 */
export function isString(config: Partial<PropertyConfig> | undefined): boolean {
  return config?.type === "String";
}

/**
 * Checks whether a property holds a time of day (`HH:mm:ss`).
 *
 * @param {Partial<PropertyConfig> | undefined} config - The config of the property.
 * @returns {boolean} `true` if the property is a time.
 */
export function isTime(config: Partial<PropertyConfig> | undefined): boolean {
  return config?.type === "Time";
}

/**
 * Checks whether a property holds a number of any kind.
 *
 * @param {Partial<PropertyConfig> | undefined} config - The config of the property.
 * @returns {boolean} `true` if the property is an integer or a float.
 */
export function isNumeric(config: Partial<PropertyConfig> | undefined): boolean {
  return isInteger(config) || isFloat(config);
}

/**
 * Checks whether a property holds a temporal value of any kind.
 *
 * @param {Partial<PropertyConfig> | undefined} config - The config of the property.
 * @returns {boolean} `true` if the property is a date, a date-time or a time.
 */
export function isTemporal(config: Partial<PropertyConfig> | undefined): boolean {
  return isDate(config) || isDateTime(config) || isTime(config);
}

/**
 * Returns the `type` of the native input a temporal property is edited with.
 *
 * @param {Partial<PropertyConfig> | undefined} config - The config of the property.
 * @returns {"date" | "time" | "datetime-local"} The input type.
 */
export function getTemporalInputType(config: Partial<PropertyConfig> | undefined): "date" | "time" | "datetime-local" {
  if (isDate(config)) {
    return "date";
  } else if (isTime(config)) {
    return "time";
  } else {
    return "datetime-local";
  }
}

/**
 * Converts the stored string of a temporal property (`YYYY-MM-DD`, `YYYY-MM-DDTHH:mm:ss.000Z`, `HH:mm:ss`)
 * into the value of its native input.
 *
 * @param {string | null | undefined} stored - The stored value.
 * @param {Partial<PropertyConfig> | undefined} config - The config of the property.
 * @returns {string} The value for the input, empty when there is none.
 */
export function toTemporalInputValue(stored: string | null | undefined, config: Partial<PropertyConfig> | undefined): string {
  if (!stored) {
    return "";
  }

  // `datetime-local` takes no milliseconds or timezone suffix
  return isDateTime(config) ? stored.slice(0, 19) : stored;
}

/**
 * Converts the value of a native temporal input into the string to store. Browsers leave out the
 * seconds when they are zero, so they are filled in here.
 *
 * The date and time of a date-time are taken as entered and marked as UTC.
 *
 * @param {string | null | undefined} value - The value of the input (`YYYY-MM-DD`, `YYYY-MM-DDTHH:mm[:ss]` or `HH:mm[:ss]`).
 * @param {Partial<PropertyConfig> | undefined} config - The config of the property.
 * @returns {string | null} The string to store, or null when the input was cleared.
 */
export function toStoredTemporal(value: string | null | undefined, config: Partial<PropertyConfig> | undefined): string | null {
  if (!value) {
    return null;
  }

  if (isDate(config)) {
    return value;
  } else if (isTime(config)) {
    return value.length === 5 ? `${value}:00` : value;
  } else {
    return `${value.length === 16 ? `${value}:00` : value}.000Z`;
  }
}
