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
import { onStartTyping, useElementSize } from "@vueuse/core";
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

const isLoading = ref<boolean>(false);

/** Guards against out-of-order responses overwriting the results of a newer search. */
let latestRequestId: number = 0;

watch(searchParams, handleSearchParamsChange, {
  deep: true,
});

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

function resetPagination(): void {
  setPagination(null);
}

async function fetchData(): Promise<PaginationResult<(CollectionNode | EntityNode | TextNode)[]>> {
  const { data, pagination } = await api.searchNodes(props.baseNodeLabel, {
    filters: searchParams.value,
  });

  return { data, pagination };
}

function setPagination(newPagination: PaginationData) {
  resultPagination.value = newPagination;
}

function replaceData(data: (CollectionNode | EntityNode | TextNode)[]) {
  fetchedItems.value = data;
}

async function handleSearchParamsChange() {
  const requestId: number = ++latestRequestId;
  isLoading.value = true;

  try {
    const { data, pagination } = await fetchData();

    if (requestId !== latestRequestId) {
      return;
    }

    pagination.offset = (pagination.offset ?? 0) + data.length;

    replaceData(data);
    setPagination(pagination);
  } finally {
    // Only the newest request can end the loading state
    if (requestId === latestRequestId) {
      isLoading.value = false;
    }
  }
}

const searchbar = useTemplateRef<InstanceType<typeof AutoComplete> & ComponentPublicInstance>("searchbar");

const { width: searchbarWidth } = useElementSize(searchbar, undefined, { box: "border-box" });

onStartTyping(() => {
  const inputEl: HTMLInputElement | undefined = searchbar.value?.$el.querySelector("input");

  if (inputEl && document.activeElement !== inputEl) {
    inputEl.focus();
  }
});
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
      :loading="isLoading"
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
        <div class="font-medium px-4 py-2">{{ fetchedItems.length }} Results</div>
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
