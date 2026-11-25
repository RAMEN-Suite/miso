<script setup lang="ts">
import { ComponentPublicInstance, computed, ref, useTemplateRef, watch } from "vue";
import AutoComplete from "primevue/autocomplete";
import InputGroup from "primevue/inputgroup";
import InputGroupAddon from "primevue/inputgroupaddon";
import Button from "primevue/button";
import { MenuItem } from "primevue/menuitem";
import FilterableMenu from "./FilterableMenu.vue";

import { useSearchParams } from "../composables/useSearchParams";
import { CollectionNode, ContentNode, NodeSearchParams, EntityNode, PaginationData, PaginationResult } from "../models/types";
import { useAppStore } from "../store/app";
import { useConfigStore } from "../store/config";
import { onStartTyping, useElementSize, useInfiniteScroll } from "@vueuse/core";
import { resolveNodeIcon } from "../config/icons";
import { getBaseNodeRef, getTypeLabelText } from "../utils/helper/modelHelper";
import RAMENNodeIcon from "./RAMENNodeIcon.vue";

const props = defineProps<{
  /** Qualified ref of the node type to search, refinements included */
  classifierRef: string;
  /**
   * Qualified refs of node types. When given, the icon in front of the searchbar becomes a button opening a searchable
   * menu of these types.
   */
  classifierOptions?: string[];
  variant?: "filled" | "outlined";
  size?: "normal" | "small";
}>();

const { getModelContext } = useConfigStore();

const heightClass = computed<string>(() => (props.size === "small" ? "h-9" : "h-12"));
const variant = computed<"filled" | "outlined">(() => props.variant ?? "filled");

const labelMenu = useTemplateRef<InstanceType<typeof FilterableMenu>>("label-menu");
const labelButton = useTemplateRef<{ $el: HTMLElement }>("label-button");

/** The name of the searched node type */
const typeName = computed<string>(() => nodeTypeNameOf(props.classifierRef));

const labelMenuItems = computed<MenuItem[]>(() => [
  {
    label: nodeTypeNameOf(getBaseNodeRef(getModelContext(), props.classifierRef) ?? props.classifierRef),
    items: (props.classifierOptions ?? []).map((ref: string) => ({
      label: nodeTypeNameOf(ref),
      nodeIcon: resolveNodeIcon({ nodeLabels: [], classifierRef: ref }),
      command: () => emit("update:classifierRef", ref),
    })),
  },
]);

const { api } = useAppStore();
const { searchParams, updateSearchParams, resetSearchParams } = useSearchParams({ rowCount: 50 });

const emit = defineEmits<{
  itemSelected: [item: CollectionNode | ContentNode | EntityNode];
  "update:classifierRef": [ref: string];
}>();

const PREVIEW_CHARACTER_SIZE: number = 1000;

/** Distance (in px) to the end of the result list below which the next page is fetched. */
const NEXT_PAGE_SCROLL_DISTANCE: number = 25;

const isSearchActive = ref<boolean>(false);
const placeHolder = computed<string>(() => {
  return `Search ${typeName.value}`;
});

/**
 * The text currently shown in the input field. Must be kept separate since the
 * searchParams.searchInput value is updated asynchronously via debounce which
 * would lead to a laggy input on typing.
 */
const visibleSearchInput = ref<string>("");

const fetchedItems = ref<(CollectionNode | ContentNode | EntityNode)[]>([]);
const resultPagination = ref<PaginationData | null>(null);
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
  const inputEl: HTMLInputElement | null = getInputElement();

  if (inputEl && document.activeElement !== inputEl) {
    inputEl.focus();
  }
});

/**
 * Moves the focus into the searchbar. Exposed for callers that show the searchbar in reaction to a user
 * action.
 *
 * @param {"input" | "labelMenu"} [target] - `input` (default) focuses the search input. `labelMenu` opens the label
 * menu, `input` focuses the input.
 * @returns {void} This function does not return any value.
 */
