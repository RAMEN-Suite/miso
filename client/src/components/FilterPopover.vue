<script setup lang="ts">
import { ref, useTemplateRef } from "vue";
import Popover from "primevue/popover";
import Button from "primevue/button";
import { FilterSpec } from "../models/types";
import FilterEditor from "./FilterEditor.vue";

defineProps<{
  filters: FilterSpec;
}>();

const emit = defineEmits<{
  (e: "apply", updatedFilters: FilterSpec): void;
  (e: "clear"): void;
}>();

const popover = useTemplateRef<InstanceType<typeof Popover>>("popover");
const editor = useTemplateRef<InstanceType<typeof FilterEditor>>("editor");

/** Working copy of the filter state. Changes are committed on "Apply", so no two-way binding */
const draft = ref<FilterSpec>([]);

/**
 * Opens/closes the popover.
 *
 * @param {Event} event - The click that triggered it.
 * @returns {void} This function does not return a value.
 */
function toggle(event: Event): void {
  popover.value?.toggle(event);
}

/**
 * Re-seeds the filter editor with the current filter state from outside (= the column).
 *
 * Called when the popover is opened.
 *
 * @returns {void} This function does not return a value.
 */
function handleShow(): void {
  editor.value?.sync();
}

/**
 * Commits the draft and closes the popover.
 *
 * @returns {void} This function does not return a value.
 */
function handleApply(): void {
  emit("apply", draft.value);

  popover.value?.hide();
}

/**
 * Drops every filter and closes the popover. The reset itself is handed to the caller.
 *
 * @returns {void} This function does not return a value.
 */
function handleClear(): void {
  emit("clear");

  popover.value?.hide();
}

defineExpose({ toggle });
</script>

<template>
  <Popover ref="popover" @show="handleShow">
    <div class="panel flex flex-column gap-1 p-2">
      <FilterEditor ref="editor" :filters="filters" @change="draft = $event" />

      <div class="footer flex justify-content-between">
        <Button
          label="Clear all"
          icon="pi pi-filter-slash"
          title="Clear all filters"
          severity="secondary"
          size="small"
          @click="handleClear"
        />
        <Button label="Apply" icon="pi pi-check" title="Apply filters" severity="primary" size="small" @click="handleApply" />
      </div>
    </div>
  </Popover>
</template>

<style scoped>
.panel {
  min-width: 20rem;
  max-width: 34rem;
}
</style>
