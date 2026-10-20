<script setup lang="ts">
import { nextTick, ref, useTemplateRef, watch } from "vue";
import { useGuidelinesStore } from "../store/guidelines";
import { CollectionNode, EntityNode, TextNode } from "../models/types";
import { resolveNodeIcon } from "../config/icons";
import NodeSearchbar from "./NodeSearchbar.vue";
import RAMENNodeIcon from "./RAMENNodeIcon.vue";

const collectionInScope = defineModel<CollectionNode | null>({ required: true });

const { getAvailableCollectionLabels } = useGuidelinesStore();

const collectionLabels: string[] = getAvailableCollectionLabels().toSorted();

/** The kind of Collection the searchbar looks for, selectable in front of it. */
const searchedLabel = ref<string>(collectionLabels[0] ?? "");

const searchbar = useTemplateRef<InstanceType<typeof NodeSearchbar>>("searchbar");

watch(searchedLabel, () => focus("input"));

defineExpose({ focus });

/**
 * Moves the focus into the searchbar, once it is rendered.
 *
 * @param {"input" | "labelMenu"} target - `labelMenu` (default) opens the collection type menu, so the user
 * chooses what to search for first; with a single type it falls back to the input. `input` focuses the input.
 * @returns {Promise<void>} Resolves once the focus is set.
 */
async function focus(target: "input" | "labelMenu" = "labelMenu"): Promise<void> {
  await nextTick();

  searchbar.value?.focus(target);
}

/**
 * Removes the picked Collection. The remove button disappears with it, so the focus moves on to the
 * searchbar that replaces the chip instead of getting lost.
 *
 * @returns {Promise<void>} Resolves once the focus is set.
 */
async function handleRemove(): Promise<void> {
  collectionInScope.value = null;

  await focus();
}

function handleSelect(item: CollectionNode | TextNode | EntityNode): void {
  collectionInScope.value = item as CollectionNode;
}
</script>

<template>
  <span
    v-if="collectionInScope"
    class="collection-chip inline-flex self-start items-center gap-1.5 max-w-full min-w-0 min-h-9 py-1 pl-3 pr-1.5 border rounded-2xl"
    :title="`Searching everything inside ${collectionInScope.data.label}, at any depth`"
  >
    <RAMENNodeIcon :spec="resolveNodeIcon(collectionInScope.nodeLabels)" class="shrink-0" />
    <span class="min-w-0 wrap-break-word">{{ collectionInScope.data.label }}</span>
    <button
      type="button"
      class="chip-remove inline-flex shrink-0 items-center justify-center size-6 rounded-full bg-transparent cursor-pointer"
      title="Remove this collection"
      aria-label="Remove this collection"
      @click="handleRemove"
    >
      <i class="icon-x" />
    </button>
  </span>

  <NodeSearchbar
    v-else
    ref="searchbar"
    :key="searchedLabel"
    v-model:additional-node-label="searchedLabel"
    base-node-label="Collection"
    :additional-node-label-options="collectionLabels"
    variant="outlined"
    size="small"
    @item-selected="handleSelect"
  />
</template>

<style scoped>
.collection-chip {
  font-size: 0.875rem;
  color: var(--p-text-color);
  border-color: var(--p-primary-color);
  background: var(--p-highlight-background);
}

.chip-remove {
  color: inherit;
  transition: background-color 0.15s;

  &:hover {
    background: var(--p-content-hover-background);
  }
}
</style>
