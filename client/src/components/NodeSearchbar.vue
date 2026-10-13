<script setup lang="ts">
import { ComponentPublicInstance, computed, ref, useTemplateRef, watch } from "vue";
import AutoComplete from "primevue/autocomplete";
import InputGroup from "primevue/inputgroup";
import InputGroupAddon from "primevue/inputgroupaddon";

import { useSearchParams } from "../composables/useSearchParams";
import {
  CollectionNode,
  NodeSearchParams,
  EntityNode,
  PaginationData,
  PaginationResult,
  ReferenceNodeLabel,
  TextNode,
} from "../models/types";
import { useAppStore } from "../store/app";
import { onStartTyping, useElementSize, useInfiniteScroll } from "@vueuse/core";
import { resolveNodeIcon } from "../config/icons";
import { filterBaseNodeLabels } from "../config/ramen";
import RAMENNodeIcon from "./RAMENNodeIcon.vue";

const props = defineProps<{
  baseNodeLabel: ReferenceNodeLabel;
  additionalNodeLabel: string;
}>();

const { api } = useAppStore();
const { searchParams, updateSearchParams, resetSearchParams } = useSearchParams({
  scope: props.baseNodeLabel,
  rowCount: 50,
  nodeLabels: [props.additionalNodeLabel],
});

const emit = defineEmits<(e: "itemSelected", item: CollectionNode | TextNode | EntityNode) => void>();

const PREVIEW_CHARACTER_SIZE: number = 1000;

/** Distance (in px) to the end of the result list below which the next page is fetched. */
const NEXT_PAGE_SCROLL_DISTANCE: number = 25;

const isSearchActive = ref<boolean>(false);
const placeHolder = computed<string>(() => {
  return `Search ${props.additionalNodeLabel}`;
});

/**
 * The text currently shown in the input field. Must be kept separate since the
 * searchParams.searchInput value is updated asynchronously via debounce which
 * would lead to a laggy input on typing.
 */
const visibleSearchInput = ref<string>("");

const fetchedItems = ref<(CollectionNode | TextNode | EntityNode)[]>([]);
const resultPagination = ref<PaginationData>();
const hasMoreItems = ref<boolean>(false);

const isLoading = ref<boolean>(false);
const isLoadingMore = ref<boolean>(false);
const isReloading = computed<boolean>(() => isLoading.value && !isLoadingMore.value);

/** Guards against out-of-order responses overwriting the results of a newer search. */
let latestRequestId: number = 0;

const resultList = ref<HTMLElement | null>(null);
const searchbar = useTemplateRef<InstanceType<typeof AutoComplete> & ComponentPublicInstance>("searchbar");

const { width: searchbarWidth } = useElementSize(searchbar, undefined, { box: "border-box" });

watch(searchParams, handleSearchParamsChange, {
  deep: true,
});

useInfiniteScroll(resultList, fetchNextPage, {
  distance: NEXT_PAGE_SCROLL_DISTANCE,
  canLoadMore: () => hasMoreItems.value && !isLoading.value,
});

onStartTyping(() => {
  const inputEl: HTMLInputElement | undefined = searchbar.value?.$el.querySelector("input");

  if (inputEl && document.activeElement !== inputEl) {
    inputEl.focus();
  }
});

/**
 * Appends a fetched page to the result list. Nodes that are already listed are skipped: the offset
 * pagination can return a node twice if the data changed between two page requests.
 *
 * @param {(CollectionNode | EntityNode | TextNode)[]} data - The nodes of the fetched page.
 * @returns {void} This function does not return any value.
 */
function appendData(data: (CollectionNode | EntityNode | TextNode)[]): void {
  const existingUuids = new Set<string>(fetchedItems.value.map((item) => item.data.uuid));

  fetchedItems.value.push(...data.filter((item) => !existingUuids.has(item.data.uuid)));
}

