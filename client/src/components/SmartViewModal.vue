<script setup lang="ts">
import { computed, inject, ref, Ref } from "vue";
import Button from "primevue/button";
import { DynamicDialogInstance } from "primevue/dynamicdialogoptions";
import FilterEditor from "./FilterEditor.vue";
import SmartViewScopeEditor from "./SmartViewScopeEditor.vue";
import { useSmartViewsStore } from "../store/smartViews";
import { useHierarchyStore } from "../store/hierarchy";
import { FilterSpec, SmartViewScope } from "../models/types";

const dialogRef = inject<Ref<DynamicDialogInstance>>("dialogRef");

if (!dialogRef) {
  throw new Error("dialogRef not provided - component must be used inside a DynamicDialog");
}

const emit = defineEmits<(e: "saved", uuid: string) => void>();

const { smartViews, getSmartView, getSmartViewFilters, getSmartViewScope, createSmartView, updateSmartView } =
  useSmartViewsStore();
const { createDefaultQuery } = useHierarchyStore();

/** UUID of the view being edited, or `null` when creating */
const editedUuid: string | null = dialogRef.value.data?.viewUuid ?? null;

/** What the filter editor starts on. Passed as prop once, must be separate from `draft` to allow resets inside the filter editor */
const initialFilters: FilterSpec = (editedUuid ? getSmartViewFilters(editedUuid) : null) ?? createDefaultQuery().filters;

const label = ref<string>((editedUuid ? getSmartView(editedUuid)?.label : "") ?? "");

/** Working copy of the filter state, applied on modal closing */
const draft = ref<FilterSpec>((editedUuid ? getSmartViewFilters(editedUuid) : null) ?? createDefaultQuery().filters);

/** What the scope editor starts on. A new view searches everywhere. */
const initialScope: SmartViewScope = (editedUuid ? getSmartViewScope(editedUuid) : null) ?? { kind: "all" };

/** Working copy of the scope, applied on modal closing */
const scopeDraft = ref<SmartViewScope>(initialScope);

/** "Inside a collection" is incomplete until a collection is picked */
const hasCompleteScope = computed<boolean>(() => scopeDraft.value.kind !== "descendants" || scopeDraft.value.ancestorUuid !== "");

const hasDuplicateLabel = computed<boolean>(() => {
  const trimmed: string = label.value.trim().toLowerCase();

  if (trimmed === "") {
    return false;
  }

  return smartViews.value.some((view) => view.uuid !== editedUuid && view.label.toLowerCase() === trimmed);
});

const isValid = computed<boolean>(() => label.value.trim().length > 0 && !hasDuplicateLabel.value && hasCompleteScope.value);

function close(): void {
  dialogRef?.value.close();
}

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

  const params = { label: label.value.trim(), scope: scopeDraft.value, filters: draft.value };

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
</script>

<template>
  <form class="smart-view-form flex flex-col" @submit.prevent="handleSubmit">
    <div class="flex flex-col gap-5 p-6 pb-5">
      <div class="flex items-center gap-3">
        <span class="inline-flex shrink-0 items-center justify-center size-10 text-2xl" aria-hidden="true">
          <i class="icon-folder-cog" />
        </span>
        <div class="flex flex-col flex-1 min-w-0">
          <!-- eslint-disable-next-line vuejs-accessibility/no-autofocus -- The name is the first thing to fill in -->
          <input
            v-model="label"
            class="title-input w-full py-0.5 bg-transparent outline-none"
            spellcheck="false"
            :placeholder="editedUuid ? 'Name this view' : 'New smart view'"
            aria-label="Smart view name"
            autofocus
          />
          <small v-if="hasDuplicateLabel" class="duplicate-hint flex items-center gap-1">
            <i class="icon-alert-circle" />
            <span>A view with this name already exists.</span>
          </small>
        </div>
        <!-- Pulled into the top right corner, like a dialog header's close button -->
        <Button
          type="button"
          class="shrink-0 self-start -mt-2 -mr-3"
          icon="icon-x"
          severity="secondary"
          text
          rounded
          title="Close"
          aria-label="Close"
          @click="close"
        />
      </div>

      <section class="grid grid-cols-[6rem_minmax(0,1fr)] items-start gap-3">
        <span class="section-title font-semibold leading-8">Search in</span>
        <SmartViewScopeEditor :scope="initialScope" @change="scopeDraft = $event" />
      </section>

      <section class="flex flex-col gap-3 pt-t">
        <span class="section-title font-semibold">Filters</span>
        <FilterEditor :filters="initialFilters" @change="draft = $event" />
      </section>
    </div>

    <footer class="flex items-center justify-between gap-2 px-6 py-3">
      <span class="footer-hint flex items-center gap-1.5">
        <i class="icon-hard-drive" />
        <span>Saved in this browser</span>
      </span>
      <div class="flex gap-2">
        <Button type="button" label="Cancel" severity="secondary" text size="small" @click="close" />
        <Button type="submit" :label="editedUuid ? 'Save' : 'Create view'" :disabled="!isValid" size="small" />
      </div>
    </footer>
  </form>
</template>

<style scoped>
.smart-view-form {
  --muted: var(--p-text-muted-color);

  width: min(36rem, calc(100vw - 2rem));
}

.title-input {
  border: none;
  font: inherit;
  font-size: 1.375rem;
  font-weight: 600;
  color: var(--p-text-color);

  &::placeholder {
    color: var(--p-inputtext-placeholder-color);
    font-weight: 500;
  }
}

.duplicate-hint {
  color: var(--p-orange-600, darkorange);
}

.section-title {
  font-size: 0.8rem;
  color: var(--muted);
}

.footer-hint {
  font-size: 0.75rem;
  color: var(--muted);
}
</style>
