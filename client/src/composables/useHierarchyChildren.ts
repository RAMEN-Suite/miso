import { computed, MaybeRefOrGetter, Ref, toValue } from "vue";
import { useAppStore } from "../store/app";
import {
  HierarchyEntry,
  HierarchyFilters,
  HierarchyNode,
  HierarchyScope,
  HierarchySort,
  LevelState,
  NodeDto,
  PaginationResult,
} from "../models/types";
import { getBaseNodeLabel } from "../utils/helper/helper";
import ApiError from "../utils/errors/api.error";

export interface UseHierarchyChildrenOptions {
  filters: MaybeRefOrGetter<HierarchyFilters>;
  sort: MaybeRefOrGetter<HierarchySort>;
}

/**
 * View-agnostic fetching engine for a hierarchy listing
 *
 * The composable owns no state of its own: it writes the entries it fetches into the `entries` ref
 * the caller provides, and its bookkeeping into the `state` object the caller provides. A column
 * passes the store-owned `levels[i].entries` and `levels[i].state` (shared, reachable by the focus
 * pane); a future tree node passes local refs.
 *
 * Note: This will likely be replaced in the near future since it is not completely usable for tree/directory view.
 *
 * @param {MaybeRefOrGetter<HierarchyScope>} scope - Which set of nodes to list (database root, specific tags, etc.)
 * @param {Ref<HierarchyEntry[]>} entries - The sink the fetched entries are written into.
 * @param {Readonly<Ref<LevelState>>} state - The state of the level the composable works on. The passed in value is a computed ref,
 * but since no complete reassignment happens here (operations happen on its properties), it can be treated as a normal ref.
 * @param {UseHierarchyChildrenOptions} options - Reactive filters and sort.
 */
export function useHierarchyChildren(
  scope: MaybeRefOrGetter<HierarchyScope>,
  entries: Ref<HierarchyEntry[]>,
  state: Readonly<Ref<LevelState>>,
  options: UseHierarchyChildrenOptions,
) {
  const { api } = useAppStore();

  const hasMore = computed<boolean>(() => state.value.initialized && state.value.cursor !== null);

  /**
   * Maps a raw node DTO from the API into a column entry, deriving the cached base label and
   * initialising the frontend-owned interaction/meta flags.
   *
   * @param {NodeDto<HierarchyNode>} dto - A single node from the API.
   * @returns {HierarchyEntry} The column entry.
   */
  function createEntryFromNode(dto: NodeDto<HierarchyNode>): HierarchyEntry {
    return {
      data: { node: dto.node, connectedNodes: [] },
      meta: {
        baseLabel: getBaseNodeLabel(dto.node.nodeLabels) as "Collection" | "Content",
        isSelected: false,
        isExpanded: false,
        isFocused: false,
      },
    };
  }

  /**
   * Fetches one page and either replaces the sink or appends to it (de-duplicating by UUID, since a
   * freshly created node may sit on top of the list and be re-fetched by the cursor).
   *
   * @param {object} fetchOptions - Options controlling how the fetched page is applied.
   * @param {boolean} fetchOptions.replace - Whether to replace the current entries (`true`)
   * or append new unique entries (`false`).
   * @returns {Promise<void>} Resolves when the page is applied.
   */
  async function fetchPage(fetchOptions: { replace: boolean }): Promise<void> {
    state.value.isLoading = true;

    const { replace } = fetchOptions;

    try {
      const result: PaginationResult<NodeDto<HierarchyNode>[]> = await api.listHierarchyNodes(toValue(scope), {
        filters: toValue(options.filters),
        sort: toValue(options.sort),
        cursor: toValue(state.value.cursor),
      });

      const fetched: HierarchyEntry[] = result.data.map((n: NodeDto<HierarchyNode>) => createEntryFromNode(n));

      if (replace) {
        entries.value = fetched;
      } else {
        const existingUuids = new Set<string>(entries.value.map((e) => e.data.node.data.uuid));

        entries.value.push(...fetched.filter((e) => !existingUuids.has(e.data.node.data.uuid)));
      }

      state.value.pagination = result.pagination;
      state.value.cursor = (result.pagination.nextCursor as string | null) ?? null;
      state.value.initialized = true;
    } finally {
      state.value.isLoading = false;
    }
  }

  /**
   * Fetches the first page from scratch (drops the cursor). Call whenever filters, sort, search or
   * the parent change.
   *
   * @returns {Promise<void>} Resolves when the first page is loaded.
   */
  async function fetchFirstPage(): Promise<void> {
    state.value.cursor = null;

    await fetchPage({ replace: true });
  }

  /**
   * Fetches the next page (infinite scroll). No-op while loading or when there is nothing more.
   * A stale-cursor rejection (400) is recovered from by refetching the first page.
   *
   * @returns {Promise<void>} Resolves when the next page is loaded.
   */
  async function fetchNextPage(): Promise<void> {
    if (state.value.isLoading || !hasMore.value) {
      return;
    }

    try {
      await fetchPage({ replace: false });
    } catch (error: unknown) {
      if (error instanceof ApiError && error.statusCode === 400) {
        await fetchFirstPage();

        return;
      }

      throw error;
    }
  }

  return {
    hasMore,
    fetchFirstPage,
    fetchNextPage,
    createEntryFromNode,
  };
}
