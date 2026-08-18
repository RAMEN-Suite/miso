<script setup lang="ts">
import { computed, inject, ref, Ref } from "vue";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import { DynamicDialogInstance } from "primevue/dynamicdialogoptions";
import FilterEditor from "./FilterEditor.vue";
import { useSmartViewsStore } from "../store/smartViews";
import { useHierarchyStore } from "../store/hierarchy";
import { FilterSpec } from "../models/types";

const dialogRef = inject<Ref<DynamicDialogInstance>>("dialogRef");

if (!dialogRef) {
  throw new Error("dialogRef not provided - component must be used inside a DynamicDialog");
}

const emit = defineEmits<{
  (e: "saved", uuid: string): void;
}>();

const { smartViews, getSmartView, getSmartViewFilters, createSmartView, updateSmartView } = useSmartViewsStore();
const { createDefaultQuery } = useHierarchyStore();

/** UUID of the view being edited, or `null` when creating */
const editedUuid: string | null = dialogRef.value.data?.viewUuid ?? null;

/** What the filter editor starts on. Passed as prop once, must be separate from `draft` to allow resets inside the filter editor */
const initialFilters: FilterSpec = (editedUuid ? getSmartViewFilters(editedUuid) : null) ?? createDefaultQuery().filters;

const label = ref<string>((editedUuid ? getSmartView(editedUuid)?.label : "") ?? "");

/** Working copy of the filter state, applied on modal closing */
const draft = ref<FilterSpec>((editedUuid ? getSmartViewFilters(editedUuid) : null) ?? createDefaultQuery().filters);

const hasDuplicateLabel = computed<boolean>(() => {
  const trimmed: string = label.value.trim().toLowerCase();

  if (trimmed === "") {
    return false;
  }

  return smartViews.value.some((view) => view.uuid !== editedUuid && view.label.toLowerCase() === trimmed);
});

const isValid = computed<boolean>(() => label.value.trim().length > 0 && !hasDuplicateLabel.value);

/**
 * Persists the view and closes, naming the one that changed so the caller can re-apply its preset when
 * it is the active listing.
 *
 * @returns {void} This function does not return any value.
 */
function handleSubmit(): void {
  if (!isValid.value) {
    return;
  }

  const params = { label: label.value.trim(), filters: draft.value };

  let uuid: string;

  if (editedUuid) {
    uuid = editedUuid;

    updateSmartView({ uuid, ...params });
  } else {
    uuid = createSmartView(params).uuid;
  }

  emit("saved", uuid);

  close();
}

function close(): void {
  dialogRef?.value.close();
}
</script>

<template>
  <form class="view-form flex flex-column gap-3" @submit.prevent="handleSubmit">
    <div class="flex flex-column gap-1">
      <!-- eslint-disable vuejs-accessibility/label-has-for -- Eslint config does not recognize PrimeVue's component -->
      <label for="smart-view-label" class="text-sm font-semibold">Label</label>
      <InputText
        id="smart-view-label"
        v-model="label"
        size="small"
        spellcheck="false"
        placeholder="e.g. Unfinished chapters"
        autocomplete="off"
        autofocus
      />
      <!-- eslint-enable vuejs-accessibility/label-has-for -->

      <small v-if="hasDuplicateLabel" class="duplicate-hint flex align-items-center gap-1">
        <i class="pi pi-exclamation-circle" />
        <span>A view with this label already exists.</span>
      </small>
    </div>

    <div class="flex flex-column gap-2">
      <span class="text-sm font-semibold">Filters</span>
      <FilterEditor :filters="initialFilters" @change="draft = $event" />
    </div>

    <div class="flex justify-content-end gap-2">
      <Button type="button" label="Cancel" severity="secondary" size="small" @click="close" />
      <Button type="submit" :label="editedUuid ? 'Save' : 'Create'" :disabled="!isValid" size="small" />
    </div>
  </form>
</template>

<style scoped>
.duplicate-hint {
  color: var(--p-orange-600, darkorange);
}
</style>
