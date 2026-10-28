import { PropertyConfig } from "../models/types.js";
import ValidationError from "../errors/validation.error.js";
import { isArray, isBoolean, isFloat, isInteger, isString, isTemporal } from "./propertyType.js";

/**
 * Checks a property value against its config from the guidelines. Empty values are only allowed for optional
 * properties, arrays are checked item by item.
 *
 * @param {unknown} value - The new value.
 * @param {PropertyConfig} config - The config of the property.
 * @returns {void} This function does not return any value.
 * @throws {ValidationError} If the value doesn't match the config.
 */
export function validatePropertyValue(value: unknown, config: PropertyConfig): void {
  const name: string = config.name;

  if (isEmptyValue(value)) {
    if (config.required) {
      throw new ValidationError(`"${name}" is required.`);
    }

    return;
  }

  if (!isArray(config)) {
    validateScalarValue(name, value, config);

    return;
  }

  if (!Array.isArray(value)) {
    throw new ValidationError(`"${name}" must be a list.`);
  }

  if (config.minItems !== undefined && value.length < config.minItems) {
    throw new ValidationError(`"${name}" must have at least ${config.minItems} entries.`);
  }

  if (config.maxItems !== undefined && value.length > config.maxItems) {
    throw new ValidationError(`"${name}" must have at most ${config.maxItems} entries.`);
  }

  value
    .filter((item: unknown) => !isEmptyValue(item))
    .forEach((item: unknown) => validateScalarValue(name, item, config.items ?? {}));
}

/**
 * Checks a single (non-array) value against its type, options and limits.
 *
 * @param {string} name - The property name, for the error message.
 * @param {unknown} value - The value to check. Must not be empty.
 * @param {Partial<PropertyConfig>} config - The config of the value.
 * @returns {void} This function does not return any value.
 * @throws {ValidationError} If the value doesn't match the config.
 */
function validateScalarValue(name: string, value: unknown, config: Partial<PropertyConfig>): void {
  if (isString(config) || isTemporal(config)) {
    if (typeof value !== "string") {
      throw new ValidationError(`"${name}" must be a string.`);
    }

    if (config.minLength !== undefined && value.length < config.minLength) {
      throw new ValidationError(`"${name}" must have at least ${config.minLength} characters.`);
    }

    if (config.maxLength !== undefined && value.length > config.maxLength) {
      throw new ValidationError(`"${name}" must have at most ${config.maxLength} characters.`);
    }
  } else if (isInteger(config) || isFloat(config)) {
    if (typeof value !== "number" || !Number.isFinite(value) || (isInteger(config) && !Number.isInteger(value))) {
      throw new ValidationError(`"${name}" must be ${isInteger(config) ? "an integer" : "a number"}.`);
    }

    const minimum: number | undefined = config.exclusiveMinimum ?? config.minimum;
    const maximum: number | undefined = config.exclusiveMaximum ?? config.maximum;

    if (minimum !== undefined && (config.exclusiveMinimum !== undefined ? value <= minimum : value < minimum)) {
      throw new ValidationError(`"${name}" is too small.`);
    }

    if (maximum !== undefined && (config.exclusiveMaximum !== undefined ? value >= maximum : value > maximum)) {
      throw new ValidationError(`"${name}" is too large.`);
    }
  } else if (isBoolean(config)) {
    if (typeof value !== "boolean") {
      throw new ValidationError(`"${name}" must be true or false.`);
    }
  }

  const options: (string | number)[] = config.options ?? [];

  if (options.length > 0 && !options.some((option: string | number) => String(option) === String(value))) {
    throw new ValidationError(`"${String(value)}" is not an allowed value for "${name}".`);
  }
}

/**
 * Whether a value counts as "not set": `null`, `undefined`, an empty string or an empty array.
 *
 * @param {unknown} value - The value to check.
 * @returns {boolean} Whether the value is empty.
 */
function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}
