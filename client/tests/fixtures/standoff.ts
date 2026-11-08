import { ApiJson } from "../../src/editors/text/src/models/types";

/**
 * A standoff annotation to build a fixture from, with the `start` and `end` of its selector. Both are inclusive, like in
 * the database. Without `end` the annotation is a zero point that sits before the character at `start`.
 */
interface AnnotationSpec {
  type: string;
  start: number;
  end?: number;
}

/**
 * Builds a standoff document as the API returns it. Uuids are `<type>-<position in the list>` so that tests can
 * reference them and the converter's uuid tiebreaks stay deterministic.
 *
 * @param {string} text - The plain text of the document.
 * @param {AnnotationSpec[]} annotations - The annotations on the text.
 * @returns {ApiJson} The standoff document.
 */
function standoff(text: string, annotations: AnnotationSpec[]): ApiJson {
  return {
    text,
    annotations: annotations.map(({ type, start, end }, i) => {
      const isZeroPoint: boolean = end === undefined;

      return {
        node: {
          data: {
            uuid: `${type}-${i}`,
            type,
            selector: { type: "TextPositionSelector" as const, start, end: end ?? start },
            text: isZeroPoint ? "" : text.slice(start, (end ?? start) + 1),
            ...(isZeroPoint ? { isZeroPoint: true as const } : {}),
          },
          nodeLabels: ["Annotation"],
        },
        connectedNodes: [],
      };
    }),
  };
}

/** Two adjacent paragraphs covering the whole text. */
export const twoParagraphs: ApiJson = standoff("HelloWorld", [
  { type: "p", start: 0, end: 4 },
  { type: "p", start: 5, end: 9 },
]);

/** One paragraph with overlapping (`add-1`/`del-2`) and nested (`add-3` in `add-1`) inline annotations. */
export const inlineOverlap: ApiJson = standoff("abcdefghij", [
  { type: "p", start: 0, end: 9 },
  { type: "add", start: 1, end: 5 },
  { type: "del", start: 3, end: 7 },
  { type: "add", start: 2, end: 4 },
]);

/**
 * Text not covered by any paragraph: `"Hi "` before, `"  "` (whitespace only) between and `" Bye"` after the two
 * paragraphs `"Alpha"` [3,7] and `"Beta"` [10,13].
 */
export const gaps: ApiJson = standoff("Hi Alpha  Beta Bye", [
  { type: "p", start: 3, end: 7 },
  { type: "p", start: 10, end: 13 },
]);

/** Zero points at the start (0), in the middle (3) and after the last character (10), plus a line break at 6. */
export const zeroPoints: ApiJson = standoff("abcdefghij", [
  { type: "p", start: 0, end: 9 },
  { type: "metamark", start: 0 },
  { type: "metamark", start: 3 },
  { type: "lb", start: 6 },
  { type: "metamark", start: 10 },
]);

/** An `opener` block classification on the first of two paragraphs. */
export const blockClassification: ApiJson = standoff("Dear Sir,Body.", [
  { type: "p", start: 0, end: 8 },
  { type: "p", start: 9, end: 13 },
  { type: "opener", start: 0, end: 8 },
]);

/**
 * Characters that are easy to miscount: an emoji (two UTF-16 code units, [1,2]), a combining accent ([4]),
 * a no-break space ([5]) and a tab ([7]). `add-1` covers `"b"` plus its combining accent.
 */
export const unicode: ApiJson = standoff("a😀b́ c\td", [
  { type: "p", start: 0, end: 8 },
  { type: "add", start: 3, end: 4 },
]);

/** Two annotations of a type that is not in the config. */
export const unconfigured: ApiJson = standoff("abc", [
  { type: "p", start: 0, end: 2 },
  { type: "unknownType", start: 0, end: 1 },
  { type: "unknownType", start: 1, end: 2 },
]);
