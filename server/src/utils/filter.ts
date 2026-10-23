import ValidationError from "../errors/validation.error.js";
import UnknownFilterFieldError from "../errors/unknownFilterField.error.js";
import { IGuidelines } from "../models/IGuidelines.js";
import {
  FilterComparator,
  FilterCondition,
  FilterOperator,
  FilterRule,
  FilterSpec,
  FilterTarget,
  PropertyConfig,
  PropertyConfigDataType,
} from "../models/types.js";
import { isArray, isBoolean, isDate, isNumeric, isString, isTime } from "./propertyType.js";

/**
 * A property config whose datatype is known. `distinct` has no entry in the guidelines, so the type is
 * the only key guaranteed to be there.
 */
type TypedPropertyConfig = Partial<PropertyConfig> & Pick<PropertyConfig, "type">;

/**
 * Max characters of a Content's text used as its `distinct` value. Bounds the sort key (and
 * therefore the cursor size) and what the search box matches against; the payload is never truncated.
 */
export const SORT_KEY_MAX_LENGTH: number = 500;

/**
 * Which comparators make sense for which datatype. Not cosmetic: `dateBefore` on a number would make
 * Neo4j throw, so an impossible combination has to be a 400 here rather than a 500 later.
 */
const COMPARATORS_BY_DATATYPE: Record<PropertyConfigDataType, FilterComparator[]> = {
  String: ["contains", "notContains", "startsWith", "endsWith", "equals", "notEquals", "in", "isEmpty", "isNotEmpty"],
  Integer: ["equals", "notEquals", "lt", "lte", "gt", "gte", "between", "in", "isEmpty", "isNotEmpty"],
  Float: ["equals", "notEquals", "lt", "lte", "gt", "gte", "between", "in", "isEmpty", "isNotEmpty"],
  Boolean: ["equals", "notEquals", "isEmpty", "isNotEmpty"],
  Date: ["dateIs", "dateBefore", "dateAfter", "between", "isEmpty", "isNotEmpty"],
  DateTime: ["dateIs", "dateBefore", "dateAfter", "between", "isEmpty", "isNotEmpty"],
  Time: ["dateIs", "dateBefore", "dateAfter", "between", "isEmpty", "isNotEmpty"],
  Array: ["in", "isEmpty", "isNotEmpty"],
  Object: ["isEmpty", "isNotEmpty"],
};

/**
 * Comparators allowed on a property that declares `options` — a closed set of values. Substring and
 * ordering comparators are meaningless there: the only sensible question about an enum is which of
 * its members a node carries.
 */
const ENUM_COMPARATORS: FilterComparator[] = ["equals", "notEquals", "in", "isEmpty", "isNotEmpty"];

/** Comparators whose value is a list rather than a raw value. */
const LIST_COMPARATORS: FilterComparator[] = ["in", "between"];

/** Comparators that ignore their value entirely. */
const VALUELESS_COMPARATORS: FilterComparator[] = ["isEmpty", "isNotEmpty"];

/**
 * Extracts a set of node properties that can be used as filter or sort fields from the guidelines.
 *
 * Acts as an injection allowlist: Since Cypher cannot parameterize a property name, the name must be
 * injected directly into the query. Nothing outside this map ever reaches {@link targetExpression},
 * so unwanted cypher errors are impossible.
 *
 * @param {IGuidelines} guidelines - The guidelines.
 * @returns {Map<string, PropertyConfig>} Property name -> its complete configuration, not just the field name.
 */
export function filterableProperties(guidelines: IGuidelines): Map<string, PropertyConfig> {
  const configs: PropertyConfig[] = [
    ...(guidelines.collections.properties.system ?? []),
    ...(guidelines.collections.properties.base ?? []),
    ...guidelines.collections.types.flatMap((type) => type.properties ?? []),
  ];

  const properties = new Map<string, PropertyConfig>();

  configs.forEach((config: PropertyConfig) => {
    if (config?.name && !properties.has(config.name)) {
      properties.set(config.name, config);
    }
  });

  return properties;
}

