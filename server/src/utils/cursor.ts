import { createHash } from "node:crypto";
import ValidationError from "../errors/validation.error.js";
import { FilterCondition, FilterRule, FilterSpec, FilterTarget, HierarchyScope } from "../models/types.js";

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
  /** Format version. A mismatch on decode means a stale tab from before a deploy. Not necessary, but kept for safety.*/
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
 *
 * Everything here goes through a canonicalization step before hashing (see {@link querySignature}):
 * the rules are user-ordered and some of their values are sets, so a raw `JSON.stringify` would
 * produce a different signature for two requests that mean exactly the same thing.
 */
export interface HierarchyQuerySpec {
  scope: HierarchyScope;
  sort: FilterTarget;
  direction: "asc" | "desc";
  filters: FilterSpec;
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
 * Computes a stable, order-independent signature of the scope + sort + filter spec.
 *
 * The scope is part of it: a `uuids` scope is a client-owned set that can change between two
 * page requests (a node losing a tag). Without the uuids in the signature such a
 * cursor would still validate, and its keyset comparison would then run against a different set —
 * silently skipping rows.
 *
 * @param {HierarchyQuerySpec} spec - The request parts a cursor is bound to.
 * @returns {string} A short hex digest identifying this exact scope + sort + filter combination.
 */
export function querySignature(spec: HierarchyQuerySpec): string {
  // Sort the uuids to keep signature stable on different orderings of the same uuid set
  const canonicalScope: HierarchyScope =
    spec.scope.kind === "uuids" ? { kind: "uuids", uuids: [...spec.scope.uuids].sort() } : spec.scope;

  const canonical: string = JSON.stringify({
    scope: canonicalScope,
    sort: canonicalTarget(spec.sort),
    direction: spec.direction,
    filters: canonicalFilters(spec.filters),
  });

  return createHash("sha1").update(canonical).digest("hex").slice(0, 12);
}

/**
 * Serializes a target into a stable string. Object key order is not guaranteed across the wire, so
 * the members are written out explicitly rather than stringified.
 *
 * @param {FilterTarget} target - The target to serialize.
 * @returns {string} A stable representation.
 */
function canonicalTarget(target: FilterTarget): string {
  if (target.kind === "property") {
    return `property:${target.field}`;
  } else {
    return target.kind;
  }
}

/**
 * Brings a rule list into a canonical form so that two requests meaning the same thing hash the
 * same.
 *
 * The rules are user-ordered and their values may be sets whose order carries no meaning (the label
 * selection is the obvious one). Without this, scrolling to page 2 after re-selecting the same
 * labels in a different order would fail the signature check and 400.
 *
 * @param {FilterSpec} filters - The parsed rules.
 * @returns {unknown[]} A canonical, order-independent representation.
 */
function canonicalFilters(filters: FilterSpec): unknown[] {
  return filters
    .map((rule: FilterRule) => ({
      target: canonicalTarget(rule.target),
      operator: rule.operator,
      conditions: rule.conditions
        .map((condition: FilterCondition) => {
          if (!Array.isArray(condition.value)) {
            return { comparator: condition.comparator, value: String(condition.value) };
          }

          const entries: string[] = condition.value.map((entry: unknown) => String(entry));

          // `in` is a set — selection order is meaningless. `between` is positional, and sorting it
          // would make [5, 12] and [12, 5] share a signature despite meaning different things.
          return {
            comparator: condition.comparator,
            value: condition.comparator === "in" ? entries.sort() : entries,
          };
        })
        .sort((a, b) => `${a.comparator}${a.value}`.localeCompare(`${b.comparator}${b.value}`)),
    }))
    .sort((a, b) => `${a.target}${a.operator}`.localeCompare(`${b.target}${b.operator}`));
}
