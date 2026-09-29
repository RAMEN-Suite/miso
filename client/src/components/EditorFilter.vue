<script lang="ts" setup>
import { computed, ComputedRef, ref, useTemplateRef } from "vue";
import { useFilterStore } from "../store/filter";
import { useGuidelinesStore } from "../store/guidelines";
import { capitalize } from "../utils/helper/helper";
import { AnnotationType } from "../models/types";
import AnnotationTypeIcon from "./AnnotationTypeIcon.vue";
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import Popover from "primevue/popover";

const { allOptions, areAllOptionsSelected, selectedOptions, selectAllOptions, selectDefaultOptions, toggleOptions } =
  useFilterStore();
const { groupedAndSortedAnnotationTypes } = useGuidelinesStore();

const popover = useTemplateRef<InstanceType<typeof Popover>>("popover");

/** Categories whose option list is currently collapsed in the filter pane. Purely visual, does not affect the selection. */
const collapsedCategories = ref<Set<string>>(new Set());

const filterableCategories: ComputedRef<Record<string, AnnotationType[]>> = computed(() => {
  return Object.fromEntries(
    Object.entries(groupedAndSortedAnnotationTypes.value ?? {}).filter(([category]) => category !== "structure"),
  );
});

const badgeContent: ComputedRef<string> = computed(() => {
  return `${selectedOptions.value.length}/${allOptions.value.length}`;
});

const badgeSeverity: ComputedRef<string> = computed(() => {
  if (areAllOptionsSelected.value) {
    return "secondary";
  }

  return "danger";
});

/**
 * Opens/closes the filter popover.
 *
 * @param {Event} event - The click that triggered it.
 * @returns {void} This function does not return a value.
 */
function toggle(event: Event): void {
  popover.value?.toggle(event);
}

/**
 * Retrieves the type names of the given annotation types.
 *
 * @param {AnnotationType[]} types - The annotation types of a category.
 * @returns {string[]} The type names.
 */
function getCategoryTypes(types: AnnotationType[]): string[] {
  return types.map((t) => t.type);
}

/**
 * Counts how many of the given annotation types are currently selected.
 *
 * @param {AnnotationType[]} types - The annotation types of a category.
 * @returns {number} The number of selected types.
 */
function getSelectedCount(types: AnnotationType[]): number {
  return types.filter((t) => selectedOptions.value.includes(t.type)).length;
}

/**
 * Checks if all annotation types of a category are selected.
 *
 * @param {AnnotationType[]} types - The annotation types of a category.
 * @returns {boolean} True if every type is selected.
 */
function isCategoryFullySelected(types: AnnotationType[]): boolean {
  return types.length > 0 && getSelectedCount(types) === types.length;
}

/**
 * Checks if only some (but not all or none) annotation types of a category are selected.
 *
 * @param {AnnotationType[]} types - The annotation types of a category.
 * @returns {boolean} True if the selection is partial.
 */
function isCategoryPartiallySelected(types: AnnotationType[]): boolean {
  const count: number = getSelectedCount(types);

  return count > 0 && count < types.length;
}

/**
 * Collapses or expands the option list of a category in the filter pane.
 *
 * @param {string} category - The category to collapse/expand.
 * @returns {void} This function does not return a value.
 */
function toggleCategoryCollapse(category: string): void {
  const updated = new Set<string>(collapsedCategories.value);

  if (updated.has(category)) {
    updated.delete(category);
  } else {
    updated.add(category);
  }

  collapsedCategories.value = updated;
}
</script>

