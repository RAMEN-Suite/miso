import { computed, EffectScope, effectScope, readonly, ref, watch } from "vue";
import {
  Annotation,
  CollectionNode,
  FilterRule,
  FilterSpec,
  HierarchyEntry,
  HierarchyPath,
  HierarchyNode,
  HierarchyRoot,
  Level,
  LevelQuery,
  LevelState,
  FocusData,
  TextNode,
  NodeDto,
  NodeStatusObject,
  AnnotationNode,
  PropertyConfig,
} from "../models/types";
import { useAppStore } from "./app";
import { useGuidelinesStore } from "./guidelines";
import { useSmartViewsStore } from "./smartViews";
import { createNodeStatusObjectFromRawData, getBaseNodeLabel } from "../utils/helper/helper";
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- This is used in the TSDoc as reference, so keep it
import type HierarchyColumn from "../components/HierarchyColumn.vue";

const scope: EffectScope = effectScope(true);

let store: ReturnType<typeof createStore> | undefined = undefined;

/**
 * Builds the single hierarchy store instance: its state, its functions and the watcher that derives
 * `levels` and `focus` from `path`.
 *
 * Everything is created inside a detached {@link EffectScope} to keep the watcher bound to the store. Otherwise,
 * the watcher and its callback functions would have to live outside of the {@linkcode useHierarchyStore} function
 * which would kind of destroy the store's encapsulation.
 *
 * @returns The store's public surface, or `undefined` if the scope has been
 * stopped, in which case the callback never ran at all.
 */
function createStore() {
  return scope.run(() => {
    const { api } = useAppStore();
    const { getAvailableCollectionLabels, getAvailableContentLabels, getAllCollectionConfigFields } = useGuidelinesStore();
    const { getSmartViewFilters } = useSmartViewsStore();

    const levels = ref<Level[]>([]);
    const focus = ref<FocusData | null>(null);
    const path = ref<HierarchyPath>([]);
    const root = ref<HierarchyRoot>({ kind: "database" });

    const mode = ref<"view" | "edit">("view");
    const asyncOperationRunning = ref<boolean>(false);
    const isFetchingFocus = ref<boolean>(false);
    const canNavigate = computed<boolean>(() => mode.value === "view");

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
            annotations: annotations.map((a: NodeDto<AnnotationNode>) => createNodeStatusObjectFromRawData(a) as Annotation),
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
     * The query a freshly built level starts with: everything, unsorted-by-default, unfiltered.
     *
     * The labels are read on every call rather than once at store creation, because the guidelines
     * are fetched asynchronously and this store may be created before they arrive — an early read
     * would bake in an empty list and leave the first column listing nothing.
     *
     * @returns {LevelQuery} A fresh default query. Never shared between levels.
     */
    function createDefaultQuery(): LevelQuery {
      return {
        filters: [
          { target: { kind: "distinct" }, operator: "and", conditions: [{ comparator: "contains", value: "" }] },
          {
            target: { kind: "labels" },
            operator: "and",
            conditions: [{ comparator: "in", value: [...getAvailableCollectionLabels(), ...getAvailableContentLabels()] }],
          },
        ],
        sort: { target: { kind: "distinct" }, order: "asc" },
      };
    }

    /**
     * Create the query a level starts on by combining the default query with an optional filter preset if the
     * hierarchy root is of kind `smartView`.
     *
     * The first column under a `smartView` root starts on that view's stored preset; every other level
     * starts unfiltered. This is the place where the decision of "no filtering" is made — for smart views, it means "reset back
     * to the preset", while for other roots it means "apply default filtering".
     *
     * @param {number} index - The level the query is for.
     * @returns {LevelQuery} A fresh query
     */
    function createQueryForLevel(index: number): LevelQuery {
      const defaults: LevelQuery = createDefaultQuery();

      if (index !== 0 || root.value.kind !== "smartView") {
        return defaults;
      }

      const preset: FilterSpec | null = getSmartViewFilters(root.value.uuid);

      if (!preset?.length) {
        return defaults;
      }

      // Important: A preset outlives the guidelines it was written against - If the guidelines change, the preset
      // might be stale/invalid. This is a safe guard to only apply rules that are still valid.
      const validProperties = new Set<string>(getAllCollectionConfigFields().map((config: PropertyConfig) => config.name));

      const filters: FilterSpec = preset.filter(
        (rule: FilterRule) => rule.target.kind !== "property" || validProperties.has(rule.target.field),
      );

      return { ...defaults, filters };
    }

    /**
     * The fetch state of a level that has not been fetched yet.
     *
     * Called when a new level is created or an existing one is cleared in {@linkcode updateLevels}.
     *
     *
     * @returns {LevelState} A fresh, empty state. Never shared between levels.
     */
    function createEmptyState(): LevelState {
      return { cursor: null, pagination: null, isLoading: false, initialized: false };
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
     * A newly built level starts on {@linkcode createDefaultQuery}: navigating to a different parent
     * clears that column's filters, rather than carrying over a filter typed while looking at a
     * different set of nodes. Only the reused trailing column keeps its query.
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
          levels.value.push({
            entries: [],
            activeItem: null,
            parentUuid: null,
            query: createQueryForLevel(levels.value.length),
            state: createEmptyState(),
          });
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
        // The spread carries `query` and `state` over by reference, which is what a reused column
        // wants: it is not refetched, so its entries still match the filter it is showing.
        levels.value.push({ ...currentChildColumn, activeItem: null });
      } else {
        levels.value.push({
          entries: [],
          activeItem: null,
          parentUuid: childParentUuid,
          query: createQueryForLevel(levels.value.length),
          state: createEmptyState(),
        });
      }
    }

    /**
     * Clears the selection, collapsing the view back to the root listing.
     *
     * @returns {void} This function does not return a value.
     */
    function clearSelection(): void {
      updatePath([]);
    }

    /**
     * Resets one level's filters and sort back to what it started on. Under a smart-view root that is
     * the view's preset for the first column, not an unfiltered listing — see
     * {@linkcode createQueryForLevel}.
     *
     * @param {number} index - The level to reset.
     * @returns {void} This function does not return a value.
     */
    function resetQuery(index: number): void {
      const level: Level | undefined = levels.value[index];

      if (level) {
        level.query = createQueryForLevel(index);
      }
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
     * Switches the listing to another root (the database hierarchy or a tag) and
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

    return {
      asyncOperationRunning,
      canNavigate,
      isFetchingFocus: readonly(isFetchingFocus),
      levels,
      mode,
      path,
      focus,
      root: readonly(root),
      clearSelection,
      createDefaultQuery,
      findEntryInHierarchy,
      initialize,
      resetQuery,
      selectItem,
      updatePath,
      setMode,
      setRoot,
    };
  });
}

export function useHierarchyStore(): NonNullable<ReturnType<typeof createStore>> {
  if (!store) {
    const created = createStore();

    if (!created) {
      throw new Error("Failed to create hierarchy store");
    }

    store = created;
  }

  return store;
}
