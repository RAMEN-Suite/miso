import { createHash } from "node:crypto";
import ValidationError from "../errors/validation.error.js";

/** Current cursor format version. Bump when the shape of {@link HierarchyCursor} changes. */
export const CURSOR_VERSION: number = 1;

/**
 * Opaque, server-produced position within a sorted, filtered hierarchy listing.
 *
 * The client never builds or inspects this — it stores the encoded string it was handed and echoes
 * it back verbatim (see {@link encodeCursor}). Keeping it opaque means the shape of the sort key
 * (`k`) can grow — a secondary sort, a per-type property — without any client or URL change.
 */
export interface HierarchyCursor {
  /** Format version. A mismatch on decode means a stale bookmark/tab from before a deploy. Not necessary, but kept for safety.*/
  v: number;
  /** Group rank of the last returned item (0 = Collection, 1 = Content). Leading sort component. */
  g: number;
  /** Sort key values of the last returned item, in the order of the active sort spec. */
  k: (string | number)[];
  /** UUID of the last returned item — the uniqueness tiebreaker if everything else is the same */
  u: string;
  /** Signature of the sort + filter spec the cursor was produced under. */
  s: string;
}

/**
 * The parts of a request that a cursor is only valid for. If any of these change, the cursor's
 * keyset comparison would run against a different ordering/set and silently skip or repeat rows —
 * so a hash of this is stored in the cursor and checked on decode.
 */
export interface HierarchyQuerySpec {
  parentUuid: string | null;
  sort: string;
  direction: "asc" | "desc";
  nodeLabels: string[];
  search: string;
}

/**
 * Decodes a cursor string produced by {@link encodeCursor} and validates it against the current
 * request's spec. A stale or malformed cursor throws an {@link ValidationError}. This can be the case if
 * a cursor comes with the request even though the request params have changed (which would need another data set
 * instead of new page of the same set).
 *
 * This is more of a safety net than a requirement - the client sets the cursor to null if any filter changes.
 *
 * @param {string} raw - The base64url cursor string echoed back by the client.
 * @param {string} expectedSignature - The signature of the current request's sort + filter spec.
 * @returns {HierarchyCursor} The decoded, validated cursor.
 * @throws {ValidationError} If the cursor is malformed, of a different version, or bound to a
 *   different sort + filter spec.
 */
export function decodeCursor(raw: string, expectedSignature: string): HierarchyCursor {
  let parsed: HierarchyCursor;

  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw new ValidationError("Malformed pagination cursor.");
  }

  if (parsed.v !== CURSOR_VERSION) {
    throw new ValidationError("Outdated pagination cursor. Please reload.");
  }

  if (parsed.s !== expectedSignature) {
    throw new ValidationError("Pagination cursor does not match the current sort/filter. Please reload.");
  }

  return parsed;
}

/**
 * Encodes a cursor into a URL-safe base64 string. This is encoding, not encryption — it carries no
 * secrets, only a position within data the caller may already read.
 *
 * @param {HierarchyCursor} cursor - The cursor to encode.
 * @returns {string} The base64url-encoded cursor string.
 */
export function encodeCursor(cursor: HierarchyCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

/**
 * Computes a stable, order-independent signature of the sort + filter spec.
 *
 * @param {HierarchyQuerySpec} spec - The request parts a cursor is bound to.
 * @returns {string} A short hex digest identifying this exact sort + filter combination.
 */
export function querySignature(spec: HierarchyQuerySpec): string {
  const canonical: string = JSON.stringify({
    parentUuid: spec.parentUuid ?? null,
    sort: spec.sort,
    direction: spec.direction,
    // Sort node labels so selection order never changes the signature
    nodeLabels: [...spec.nodeLabels].sort(),
    search: spec.search,
  });

  return createHash("sha1").update(canonical).digest("hex").slice(0, 12);
}