/**
 * Validates one filter/sort target against the allowlist.
 *
 * Used for every rule **and** for the sort, so there is exactly one way to turn request data into a
 * {@link FilterTarget}. A target that skips this function is an injection hole.
 *
 * @param {unknown} raw - The target as it arrived in the body.
 * @param {Map<string, PropertyConfig>} properties - The allowlist from {@link filterableProperties}.
 * @param {boolean} forSort - Whether the target is being used as a sort key.
 * @returns {FilterTarget} The validated target.
 * @throws {UnknownFilterFieldError} If a property is not defined in the guidelines.
 * @throws {ValidationError} If the target is malformed or not usable in this position.
 */
export function parseFilterTarget(raw: unknown, properties: Map<string, PropertyConfig>, forSort: boolean = false): FilterTarget {
  if (!raw || typeof raw !== "object") {
    throw new ValidationError("A filter target is required.");
  }

  const target = raw as { kind?: unknown; field?: unknown };

  if (target.kind === "distinct") {
    return { kind: "distinct" };
  }

  if (target.kind === "labels") {
    if (forSort) {
      throw new ValidationError("Cannot sort by node labels.");
    }

    return { kind: "labels" };
  }

  if (target.kind === "property") {
    if (typeof target.field !== "string" || target.field === "") {
      throw new ValidationError("A `property` target needs a `field`.");
    }

    if (!properties.has(target.field)) {
      throw new UnknownFilterFieldError(target.field);
    }

    return { kind: "property", field: target.field };
  }

  throw new ValidationError(`Unknown filter target kind "${String(target.kind)}".`);
}

/**
 * The property config a scalar target compares as. `labels` never gets here — it is a set, handled on its
 * own path in {@link parseFilterSpec} and {@link buildFilterCypher}.
 *
 * @param {FilterTarget} target - A validated target.
 * @param {Map<string, PropertyConfig>} properties - The allowlist.
 * @returns {TypedPropertyConfig} The config of the target's property, or a bare string config if it has none.
 */
function configOf(target: FilterTarget, properties: Map<string, PropertyConfig>): TypedPropertyConfig {
  if (target.kind === "labels") {
    throw new ValidationError("Node labels have no datatype.");
  }

  // `distinct` is `label` or a slice of `text` -> always a string
  const fallback: TypedPropertyConfig = { type: "String" };

  if (target.kind === "distinct") {
    return fallback;
  } else {
    return properties.get(target.field) ?? fallback;
  }
}

/**
 * Coerces one JSON value into what the driver should send, and rejects values that cannot represent
 * the datatype.
 *
 * Numbers stay JS numbers — Cypher compares INTEGER and FLOAT without complaint. Temporals are
 * normalized to the string form they are stored in (`YYYY-MM-DD`, ISO 8601, `HH:mm:ss`). These forms
 * are fixed-width, so comparing them as strings orders them chronologically.
 *
 * @param {unknown} value - The raw value.
 * @param {TypedPropertyConfig} config - The config of the property to coerce to.
 * @returns {string | number | boolean} The coerced value.
 * @throws {ValidationError} If the value cannot represent the datatype.
 */
function coerceValue(value: unknown, config: TypedPropertyConfig): string | number | boolean {
  if (isString(config) || isArray(config)) {
    if (typeof value !== "string") {
      throw new ValidationError(`Expected a string value, got ${typeof value}.`);
    }

    return value;
  }

  if (isBoolean(config)) {
    if (typeof value !== "boolean") {
      throw new ValidationError(`Expected a boolean value, got ${typeof value}.`);
    }

    return value;
  }

  if (isNumeric(config)) {
    const parsed: number = Number(value);

    if (Number.isNaN(parsed)) {
      throw new ValidationError(`Expected a numeric value, got "${String(value)}".`);
    }

    return parsed;
  }

  // A bare time is no valid input for `Date`, so it is checked by its shape instead
  if (isTime(config)) {
    if (typeof value !== "string" || !/^\d{2}:\d{2}:\d{2}$/.test(value)) {
      throw new ValidationError(`Expected a time value (HH:mm:ss), got "${String(value)}".`);
    }

    return value;
  }

  const parsed: Date = new Date(value as string | number);

  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`Expected a date value, got "${String(value)}".`);
  }

  const iso: string = parsed.toISOString();

  if (isDate(config)) {
    return iso.slice(0, 10);
  } else {
    return iso;
  }
}

