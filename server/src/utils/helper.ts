import { Request } from "express";
import { isDate, isDateTime, isDuration, isInt, isLocalDateTime, isLocalTime, isTime, types } from "neo4j-driver";
import {
  CursorData,
  FilterSpec,
  FilterTarget,
  HierarchyQuery,
  HierarchyScope,
  NodeStatusObject,
  PropertyConfig,
} from "../models/types.js";
import { parseFilterSpec, parseFilterTarget } from "./filter.js";
import ICharacter from "../models/ICharacter.js";
import NotFoundError from "../errors/notFound.error.js";
import ValidationError from "../errors/validation.error.js";
import { TOOL_URL_MAPPING } from "../constants.js";

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
 * Creates an array of Character nodes from a given string.
 *
 * Used for preprocessing texts that came attached to Annotations or Collections and have to be created
 * from scratch in the database.
 *
 * @param {string} text - The string to create characters from.
 * @return {ICharacter[]} An array of ICharacter objects, one for each character in the input string.
 */
export function createCharactersFromText(text: string): ICharacter[] {
  return text.split("").map((c: string) => ({
    text: c,
    uuid: crypto.randomUUID(),
  }));
}

/**
 * Parses pagination parameters from the request query.
 *
 * Copied from the official Neo4j Graphacademy repo: https://github.com/neo4j-graphacademy/app-nodejs/blob/main/src/utils.js
 * and modiefied.
 *
 * @param {Request} req - The express request object.
 * @returns {Record<string, any>} An object with the following properties:
 *   - `search`: The search string to filter by.
 *   - `sort`: The field to sort by.
 *   - `order`: The direction of the sort (ascending/descending).
 *   - `limit`: The maximum number of results to return.
 *   - `offset`: The number of results to skip.
 */
export function getPagination(req: Request): Record<string, any> {
  // TODO: Should this function have more restriction functionalities/error handling
  let { search, limit, order, cursorUuid, cursorLabel, offset } = req.query;

  // Valid Order directions
  const ORDER_ASC: string = "ASC";
  const ORDER_DESC: string = "DESC";
  const ORDERS: string[] = [ORDER_ASC, ORDER_DESC];
  // TODO: This is a temporary solution until a better endless
  // pagination solution in the frontend is implemented
  const MAX_ROW_COUNT: number = 1000;
  const DEFAULT_OFFSET: number = 0;

  const isCursorValid: boolean = typeof cursorUuid === "string" && typeof cursorLabel === "string" && cursorUuid !== "";

  // Set default values
  search ||= "";
  const cursor: CursorData | null = isCursorValid
    ? {
        uuid: cursorUuid as string,
        label: cursorLabel as string,
      }
    : null;

  // Only accept ASC/DESC values
  if (!order || !ORDERS.includes(order.toString().toUpperCase())) {
    order = ORDER_ASC;
  }

  return {
    cursor,
    limit: parseInt(limit as string) || MAX_ROW_COUNT,
    offset: parseInt(offset as string) || DEFAULT_OFFSET,
    order,
    search,
  };
}

/**
 * Parses a uuid from the given request source, trying each key in order.
 *
 * Used as generic uuid parser to read from both params and body.
 *
 * @param {Record<string, unknown>} source - The object to read the uuid from. Currently only `req.params` or `req.body`
 * @param {string[]} keys - The keys to try, in order.
 * @returns {string} The parsed uuid.
 * @throws {ValidationError} If none of the keys yield a non-empty string.
 */
export function parseUuidFrom(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value: unknown = source[key];

    if (Array.isArray(value)) {
      throw new ValidationError("`uuid` can not be an array");
    }

    if (typeof value === "string" && value !== "") {
      return value;
    }
  }

  throw new ValidationError("`uuid` is required.");
}

/**
 * Parses a node status object from a request body.
 *
 * @param {Request} req - The express request object.
 * @returns {string} The parsed node status object.
 * @throws {ValidationError} If the `data` field is missing or malformed.
 */
export function parseNodeStatusObject(req: Request): NodeStatusObject {
  const body: Record<string, unknown> = (req.body ?? {}) as Record<string, unknown>;

  if (!body.data || typeof body.data !== "object") {
    throw new ValidationError("`data` is required.");
  }

  return body.data as NodeStatusObject;
}