function focus(target: "input" | "labelMenu" = "input"): void {
  const button: HTMLElement | undefined = labelButton.value?.$el;

  if (target === "labelMenu" && button && (props.classifierOptions?.length ?? 0) > 1) {
    button.click();
  } else {
    getInputElement()?.focus();
  }
}

/** The name of a node type, the ref if the model doesn't know it */
function nodeTypeNameOf(ref: string): string {
  return getModelContext().model.getNode(ref)?.name ?? ref;
}

function getInputElement(): HTMLInputElement | null {
  return searchbar.value?.$el.querySelector("input") ?? null;
}

/**
 * Appends a fetched page to the result list. Nodes that are already listed are skipped: the offset
 * pagination can return a node twice if the data changed between two page requests.
 *
 * @param {(CollectionNode | EntityNode | ContentNode)[]} data - The nodes of the fetched page.
 * @returns {void} This function does not return any value.
 */
function appendData(data: (CollectionNode | EntityNode | ContentNode)[]): void {
  const existingUuids = new Set<string>(fetchedItems.value.map((item) => item.properties.uuid));

  fetchedItems.value.push(...data.filter((item) => !existingUuids.has(item.properties.uuid)));
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
 * @returns {Promise<PaginationResult<(CollectionNode | EntityNode | ContentNode)[]>>} The fetched page plus pagination.
 */
async function fetchData(offset: number = 0): Promise<PaginationResult<(CollectionNode | EntityNode | ContentNode)[]>> {
  const { data, pagination } = await api.searchNodes(props.classifierRef, {
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
 * @returns {string} The truncated text, empty if there is none.
 */
function getPreviewText(text: string | undefined): string {
  return text?.slice(0, PREVIEW_CHARACTER_SIZE) ?? "";
}

function handleResultItemSelect(item: CollectionNode | ContentNode | EntityNode): void {
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

function replaceData(data: (CollectionNode | EntityNode | ContentNode)[]) {
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

function setPagination(newPagination: PaginationData | null) {
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

defineExpose({ focus });
</script>

<template>
  <InputGroup>
    <template v-if="props.classifierOptions?.length">
      <Button
        ref="label-button"
        type="button"
        class="label-button"
        :class="heightClass"
        :size="props.size === 'small' ? 'small' : undefined"
        severity="secondary"
        :outlined="variant === 'outlined'"
        :title="`Searching ${typeName} nodes. Click to search another type`"
        @click="labelMenu?.toggle($event)"
      >
        <RAMENNodeIcon :spec="resolveNodeIcon({ nodeLabels: [], classifierRef: props.classifierRef })" />
        <i class="icon-chevron-down" />
      </Button>
      <FilterableMenu ref="label-menu" :model="labelMenuItems">
        <template #itemicon="{ item }">
          <RAMENNodeIcon :spec="item.nodeIcon" />
        </template>
      </FilterableMenu>
    </template>
    <InputGroupAddon v-else class="w-12" :title="`Searching ${typeName} nodes`">
      <RAMENNodeIcon :spec="resolveNodeIcon({ nodeLabels: [], classifierRef: props.classifierRef })" />
    </InputGroupAddon>
    <AutoComplete
      ref="searchbar"
      v-model="visibleSearchInput"
      :class="[heightClass, isSearchActive ? 'active' : 'inactive']"
      :placeholder="placeHolder"
      :suggestions="fetchedItems"
      :loading="isReloading"
      input-class="w-full"
      class="searchbar"
      :size="props.size === 'small' ? 'small' : undefined"
      :variant="variant"
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
        <div class="result-item">
          <RAMENNodeIcon
            v-tooltip.hover.top="{ value: getTypeLabelText(getModelContext(), option), showDelay: 50 }"
            :spec="resolveNodeIcon(option)"
          />
          <span :title="getPreviewText(option.properties?.label ?? option.properties?.text)">
            {{ getPreviewText(option.properties?.label ?? option.properties?.text) }}
          </span>
        </div>
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
.label-button {
  flex: 0 0 auto;
  width: auto;
}

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
