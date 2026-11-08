import type { ContentMedium } from "../models/types.js";

/**
 * Selectors of annotations: which part of the annotated Content an annotation covers (`selector` of RAMEN's
 * Annotation base node, types named after the Web Annotation data model). RAMEN core only requires a `type`; the rest
 * is checked here, per medium of the annotated Content.
 *
 * A new selector type needs its interface in {@linkcode SelectorByMedium} and an entry in
 * {@linkcode SELECTOR_BY_MEDIUM} (the compiler asks for it).
 *
 * Mirrored on the client (`client/src/utils/helper/selector.ts`), keep both in sync. Stored as JSON string, see
 * `toStoredSelector`/`fromStoredSelector` in `helper.ts`.
 *
 * @packageDocumentation
 */

/**
 * A char position in a text.
 * - Range: `start` and `end` are the first and last char, both inclusive.
 * - Zero point (between two chars, e.g. a line break): `start === end`, the offset of the char it stands before.
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

/** The selector type of a medium and its check, which returns the problems of a selector of that type */
interface SelectorDefinition {
  type: Selector["type"];
  check: (selector: Record<string, unknown>) => string[];
}

/** The selector definition of each medium */
const SELECTOR_BY_MEDIUM: Readonly<{ [M in SelectorMedium]: SelectorDefinition & { type: SelectorByMedium[M]["type"] } }> =
  {
    text: { type: "TextPositionSelector", check: checkTextPositionSelector },
  };

/**
 * Whether a value is a plain object (not `null`, not a list).
 *
 * @param {unknown} value - The value.
 * @returns {boolean} `true` for plain objects.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Whether a value is a char position: an integer that is not negative.
 *
 * @param {unknown} value - The value.
 * @returns {boolean} `true` for positions.
 */
function isPosition(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

/**
 * Checks a `TextPositionSelector`: `start` and `end` are positions, `start` is not after `end`, no other properties.
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
 * Checks the selector of an annotation on a Content: an object of the selector type of the Content's medium, valid for
 * that type. Media without a selector type accept any known one.
 *
 * @param {unknown} selector - The selector.
 * @param {ContentMedium} medium - The medium of the annotated Content.
 * @returns {string[]} The problems, empty if the selector is valid.
 */
export function checkSelector(selector: unknown, medium: ContentMedium): string[] {
  if (!isPlainObject(selector)) {
    return ["The selector must be an object."];
  }

  const expected: SelectorDefinition | undefined = (SELECTOR_BY_MEDIUM as Partial<Record<ContentMedium, SelectorDefinition>>)[
    medium
  ];

  if (expected && selector.type !== expected.type) {
    return [`Annotations on ${medium} content need a ${expected.type}, found '${String(selector.type)}'.`];
  }

  const definition: SelectorDefinition | undefined = Object.values<SelectorDefinition>(SELECTOR_BY_MEDIUM).find(
    ({ type }) => type === selector.type,
  );

  if (!definition) {
    return [`Unknown selector type '${String(selector.type)}'.`];
  }

  return definition.check(selector);
}
