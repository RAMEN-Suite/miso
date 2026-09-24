import { Ref } from "vue";
import {
  NodeDto,
  Character,
  PropertyConfigDataType,
  StandoffAnnotation,
  StandoffJson,
  TextNode,
  NodeStatusObject,
  NodeStatus,
  AnnotationNode,
  EntityNode,
  CollectionNode,
  ToCItem,
  Annotation,
  BaseNodeLabel,
  PropertyConfig,
  AnnotationType,
} from "../../models/types";
import { EditorView } from "@tiptap/pm/view";
import { Node } from "@tiptap/pm/model";
import { useGuidelinesStore } from "../../store/guidelines";

const { getAnnotationType } = useGuidelinesStore();

/**
 * Recursively builds a tree of {@link ToCItem} nodes from a ProseMirror node's block children.
 *
 * @param node - The ProseMirror node whose block children to traverse.
 * @param contentStartPos - Absolute document position where `node`'s content begins.
 *   For the document root this is `0`; for any other block node it is `nodePos + 1`
 *   (skipping the opening token).
 */
export function buildDocChildren(node: Node, contentStartPos: number): ToCItem[] {
  const result: ToCItem[] = [];

  node.forEach((child: Node, offset: number) => {
    if (!child.isBlock) {
      return;
    }

    const annotationType: string = getAnnotationType(child.type.name);
    const childPos: number = contentStartPos + offset;

    result.push({
      key: child.attrs.uuid ?? childPos.toString(),
      label: annotationType,
      data: {
        text: child.textContent ?? "",
        pos: childPos,
        nodeSize: child.nodeSize,
        nodeType: child.type.name,
        type: annotationType,
        level: child.attrs.level ?? null,
        _annotationData: child.attrs._annotationData,
        _semanticBlocks: child.attrs._semanticBlocks ?? [],
      },
      children: buildDocChildren(child, childPos + 1),
    });
  });

  return result;
}

/**
 * Builds a nested {@link ToCItem} tree representing the full block structure of a ProseMirror document.
 *
 * Each item carries the node's absolute position (`data.pos`), which can be passed directly to
 * `editor.commands.setTextSelection` or `editor.view.nodeDOM` for navigation.
 *
 * @param doc - The ProseMirror document node (`editor.state.doc`).
 */
export function buildDocStructure(doc: Node): ToCItem[] {
  // doc has no opening token, so its content starts at position 0
  const structure: ToCItem[] = buildDocChildren(doc, 0);

  return structure;
}

/**
 * Converts the given characters and annotations into a single StandoffJson object.
 *
 * @param characters - The list of characters.
 * @param annotations - The list of annotations.
 * @returns {StandoffJson} The assembled Standoff JSON object.
 */
export function buildStandoffJson(characters: Character[], annotations: Annotation[]): StandoffJson {
  const text: string = characters.map((c) => c.data.text).join("");
  const standoffAnnotations: StandoffAnnotation[] = annotations.map((a) => a.node.data);

  return {
    text,
    annotations: standoffAnnotations,
  };
}

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
    const clonedMap = new Map<any, any>();

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