<template>
  <div class="flex justify-end">
    <Button
      type="button"
      icon="icon-filter"
      label="Filter"
      size="small"
      severity="secondary"
      outlined
      title="Filter annotation types"
      :badge="badgeContent"
      :badge-severity="badgeSeverity"
      @click="toggle"
    />
    <Popover ref="popover">
      <div class="filter-panel flex flex-col">
        <div class="panel-header flex items-center justify-between gap-2 pb-2 mb-2">
          <span class="panel-title text-sm font-semibold">Annotation types</span>
          <div class="flex items-center gap-1">
            <Button
              class="header-button"
              :label="areAllOptionsSelected ? 'Select none' : 'Select all'"
              :title="areAllOptionsSelected ? 'Deselect all types' : 'Select all types'"
              size="small"
              severity="secondary"
              text
              @click="selectAllOptions"
            />
            <span class="separator" aria-hidden="true"></span>
            <Button
              class="header-button"
              label="Default"
              title="Reset to default selection"
              size="small"
              severity="secondary"
              text
              @click="selectDefaultOptions"
            />
          </div>
        </div>
        <div class="categories flex flex-col">
          <section v-for="(annotationTypes, category) in filterableCategories" :key="category" class="category">
            <div class="category-header flex items-center gap-2">
              <Button
                :icon="`icon-chevron-${collapsedCategories.has(category) ? 'right' : 'down'}`"
                :title="collapsedCategories.has(category) ? 'Expand category' : 'Collapse category'"
                :aria-expanded="!collapsedCategories.has(category)"
                size="small"
                severity="secondary"
                text
                rounded
                @click="toggleCategoryCollapse(category)"
              />
              <!-- eslint-disable-next-line vuejs-accessibility/label-has-for -- No id as component prop currently -->
              <label
                :for="`filter-category-${category}`"
                :title="`Toggle all types of category ${category}`"
                class="category-toggle flex flex-1 items-center gap-2 px-1.5 py-0.5 rounded cursor-pointer min-w-0"
              >
                <Checkbox
                  :model-value="isCategoryFullySelected(annotationTypes)"
                  :indeterminate="isCategoryPartiallySelected(annotationTypes)"
                  :input-id="`filter-category-${category}`"
                  binary
                  size="small"
                  @update:model-value="toggleOptions(getCategoryTypes(annotationTypes))"
                />
                <span class="category-name font-semibold truncate">
                  {{ capitalize(category) }}
                </span>
              </label>
            </div>
            <div v-show="!collapsedCategories.has(category)" class="options flex flex-col">
              <!-- eslint-disable-next-line vuejs-accessibility/label-has-for -- No id as component prop currently -->
              <label
                v-for="annotationType of annotationTypes"
                :key="annotationType.type"
                :for="`filter-type-${annotationType.type}`"
                class="option flex items-center gap-2 px-5 py-0.5 rounded cursor-pointer"
              >
                <Checkbox
                  v-model="selectedOptions"
                  :input-id="`filter-type-${annotationType.type}`"
                  :value="annotationType.type"
                  size="small"
                />
                <div class="annotation-type-icon-container shrink-0">
                  <AnnotationTypeIcon :annotation-type="annotationType.type" />
                </div>
                <span class="option-name">{{ annotationType.type }}</span>
              </label>
            </div>
          </section>
        </div>
      </div>
    </Popover>
  </div>
</template>

<style scoped>
.filter-panel {
  /* Fixed width so collapsing categories or showing the scrollbar does not resize the popover */
  width: 22rem;
  max-height: 60vh;
}

.panel-header {
  flex-shrink: 0;
  border-bottom: 1px solid var(--p-content-border-color);
}

.panel-title {
  color: var(--p-text-muted-color);
}

.header-button {
  padding: 0.125rem 0.375rem;
  font-size: 0.875rem;
}

.separator {
  color: var(--p-text-muted-color);
}

.categories {
  /* Allows the list to shrink inside the max-height flex column so it scrolls instead of overflowing */
  min-height: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
}

.option-name {
  overflow-wrap: anywhere;
}

.category-header .counter {
  color: var(--p-text-muted-color);
}

.options {
  padding-left: 2.75rem;
}

.annotation-type-icon-container {
  width: 16px;
  height: 16px;
}

.option:hover,
.category-toggle:hover {
  background-color: var(--p-content-hover-background);
}
</style>