/**
 * Stores the pagination of a fetched page. The offset is advanced by the page size, so it always
 * holds the number of results fetched from the server so far — the offset of the next page.
 *
 * @param {PaginationData} pagination - The pagination returned with the page.
 * @param {number} pageSize - The number of nodes the page contained.
 * @returns {void} This function does not return any value.
 */
function applyPagination(pagination: PaginationData, pageSize: number): void {
  pagination.offset = (pagination.offset ?? 0) + pageSize;

  setPagination(pagination);

  // An empty page ends the list even if the total says otherwise (results removed in the meantime)
  hasMoreItems.value = pageSize > 0 && pagination.offset < pagination.totalRecords;
}

/**
 * Fetches one page of nodes matching the current search parameters.
 *
 * @param {number} offset - The number of results to skip, i.e. how many were already fetched.
 * @returns {Promise<PaginationResult<(CollectionNode | EntityNode | TextNode)[]>>} The fetched page plus pagination.
 */
async function fetchData(offset: number = 0): Promise<PaginationResult<(CollectionNode | EntityNode | TextNode)[]>> {
  const { data, pagination } = await api.searchNodes(props.baseNodeLabel, {
    filters: { ...searchParams.value, offset },
  });

  return { data, pagination };
}

/**
 * Fetches the next page of the current search and appends it to the result list. No-op while a
 * request is running or when everything is fetched. A search started in the meantime wins: the
 * page of the outdated search is dropped.
 *
 * @returns {Promise<void>} Resolves when the next page is applied.
 */
async function fetchNextPage(): Promise<void> {
  if (isLoading.value || !hasMoreItems.value) {
    return;
  }

  const requestId: number = ++latestRequestId;
  isLoading.value = true;
  isLoadingMore.value = true;

  try {
    const { data, pagination } = await fetchData(resultPagination.value?.offset ?? fetchedItems.value.length);

    if (requestId !== latestRequestId) {
      return;
    }

    appendData(data);
    applyPagination(pagination, data.length);
  } finally {
    // A search that started in the meantime is a reload, whatever happened to this page
    isLoadingMore.value = false;

    // Only the newest request can end the loading state
    if (requestId === latestRequestId) {
      isLoading.value = false;
    }
  }
}

/**
 * Returns the first characters of given text.
 *
 * Used to cap the characters inserted into the DOM as fulltext or title attributes to prevent
 * performance issues. Visual clipping is handled via CSS `text-overflow: ellipsis`.
 *
 * @param text - The text to truncate.
 * @returns {void} - This function does not return any value.
 */
function getPreviewText(text: string | undefined): string {
  return text?.slice(0, PREVIEW_CHARACTER_SIZE) ?? "";
}

function handleResultItemSelect(item: CollectionNode | TextNode | EntityNode): void {
  resetSearch();

  emit("itemSelected", item);
}

function handleSearchInputChange(newInput: string) {
  const data: NodeSearchParams = {
    searchInput: newInput,
  };

  updateSearchParams(data, { immediate: false });
}

async function handleSearchParamsChange() {
  const requestId: number = ++latestRequestId;
  isLoading.value = true;

  try {
    const { data, pagination } = await fetchData();

    if (requestId !== latestRequestId) {
      return;
    }

    replaceData(data);
    applyPagination(pagination, data.length);
  } finally {
    // Only the newest request can end the loading state
    if (requestId === latestRequestId) {
      isLoading.value = false;
    }
  }
}

function replaceData(data: (CollectionNode | EntityNode | TextNode)[]) {
  fetchedItems.value = data;
}

function resetPagination(): void {
  setPagination(null);
  hasMoreItems.value = false;
}

function resetSearch(): void {
  visibleSearchInput.value = "";
  fetchedItems.value = [];
  resetSearchParams();
  resetPagination();
  setIsSearchActive(false);
}

function setIsSearchActive(mode: boolean): void {
  isSearchActive.value = mode;

  if (!mode) {
    return;
  }
}