export function createNewCharacter(char: string): Character {
  return {
    data: {
      uuid: crypto.randomUUID(),
      text: char,
    },
    annotations: [],
  };
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
 * Creates a new Collection object with default values.
 *
 * This function is used to generate a new Collection object with default values for the node labels and data properties.
 *
 * @return {CollectionNode} A new Collection object with default values.
 */
export function createCollectionNode(): CollectionNode {
  return {
    nodeLabels: ["Collection"],
    data: {
      uuid: crypto.randomUUID(),
      label: "",
    },
  };
}

/**
 * Creates a new Text object with default values.
 *
 * This function is used to generate a new Text object with default values for the node labels and data properties.
 * The additional (domain) labels are applied on creation so that the node never needs its labels mutated later.
 *
 * @param {Object} params - The optional parameters for the new node.
 * @param {string[]} params.additionalNodeLabels - The additional labels to append to the "Content" base label.
 *   Defaults to none, leaving the node with the base label only.
 * @return {TextNode} A new Text object with default values.
 */
export function createTextNode(params?: { additionalNodeLabels: string[] }): TextNode {
  return {
    nodeLabels: ["Content", ...(params?.additionalNodeLabels ?? [])],
    data: {
      uuid: crypto.randomUUID(),
      text: "",
    },
  };
}

/**
 * Creates a new Entity object with default values.
 *
 * There are no guidelines for Entities yet, so a new Entity only consists of a UUID and an (empty) label.
 *
 * @param {Object} params - The optional parameters for the new node.
 * @param {string[]} params.additionalNodeLabels - The additional labels to append to the "Entity" base label.
 *   Defaults to none, leaving the node with the base label only.
 * @return {EntityNode} A new Entity object with default values.
 */
export function createEntityNode(params?: { additionalNodeLabels: string[] }): EntityNode {
  return {
    nodeLabels: ["Entity", ...(params?.additionalNodeLabels ?? [])],
    data: {
      uuid: crypto.randomUUID(),
      label: "",
    },
  };
}

/**
 * Creates a new, not yet persisted Entity node wrapped in a node status object, ready to be filled in by the user.
 *
 * The node is marked as "created" so that the backend creates it once the parent node is saved.
 *
 * @param {Object} params - The optional parameters for the new node.
 * @param {string[]} params.additionalNodeLabels - The additional labels to append to the "Entity" base label.
 *   Defaults to none, leaving the node with the base label only.
 * @return {NodeStatusObject<EntityNode>} A new Entity node status object with default values.
 */
export function createEntityNodeStatusObject(params?: { additionalNodeLabels: string[] }): NodeStatusObject<EntityNode> {
  const entityNode: NodeStatusObject<EntityNode> = createNodeStatusObjectFromRawData(
    createNodeDtoFromNode(createEntityNode({ additionalNodeLabels: params?.additionalNodeLabels ?? [] })),
  ) as NodeStatusObject<EntityNode>;

  entityNode.meta.status = "created";

  return entityNode;
}

/**
 * Creates a new, not yet persisted Content node wrapped in a node status object, ready to be filled in by the user.
 *
 * The node is marked as "created" so that the backend creates it once the parent node is saved.
 *
 * @param {Object} params - The optional parameters for the new node.
 * @param {string[]} params.additionalNodeLabels - The additional labels to append to the "Content" base label.
 *   Defaults to none, leaving the node with the base label only.
 * @return {NodeStatusObject<TextNode>} A new Content node status object with default values.
 */
export function createContentNodeStatusObject(params?: { additionalNodeLabels: string[] }): NodeStatusObject<TextNode> {
  const contentNode: NodeStatusObject<TextNode> = createNodeStatusObjectFromRawData(
    createNodeDtoFromNode(createTextNode({ additionalNodeLabels: params?.additionalNodeLabels ?? [] })),
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
 * Returns a list of all labels that are not one of the RAMEN base node labels.
 *
 * Mainly used for visual purposes (base node labels do not need to be displayed).
 *
 * @param {string[]} labels - All Node labels of a RAMEN-valid node
 * @returns {string[]} List of all labels that are not one of the RAMEN base node labels
 */
export function filterBaseNodeLabel(labels: string[]): string[] {
  const baseNodeLabels: string[] = ["Annotation", "Collection", "Content", "Entity"];

  return labels.filter((l: string) => !baseNodeLabels.includes(l));
}

/**
 * Returns the RAMEN base node label for a node from its full list of labels.
 *
 * @param {string[]} labels - All Node labels of a RAMEN-valid node
 * @returns {BaseNodeLabel} The node's base label
 * @throws {Error} If none of the base labels is present
 */
export function getBaseNodeLabel(labels: string[]): BaseNodeLabel {
  if (labels.includes("Entity")) {
    return "Entity";
  } else if (labels.includes("Collection")) {
    return "Collection";
  } else if (labels.includes("Content")) {
    return "Content";
  } else if (labels.includes("Annotation")) {
    return "Annotation";
  } else {
    throw new Error("Node does not have a valid base label");
  }
}

/**
 * Checks whether an annotation matches the requirements of its configuration.
 *
 * Currently only property fields are validated. Will be extended when rules for connected
 * entities etc. are applied.
 *
 * @param {Annotation} annotation - The annotation whose node data is checked.
 * @param {PropertyConfig[]} config - The config of the annotation type.
 * @return {boolean} Returns `true` if all required fields have a value, `false` otherwise.
 */
export function checkAnnotationValidity(annotation: Annotation, config: AnnotationType): boolean {
  const fields: PropertyConfig[] = config.properties ?? [];

  return fields.every((field: PropertyConfig) => {
    if (!field.required) {
      return true;
    }

    const value: unknown = annotation.node.data[field.name];

    if (value === null || value === undefined) {
      return false;
    }

    if (field.type === "string" && (value as string).trim().length === 0) {
      return false;
    }

    return true;
  });
}

/**
 * A function that compares two objects to check if they are equal. Works only for non-nested objects
 * where values are strings or numbers.
 *
 * @param {Record<string, any>} obj1 - The first object to compare.
 * @param {Record<string, any>} obj2 - The second object to compare.
 * @return {boolean} Returns true if the objects are equal, otherwise false.
 */
export function areObjectsEqual(obj1: Record<string, any>, obj2: Record<string, any>): boolean {
  // TODO: This function needs to be rewritten when there are more complex objects...
  const keys1: string[] = Object.keys(obj1);
  const keys2: string[] = Object.keys(obj2);

  if (keys1.length !== keys2.length) {
    return false;
  }

  for (const key of keys1) {
    if (!keys2.includes(key) || obj1[key] !== obj2[key]) {
      return false;
    }
  }

  return true;
}

/**
 * Checks if two sets are equal by comparing their sizes and elements. Used for comparing
 * character annotations.
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
 * Filters out the RAMEN base node labels (`"Annotation"`, `"Collection"`, `"Content"`, `"Entity"`, `"Text"`)
 * from the given array, returning only the domain-specific labels.
 *
 * This function is mostly used for displaying labels in node previews (e.g. in annotation forms,
 * collection column entries etc.).
 *
 * // TODO: Don't forget to remove the "Text" label.
 *
 * @param {string[]} nodeLabels - The full list of node labels to filter.
 * @returns {string[]} The labels with all base node labels removed.
 */
export function filterDefaultLabels(nodeLabels: string[]): string[] {
  // TODO: Remove "Text" check ("Content") is enough. Only kept for legacy reasons :)
  const baseNodeLabels: string[] = ["Annotation", "Collection", "Content", "Entity", "Content"];

  return nodeLabels.filter((l) => !baseNodeLabels.includes(l));
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
 * Returns the ProseMirror document positions that correspond to the top and bottom edges
 * of the editor's scroll container (i.e. the currently visible range of the document).
 *
 * Falls back to `0` for `from` and `doc.content.size` for `to` when `posAtCoords` returns
 * `null` — which happens when the editor content does not yet fill the container or the
 * coordinates land outside the rendered document.
 *
 * @param {EditorView} editorView - The ProseMirror EditorView instance.
 * @returns {{ from: number; to: number }} The start and end document positions of the visible range.
 */
export function getVisibleDocRange(editorView: EditorView): { from: number; to: number } {
  // TODO: Add viewport buffer so that annotation directly above/below are included...
  const rect: DOMRect | undefined = editorView.dom.parentElement?.getBoundingClientRect();

  if (!rect) {
    return { from: 0, to: editorView.state.doc.content.size };
  }

  const { top: parentTopOffset, left: parentLeftOffset, height } = rect;

  const startPos = editorView.posAtCoords({
    left: parentLeftOffset + 1,
    top: parentTopOffset,
  });
  const endPos = editorView.posAtCoords({
    left: parentLeftOffset + 1,
    top: parentTopOffset + height,
  });

  // Catch edge cases
  const from: number = startPos?.pos ?? 0;
  const to: number = endPos?.pos ?? editorView.state.doc.content.size;

  return { from, to };
}

// TODO: These functions should actually check the node, not the status object...refactor later
export function isEntityNode(node: NodeStatusObject): node is NodeStatusObject<EntityNode> {
  return node.node.nodeLabels.includes("Entity");
}

export function isAnnotationNode(node: NodeStatusObject): node is NodeStatusObject<AnnotationNode> {
  return node.node.nodeLabels.includes("Annotation");
}

export function isCollectionNode(node: NodeStatusObject): node is NodeStatusObject<CollectionNode> {
  return node.node.nodeLabels.includes("Collection");
}

export function isContentNode(node: NodeStatusObject): node is NodeStatusObject<TextNode> {
  return node.node.nodeLabels.includes("Content");
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
 * Toggles the text highlighting for the given annotation by adding CSS classes to annotated span elements.
 *
 * @param {Annotation} annotation - The annotation for which to toggle highlighting.
 * @param {'on' | 'off'} direction - The direction of the toggle operation.
 * @return {void}
 */
export function toggleTextHightlighting(annotation: Annotation, direction: "on" | "off"): void {
  const annotatedSpans: NodeListOf<HTMLSpanElement> = document.querySelectorAll(
    `#text > span:has(span[data-anno-uuid="${annotation.node.data.uuid}"])`,
  );

  if (annotatedSpans.length === 0) {
    return;
  }

  scrollIntoViewIfNeeded(annotatedSpans[0]);

  annotatedSpans.forEach((span: HTMLSpanElement) => {
    if (direction === "on") {
      span.classList.add("highlight");
    } else {
      span.classList.remove("highlight");
    }
  });
}

/**
 * Scrolls the given span element into view if it is outside the viewport.
 *
 * @param {HTMLSpanElement} span - The span element to scroll into view.
 * @return {void}
 */
export function scrollIntoViewIfNeeded(span: HTMLSpanElement): void {
  const spanRect: DOMRect = span.getBoundingClientRect();
  const containerRect: DOMRect = document.querySelector(".text-container").getBoundingClientRect();

  const isOutsideViewport: boolean = spanRect.top <= containerRect.top || spanRect.bottom >= containerRect.bottom;

  if (isOutsideViewport) {
    span.scrollIntoView({ behavior: "smooth" });
  }
}

/**
 * Returns a default value based on the data type.
 *
 * Used during import, editing and saving of Collections or Annotations.
 *
 * @param {PropertyConfigDataType} type - The data type.
 * @return {any} The appropriate default value for the data type.
 */
export function getDefaultValueForProperty(type: PropertyConfigDataType): any {
  switch (type) {
    case "boolean":
      return false;
    case "date":
      const today: Date = new Date();
      const year: number = today.getUTCFullYear();
      const month: number = today.getUTCMonth();
      const day: number = today.getUTCDate();
      return new Date(Date.UTC(year, month, day, 0, 0, 0)).toISOString();
    case "date-time":
      return new Date().toISOString();
    case "integer":
      return 0;
    case "number":
      return 0;
    case "string":
      return "";
    case "time":
      return "00:00:00";
    case "array":
      return [];
    default:
      return null;
  }
}