/**
 * Reads and validates the conditions of one rule when it is targeted on a node property (e.g. `status`).
 *
 * Conditions with no user input are dropped — an untouched control contributes `null` or `""`, and
 * turning that into a predicate would filter everything away. An **empty array is not empty input**:
 * `in` with `[]` means "match nothing", which is what deselecting every label should do.
 *
 * A property declaring `options` is a closed set: only {@link ENUM_COMPARATORS} apply, and every
 * value has to be one of the declared members — otherwise a filter can silently match nothing.
 *
 * @param {unknown[]} raw - The rule's `conditions` array.
 * @param {TypedPropertyConfig} config - The config of the property the target compares as.
 * @returns {FilterCondition[]} The validated, pruned conditions.
 * @throws {ValidationError} If a condition is malformed, its comparator does not fit the datatype,
 *   or its value is not a declared option.
 */
function parsePropertyConditions(raw: unknown[], config: TypedPropertyConfig): FilterCondition[] {
  const options: string[] | number[] | undefined = config.options;
  const supported: FilterComparator[] = COMPARATORS_BY_DATATYPE[config.type];

  const allowed: FilterComparator[] = options?.length
    ? supported.filter((comparator) => ENUM_COMPARATORS.includes(comparator))
    : supported;

  const conditions: FilterCondition[] = [];

  raw.forEach((rawCondition: unknown) => {
    if (!rawCondition || typeof rawCondition !== "object") {
      throw new ValidationError("A filter condition must be an object.");
    }

    const { comparator, value } = rawCondition as { comparator?: unknown; value?: unknown };

    if (typeof comparator !== "string" || !allowed.includes(comparator as FilterComparator)) {
      throw new ValidationError(`Comparator "${String(comparator)}" cannot be used on a ${config.type} value.`);
    }

    if (VALUELESS_COMPARATORS.includes(comparator as FilterComparator)) {
      conditions.push({ comparator: comparator as FilterComparator, value: null });

      return;
    }

    if (value === null || value === undefined || value === "") {
      return;
    }

    if (LIST_COMPARATORS.includes(comparator as FilterComparator)) {
      if (!Array.isArray(value)) {
        throw new ValidationError(`Comparator "${comparator}" needs an array value.`);
      }

      if (comparator === "between" && value.length !== 2) {
        throw new ValidationError(`Comparator "between" needs exactly two values.`);
      }

      conditions.push({
        comparator: comparator as FilterComparator,
        value: value.map((entry: unknown) => assertOption(coerceValue(entry, config), options)),
      });

      return;
    }

    conditions.push({
      comparator: comparator as FilterComparator,
      value: assertOption(coerceValue(value, config), options),
    });
  });

  return conditions;
}

/**
 * Checks a coerced value against a property's declared value options if it is an enum-like data type.
 *
 * Compared as strings, since JSON does not distinguish `1` from `"1"` reliably enough to reject a
 * value on that basis alone.
 *
 * @param {string | number | boolean} value - The coerced value.
 * @param {(string | number)[] | undefined} options - The declared members, if any.
 * @returns {string | number | boolean} The value, unchanged.
 * @throws {ValidationError} If the property declares options and the value is not one of them.
 */
function assertOption(value: string | number | boolean, options?: string[] | number[]): string | number | boolean {
  const members: (string | number)[] = options ?? [];

  if (members.length > 0 && !members.some((option: string | number) => option.toString() === value.toString())) {
    throw new ValidationError(`"${value.toString()}" is not one of the allowed values (${members.join(", ")}).`);
  }

  return value;
}

/**
 * Reads and validates the operator that concatenates the conditions of one rule.
 *
 * Can be `and` or `or`.
 *
 * @param {unknown} operator - The rule's operator.
 * @returns {FilterOperator} The validated operator.
 * @throws {ValidationError} If the operator is not a valid string.
 */
function parseConcatenationOperator(operator: unknown): FilterOperator {
  if (typeof operator !== "string") {
    throw new ValidationError("A filter operator must be a string.");
  }

  if (operator === "and" || operator === "AND") {
    return "and";
  } else if (operator === "or" || operator === "OR") {
    return "or";
  } else {
    throw new ValidationError(`Unknown filter operator "${operator}".`);
  }
}

/**
 * Reads and validates the filter rules of a request. Rules left without conditions disappear, so
 * the default query (empty search box) is a genuine no-op rather than a predicate.
 *
 * @param {unknown} raw - The `filters` value from the body.
 * @param {Map<string, PropertyConfig>} properties - The allowlist from {@link filterableProperties}.
 * @returns {FilterSpec} The validated, pruned rules.
 * @throws {ValidationError} If a rule is malformed or a comparator does not fit its datatype.
 * @throws {UnknownFilterFieldError} If a rule names a property the guidelines do not define.
 */
