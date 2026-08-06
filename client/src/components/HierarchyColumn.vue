<script setup lang="ts">
import { InputText, Button, useDialog } from "primevue";
import { useHierarchyStore } from "../store/hierarchy";
import HierarchyItem from "./HierarchyItem.vue";
import { MenuItem } from "primevue/menuitem";
import { HierarchyEntry, HierarchyFilters, HierarchySort, HierarchyNode, NodeDto } from "../models/types";
import { useGuidelinesStore } from "../store/guidelines";
import MultiSelect from "primevue/multiselect";
import Menu from "primevue/menu";
import { computed, ref, useTemplateRef, watch, WritableComputedRef } from "vue";
import OverlayBadge from "primevue/overlaybadge";
import { useAppStore } from "../store/app";
import { useEventListener, useInfiniteScroll, watchDebounced } from "@vueuse/core";
import { useHierarchyChildren } from "../composables/useHierarchyChildren";
import { FETCH_DELAY } from "../config/constants";
import CreateCollectionModal from "./CreateCollectionModal.vue";
import CreateContentModal from "./CreateContentModal.vue";
import { resolveNodeIcon } from "../config/icons.ts";

const props = defineProps<{
  index: number;
  parentUuid: string | null;
}>();

const { addToastMessage, createModalInstance, destroyModalInstance } = useAppStore();
const dialog: ReturnType<typeof useDialog> = useDialog();

const { getAvailableCollectionLabels, getAvailableContentLabels } = useGuidelinesStore();
const { levels, focus, canNavigate, selectItem, setMode } = useHierarchyStore();

const addMenu = useTemplateRef<InstanceType<typeof Menu>>("add-menu");

const collectionLabels: string[] = getAvailableCollectionLabels().toSorted();
const contentLabels: string[] = getAvailableContentLabels().toSorted();

const addMenuItems: MenuItem[] = [
  {
    label: "Collection",
    icon: "pi pi-folder",
    items: collectionLabels.map((l) => ({
      label: l,
      icon: resolveNodeIcon(["Collection"]),
      command: () => openCreateModal("Collection", { additionalNodeLabel: l }),
    })),
  },
  {
    label: "Content",
    icon: "pi pi-file",
    items: contentLabels.map((l) => ({
      label: l,
      icon: resolveNodeIcon(["Content"]),
      command: () => openCreateModal("Content", { additionalNodeLabel: l }),
    })),
  },
];

const groupedLabelOptions = computed(() => [
  { label: "Collections", items: collectionLabels.map((l) => ({ label: l, value: l })) },
  { label: "Contents", items: contentLabels.map((l) => ({ label: l, value: l })) },
]);

const allLabelValues: string[] = [...collectionLabels, ...contentLabels];

const searchInput = ref<string>("");
const selectedLabels = ref<string[]>([...allLabelValues]);
const sort = ref<HierarchySort>({ field: "distinct", direction: "asc" });

const filters = computed<HierarchyFilters>(() => ({
  search: searchInput.value,
  nodeLabels: selectedLabels.value,
}));

const areAllLabelsSelected = computed<boolean>(() => selectedLabels.value.length === allLabelValues.length);

const column = useTemplateRef<HTMLDivElement>("column");
const scrollPane = useTemplateRef<HTMLDivElement>("scroll-pane");
const resizer = useTemplateRef<HTMLDivElement>("resizer");

// The store-owned entries array for this column is the fetch sink - shared, reachable by the focus pane
// and the children composable. Needed to allow the composable working on the
// reactive data itself since it can not reach to the store itself (too many moving parts)
const entries: WritableComputedRef<HierarchyEntry[]> = computed({
  get: () => levels.value[props.index]?.entries ?? [],
  set: (value: HierarchyEntry[]) => {
    if (levels.value[props.index]) {
      levels.value[props.index].entries = value;
    }
  },
});

const focusedUuid = computed<string | null>(() => {
  if (!focus.value) {
    return null;
  }

  return focus.value.kind === "collection" ? focus.value.collection.node.data.uuid : focus.value.content.node.data.uuid;
});

const { pagination, isLoading, hasMore, fetchFirstPage, fetchNextPage, createEntryFromNode } = useHierarchyChildren(
  () => props.parentUuid,
  entries,
  { filters, sort },
);

useEventListener(resizer, "mousedown", startResize);
useEventListener(window, "mouseup", endResize);

useInfiniteScroll(scrollPane, fetchNextPage, {
  distance: 25,
  canLoadMore: () => hasMore.value && !isLoading.value,
});

// Parent change (navigation) -> reload from page 1
watch(
  () => props.parentUuid,
  () => fetchFirstPage(),
  { immediate: true },
);

// Label/sort changes -> reload immediately; search is debounced
watch([selectedLabels, sort], () => fetchFirstPage(), { deep: true });
watchDebounced(searchInput, () => fetchFirstPage(), { debounce: FETCH_DELAY });

