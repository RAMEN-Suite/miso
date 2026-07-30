import { DeepReadonly, readonly, Ref, ref, toValue } from "vue";
import { NodeSearchParams, ReferenceNodeLabel } from "../models/types";
import { useGuidelinesStore } from "../store/guidelines";
import { useTimeoutFn } from "@vueuse/core";
import { FETCH_DELAY } from "../config/constants";

export interface UseSearchParamsReturn {
  searchParams: DeepReadonly<Ref<NodeSearchParams>>;
  resetSearchParams: () => void;
  updateSearchParams: (params: NodeSearchParams, options?: { immediate: boolean }) => void;
}

/**
 * Composable function for managing search parameters for fetching node data.
 *
 * Currently used for displaying (sub-)collections in a table and searching nodes, combined with pagination. Returns the search parameter object.
 *
 * The object contains the following properties:
 * - `searchParams`: A reactive object property with the search parameters. The object is readonly, but its properties are not. The properties are:
 *   - `searchInput`: The search string to search for in the node.
 *   - `nodeLabels`: An array of node labels to filter by.
 *   - `rowCount`: The number of results to return in the result set.
 *   - `sortDirection`: The direction to sort by.
 * - `resetSearchParams`: A function that resets the search parameters to their default values.
 * - `updateSearchParams`: A function that updates the search parameters with given data. These are partials, so not all parameters will be updated.
 *
 * @param {Object} options - The options for the search.
 * @param {string} options.scope - The base node label the search is scoped to.
 * @param {number} options.rowCount - The number of rows to fetch per page (optional).
 * @param {string[]} options.nodeLabels - Fixed node labels to search with, overriding the default of
 *   "all available labels for this scope". Pass this to lock a search to a single label; the lock is
 *   re-applied by `resetSearchParams` so it survives a reset.
 * @returns {UseSearchParamsReturn} An object with reactive properties for performing a search query on the backend.
 */
export function useSearchParams(options: {
  scope: ReferenceNodeLabel;
  rowCount?: number;
  nodeLabels?: string[];
}): UseSearchParamsReturn {
  const { getAvailableNodeLabels } = useGuidelinesStore();

  const DEFAULT_ROW_COUNT: number | null = options?.rowCount ?? null;

  const defaultNodeLabels: string[] = options.nodeLabels ?? toValue(getAvailableNodeLabels(options.scope));

  const searchParams = ref<NodeSearchParams>({
    searchInput: "",
    nodeLabels: [...defaultNodeLabels],
    offset: 0,
    rowCount: DEFAULT_ROW_COUNT,
    sortDirection: "asc",
  });

  /**
   * Resets the search parameters to their default values. Currently only used when the uuid of a route changes
   * and new data need to be fetched without any filters applied.
   *
   * @returns {void} This function does not return any value.
   */
  function resetSearchParams(): void {
    searchParams.value = {
      searchInput: "",
      nodeLabels: [...defaultNodeLabels],
      offset: 0,
      rowCount: DEFAULT_ROW_COUNT,
      sortDirection: "asc",
    };
  }

  /** Debounced update of the search parameters */
  const { start: updateDebounced } = useTimeoutFn(
    (params: NodeSearchParams) => {
      updateParams(params);
    },
    FETCH_DELAY,
    { immediate: false },
  );

  /**
   * Updates the search parameters with given data. These are partials, so not all parameters will be updated.
   * If the `immediate` option is set to true (default), the search parameters are updated immediately. If set to false,
   * the update is debounced with the time specified in `FETCH_DELAY` (currently 500ms).
   *
   * @param {NodeSearchParams} params - The partial search parameters to update.
   * @param {{ immediate: boolean }} options - Optional options object.
   * @param {boolean} options.immediate - Whether to update the search parameters immediately or not.
   */
  function updateSearchParams(params: NodeSearchParams, options: { immediate: boolean } = { immediate: true }): void {
    const { immediate } = options;

    if (immediate) {
      updateParams(params);
    } else {
      updateDebounced(params);
    }
  }

  /**
   * Updates the search parameters with given data. These are partials, so not all parameters will be updated.
   * The search parameters are updated immediately.
   *
   * @param {NodeSearchParams} params - The partial search parameters to update.
   */
  function updateParams(params: NodeSearchParams): void {
    for (const [name, value] of Object.entries(params)) {
      if (value !== undefined && name in searchParams.value) {
        searchParams.value[name] = value;
      }
    }
  }

  return {
    searchParams: readonly(searchParams),
    resetSearchParams,
    updateSearchParams,
  };
}
