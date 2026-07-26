import { computed, MaybeRefOrGetter, readonly, Ref, ref, toValue } from "vue";
import { useAppStore } from "../store/app";
import {
  HierarchyEntry,
  HierarchyFilters,
  HierarchyNode,
  HierarchySort,
  NodeDto,
  PaginationData,
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
 * The composable does **not** own the entries: it writes them into the `entries` ref the caller
 * provides. A column passes the store-owned `levels[i].entries` (shared, reachable by the focus
 * pane); a future tree node passes a local `ref([])`. The composable owns only what is genuinely
 * per-list — the opaque cursor, the loading flag and hasMore.
 *
 * This might be replaced in the near future since it is not completely usabel for tree/directory view.
 *
 * @param {MaybeRefOrGetter<string | null>} parentUuid - Parent UUID, or null for top-level nodes.
 * @param {Ref<HierarchyEntry[]>} entries - The sink the fetched entries are written into.
 * @param {UseHierarchyChildrenOptions} options - Reactive filters, sort and optional page size.
 */
export function useHierarchyChildren(
  parentUuid: MaybeRefOrGetter<string | null>,
  entries: Ref<HierarchyEntry[]>,
  options: UseHierarchyChildrenOptions,
) {
  const { api } = useAppStore();

  const cursor = ref<string | null>(null);
  const pagination = ref<PaginationData | null>(null);
  const isLoading = ref<boolean>(false);
  const initialized = ref<boolean>(false);

  const hasMore = computed<boolean>(() => initialized.value && cursor.value !== null);

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
    isLoading.value = true;

    const { replace } = fetchOptions;

    try {
      const result: PaginationResult<NodeDto<HierarchyNode>[]> = await api.getHierarchyChildren(toValue(parentUuid), {
        filters: toValue(options.filters),
        sort: toValue(options.sort),
        cursor: cursor.value,
      });

      const fetched: HierarchyEntry[] = result.data.map((n: NodeDto<HierarchyNode>) => createEntryFromNode(n));

      if (replace) {
        entries.value = fetched;
      } else {
        const existingUuids = new Set<string>(entries.value.map((e) => e.data.node.data.uuid));

        entries.value.push(...fetched.filter((e) => !existingUuids.has(e.data.node.data.uuid)));
      }

      pagination.value = result.pagination;
      cursor.value = (result.pagination.nextCursor as string | null) ?? null;
      initialized.value = true;
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Fetches the first page from scratch (drops the cursor). Call whenever filters, sort, search or
   * the parent change.
   *
   * @returns {Promise<void>} Resolves when the first page is loaded.
   */
  async function fetchFirstPage(): Promise<void> {
    cursor.value = null;

    await fetchPage({ replace: true });
  }

  /**
   * Fetches the next page (infinite scroll). No-op while loading or when there is nothing more.
   * A stale-cursor rejection (400) is recovered from by refetching the first page.
   *
   * @returns {Promise<void>} Resolves when the next page is loaded.
   */
  async function fetchNextPage(): Promise<void> {
    if (isLoading.value || !hasMore.value) {
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
    pagination: readonly(pagination),
    isLoading: readonly(isLoading),
    hasMore,
    fetchFirstPage,
    fetchNextPage,
    createEntryFromNode,
  };
}
