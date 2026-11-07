import {
  NodeDto,
  TextNode,
  NodeStatusObject,
  NodeStatus,
  AnnotationNode,
  EntityNode,
  CollectionNode,
  Annotation,
  ModelAttribute,
  ModelContext,
  NodeTypeOption,
} from "../../models/types";
import { createEntityNode, createTextNode, filterBaseNodeLabels } from "../../config/ramen";
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
 * Creates a a valid node status object from a given {@link NodeDto} by adding
 * a `meta` key to the node DTO which makes it editable in the frontend.
 *
 * @return {NodeStatusObject} A new node statsu object.
 */
export function createNodeStatusObjectFromRawData(rawNode: NodeDto): NodeStatusObject {
  return {
    node: rawNode.node,
    connectedNodes: rawNode.connectedNodes.map((n) => createNodeStatusObjectFromRawData(n)),
    meta: {
      status: "unchanged",
    },
  };
}

/**
 * Recursively sets the status of a node and all its connected nodes, in place.
 *
 * Mainly used as post-request cleanup: once the backend has persisted the changes, the whole tree
 * is "unchanged" again, so the next save does not re-announce nodes as created/modified/deleted.
 *
 * @param {NodeStatusObject} node - The root node of the tree. Is mutated in place.
 * @param {NodeStatus} status - The status to apply to every node in the tree.
 * @returns {void} This function does not return any value.
 */
export function setNodeTreeStatus(node: NodeStatusObject, status: NodeStatus): void {
  node.meta.status = status;

  node.connectedNodes.forEach((child) => setNodeTreeStatus(child, status));
}

/**
 * Recursively removes all connected nodes that were deleted or detached during editing, in place.
 *
 * Used as post-request cleanup, together with {@link setNodeTreeStatus}, to match the database state
 * after a successful operation.
 *
 * @param {NodeStatusObject} node - The root node of the tree. Is mutated in place.
 * @returns {void} This function does not return any value.
 */
export function pruneDeletedNodes(node: NodeStatusObject): void {
  node.connectedNodes = node.connectedNodes.filter((c) => c.meta.status !== "deleted" && c.meta.status !== "removed");

  node.connectedNodes.forEach((child) => pruneDeletedNodes(child));
}

/**
 * Removes all properties from the given node data that are not declared in the model, in place.
 *
 * Is applied before saving to keep stale properties (e.g. from a configuration that has changed in the meantime) out of the database.
 *
 * @param {Record<string, unknown>} data - The node data to prune. Is mutated in place.
 * @param {readonly string[]} names - The names of the properties declared for the node.
 * @param {readonly string[]} intrinsic - Properties that are always kept, whether they are declared or not.
 * @returns {void} This function does not return any value.
 */
export function pruneUnconfiguredProperties(
  data: Record<string, unknown>,
  names: readonly string[],
  intrinsic: readonly string[],
): void {
  const allowed = new Set<string>([...names, ...intrinsic]);

  Object.keys(data).forEach((key: string) => {
    if (!allowed.has(key)) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- Safe to delete
      delete data[key];
    }
  });
}

/**
 * Creates a new, not yet persisted Entity node wrapped in a node status object, ready to be filled in by the user.
 *
 * The node is marked as "created" so that the backend creates it once the parent node is saved.
 *
 * @param {NodeTypeOption} type - The node type of the new Entity.
 * @return {NodeStatusObject<EntityNode>} A new Entity node status object with default values.
 */
export function createEntityNodeStatusObject(type: NodeTypeOption): NodeStatusObject<EntityNode> {
  const entityNode: NodeStatusObject<EntityNode> = createNodeStatusObjectFromRawData(
    createNodeDtoFromNode(createEntityNode(type)),
  ) as NodeStatusObject<EntityNode>;

  entityNode.meta.status = "created";

  return entityNode;
}

/**
 * Creates a new, not yet persisted Content node wrapped in a node status object, ready to be filled in by the user.
 *
 * The node is marked as "created" so that the backend creates it once the parent node is saved.
 *
 * @param {NodeTypeOption} type - The node type of the new Content.
 * @return {NodeStatusObject<TextNode>} A new Content node status object with default values.
 */
export function createContentNodeStatusObject(type: NodeTypeOption): NodeStatusObject<TextNode> {
  const contentNode: NodeStatusObject<TextNode> = createNodeStatusObjectFromRawData(
    createNodeDtoFromNode(createTextNode(type)),
  ) as NodeStatusObject<TextNode>;

  contentNode.meta.status = "created";

  return contentNode;
}

/**
 * Creates a a valid node DTO object from a given raw node (Annotation, Entity, Collection, Text).
 * This is to match the structure of the generic {@link NodeDto} object used in the API data.
 *
 * @return {TextNode} A new Text object with default values.
 */
export function createNodeDtoFromNode<T extends AnnotationNode | EntityNode | CollectionNode | TextNode>(rawNode: T): NodeDto<T> {
  return {
    node: rawNode,
    connectedNodes: [],
  };
}

/**
 * Checks whether the properties of an annotation are valid according to the model (validated by RAMEN core).
 *
 * Currently only properties are validated. Will be extended when rules for connected entities etc. are applied.
 *
 * @param {Annotation} annotation - The annotation whose node data is checked.
 * @param {ModelAttribute[]} properties - The properties of its annotation shape.
 * @param {ModelContext} context - The model context.
 * @return {boolean} Returns `true` if all properties are valid, `false` otherwise.
 */
export function checkAnnotationValidity(annotation: Annotation, properties: ModelAttribute[], context: ModelContext): boolean {
  return properties.every(
    (entry: ModelAttribute) => validateValue(context, entry, annotation.node.data[entry.attribute.name]).length === 0,
  );
}

/**
 * Checks if two sets are equal by comparing their sizes and elements.
 *
 * @param {Set<string>} setA - The first set to compare.
 * @param {Set<string>} setB - The second set to compare.
 * @return {boolean} Returns true if the sets are equal, otherwise false.
 */
export function areSetsEqual(setA: Set<string>, setB: Set<string>): boolean {
  if (setA.size !== setB.size) {
    return false;
  }

  for (const item of setA) {
    if (!setB.has(item)) {
      return false;
    }
  }

  return true;
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
 * Format a file size in bytes into a human-readable string.
 *
 * @param {number} bytes The file size in bytes
 * @returns {string} The formatted file size as a string (e.g. "1.23 MB")
 */
export function formatFileSize(bytes: number): string {
  const k: number = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

  if (bytes === 0) {
    return `0 ${sizes[0]}`;
  }

  const i: number = Math.floor(Math.log(bytes) / Math.log(k));
  const formattedSize: number = parseFloat((bytes / Math.pow(k, i)).toFixed(2));

  return `${formattedSize} ${sizes[i]}`;
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

/**
 * Removes formatting characters from the input text.
 *
 * @param {string} text - The text containing formatting characters.
 * @return {string} The text with formatting characters removed.
 */
export function removeFormatting(text: string): string {
  const plainText: string = text.replace(/\r\n?|\n/g, "");
  return plainText;
}

/**
 * Returns a display string for a Content node.
 *
 * This is currently a hack since multi-level RAMEN refinements are not yet supported.
 * TODO: Will be fixed as soon as Nori export is implemented.
 *
 * @param {string[]} nodeLabels - All node labels of the Content node.
 * @returns {string} The labels joined with " › " (empty string if none).
 */
export function getContentLabelText(nodeLabels: string[]): string {
  return filterBaseNodeLabels(nodeLabels).join(" › ");
}