export function parseFilterSpec(raw: unknown, properties: Map<string, PropertyConfig>): FilterSpec {
  if (raw === undefined || raw === null) {
    return [];
  }

  if (!Array.isArray(raw)) {
    throw new ValidationError("`filters` must be an array of rules.");
  }

  const rules: FilterSpec = [];

  raw.forEach((rawRule: unknown) => {
    if (!rawRule || typeof rawRule !== "object") {
      throw new ValidationError("A filter rule must be an object.");
    }

    const rule = rawRule as { target?: unknown; operator?: unknown; conditions?: unknown };

    if (!Array.isArray(rule.conditions)) {
      throw new ValidationError("A filter rule needs a `conditions` array.");
    }

    const target: FilterTarget = parseFilterTarget(rule.target, properties);
    const operator: FilterOperator = parseConcatenationOperator(rule.operator);

    // A label set is matched as a set, not compared as a scalar, so it never enters the datatype
    // machinery: one comparator, one Cypher fragment
    let conditions: FilterCondition[];

    if (target.kind === "labels") {
      conditions = parseLabelConditions(rule.conditions);
    } else {
      conditions = parsePropertyConditions(rule.conditions, configOf(target, properties));
    }

    if (conditions.length > 0) {
      rules.push({ target, operator, conditions });
    }
  });

  return rules;
}

/**
 * Reads the conditions of a `labels` rule, which only ever means "carries one of these labels".
 *
 * Tailored very specific on checking the labels of neo4j nodes instead of their properties
 *
 * @param {unknown[]} raw - The rule's `conditions` array.
 * @returns {FilterCondition[]} The validated conditions.
 * @throws {ValidationError} If a condition is not an `in` over an array of strings.
 */
function parseLabelConditions(raw: unknown[]): FilterCondition[] {
  return raw.map((rawCondition: unknown) => {
    const { comparator, value } = (rawCondition ?? {}) as { comparator?: unknown; value?: unknown };

    if (comparator !== "in" || !Array.isArray(value) || value.some((label) => typeof label !== "string")) {
      throw new ValidationError("A `labels` rule needs an `in` comparator over an array of label strings.");
    }

    return { comparator: "in", value };
  });
}

/**
 * Creates the Cypher statement that determines a key for further sorting or filtering operations.
 *
 * @param {FilterTarget} target - A validated target that has been through {@link parseFilterTarget}.
 * @returns {string} - A Cypher expression.
 * @throws {ValidationError} If the target is invalid (e.g. sorting by node labels with `labels` is not allowed currently).
 * @example
 * // Passing a node's "status" property as sort value or filtering rule:
 * {
 *   kind: "property",
 *   field: "status"
 * }
 *
 * // returns:
 * `n.status`
 */
export function targetExpression(target: FilterTarget): string {
  if (target.kind === "distinct") {
    return `coalesce(n.label, left(n.text, $previewLength), '')`;
  }

  if (target.kind === "property") {
    return `n.\`${target.field}\``;
  }

  throw new ValidationError("Node labels have no scalar value.");
}

/**
 * Builds the Cypher predicate for *one* condition of a rule.
 *
 * Note on Null semantics: a condition on a property only ever matches nodes that **carry** that property.
 * This holds for negative comparators too — `status notEquals "draft"` returns non-draft letters, not
 * every node in the graph that has no status. Filtering is meant to narrow a listing down to a
 * subset, and nodes that cannot answer the question at all would only pollute it.
 * Cypher gives this for free: `n.property <> 'value'` is `null` for a missing property, hence false. Use the
 * `isEmpty` comparator when the nodes *without* a value should be displayed.
 *
 * @param {string} expression - The left-hand side from {@link targetExpression}.
 * @param {TypedPropertyConfig} config - The config of the property being compared.
 * @param {FilterCondition} condition - The condition.
 * @param {string} name - The parameter name the value is bound under.
 * @returns {string} A Cypher boolean expression.
 */
function conditionCypher(expression: string, config: TypedPropertyConfig, condition: FilterCondition, name: string): string {
  const predicate: string = buildPredicate({ comparator: condition.comparator, lhs: expression, rhs: `$${name}`, name, config });

  return `(${predicate})`;
}

