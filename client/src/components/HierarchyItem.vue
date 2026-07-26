<script setup lang="ts">
import { computed } from "vue";
import { HierarchyEntry } from "../models/types";
import { ellipsize } from "../utils/helper/helper";
import { resolveNodeIcon } from "../config/icons";

const emit = defineEmits(["itemSelected"]);

const props = defineProps<{
  entry: HierarchyEntry;
  isActive: boolean;
}>();

const PREVIEW_LENGTH: number = 80;

const isCollection = computed<boolean>(() => props.entry.meta.baseLabel === "Collection");
const icon = computed<string>(() => resolveNodeIcon(props.entry.data.node.nodeLabels));

// A Collection shows its label; a Content shows a single-line preview of its (truncated) text
const displayText = computed<string>(() => {
  const data = props.entry.data.node.data as { label?: string; text?: string };

  if (isCollection.value) {
    return data.label ?? "";
  }

  return ellipsize(data.text ?? "", PREVIEW_LENGTH);
});

const title = computed<string>(() => (isCollection.value ? `Open "${displayText.value}"` : `Show preview of this Content`));

function handleItemSelect(): void {
  emit("itemSelected", props.entry.data.node.data.uuid);
}
</script>

<template>
  <div
    class="container p-1"
    draggable="true"
    tabindex="0"
    :class="{ active: props.isActive, selected: props.entry.meta.isSelected, collection: isCollection, content: !isCollection }"
    :title="title"
    @click="handleItemSelect"
    @keydown.enter="handleItemSelect"
    @keydown.space.prevent="handleItemSelect"
  >
    <div class="body flex align-items-center gap-2">
      <i :class="icon" class="node-icon flex-shrink-0" />
      <div class="text-and-labels flex-grow-1 min-w-0">
        <div class="label" :class="{ 'font-bold': isCollection }">
          {{ displayText }}
        </div>
      </div>
      <i v-if="isCollection" class="pi pi-angle-right chevron flex-shrink-0" />
    </div>
  </div>
</template>

<style scoped>
.container {
  border-bottom: 1px solid grey;
  cursor: pointer;

  &:hover {
    background-color: hsl(0, 0%, 90%);
  }

  &.active {
    background-color: hsl(0, 0%, 75%);
  }

  &.selected {
    background-color: var(--p-highlight-background, hsl(210, 80%, 90%));
  }
}

.node-icon {
  font-size: 0.9rem;
}

.content .label {
  color: hsl(0, 0%, 40%);
  font-weight: normal;
}

.label {
  height: 1.5rem;
  font-size: 0.9rem;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.chevron {
  font-size: 0.75rem;
  color: hsl(0, 0%, 45%);
}
</style>