function openCreateModal(kind: "Collection" | "Content", params: { additionalNodeLabel: string }): void {
  if (!canNavigate.value) {
    showUnsavedChangesWarning();
    return;
  }

  // The parent is the active item of the previous column, always a Collection (Contents have no columns)
  const parentCollection = props.index > 0 ? levels.value[props.index - 1]?.activeItem?.node ?? null : null;

  const modalComponent = kind === "Collection" ? CreateCollectionModal : CreateContentModal;

  createModalInstance(
    dialog.open(modalComponent, {
      props: {
        modal: true,
        header: `Create new ${params.additionalNodeLabel}`,
        style: { width: "420px" },
      },
      data: { parentCollection, additionalNodeLabel: params.additionalNodeLabel },
      emits: {
        onSuccess: (created: NodeDto<HierarchyNode>) => {
          if (!created) {
            return;
          }

          // Add to top of list (should be visible directly) and focus it
          entries.value.unshift(createEntryFromNode(created));
          selectItem(created, props.index);

          addToastMessage({ severity: "success", summary: "Operation successful", detail: "", life: 2000 });

          setMode("view");
          destroyModalInstance();
        },
      },
      onClose: destroyModalInstance,
    }),
  );
}

function toggleAddMenu(event: Event): void {
  addMenu.value?.toggle(event);
}

function handleChangeSortOrderClick(): void {
  sort.value = { ...sort.value, direction: sort.value.direction === "asc" ? "desc" : "asc" };
}

function handleItemSelected(uuid: string): void {
  if (!canNavigate.value) {
    showUnsavedChangesWarning();
    return;
  }

  if (uuid === focusedUuid.value) {
    return;
  }

  const entry: HierarchyEntry | undefined = entries.value.find((e) => e.data.node.data.uuid === uuid);

  if (entry) {
    selectItem(entry.data, props.index);
  }
}

function handleLabelsChange(selected: string[]): void {
  selectedLabels.value = selected;
}

function handleResize(event: MouseEvent): void {
  if (!column.value) {
    return;
  }

  const newWidth: number = event.clientX - column.value.getBoundingClientRect().left;
  column.value.style.width = `${newWidth}px`;
}

function showUnsavedChangesWarning(): void {
  addToastMessage({
    severity: "warn",
    summary: "You have unsaved changes.",
    detail: "Please save or discard your changes before navigating.",
    life: 3000,
  });
}

function startResize(): void {
  window.addEventListener("mousemove", handleResize);
}

function endResize(): void {
  window.removeEventListener("mousemove", handleResize);
}
</script>

<template>
  <div ref="column" class="column flex flex-column p-1">
    <div class="header flex gap-1">
      <InputText
        v-model="searchInput"
        size="small"
        class="w-full"
        spellcheck="false"
        placeholder="Filter"
        title="Filter by label or text"
      />
      <MultiSelect
        :model-value="selectedLabels"
        :options="groupedLabelOptions"
        option-label="label"
        option-value="value"
        option-group-label="label"
        option-group-children="items"
        dropdown-icon="pi pi-filter"
        :filter="false"
        title="Select node labels to filter"
        class="flex-shrink-0"
        :pt="{
          root: { style: { height: '100%' } },
          labelContainer: { style: { display: 'none' } },
        }"
        @update:model-value="handleLabelsChange"
      >
        <template #dropdownicon>
          <OverlayBadge v-if="!areAllLabelsSelected" severity="danger">
            <i class="pi pi-filter-fill" />
          </OverlayBadge>
          <i v-else class="pi pi-filter" />
        </template>
      </MultiSelect>
      <Button
        size="small"
        severity="secondary"
        :icon="`pi pi-sort-alpha-${sort.direction === 'asc' ? 'down' : 'up'}`"
        title="Change sort"
        @click="handleChangeSortOrderClick"
      />
    </div>
    <div class="content-wrapper">
      <div ref="scroll-pane" class="content">
        <template v-for="entry in entries" :key="entry.data.node.data.uuid">
          <HierarchyItem
            :entry="entry"
            :is-active="levels[props.index]?.activeItem?.node.data.uuid === entry.data.node.data.uuid"
            @item-selected="handleItemSelected"
          ></HierarchyItem>
        </template>
        <div v-if="isLoading && entries.length > 0" class="text-center" title="More data are loading...">
          <span class="pi pi-spin pi-spinner"></span>
        </div>
      </div>
      <Button
        class="add-button"
        severity="secondary"
        icon="pi pi-plus"
        title="Add Collection or Content"
        @click="toggleAddMenu"
      />
      <Menu ref="add-menu" :model="addMenuItems" :popup="true" />
    </div>
    <div class="footer">
      <div class="count text-xs text-right pr-3">{{ entries.length }}/{{ pagination?.totalRecords ?? 0 }}</div>
    </div>
  </div>
  <div ref="resizer" class="resizer" title="Hold down mouse and drag to resize column">
    <div class="handle"></div>
  </div>
</template>

<style scoped>
.column {
  display: flex;
  width: 220px;
}

.resizer {
  padding: 10px 0;
  background-color: var(--p-splitter-gutter-background);
  width: 7px;
  cursor: col-resize;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;

  .handle {
    width: 3px;
    border-radius: 5px;
    background-color: rgb(143, 143, 143);
    height: 50px;
  }
}

.header > * {
  min-width: 0;
}

.content-wrapper {
  position: relative;
  display: flex;
  flex-grow: 1;
  min-height: 0;
}

.content {
  overflow-y: auto;
  overflow-x: hidden;
  flex-grow: 1;
  scrollbar-width: thin;
  scrollbar-gutter: stable;
}

.add-button {
  position: absolute;
  right: 0.75rem;
  bottom: 0.75rem;
  opacity: 0.55;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  transition: opacity 0.15s ease;

  &:hover,
  &:focus-visible {
    opacity: 1;
  }
}
</style>