/**
 * Builds the bare comparison Cypher predicate, value against value.
 *
 * Three cases need special treatment:
 *
 * - The substring comparators lower-case both sides.
 * - `between` reads its two bounds out of a single list parameter, so it needs the bare `name`
 *   instead of the ready-made `rhs`.
 * - `isEmpty`/`isNotEmpty` treat an empty string as "no value", but only for text: comparing `''`
 *   against a number would compare across types.
 *
 * @param {object} params - The prepared fragments of the comparison.
 * @param {FilterComparator} params.comparator - The comparator to render.
 * @param {string} params.lhs - The left-hand side (= the node value).
 * @param {string} params.rhs - The parameter reference.
 * @param {string} params.name - The bare parameter name, for the list comparators.
 * @param {TypedPropertyConfig} params.config - The config of the property being compared.
 * @returns {string} A Cypher boolean expression.
 * @throws {ValidationError} If the comparator is not one this function can render.
 */
function buildPredicate(params: {
  comparator: FilterComparator;
  lhs: string;
  rhs: string;
  name: string;
  config: TypedPropertyConfig;
}): string {
  const { comparator, lhs, rhs, name, config } = params;

  switch (comparator) {
    case "contains":
      return `toLower(${lhs}) CONTAINS toLower(${rhs})`;
    case "notContains":
      return `NOT toLower(${lhs}) CONTAINS toLower(${rhs})`;
    case "startsWith":
      return `toLower(${lhs}) STARTS WITH toLower(${rhs})`;
    case "endsWith":
      return `toLower(${lhs}) ENDS WITH toLower(${rhs})`;
    case "equals":
    case "dateIs":
      return `${lhs} = ${rhs}`;
    case "notEquals":
      return `${lhs} <> ${rhs}`;
    case "lt":
    case "dateBefore":
      return `${lhs} < ${rhs}`;
    case "lte":
      return `${lhs} <= ${rhs}`;
    case "gt":
    case "dateAfter":
      return `${lhs} > ${rhs}`;
    case "gte":
      return `${lhs} >= ${rhs}`;
    case "between":
      return `${lhs} >= $${name}[0] AND ${lhs} <= $${name}[1]`;
    case "in":
      return `${lhs} IN $${name}`;
    case "isEmpty":
      return isString(config) ? `${lhs} IS NULL OR ${lhs} = ''` : `${lhs} IS NULL`;
    case "isNotEmpty":
      return isString(config) ? `${lhs} IS NOT NULL AND ${lhs} <> ''` : `${lhs} IS NOT NULL`;
    default:
      throw new ValidationError(`Unsupported comparator "${String(comparator)}".`);
  }
}

/**
 * Builds the WHERE body for a cypher query that needs filtering.
 *
 * Rules are ANDed with each other; the conditions inside a rule are joined by that rule's operator.
 * Values are always parameters — only the property name is interpolated, and only after
 * {@link parseFilterTarget} has checked it against the allowlist.
 *
 * @param {FilterSpec} spec - The validated filter rules.
 * @param {Map<string, PropertyConfig>} properties - The allowlist, for datatype lookup.
 * @returns {{ clause: string; params: Record<string, unknown> }} A full Cypher predicate (or `"true"` when
 *   there is nothing to filter) and the parameters it refers to.
 */
export function buildFilterCypher(
  spec: FilterSpec,
  properties: Map<string, PropertyConfig>,
): { clause: string; params: Record<string, unknown> } {
  const params: Record<string, unknown> = {};
  const clauses: string[] = [];

  let paramIndex: number = 0;

  spec.forEach((rule: FilterRule) => {
    const predicates: string[] = rule.conditions.map((condition: FilterCondition) => {
      const name: string = `f${paramIndex++}`;

      params[name] = condition.value;

      // Filtering by node labels is a special case since comparison doesn't happen on property level
      if (rule.target.kind === "labels") {
        return `(size(apoc.coll.intersection($${name}, labels(n))) > 0)`;
      }

      return conditionCypher(targetExpression(rule.target), configOf(rule.target, properties), condition, name);
    });

    if (predicates.length > 0) {
      clauses.push(`(${predicates.join(rule.operator === "or" ? " OR " : " AND ")})`);
    }
  });

  return {
    clause: clauses.length > 0 ? clauses.join("\n      AND ") : "true",
    params,
  };
}