/**
 *  Parses the `POST /nodes` request body into a valid combination of uuid and `NodeStatusObject`.
 *
 * @param {Request} req - The express request object.
 * @returns The parsed uuid and node status object.
 * @throws {ValidationError} If the `uuid` or `data` fields are missing or malformed.
 */
export function parseCreateNodePayload(req: Request): { uuid: string; data: NodeStatusObject } {
  const uuid: string = parseUuidFrom(req.body, ["uuid"]);
  const data: NodeStatusObject = parseNodeStatusObject(req);

  return { uuid, data };
}

/**
 * Parses and validates the `scope` of a hierarchy listing request — which set of nodes is being
 * listed.
 *
 * @param {unknown} raw - The `scope` member of the request body.
 * @returns {HierarchyScope} The validated scope.
 * @throws {ValidationError} If the scope is missing, of an unknown kind, or malformed.
 */
function parseHierarchyScope(raw: unknown): HierarchyScope {
  if (!raw || typeof raw !== "object") {
    throw new ValidationError("`scope` is required.");
  }

  const maxScopeUuids: number = 10000;
  const scope = raw as { kind?: unknown; parentUuid?: unknown; uuids?: unknown };

  switch (scope.kind) {
    case "top": {
      return { kind: "top" };
    }
    case "children": {
      if (typeof scope.parentUuid !== "string" || scope.parentUuid === "") {
        throw new ValidationError("A `children` scope needs a `parentUuid`.");
      }

      return { kind: "children", parentUuid: scope.parentUuid };
    }
    case "uuids": {
      if (!Array.isArray(scope.uuids) || scope.uuids.some((uuid) => typeof uuid !== "string")) {
        throw new ValidationError("A `uuids` scope needs `uuids` to be an array of strings.");
      }

      if (scope.uuids.length > maxScopeUuids) {
        throw new ValidationError(`Too many uuids requested (max ${maxScopeUuids}).`);
      }

      return { kind: "uuids", uuids: scope.uuids as string[] };
    }
    default: {
      throw new ValidationError(`Unknown scope kind "${String(scope.kind)}".`);
    }
  }
}

/**
 * Reads the sort direction out of a request.
 *
 * Deliberately forgiving: anything that is not explicitly `desc` falls back to `asc`, but is logged to the console.
 * A wrong direction shows the same listing in the wrong order which the user sees immediately and fixes with one click.
 *
 * @param {unknown} order - The `order` value from the request body.
 * @returns {"asc" | "desc"} The normalized direction, defaulting to `asc`.
 */
export function parseSortDirection(order: unknown): "asc" | "desc" {
  if (typeof order !== "string" || order === "") {
    console.error(`Invalid sort direction "${String(order)}"`);
  }

  if (order === "desc" || order === "DESC") {
    return "desc";
  } else {
    return "asc";
  }
}

/**
 * Parses a `POST /hierarchy/query` request into a normalized listing spec.
 *
 * Every hierarchy listing goes through this one endpoint, whatever its scope — see the route for
 * why a read is a POST. Distinct from {@link getPagination}: this uses opaque cursor pagination
 * (not offset/structured cursor) and carries the filter rules the hierarchy view needs.
 *
 * The property allowlist is passed in rather than read here: it comes from the guidelines, and
 * reading it in this module would make the low-level helpers depend on a service that depends on
 * them.
 *
 * @param {Request} req - The express request object.
 * @param {Map<string, PropertyConfig>} properties - Filterable properties, from `filterableProperties`.
 * @returns {HierarchyQuery} The parsed hierarchy query.
 * @throws {ValidationError} If the scope, a filter rule or the sort target is missing or malformed.
 * @throws {UnknownFilterFieldError} If a filter or the sort names a property the guidelines do not define.
 */
export function parseHierarchyQuery(req: Request, properties: Map<string, PropertyConfig>): HierarchyQuery {
  const body: Record<string, unknown> = (req.body ?? {}) as Record<string, unknown>;

  const scope: HierarchyScope = parseHierarchyScope(body.scope);
  const filters: FilterSpec = parseFilterSpec(body.filters, properties);
  const sort: FilterTarget = parseFilterTarget(body.sort ?? { kind: "distinct" }, properties, true);
  const order: "asc" | "desc" = parseSortDirection(body.order);
  const limit: number = parsePaginationLimit(body.limit);

  const cursor: string | null = (body.cursor as string) || null;

  return { scope, filters, sort, order, limit, cursor, properties };
}

