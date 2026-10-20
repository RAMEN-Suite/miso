<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from "vue";
import SelectButton from "primevue/selectbutton";
import { useAppStore } from "../store/app";
import { useGuidelinesStore } from "../store/guidelines";
import { CollectionNode, NodeDto, SmartViewScope } from "../models/types";
import SmartViewCollectionPicker from "./SmartViewCollectionPicker.vue";

const props = defineProps<{
  scope: SmartViewScope;
}>();

const emit = defineEmits<{ change: [SmartViewScope] }>();

const { api } = useAppStore();
const { getAvailableCollectionLabels } = useGuidelinesStore();

const canSearchInside: boolean = getAvailableCollectionLabels().length > 0;

const modeOptions: { label: string; value: SmartViewScope["kind"]; icon: string; hint: string }[] = [
  { label: "Everywhere", value: "all", icon: "icon-globe", hint: "All collections and contents" },
  {
    label: "Inside a collection",
    value: "descendants",
    icon: "icon-folder-search",
    hint: "Everything inside one collection, at any depth",
  },
];

const mode = ref<SmartViewScope["kind"]>(props.scope.kind);

/** The Collection the view searches in. Kept while switching to "Everywhere", so switching back restores it. */
const ancestor = ref<CollectionNode | null>(null);

/** True if the stored ancestor of an edited view could not be loaded (e.g. it was deleted). */
const isAncestorMissing = ref<boolean>(false);

/** Whether a Collection is picked and shown, which hides the options until it is removed. */
const isPicked = computed<boolean>(() => mode.value === "descendants" && ancestor.value !== null);

const picker = useTemplateRef<InstanceType<typeof SmartViewCollectionPicker>>("picker");

watch([mode, ancestor], emitChange);

watch(mode, focusPicker);

watch(ancestor, () => {
  if (ancestor.value) {
    isAncestorMissing.value = false;
  }
});

onMounted(loadAncestor);

/**
 * Emits the scope the current state adds up to. "Inside a collection" without a picked Collection is
 * emitted with an empty `ancestorUuid`, which the parent has to treat as incomplete.
 *
 * @returns {void} This function does not return any value.
 */
function emitChange(): void {
  if (mode.value === "descendants") {
    emit("change", { kind: "descendants", ancestorUuid: ancestor.value?.data.uuid ?? "" });
  } else {
    emit("change", { kind: "all" });
  }
}

/**
 * Moves the focus into the collection search once "Inside a collection" is chosen, so the user can type
 * straight away. Only reacts to a mode change, never on mount, so it does not steal the focus from the
 * name field when an existing view is opened.
 *
 * @returns {Promise<void>} Resolves once the focus is set.
 */
async function focusPicker(): Promise<void> {
  if (mode.value !== "descendants" || ancestor.value) {
    return;
  }

  // The picker is only rendered for "Inside a collection"
  await nextTick();

  await picker.value?.focus();
}

/**
 * Loads the Collection of the `descendants` scope the editor was seeded with, since the scope only
 * stores its uuid. A Collection that can not be loaded is dropped from the scope and reported.
 *
 * @returns {Promise<void>} Resolves once the Collection is loaded or reported missing.
 */
async function loadAncestor(): Promise<void> {
  if (props.scope.kind !== "descendants" || props.scope.ancestorUuid === "") {
    return;
  }

  try {
    const collection: NodeDto<CollectionNode> = await api.getCollection(props.scope.ancestorUuid);

    ancestor.value = collection.node;
  } catch {
    isAncestorMissing.value = true;

    emitChange();
  }
}
</script>

<template>
  <div class="scope-editor flex flex-col gap-2">
    <SelectButton
      v-if="!isPicked"
      v-model="mode"
      class="self-start"
      :options="modeOptions"
      option-label="label"
      option-value="value"
      :option-disabled="(option) => option.value === 'descendants' && !canSearchInside"
      :allow-empty="false"
      size="small"
      aria-label="Where to search"
    >
      <template #option="{ option }">
        <span class="flex items-center gap-1.5" :title="option.hint">
          <i :class="option.icon" />
          <span>{{ option.label }}</span>
        </span>
      </template>
    </SelectButton>

    <div class="flex items-center min-w-0 min-h-9">
      <SmartViewCollectionPicker v-if="mode === 'descendants'" ref="picker" v-model="ancestor" />
    </div>

    <small v-if="isAncestorMissing" class="missing-hint flex items-center gap-1">
      <i class="icon-alert-circle" />
      <span>The collection this view searched in no longer exists. Choose another one.</span>
    </small>
  </div>
</template>

<style scoped>
.missing-hint {
  color: var(--p-orange-600, darkorange);
}
</style>
