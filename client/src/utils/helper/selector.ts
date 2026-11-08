import type { ContentMedium } from "../../models/types";

/**
 * Selectors of annotations: which part of the annotated Content an annotation covers, stored in the `selector` property
 * of RAMEN's Annotation base node. RAMEN core only requires a non-empty `type` (the `Selector` data type is an Object);
 * everything else about a selector is checked here. The selector types are named after the Web Annotation data model.
 *
 * The selector of an annotation depends on the medium of the annotated Content ({@linkcode SelectorByMedium}). A new
 * one (e.g. `SvgSelector` for images) is added here only, in both copies of this file:
 * 1. its interface, as entry of its medium in {@linkcode SelectorByMedium},
 * 2. its `type` in {@linkcode SELECTOR_TYPE_BY_MEDIUM} and its check in {@linkcode SELECTOR_CHECKS} (the compiler asks
 *    for both once the entry exists).
 *
 * Validation and storage work on any selector. Annotations of the new medium are typed `IAnnotation<"image">`, the
 * text code (`IAnnotation` = `IAnnotation<"text">`) stays untouched.
 *
 * Mirrored on the server (`server/src/utils/selector.ts`), keep both in sync. The functions at the end are client only.
 *
 * @packageDocumentation
 */

/**
 * A position in a text, counted in characters of the text.
 * - Range: `start` is the first char, `end` the last char, both inclusive.
 * - Zero point (a position between two characters, e.g. a line break): `start` and `end` are both the offset of the
 *   char it stands before, as a counter of the plain text.
 */
export interface TextPositionSelector {
  type: "TextPositionSelector";
  start: number;
  end: number;
}

/** The selector of annotations on a Content of each medium. Media without an entry have no selector yet. */
export interface SelectorByMedium {
  text: TextPositionSelector;
}

/** The media whose annotations have a selector */
export type SelectorMedium = keyof SelectorByMedium & ContentMedium;

/** The selectors the app writes and checks */
export type Selector = SelectorByMedium[SelectorMedium];

/** The selector `type` of each medium, for the checks at runtime */
export const SELECTOR_TYPE_BY_MEDIUM: Readonly<{ [M in SelectorMedium]: SelectorByMedium[M]["type"] }> = {
  text: "TextPositionSelector",
};

/** The checks of the selector types, each returning the problems of a selector of its type */
const SELECTOR_CHECKS: Readonly<Record<Selector["type"], (selector: Record<string, unknown>) => string[]>> = {
  TextPositionSelector: checkTextPositionSelector,
};

/**
 * Whether a value is a plain object (not `null`, not a list).
 *
 * @param {unknown} value - The value.
 * @returns {boolean} `true` for plain objects.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Whether an object has a key of its own (not inherited, e.g. `toString`).
 *
 * @param {object} object - The object.
 * @param {string} key - The key.
 * @returns {boolean} `true` if the key is the object's own.
 */
function hasOwnKey(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

/**
 * Whether a value is a character position: an integer that is not negative.
 *
 * @param {unknown} value - The value.
 * @returns {boolean} `true` for positions.
 */
function isPosition(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

/**
 * Checks a `TextPositionSelector`: `start` and `end` are positions, `start` is not after `end`, and there are no other
 * properties.
 *
 * @param {Record<string, unknown>} selector - The selector, its `type` already checked.
 * @returns {string[]} The problems, empty if the selector is valid.
 */
function checkTextPositionSelector(selector: Record<string, unknown>): string[] {
  const problems: string[] = [];

  for (const key of ["start", "end"]) {
    if (!isPosition(selector[key])) {
      problems.push(`Selector property '${key}' must be an integer of at least 0.`);
    }
  }

  if (isPosition(selector.start) && isPosition(selector.end) && selector.start > selector.end) {
    problems.push("Selector property 'start' must not be greater than 'end'.");
  }

  for (const key of Object.keys(selector)) {
    if (!["type", "start", "end"].includes(key)) {
      problems.push(`Selector property '${key}' is not allowed for a TextPositionSelector.`);
    }
  }

  return problems;
}

/**
 * Whether a value is a valid `TextPositionSelector`.
 *
 * @param {unknown} value - The value.
 * @returns {boolean} `true` if it is one and has no problems.
 */
export function isTextPositionSelector(value: unknown): value is TextPositionSelector {
  return isPlainObject(value) && value.type === "TextPositionSelector" && checkTextPositionSelector(value).length === 0;
}

/**
 * Checks the selector of an annotation on a Content: it must be an object of the selector type of the Content's medium
 * (see {@linkcode SELECTOR_TYPE_BY_MEDIUM}) and valid for that type.
 *
 * @param {unknown} selector - The selector.
 * @param {ContentMedium} medium - The medium of the annotated Content.
 * @returns {string[]} The problems, empty if the selector is valid.
 */
export function checkSelector(selector: unknown, medium: ContentMedium): string[] {
  if (!isPlainObject(selector)) {
    return ["The selector must be an object."];
  }

  const type: unknown = selector.type;
  const expectedType: Selector["type"] | undefined = hasOwnKey(SELECTOR_TYPE_BY_MEDIUM, medium)
    ? SELECTOR_TYPE_BY_MEDIUM[medium as SelectorMedium]
    : undefined;

  if (expectedType && type !== expectedType) {
    return [`Annotations on ${medium} content need a ${expectedType}, found '${String(type)}'.`];
  }

  if (typeof type !== "string" || !hasOwnKey(SELECTOR_CHECKS, type)) {
    return [`Unknown selector type '${String(type)}'.`];
  }

  return SELECTOR_CHECKS[type as Selector["type"]](selector);
}

// ----- Client only -----

/**
 * Creates a `TextPositionSelector`.
 *
 * @param {number} start - The first char of a range, or the offset of a zero point.
 * @param {number} end - The last char of a range (inclusive), or the offset of a zero point.
 * @returns {TextPositionSelector} The selector.
 */
export function createTextPositionSelector(start: number, end: number): TextPositionSelector {
  return { type: "TextPositionSelector", start, end };
}
