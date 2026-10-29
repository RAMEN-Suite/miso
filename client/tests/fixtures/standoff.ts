import { ApiJson } from "../../src/editors/text/src/models/types";

/**
 * A standoff annotation to build a fixture from. Indices are inclusive, like in the database.
 * Without `endIndex` the annotation is a zero point that sits before the character at `startIndex`.
 */
interface AnnotationSpec {
  type: string;
  startIndex: number;
  endIndex?: number;
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
    annotations: annotations.map(({ type, startIndex, endIndex }, i) => {
      const isZeroPoint: boolean = endIndex === undefined;

      return {
        node: {
          data: {
            uuid: `${type}-${i}`,
            type,
            startIndex,
            endIndex: endIndex ?? startIndex,
            text: isZeroPoint ? "" : text.slice(startIndex, (endIndex ?? startIndex) + 1),
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
  { type: "p", startIndex: 0, endIndex: 4 },
  { type: "p", startIndex: 5, endIndex: 9 },
]);

/** One paragraph with overlapping (`add-1`/`del-2`) and nested (`add-3` in `add-1`) inline annotations. */
export const inlineOverlap: ApiJson = standoff("abcdefghij", [
  { type: "p", startIndex: 0, endIndex: 9 },
  { type: "add", startIndex: 1, endIndex: 5 },
  { type: "del", startIndex: 3, endIndex: 7 },
  { type: "add", startIndex: 2, endIndex: 4 },
]);

/**
 * Text not covered by any paragraph: `"Hi "` before, `"  "` (whitespace only) between and `" Bye"` after the two
 * paragraphs `"Alpha"` [3,7] and `"Beta"` [10,13].
 */
export const gaps: ApiJson = standoff("Hi Alpha  Beta Bye", [
  { type: "p", startIndex: 3, endIndex: 7 },
  { type: "p", startIndex: 10, endIndex: 13 },
]);

/** Zero points at the start (0), in the middle (3) and after the last character (10), plus a line break at 6. */
export const zeroPoints: ApiJson = standoff("abcdefghij", [
  { type: "p", startIndex: 0, endIndex: 9 },
  { type: "metamark", startIndex: 0 },
  { type: "metamark", startIndex: 3 },
  { type: "lb", startIndex: 6 },
  { type: "metamark", startIndex: 10 },
]);

/** An `opener` block classification on the first of two paragraphs. */
export const blockClassification: ApiJson = standoff("Dear Sir,Body.", [
  { type: "p", startIndex: 0, endIndex: 8 },
  { type: "p", startIndex: 9, endIndex: 13 },
  { type: "opener", startIndex: 0, endIndex: 8 },
]);

/**
 * Characters that are easy to miscount: an emoji (two UTF-16 code units, [1,2]), a combining accent ([4]),
 * a no-break space ([5]) and a tab ([7]). `add-1` covers `"b"` plus its combining accent.
 */
export const unicode: ApiJson = standoff("a😀b́ c\td", [
  { type: "p", startIndex: 0, endIndex: 8 },
  { type: "add", startIndex: 3, endIndex: 4 },
]);

/** Two annotations of a type that is not in the guidelines. */
export const unconfigured: ApiJson = standoff("abc", [
  { type: "p", startIndex: 0, endIndex: 2 },
  { type: "unknownType", startIndex: 0, endIndex: 1 },
  { type: "unknownType", startIndex: 1, endIndex: 2 },
]);