function setPagination(newPagination: PaginationData) {
  resultPagination.value = newPagination;
}

/**
 * Function ref for the scrollable result list. The list lives in the AutoComplete's overlay, which
 * is only mounted while open — Vue calls this with the element on mount and with `null` on unmount.
 *
 * @param {Element | ComponentPublicInstance | null} element - The result list element, or `null` once it is gone.
 * @returns {void} This function does not return any value.
 */
function setResultList(element: Element | ComponentPublicInstance | null): void {
  resultList.value = element as HTMLElement | null;
}
</script>

<template>
  <InputGroup>
    <InputGroupAddon class="w-12" :title="`Searching ${props.additionalNodeLabel} nodes`">
      <RAMENNodeIcon :spec="resolveNodeIcon([props.baseNodeLabel, props.additionalNodeLabel])" />
    </InputGroupAddon>
    <AutoComplete
      ref="searchbar"
      v-model="visibleSearchInput"
      :class="isSearchActive ? 'active' : 'inactive'"
      :placeholder="placeHolder"
      :suggestions="fetchedItems"
      :loading="isReloading"
      input-class="w-full"
      class="searchbar h-12"
      variant="filled"
      :title="placeHolder"
      :overlay-style="{ width: `${searchbarWidth}px`, maxWidth: `${searchbarWidth}px` }"
      :pt="{
        pcInputText: {
          root: {
            autofocus: true,
          },
        },
        listContainer: {
          ref: setResultList,
        },
        loader: {
          style: {
            zIndex: 1,
          },
        },
      }"
      @complete="handleSearchInputChange($event.query)"
      @option-select="handleResultItemSelect($event.value)"
    >
      <template v-if="fetchedItems.length > 0" #header>
        <div class="font-medium px-4 py-2">
          {{ fetchedItems.length }}
          <template v-if="hasMoreItems">of {{ resultPagination?.totalRecords }}</template>
          Results
        </div>
      </template>
      <template #option="{ option }">
        <template v-if="props.baseNodeLabel === 'Collection'">
          <div class="result-item">
            <RAMENNodeIcon
              v-tooltip.hover.top="{ value: filterBaseNodeLabels(option.nodeLabels).join(', '), showDelay: 50 }"
              :spec="resolveNodeIcon(option.nodeLabels)"
            />
            <span :title="getPreviewText(option.data?.label ?? option.data?.text)">
              {{ getPreviewText(option.data?.label ?? option.data?.text) }}
            </span>
          </div>
        </template>
        <template v-if="props.baseNodeLabel === 'Entity'">
          <div class="result-item">
            <RAMENNodeIcon
              v-tooltip.hover.top="{ value: filterBaseNodeLabels(option.nodeLabels).join(', '), showDelay: 50 }"
              :spec="resolveNodeIcon(option.nodeLabels)"
            />
            <span :title="getPreviewText(option.data?.label ?? option.data?.text)">
              {{ getPreviewText(option.data?.label ?? option.data?.text) }}
            </span>
          </div>
        </template>
        <template v-if="props.baseNodeLabel === 'Content'">
          <div class="result-item">
            <RAMENNodeIcon
              v-tooltip.hover.top="{ value: filterBaseNodeLabels(option.nodeLabels).join(', '), showDelay: 50 }"
              :spec="resolveNodeIcon(option.nodeLabels)"
            />
            <span :title="getPreviewText(option.data?.text)">{{ getPreviewText(option.data?.text) }}</span>
          </div>
        </template>
      </template>
    </AutoComplete>
    <Teleport v-if="resultList && isLoadingMore" :to="resultList">
      <div class="text-center py-1" title="More data are loading...">
        <span class="icon-loader-circle animate-spin"></span>
      </div>
    </Teleport>
  </InputGroup>
</template>

<style scoped>
.result-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  min-width: 0;
  width: 100%;
}

.result-item > :first-child {
  flex-shrink: 0;
}

.result-item > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
