import { AnnotationNode, ModelAttribute, ModelContext } from "../../models/types";
import { isList, validateValue } from "./modelHelper";

/**
 * Converts a camelCase or PascalCase string into a space-separated title case string
 * (for example `"actorRoles"` to `"Actor Roles"`).
 *
 * @param {string} inputString - The string to be transformed.
 * @return {string} The transformed string in title case.
 */
export function camelCaseToTitleCase(inputString: string): string {
  return inputString.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^\w/, (char) => char.toUpperCase());
}

/**
 * Capitalizes the first letter of a given string.
 *
 * @param {string} inputString - The string to be capitalized.
 * @return {string} The input string with the first letter capitalized.
 */
export function capitalize(inputString: string): string {
  return inputString.charAt(0).toUpperCase() + inputString.slice(1);
}

/**
 * Deep clones an object, map or array. This means that any nested objects, maps or arrays will also be cloned.
 * Used to remove unwanted references e.g. resetting editor state on save/cancel/undo/redo operations.
 *
 * @param {T} input - The object, map or array to be deep cloned.
 * @return {T} The cloned object, map or array.
 */
export function cloneDeep<T>(input: T): T {
  if (input instanceof Map) {
    const clonedMap = new Map<unknown, unknown>();

    // new Map(input) would not work since the reference to nested objects would still be the same
    input.forEach((value, key) => {
      clonedMap.set(key, cloneDeep(value));
    });

    return clonedMap as T;
  }

  if (Array.isArray(input)) {
    return JSON.parse(JSON.stringify(input)) as T;
  }

  if (typeof input === "object" && input !== null) {
    return JSON.parse(JSON.stringify(input)) as T;
  }

  // Default for primitive types like string, number, boolean, etc.
  return input;
}

/**
 * Removes all properties of a node that are not declared in the model, in place.
 *
 * Is applied before saving to keep stale properties (e.g. from a configuration that has changed in the meantime) out of the database.
 *
 * @param {Record<string, unknown>} properties - The node's properties to prune. Is mutated in place.
 * @param {readonly string[]} names - The names of the properties declared for the node.
 * @param {readonly string[]} intrinsic - Properties that are always kept, whether they are declared or not.
 * @returns {void} This function does not return any value.
 */
export function pruneUnconfiguredProperties(
  properties: Record<string, unknown>,
  names: readonly string[],
  intrinsic: readonly string[],
): void {
  const allowed = new Set<string>([...names, ...intrinsic]);

  Object.keys(properties).forEach((key: string) => {
    if (!allowed.has(key)) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- Safe to delete
      delete properties[key];
    }
  });
}

/**
 * Checks whether the properties of an annotation are valid according to the model (validated by RAMEN core).
 *
 * Currently only properties are validated. Will be extended when rules for connected entities etc. are applied.
 *
 * @param {AnnotationNode} annotation - The annotation node whose data is checked.
 * @param {ModelAttribute[]} properties - The properties of its annotation shape.
 * @param {ModelContext} context - The model context.
 * @return {boolean} Returns `true` if all properties are valid, `false` otherwise.
 */
export function checkAnnotationValidity(
  annotation: AnnotationNode,
  properties: ModelAttribute[],
  context: ModelContext,
): boolean {
  return properties.every(
    (entry: ModelAttribute) => validateValue(context, entry, annotation.properties[entry.attribute.name]).length === 0,
  );
}

/**
 * Truncates a string to a maximum length, appending "..." if truncation is needed.
 *
 * @param {string} text - The string to truncate.
 * @param {string} maxLength - The maximum number of characters to keep before truncation.
 * @returns The original string if it's within `maxLength`, otherwise the truncated string followed by "...".
 *
 * @example
 * ellipsize("Hello World", 5); // "Hello..."
 * ellipsize("Hi", 5);          // "Hi"
 */
export function ellipsize(text: string, maxLength: number): string {
  return text.slice(0, maxLength) + (text.length > maxLength ? "..." : "");
}

/**
 * Formats a raw property value for read-only display. When the attribute is known, its cardinality is used,
 * otherwise the shape is derived from the raw value itself (e.g. for properties not declared in the model).
 *
 * @param {unknown} value - The raw property value.
 * @param {ModelAttribute} [entry] - The attribute of the property, if known.
 * @returns {string} The formatted, human-readable value.
 */
export function formatPropertyValue(value: unknown, entry?: ModelAttribute): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if ((entry && isList(entry)) || Array.isArray(value)) {
    return Array.isArray(value) && value.length > 0 ? value.join(", ") : "—";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}