/**
 * Parses the pagination limit from the request body.
 *
 * @param {unknown} rawLimit - The `limit` value from the request body. Typed as `unknown` to be forgiving, but very likely string
 * @returns {number} The normalized limit, defaulting to 50 and capped to 1000.
 */
function parsePaginationLimit(rawLimit: unknown): number {
  const DEFAULT_LIMIT: number = 50;
  const MAX_LIMIT: number = 1000;

  if (!rawLimit || typeof rawLimit !== "string") {
    return DEFAULT_LIMIT;
  }

  const parsedLimit: number = parseInt(rawLimit as string);
  const limit: number = Math.min(Number.isNaN(parsedLimit) ? DEFAULT_LIMIT : parsedLimit, MAX_LIMIT);

  return limit;
}

/**
 * Checks if a given file name is a valid configuration file.
 *
 * Currently used to validate the provided file name for guidelines and stylesheet when the provided URL
 * is not a valid HTTP URL, to prevent path traversal and only allow JSON and CSS files in the config directory.
 *
 * @param {string} fileName The file name (maybe including a path) to check.
 * @return {boolean} True if the file name is a valid configuration file, false otherwise.
 */
export function isValidConfigFile(fileName: string): boolean {
  // No path traversal should be allowed, only the file name
  if (fileName.includes("/") || fileName.includes("..")) {
    return false;
  }

  // Files in the directry are either JSON (guidelines) or CSS (stylesheet) files, so only these should be allowed
  if (!fileName.endsWith(".json") && !fileName.endsWith(".css")) {
    return false;
  }

  return true;
}

/**
 * Checks if a given string is a valid HTTP URL.
 *
 * Currently only used to determine whether the provided URLs for
 * guidelines and styles are a remote URL that needs to be fetched
 * or a local file path that can be read from the file system directly.
 *
 * @param {string} string The string to check.
 * @return {boolean} True if the string is a valid HTTP URL, false otherwise.
 */
export function isValidHttpUrl(string: string): boolean {
  try {
    const newUrl: URL = new URL(string);

    return newUrl.protocol === "http:" || newUrl.protocol === "https:";
  } catch (err: unknown) {
    return false;
  }
}

/**
 * Resolves the base URL of a per-project external tool from the environment.
 *
 * The tool name is looked up in the `TOOL_URL_MAPPING` whitelist to find the
 * environment variable holding its base URL. Only known tool names resolve, so arbitrary environment
 * variables cannot be probed via the request path.
 *
 * @param {string} toolName - The name of the tool as provided in the request path.
 * @throws {NotFoundError} If the tool name is unknown or no valid URL is configured for it.
 * @return {string} The configured base URL of the tool.
 */
export function getToolUrl(toolName: string): string {
  const envKey: string | undefined = TOOL_URL_MAPPING[toolName];

  if (!envKey) {
    throw new NotFoundError(`Unknown tool: "${toolName}"`);
  }

  const url: string | undefined = process.env[envKey];

  if (!url || !isValidHttpUrl(url)) {
    throw new NotFoundError(`No URL is configured for tool "${toolName}"`);
  }

  return url;
}

/**
 * Convert Neo4j Properties back into JavaScript types.
 *
 * Copied from the official Neo4j Graphacademy repo: https://github.com/neo4j-graphacademy/app-nodejs/blob/main/src/utils.js
 * and modiefied.
 *
 * @param {Record<string, any>} properties
 * @return {Record<string, any>}
 */
export function toNativeTypes(properties: Record<string, any>): Record<string, any> {
  return Object.fromEntries(
    Object.keys(properties).map((key) => {
      const value: any = valueToNativeType(properties[key]);

      return [key, value];
    }),
  );
}

/**
 * Convert an individual value to its JavaScript equivalent.
 *
 * Copied from the official Neo4j Graphacademy repo: https://github.com/neo4j-graphacademy/app-nodejs/blob/main/src/utils.js
 * and modiefied.
 *
 * @param {any} value
 * @returns {any}
 */
