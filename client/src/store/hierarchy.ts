import { computed, readonly, ref, watch } from "vue";
import {
  CollectionNode,
  HierarchyEntry,
  HierarchyPath,
  HierarchyNode,
  HierarchyRoot,
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
import type HierarchyColumn from "../components/HierarchyColumn.vue";

const { api } = useAppStore();

const levels = ref<Level[]>([]);
const focus = ref<FocusData | null>(null);
const path = ref<HierarchyPath>([]);
const root = ref<HierarchyRoot>({ kind: "database", uuid: null });

// Navigation history is in-app
const previousPaths = useRefHistory(path, {
  capacity: 25,
});

const mode = ref<"view" | "edit">("view");
const asyncOperationRunning = ref<boolean>(false);
const isFetchingFocus = ref<boolean>(false);
const canNavigate = computed<boolean>(() => mode.value === "view");
const canGoBack = computed<boolean>(() => previousPaths.canUndo.value);
const canGoForward = computed<boolean>(() => previousPaths.canRedo.value);

/**
 * Guards against a slow focus request overwriting a newer one. Every path change bumps the token,
 * and a response whose token no longer matches is discarded.
 */
let focusRequestToken: number = 0;

/**
 * Fetches the focus-pane data for a hierarchy item. A Collection loads its node and annotations; a
 * Content is a leaf — the path already carries its data, so no extra request is made.
 *
 * @param {NodeDto<HierarchyNode>} item - The item to focus.
 * @returns {Promise<FocusData>} The focus data for the pane.
 */
async function fetchFocusData(item: NodeDto<HierarchyNode>): Promise<FocusData> {
  const uuid: string = item.node.data.uuid;

  if (getBaseNodeLabel(item.node.nodeLabels) === "Collection") {
    isFetchingFocus.value = true;

    try {
      // TODO: Handle errors
      const [collection, annotations] = await Promise.all([api.getCollection(uuid), api.getAnnotations("collection", uuid)]);

      return {
        kind: "collection",
        collection: createNodeStatusObjectFromRawData(collection) as NodeStatusObject<CollectionNode>,
        annotations: annotations.map((a: NodeDto<AnnotationNode>) => createNodeStatusObjectFromRawData(a)),
      };
    } finally {
      isFetchingFocus.value = false;
    }
  }

  return {
    kind: "content",
    content: createNodeStatusObjectFromRawData(item) as NodeStatusObject<TextNode>,
  };
}

/**
 * Rebuilds the column levels from the current path.
 *
 * There is one "selection" level per path element (each showing its parent's children and
 * highlighting the selected item), plus a trailing "child" column showing the children of the
 * focused item — but **only when that item is a Collection**. A Content is a leaf, so no child
 * column is appended. The trailing column is reused (not refetched) when it already shows the
 * children of the same parent (e.g. on breadcrumb navigation or when the path is truncated).
 *
 * @returns {void} This function does not return a value.
 */
function updateLevels(): void {
  const newPathLength: number = path.value.length;
  const lastItem: NodeDto<HierarchyNode> | null = path.value[newPathLength - 1] ?? null;

  // Empty path (root) behaves like a collection: it still gets a top-level child column
  const lastItemCanHaveChildren: boolean = lastItem ? getBaseNodeLabel(lastItem.node.nodeLabels) === "Collection" : true;

  // Column that would show the focused item's children — captured before resizing, for reuse
  const currentChildColumn: Level | undefined = levels.value[newPathLength];

  if (levels.value.length > newPathLength) {
    // Slice to match new path length
    levels.value = levels.value.slice(0, newPathLength);
  } else if (newPathLength > levels.value.length) {
    // Fill up with empty selection levels
    const diff: number = newPathLength - levels.value.length;

    for (let i = 0; i < diff; i++) {
      levels.value.push({ entries: [], activeItem: null, parentUuid: null });
    }
  }

  // Set activeItem + parentUuid of each selection level. Level 0 has no parent: what it lists is
  // decided by `root`, not by a parent uuid.
  levels.value.forEach((level: Level, index: number) => {
    level.activeItem = path.value[index];
    level.parentUuid = levels.value[index - 1]?.activeItem?.node.data.uuid ?? null;
  });

  // A focused Content is a leaf — no child column to append
  if (!lastItemCanHaveChildren) {
    return;
  }

  const childParentUuid: string | null = levels.value[levels.value.length - 1]?.activeItem?.node.data.uuid ?? null;
  const canReuse: boolean = !!currentChildColumn && currentChildColumn.parentUuid === childParentUuid;

  if (canReuse) {
    levels.value.push({ ...currentChildColumn, activeItem: null });
  } else {
    levels.value.push({ entries: [], activeItem: null, parentUuid: childParentUuid });
  }
}

// `path` is the single source of truth: levels and focus are derived from it, so every way of
// changing the path (item click, breadcrumb, history back/forward, deep-link seed) lands here.
watch(path, async (newPath: HierarchyPath) => {
  updateLevels();

  const token: number = ++focusRequestToken;

  if (newPath.length === 0) {
    focus.value = null;

    return;
  }

  const focusData: FocusData = await fetchFocusData(newPath[newPath.length - 1]);

  // A newer selection has been made while this request was in flight — discard the stale result
  if (token === focusRequestToken) {
    focus.value = focusData;
  }
});

export function useHierarchyStore() {
  /**
   * Clears the selection, collapsing the view back to the root listing.
   *
   * @returns {void} This function does not return a value.
   */
  function clearSelection(): void {
    updatePath([]);
  }

  /**
   * Builds the initial levels for the current root when nothing has been selected yet.
   *
   * Called by the hierarchy view on mount. It deliberately does nothing when levels already exist:
   * a deep link seeds the path in a router guard *before* the view mounts, and rebuilding here
   * would throw that selection away. It also preserves the selection when navigating back from
   * another route.
   *
   * @returns {void} This function does not return a value.
   */
  function initialize(): void {
    if (levels.value.length === 0) {
      updateLevels();
    }
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
   * Steps back to the previously selected path. No-op while there are unsaved changes.
   *
   * @returns {void} This function does not return a value.
   */
  function goBack(): void {
    if (canNavigate.value && canGoBack.value) {
      previousPaths.undo();
    }
  }

  /**
   * Steps forward to the path that was undone last. No-op while there are unsaved changes.
   *
   * @returns {void} This function does not return a value.
   */
  function goForward(): void {
    if (canNavigate.value && canGoForward.value) {
      previousPaths.redo();
    }
  }

  /**
   * Selects an item at a given depth, dropping everything selected below it. The item is passed in
   * whole because the caller (e.g. {@linkcode HierarchyColumn}) already holds it.
   *
   * @param {NodeDto<HierarchyNode>} item - The item that was selected.
   * @param {number} depth - The depth the item sits at (the level index it was selected in).
   * @returns {void} This function does not return a value.
   */
  function selectItem(item: NodeDto<HierarchyNode>, depth: number): void {
    updatePath([...path.value.slice(0, depth), item]);
  }

  /**
   * Sets the whole active path (root first, focused item last). Levels and focus follow from it.
   *
   * @param {HierarchyPath} newPath The active path.
   * @returns {void} This function does not return a value.
   */
  function updatePath(newPath: HierarchyPath): void {
    path.value = newPath;
  }

  /**
   * Sets the current mode ('view' or 'edit').
   *
   * @param {string} newMode - The new mode.
   * @returns {void} This function does not return a value.
   */
  function setMode(newMode: "view" | "edit"): void {
    mode.value = newMode;
  }

  /**
   * Switches the listing to another root (the database hierarchy, bookmarks, a workspace) and
   * clears the current selection.
   *
   * @param {HierarchyRoot} newRoot - The root to display.
   * @returns {void} This function does not return a value.
   */
  function setRoot(newRoot: HierarchyRoot): void {
    root.value = newRoot;
    path.value = [];
    levels.value = [];

    // `path` may already have been empty, in which case the watcher does not fire
    updateLevels();
  }

  return {
    asyncOperationRunning,
    canGoBack,
    canGoForward,
    canNavigate,
    isFetchingFocus: readonly(isFetchingFocus),
    levels,
    mode,
    path,
    focus,
    root: readonly(root),
    clearSelection,
    findEntryInHierarchy,
    goBack,
    goForward,
    initialize,
    selectItem,
    updatePath,
    setMode,
    setRoot,
  };
}
