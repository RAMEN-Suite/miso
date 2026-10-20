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

const { areAllOptionsSelected, selectedOptions, selectAllOptions, toggleOptions } = useFilterStore();
const { groupedAndSortedAnnotationTypes } = useGuidelinesStore();

const popover = useTemplateRef<InstanceType<typeof Popover>>("popover");

/** Categories whose option list is currently collapsed in the filter pane. Purely visual, does not affect the selection. */
const collapsedCategories = ref<Set<string>>(new Set());

const filterableCategories: ComputedRef<Record<string, AnnotationType[]>> = computed(() => {
  return Object.fromEntries(
    Object.entries(groupedAndSortedAnnotationTypes.value ?? {}).filter(([category]) => category !== "structure"),
  );
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
    <div class="relative">
      <Button
        type="button"
        icon="icon-filter"
        label="Filter"
        size="small"
        severity="secondary"
        outlined
        :title="areAllOptionsSelected ? 'Filter annotation types' : 'Filter annotation types'"
        @click="toggle"
      />
      <span v-if="!areAllOptionsSelected" class="changed-dot" aria-hidden="true"></span>
    </div>
    <Popover ref="popover">
      <div class="filter-panel flex flex-col gap-2">
        <div class="categories flex flex-col">
          <section v-for="(annotationTypes, category) in filterableCategories" :key="category" class="category">
            <div class="category-header flex items-center gap-1">
              <!-- eslint-disable-next-line vuejs-accessibility/label-has-for -- No id as component prop currently -->
              <label
                :for="`filter-category-${category}`"
                :title="`Toggle all types of category ${category}`"
                class="row category-toggle flex flex-1 items-center gap-2 min-w-0"
              >
                <Checkbox
                  :model-value="isCategoryFullySelected(annotationTypes)"
                  :indeterminate="isCategoryPartiallySelected(annotationTypes)"
                  :input-id="`filter-category-${category}`"
                  binary
                  size="small"
                  @update:model-value="toggleOptions(getCategoryTypes(annotationTypes))"
                />
                <span class="category-name truncate">
                  {{ capitalize(category) }}
                </span>
              </label>
              <Button
                class="chevron-button"
                :icon="`icon-chevron-${collapsedCategories.has(category) ? 'right' : 'down'}`"
                :title="collapsedCategories.has(category) ? 'Expand category' : 'Collapse category'"
                :aria-expanded="!collapsedCategories.has(category)"
                size="small"
                severity="secondary"
                text
                rounded
                @click="toggleCategoryCollapse(category)"
              />
            </div>
            <div v-show="!collapsedCategories.has(category)" class="options flex flex-col">
              <!-- eslint-disable-next-line vuejs-accessibility/label-has-for -- No id as component prop currently -->
              <label
                v-for="annotationType of annotationTypes"
                :key="annotationType.type"
                :for="`filter-type-${annotationType.type}`"
                class="row option flex items-center gap-2"
              >
                <Checkbox
                  v-model="selectedOptions"
                  :input-id="`filter-type-${annotationType.type}`"
                  :value="annotationType.type"
                  size="small"
                />
                <span class="annotation-type-icon-container shrink-0">
                  <AnnotationTypeIcon :config="annotationType" :size="16" />
                </span>
                <span class="option-name">{{ annotationType.type }}</span>
              </label>
            </div>
          </section>
        </div>
        <div class="panel-footer flex justify-end">
          <button
            type="button"
            class="action-link flex items-center gap-1"
            :title="areAllOptionsSelected ? 'Deselect all types' : 'Select all types'"
            @click="selectAllOptions"
          >
            <i :class="areAllOptionsSelected ? 'icon-x' : 'icon-check'" aria-hidden="true"></i>
            {{ areAllOptionsSelected ? "Deselect all" : "Select all" }}
          </button>
        </div>
      </div>
    </Popover>
  </div>
</template>

<style scoped>
.changed-dot {
  position: absolute;
  top: -0.2rem;
  right: -0.2rem;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background-color: var(--p-orange-500);
  box-shadow: 0 0 0 2px var(--p-content-background);
}

.filter-panel {
  width: 20rem;
  max-height: 60vh;
}

.panel-footer {
  flex-shrink: 0;
}

.action-link {
  padding: 0.125rem 0.375rem;
  border-radius: var(--p-content-border-radius);
  color: var(--p-primary-color);
  cursor: pointer;
}

.action-link:hover {
  background-color: var(--p-content-hover-background);
}

.categories {
  min-height: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
}

.category + .category {
  margin-top: 0.25rem;
}

.row {
  padding: 0.25rem 0.5rem;
  border-radius: var(--p-content-border-radius);
  cursor: pointer;
}

.row:hover {
  background-color: var(--p-content-hover-background);
}

.category-name {
  font-weight: 600;
}

.chevron-button {
  width: 1.75rem;
  height: 1.75rem;
  flex-shrink: 0;
}

.option-name {
  overflow-wrap: anywhere;
}

.annotation-type-icon-container {
  width: 16px;
  height: 16px;
}

.options {
  padding-left: 1.5rem;
}
</style>