export function valueToNativeType(value: any): any {
  if (Array.isArray(value)) {
    value = value.map((innerValue) => valueToNativeType(innerValue));
  } else if (isInt(value)) {
    value = value.toNumber();
  } else if (isDate(value) || isDateTime(value) || isLocalDateTime(value)) {
    value = value.toStandardDate();
  } else if (isLocalTime(value) || isTime(value)) {
    value = value.toString();
  } else if (isDuration(value)) {
    value = value.toString();
  } else if (typeof value === "object" && value !== undefined && value !== null) {
    value = toNativeTypes(value);
  }

  return value;
}

/**
 * Convert JavaScript types back into Neo4j Properties, using the provided configuration. This conversion direction
 * uses the field configuration since the desired neo4j data type can not always be inferred from the JavaScript type
 * (e.g. dates, date times and times are always strings in JavaScript).
 *
 * @param {Record<string, any>} properties
 * @param {PropertyConfig[]} fields
 * @return {Record<string, any>}
 */
export function toNeo4jTypes(properties: any, fields: PropertyConfig[]): Record<string, any> {
  return Object.fromEntries(
    Object.keys(properties).map((key) => {
      const config: PropertyConfig | undefined = fields.find((field) => field.name === key);
      const value: any = valueToNeo4jType(properties[key], config);

      return [key, value];
    }),
  );
}

/**
 * Convert an individual value to its Neo4j equivalent, using the provided configuration. This conversion direction
 * uses the field configuration since the desired neo4j data type can not always be inferred from the JavaScript type
 * (e.g. dates, date times and times are always strings in JavaScript).
 *
 * @param {any} value
 * @param {PropertyConfig | undefined} config
 * @returns {any}
 */
function valueToNeo4jType(value: any, config: Partial<PropertyConfig> | undefined): any {
  // TODO: How handle empty string?
  // TODO: This is the case for non-customizable properties (uuid, start/endIndex etc.). Keep or handle better?
  if (!config) {
    return value;
  }

  const isRequired: boolean = config?.required ?? true;
  const valueIsNull: boolean = value === null || value === undefined;

  // This can be applied to all data types - if the value does not exist and is not needed, it doesnt need to be set
  if (valueIsNull && !isRequired) {
    return null;
  }

  // Call function recursively when needed if data type is array
  if (config.type === "array") {
    if (value.length === 0) {
      if (isRequired) {
        return [];
      } else {
        return null;
      }
    } else {
      return (
        value
          .map((innerValue: any) => valueToNeo4jType(innerValue, config.items))
          // This is needed since arrays with null values (e.g. [1, 2, null, 4]) are not allowed as node properties)
          .filter((v: any) => v !== null && v !== undefined)
      );
    }
  }

  if (config.type === "integer") {
    if (valueIsNull) {
      if (!isRequired) {
        return null;
      } else {
        return 0;
      }
    } else {
      return types.Integer.fromValue(value);
    }
  } else if (config.type === "number") {
    return value;
  } else if (config.type === "string") {
    return value;
  } else if (config.type === "date") {
    if (valueIsNull && !isRequired) {
      return null;
    } else {
      return types.Date.fromStandardDate(new Date(value));
    }
  } else if (config.type === "date-time") {
    if (valueIsNull && !isRequired) {
      return null;
    } else {
      return types.DateTime.fromStandardDate(new Date(value));
    }
  } else if (config.type === "time") {
    if (valueIsNull) {
      if (!isRequired) {
        return null;
      } else {
        return new types.LocalTime(0, 0, 0, 0);
      }
    } else {
      // Needs more work since parsing can fail easily (Dates/Datetimes handle wrong values better)
      try {
        const items: number[] = (value as string).split(":").map((item: string) => {
          const parsed: number = parseInt(item);

          if (isNaN(parsed)) {
            throw new Error(`Invalid time format: ${value}`);
          }

          return parsed;
        });

        const hours: number = items[0] ?? 0;
        const minutes: number = items[1] ?? 0;
        const seconds: number = items[2] ?? 0;

        return new types.LocalTime(hours, minutes, seconds, 0);
      } catch (e: unknown) {
        console.error(`Failed to parse time from value "${value}":`, e);

        // Same logic as above (no value/not required)
        if (!isRequired) {
          return null;
        }

        return new types.LocalTime(0, 0, 0, 0);
      }
    }
  } else if (config.type === "boolean") {
    return value;
  } else {
    return value;
  }
}
