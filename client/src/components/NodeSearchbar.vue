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
import { onStartTyping } from "@vueuse/core";
import NodeIcon from "./NodeIcon.vue";

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

const PREVIEW_CHARACTER_SIZE: number = 25;

const isSearchActive = ref<boolean>(false);
const placeHolder = computed<string>(() => {
  return `Search ${props.additionalNodeLabel}`;
});

/**
 * The text currently shown in the input field. Must be kept separate since the
 * searchParams.searchInput value is updated asynchronously via debounde which
 * would lead to a laggy input on typing^.
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

onStartTyping(() => {
  const inputEl: HTMLInputElement | undefined = searchbar.value?.$el.querySelector("input");

  if (inputEl && document.activeElement !== inputEl) {
    inputEl.focus();
  }
});
</script>

<template>
  <InputGroup>
    <InputGroupAddon class="w-3rem" :title="`Searching ${props.additionalNodeLabel} nodes`">
      <NodeIcon :node-labels="[props.baseNodeLabel, props.additionalNodeLabel]" />
    </InputGroupAddon>
    <AutoComplete
      ref="searchbar"
      :class="isSearchActive ? 'active' : 'inactive'"
      v-model="visibleSearchInput"
      :placeholder="placeHolder"
      :suggestions="fetchedItems"
      :loading="isLoading"
      input-class="w-full"
      class="searchbar h-3rem"
      variant="filled"
      :title="placeHolder"
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
        <div class="font-medium px-3 py-2">{{ fetchedItems.length }} Results</div>
      </template>
      <template #option="{ option }">
        <template v-if="props.baseNodeLabel === 'Collection'">
          <div class="result-item">
            <NodeIcon :node-labels="option.nodeLabels" />
            <span :title="option.data">{{ option.data?.label ?? option.data?.text }}</span>
          </div>
        </template>
        <template v-if="props.baseNodeLabel === 'Entity'">
          <div class="result-item">
            <NodeIcon :node-labels="option.nodeLabels" />
            <span :title="option.data">{{ option.data?.label ?? option.data?.text }}</span>
          </div>
        </template>
        <template v-if="props.baseNodeLabel === 'Content'">
          <div class="result-item">
            <NodeIcon :node-labels="option.nodeLabels" />
            <span :title="option.data">{{ option.data?.text.slice(0, PREVIEW_CHARACTER_SIZE) }}</span>
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
}
</style>
