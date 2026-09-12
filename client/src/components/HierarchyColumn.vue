<script setup lang="ts">
import { InputText, Button, SplitButton, useDialog } from "primevue";
import { useHierarchyStore } from "../store/hierarchy";
import HierarchyItem from "./HierarchyItem.vue";
import { MenuItem } from "primevue/menuitem";
import {
  FilterRule,
  FilterSpec,
  FilterTarget,
  HierarchyEntry,
  HierarchyScope,
  HierarchyNode,
  Level,
  LevelState,
  NodeDto,
  PropertyConfig,
} from "../models/types";
import { targetKey } from "../config/filters";
import { useTagsStore } from "../store/tags";
import { useGuidelinesStore } from "../store/guidelines";
import Menu from "primevue/menu";
import FilterPopover from "./FilterPopover.vue";
import { computed, onMounted, useTemplateRef, watch, WritableComputedRef } from "vue";
import { useAppStore } from "../store/app";
import { useDebounceFn, useEventListener, useInfiniteScroll } from "@vueuse/core";
import { useHierarchyChildren } from "../composables/useHierarchyChildren";
import { FETCH_DELAY } from "../config/constants";
import CreateCollectionModal from "./CreateCollectionModal.vue";
import CreateContentModal from "./CreateContentModal.vue";
import { resolveNodeIcon } from "../config/icons.ts";

const props = defineProps<{
  index: number;
  parentUuid: string | null;
}>();

const dialog: ReturnType<typeof useDialog> = useDialog();

const { addToastMessage, createModalInstance, destroyModalInstance } = useAppStore();
const { getAvailableCollectionLabels, getAvailableContentLabels, getAllCollectionConfigFields } = useGuidelinesStore();
const { levels, focus, root, canNavigate, resetQuery, selectItem, setMode } = useHierarchyStore();
const { getTagEntryUuids } = useTagsStore();

/** Derived state from the store. Shorthand since multiple use cases in the component */
const state = computed<LevelState>(() => levels.value[props.index]?.state);

/** Filters of this column. */
const filters: WritableComputedRef<FilterSpec> = computed({
  get: () => levels.value[props.index]?.query.filters ?? [],
  set: (value: FilterSpec) => {
    if (levels.value[props.index]) {
      levels.value[props.index].query.filters = value;
    }
  },
});

/**
 * The rule representing the distinct property search (`label` for Collections, `text` for Content).
 * Used to access the nested state direcly via a searchbox component.
 */
const searchRule = computed<FilterRule | undefined>(() =>
  filters.value.find((rule: FilterRule) => rule.target.kind === "distinct"),
);

/**
 * The search input for the search rule. Bound to the component's state.
 */
const searchInput: WritableComputedRef<string> = computed({
  get: () => (searchRule.value?.conditions[0]?.value as string) ?? "",
  set: (value: string) => {
    if (searchRule.value?.conditions[0]) {
      searchRule.value.conditions[0].value = value;
    }
  },
});

const addMenu = useTemplateRef<InstanceType<typeof Menu>>("add-menu");
const filterPopover = useTemplateRef<InstanceType<typeof FilterPopover>>("filter-popover");
const sortButton = useTemplateRef<{ $el: HTMLElement }>("sort-button");

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

const allLabelValues: string[] = [...collectionLabels, ...contentLabels];

/**
 * Whether anything in the filter popover currently narrows the listing.
 */
const hasActiveFilters = computed<boolean>(() => {
  const selectedLabels: string[] = (filters.value.find((rule: FilterRule) => rule.target.kind === "labels")?.conditions[0]
    ?.value ?? []) as string[];

  if (selectedLabels.length !== allLabelValues.length) {
    return true;
  }

  for (const rule of filters.value) {
    if (rule.target.kind === "property" && rule.conditions.length > 0) {
      return true;
    }

    if (rule.target.kind === "distinct" && rule.conditions[0]?.value !== "") {
      return true;
    }
  }

  return false;
});

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

/**
 * Which set of nodes this column lists (db hierarchy, tags etc.). Only the first column depends on the active root — every
 * column below it always shows the `PART_OF` children of the item selected in the previous one.
 */
const scope = computed<HierarchyScope>(() => {
  if (props.parentUuid) {
    return { kind: "children", parentUuid: props.parentUuid };
  }

  if (props.index === 0 && root.value.kind === "tag") {
    return { kind: "uuids", uuids: getTagEntryUuids(root.value.uuid) };
  }

  return { kind: "top" };
});

/** Creating a node inside a tag listing should not be allowed, there is no place to put it in the database */
const canCreateNodes = computed<boolean>(() => scope.value.kind !== "uuids");

const focusedUuid = computed<string | null>(() => {
  if (!focus.value) {
    return null;
  }

  return focus.value.kind === "collection" ? focus.value.collection.node.data.uuid : focus.value.content.node.data.uuid;
});

// Getters, not the objects themselves: `updateLevels` replaces the whole level on navigation, and a
// captured reference would keep sending the previous level's query (the column is reused by index,
// not remounted).
const { hasMore, fetchFirstPage, fetchNextPage, createEntryFromNode } = useHierarchyChildren(scope, entries, state, {
  filters: () => levels.value[props.index].query.filters,
  sort: () => levels.value[props.index].query.sort,
});

useEventListener(resizer, "mousedown", startResize);
useEventListener(window, "mouseup", endResize);

useInfiniteScroll(scrollPane, fetchNextPage, {
  distance: 25,
  canLoadMore: () => hasMore.value && !state.value.isLoading,
});

watch(scope, () => fetchFirstPage(), { immediate: true });

const debouncedFetchFirstPage = useDebounceFn(() => fetchFirstPage(), FETCH_DELAY);

