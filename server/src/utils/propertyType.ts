import { PropertyConfig } from "../models/types.js";

/*
 * Datatype checks for property configurations. Mirrors `client/src/utils/helper/propertyTypeHelper.ts`.
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
 * Checks whether a property holds a JSON object.
 *
 * @param {Partial<PropertyConfig> | undefined} config - The config of the property.
 * @returns {boolean} `true` if the property is an object.
 */
export function isObject(config: Partial<PropertyConfig> | undefined): boolean {
  return config?.type === "Object";
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
