import { computed, readonly, ref } from "vue";
import {
  CollectionNode,
  HierarchyEntry,
  HierarchyPath,
  HierarchyNode,
  Level,
  FocusData,
  TextNode,
  NodeDto,
  NodeStatusObject,
  AnnotationNode,
} from "../models/types";
import { useAppStore } from "./app";
import { useRefHistory } from "@vueuse/core";
import { createNodeStatusObjectFromRawData, getBaseNodeLabel } from "../utils/helper/helper";

const { api } = useAppStore();

const levels = ref<Level[]>([]);
const focus = ref<FocusData | null>(null);
const path = ref<HierarchyPath>([]);

const previousPaths = useRefHistory(path, {
  capacity: 5,
});

const mode = ref<"view" | "edit">("view");
const asyncOperationRunning = ref<boolean>(false);
const isFetchingFocus = ref<boolean>(false);
const canNavigate = computed<boolean>(() => mode.value === "view");

export function useHierarchyStore() {
  /**
   * Fetches the focus-pane data for a hierarchy node. A Collection loads its node and annotations; a
   * Content is a leaf — the path already carries its data, so no extra request is made.
   *
   * @param {NodeDto<HierarchyNode>} node - The node to focus.
   * @returns {Promise<FocusData>} The focus data for the pane.
   */
  async function fetchFocusData(node: NodeDto<HierarchyNode>): Promise<FocusData> {
    const uuid: string = node.node.data.uuid;

    if (getBaseNodeLabel(node.node.nodeLabels) === "Collection") {
      isFetchingFocus.value = true;

      // TODO: Handle errors
      const [collection, annotations] = await Promise.all([api.getCollection(uuid), api.getAnnotations("collection", uuid)]);

      const focusData: FocusData = {
        kind: "collection",
        collection: createNodeStatusObjectFromRawData(collection) as NodeStatusObject<CollectionNode>,
        annotations: annotations.map((a: NodeDto<AnnotationNode>) => createNodeStatusObjectFromRawData(a)),
      };

      isFetchingFocus.value = false;

      return focusData;
    }

    return {
      kind: "content",
      content: createNodeStatusObjectFromRawData(node) as NodeStatusObject<TextNode>,
    };
  }

  /**
   * Creates a new URL path element array by inserting a new UUID at the given index.
   *
   * @param {string} uuid The UUID to be inserted into the URL path element array.
   * @param {number} index The index at which to insert the new UUID.
   * @returns {string[]} A new array with the inserted UUID.
   */
  function createNewUrlPathElements(uuid: string, index: number): string[] {
    const currentUuids: string[] = getUrlPath();
    const newUuids: string[] = [...currentUuids.slice(0, index), uuid];

    return newUuids;
  }

  /**
   * Creates a new URL `path` query by inserting a new UUID at the given index.
   *
   * @param {string} uuid The UUID to be inserted into the URL path.
   * @param {number} index The index at which to insert the new UUID.
   * @returns {string} The new URL path as a string.
   */
  function createNewUrlPath(uuid: string, index: number): string {
    return createNewUrlPathElements(uuid, index).join(",");
  }

  /**
   * Finds a hierarchy entry in a given column (level) by its UUID.
   *
   * @param {string} uuid The UUID of the entry to find.
   * @param {number} index The level index to search in.
   * @returns {HierarchyEntry | null} The entry if found, or null.
   */
  function findEntryInHierarchy(uuid: string, index: number): HierarchyEntry | null {
    return levels.value[index]?.entries.find((e) => e.data.node.data.uuid === uuid) ?? null;
  }

  /**
   * Retrieves the URL path from the current URL `path` query.
   *
   * @returns {string[]} The URL path as an array of UUIDs, or an empty array.
   */
  function getUrlPath(): string[] {
    const uuidPath: string | null = new URLSearchParams(window.location.search).get("path");

    return uuidPath?.split(",") ?? [];
  }

  /**
   * Resets the application to its default view by clearing the path selection, focus pane and
   * keeping only the first level of the hierarchy.
   *
   * @returns {void} This function does not return a value.
   */
  function restoreDefaultView(): void {
    if (levels.value[0]) {
      levels.value[0].activeNode = null;
    }

    setPath([]);
    setFocus(null);

    // Keep only first level (top-level column)
    levels.value = levels.value.slice(0, 1);
  }

  /**
   * Restores the previous path selection by undoing the last path selection operation.
   *
   * @returns {void} This function does not return a value.
   */
  function restorePath(): void {
    if (previousPaths.canUndo) {
      previousPaths.undo();
    }
  }

  /**
   * Sets the node shown in the focus pane.
   *
   * @param {FocusData | null} focusData - The focus data, or null when nothing is focused.
   * @returns {void} This function does not return a value.
   */
  function setFocus(focusData: FocusData | null): void {
    focus.value = focusData;
  }

  /**
   * Sets the active path (root first, focused node last).
   *
   * @param {HierarchyPath} newPath The active path.
   * @returns {void} This function does not return a value.
   */
  function setPath(newPath: HierarchyPath): void {
    path.value = newPath;
  }

  /**
   * Sets the current mode ('view' or 'edit').
   *
   * @param {string} newMode - The new mode.
   */
  function setMode(newMode: "view" | "edit"): void {
    mode.value = newMode;
  }

  /**
   * Updates the hierarchy levels and fetches focus data for the new path.
   *
   * @param {HierarchyPath} newPath The new path.
   * @returns {Promise<void>} A promise that resolves when the operation is complete.
   */
  async function updateLevelsAndFetchData(newPath: HierarchyPath): Promise<void> {
    setPath(newPath);
    updateLevels();

    if (newPath.length === 0) {
      setFocus(null);

      return;
    }

    const focusData: FocusData = await fetchFocusData(newPath[newPath.length - 1]);

    setFocus(focusData);
  }

  /**
   * Rebuilds the column levels from the current path.
   *
   * There is one "selection" level per path element (each showing its parent's children and
   * highlighting the selected node), plus a trailing "child" column showing the children of the
   * focused node — but **only when that node is a Collection**. A Content is a leaf, so no child
   * column is appended. The trailing column is reused (not refetched) when it already shows the
   * children of the same parent (e.g. on breadcrumb navigation or URL truncation).
   *
   * @returns {void} This function does not return a value.
   */
  function updateLevels(): void {
    const newPathLength: number = path.value.length;
    const lastNode: NodeDto<HierarchyNode> | null = path.value[newPathLength - 1] ?? null;

    // Empty path (root) behaves like a collection: it still gets a top-level child column
    const lastNodeCanHaveChildren: boolean = lastNode ? getBaseNodeLabel(lastNode.node.nodeLabels) === "Collection" : true;

    // Column that would show the focused node's children — captured before resizing, for reuse
    const currentChildColumn: Level | undefined = levels.value[newPathLength];

    if (levels.value.length > newPathLength) {
      // Slice to match new path length
      levels.value = levels.value.slice(0, newPathLength);
    } else if (newPathLength > levels.value.length) {
      // Fill up with empty selection levels
      const diff: number = newPathLength - levels.value.length;

      for (let i = 0; i < diff; i++) {
        levels.value.push({ entries: [], activeNode: null, parentUuid: null });
      }
    }

    // Set activeNode + parentUuid of each selection level
    levels.value.forEach((level: Level, index: number) => {
      level.activeNode = path.value[index];
      level.parentUuid = levels.value[index - 1]?.activeNode?.node.data.uuid ?? null;
    });

    // A focused Content is a leaf — no child column to append
    if (!lastNodeCanHaveChildren) {
      return;
    }

    const childParentUuid: string | null = levels.value[levels.value.length - 1]?.activeNode?.node.data.uuid ?? null;
    const canReuse: boolean = !!currentChildColumn && currentChildColumn.parentUuid === childParentUuid;

    if (canReuse) {
      levels.value.push({ ...currentChildColumn, activeNode: null });
    } else {
      levels.value.push({ entries: [], activeNode: null, parentUuid: childParentUuid });
    }
  }

  /**
   * Validates a hierarchy path given by a comma-separated string of UUIDs.
   *
   * @param {string} uuidString - The comma-separated string of UUIDs to validate.
   * @returns {Promise<HierarchyPath>} A promise that resolves with the validated path.
   */
  async function validatePath(uuidString: string): Promise<HierarchyPath> {
    return await api.validateHierarchyPath(uuidString);
  }

  return {
    asyncOperationRunning,
    canNavigate,
    isFetchingFocus: readonly(isFetchingFocus),
    levels,
    mode,
    path,
    focus,
    createNewUrlPath,
    createNewUrlPathElements,
    fetchFocusData,
    findEntryInHierarchy,
    getUrlPath,
    restoreDefaultView,
    restorePath,
    setFocus,
    setMode,
    setPath,
    updateLevels,
    updateLevelsAndFetchData,
    validatePath,
  };
}