// PrimeVue's `pt` option does not reliably reach the SplitButton's internal dropdown/main buttons
// (see the same workaround in AnnotationButton.vue), so the width is set on the DOM node directly.
onMounted(() => {
  const dropdownButton: HTMLButtonElement | null = sortButton.value?.$el.querySelector(".p-splitbutton-dropdown") ?? null;

  if (dropdownButton) {
    dropdownButton.style.width = "15px";
    dropdownButton.style.padding = "1px";
  }
});

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

/**
 * Opens/closes the filter popover.
 *
 * @param {Event} event - The click that triggered it, used by the popover to position itself.
 * @returns {void} This function does not return a value.
 */
function toggleFilterPopover(event: Event): void {
  filterPopover.value?.toggle(event);
}

/**
 * Resets this column back to an unfiltered listing. The defaults come from the store, so "no
 * filtering" means the same thing here as it does for a freshly built level.
 *
 * @returns {void} This function does not return a value.
 */
async function handleClearFilters(): Promise<void> {
  resetQuery(props.index);

  await fetchFirstPage();
}

/**
 * Apply filters to the current column and refetch the first page.
 *
 * @param {FilterSpec} updatedFilters - The filters to apply.
 * @returns {void} This function does not return a value.
 */
async function handleApplyFilters(updatedFilters: FilterSpec): Promise<void> {
  levels.value[props.index].query.filters = updatedFilters;

  await fetchFirstPage();
}

async function handleChangeSortOrderClick(): Promise<void> {
  const level: Level | undefined = levels.value[props.index];

  if (!level) {
    return;
  }

  level.query.sort = { ...level.query.sort, order: level.query.sort.order === "asc" ? "desc" : "asc" };

  await fetchFirstPage();
}

const sortTargetOptions = computed<{ label: string; value: string }[]>(() => [
  { label: "Alphabetically", value: "distinct" },
  ...getAllCollectionConfigFields()
    .filter((config: PropertyConfig, index: number, all: PropertyConfig[]) => {
      return config?.name && all.findIndex((other: PropertyConfig) => other.name === config.name) === index;
    })
    .toSorted((a: PropertyConfig, b: PropertyConfig) => a.name.localeCompare(b.name))
    .map((property: PropertyConfig) => ({ label: property.name, value: property.name })),
]);

const sortTargetKey = computed<string>(() => targetKey(levels.value[props.index]?.query.sort.target ?? { kind: "distinct" }));

const sortMenuItems = computed<MenuItem[]>(() =>
  sortTargetOptions.value.map((option) => ({
    label: option.label,
    icon: sortTargetKey.value === option.value ? "pi pi-check" : undefined,
    title: option.value === "distinct" ? "Sort alphabetically" : `Sort by ${option.label}`,
    command: () => handleSortTargetChange(option.value),
  })),
);

/**
 * Switches what this column is sorted by and refetches the first page.
 *
 * @param {string} key - The chosen option's value: "distinct", or a property name.
 * @returns {void} This function does not return a value.
 */
async function handleSortTargetChange(key: string): Promise<void> {
  const level: Level | undefined = levels.value[props.index];

  if (!level) {
    return;
  }

  const target: FilterTarget = key === "distinct" ? { kind: "distinct" } : { kind: "property", field: key };

  level.query.sort = { ...level.query.sort, target };

  await fetchFirstPage();
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
  <div v-if="levels[props.index]" ref="column" class="column flex flex-column p-1">
    <div class="header flex gap-1">
      <InputText
        v-model="searchInput"
        size="small"
        class="w-full"
        spellcheck="false"
        placeholder="Search..."
        title="Filter by label or text"
        @update:model-value="debouncedFetchFirstPage"
      />
      <Button size="small" severity="secondary" title="Filter the listing" class="flex-shrink-0" @click="toggleFilterPopover">
        <i v-if="hasActiveFilters" class="pi pi-filter-fill" />
        <i v-else class="pi pi-filter" />
      </Button>
      <SplitButton
        ref="sort-button"
        size="small"
        severity="secondary"
        :icon="`pi pi-sort-amount-${levels[props.index].query.sort.order === 'asc' ? 'down' : 'up'}`"
        :model="sortMenuItems"
        class="flex-shrink-0"
        :button-props="{ title: 'Change sort direction' }"
        :menu-button-props="{ title: 'Choose what to sort by' }"
        :pt="{ pcMenu: { itemLink: ({ context }) => ({ title: context.item.title }) } }"
        @click="handleChangeSortOrderClick"
      />
    </div>
    <FilterPopover ref="filter-popover" :filters="filters" @apply="handleApplyFilters" @clear="handleClearFilters" />
    <div class="content-wrapper">
      <div ref="scroll-pane" class="content">
        <template v-for="entry in entries" :key="entry.data.node.data.uuid">
          <HierarchyItem
            :entry="entry"
            :is-active="levels[props.index].activeItem?.node.data.uuid === entry.data.node.data.uuid"
            @item-selected="handleItemSelected"
          ></HierarchyItem>
        </template>
        <div v-if="state.isLoading && entries.length > 0" class="text-center" title="More data are loading...">
          <span class="pi pi-spin pi-spinner"></span>
        </div>
      </div>
      <Button
        v-if="canCreateNodes"
        class="add-button"
        severity="secondary"
        icon="pi pi-plus"
        title="Add Collection or Content"
        @click="toggleAddMenu"
      />
      <Menu v-if="canCreateNodes" ref="add-menu" :model="addMenuItems" :popup="true" />
    </div>
    <div class="footer">
      <div class="count text-xs text-right pr-3">{{ entries.length }}/{{ state.pagination?.totalRecords ?? 0 }}</div>
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
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  transition: all 0.15s ease;
}
</style>
