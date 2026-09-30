<script setup lang="ts">
import { computed } from "vue";
import { CollectionNode, HierarchyEntry, IconSpec } from "../models/types";
import { resolveNodeIcon } from "../config/icons";
import RAMENNodeIcon from "./RAMENNodeIcon.vue";
import { useTagsStore } from "../store/tags";
import { normalizeTagColor } from "../config/tags";
import { getContentLabelText } from "../utils/helper/helper";

const emit = defineEmits(["itemSelected"]);

const props = defineProps<{
  entry: HierarchyEntry;
  isActive: boolean;
}>();

const { entryIndex, tags } = useTagsStore();

const isCollection = computed<boolean>(() => props.entry.meta.baseLabel === "Collection");
const icon = computed<IconSpec>(() => resolveNodeIcon(props.entry.data.node.nodeLabels));
const tagColors = computed<string[]>(() => {
  const tagUuids: string[] = entryIndex.value.get(props.entry.data.node.data.uuid) ?? [];

  return tagUuids.map((uuid) => normalizeTagColor(tags.value.find((tag) => tag.uuid === uuid)?.appearance?.color));
});

const displayText = computed<string>(() => {
  if (isCollection.value) {
    return (props.entry.data.node as CollectionNode).data.label;
  }

  return getContentLabelText(props.entry.data.node.nodeLabels);
});

const title = computed<string>(() => (isCollection.value ? `Open "${displayText.value}"` : `Show preview of this Content`));

function handleItemSelect(): void {
  emit("itemSelected", props.entry.data.node.data.uuid);
}
</script>

<template>
  <div
    class="hierarchy-item p-1"
    draggable="true"
    role="treeitem"
    tabindex="0"
    :class="{ active: props.isActive, selected: props.entry.meta.isSelected, collection: isCollection, content: !isCollection }"
    :data-node-uuid="props.entry.data.node.data.uuid"
    :title="title"
    :aria-selected="props.entry.meta.isSelected"
    @click="handleItemSelect"
    @keydown.enter="handleItemSelect"
    @keydown.space.prevent="handleItemSelect"
  >
    <div class="body flex items-center gap-2">
      <RAMENNodeIcon :spec="icon" class="node-icon shrink-0" />
      <div class="text-and-labels grow min-w-0">
        <div class="label" :class="{ 'font-bold': isCollection }">
          {{ displayText }}
        </div>
      </div>
      <div class="tags flex">
        <span v-for="color in tagColors" :key="color" class="tag-dot" :style="{ backgroundColor: color }"></span>
      </div>
      <i v-if="isCollection" class="pi pi-angle-right chevron shrink-0" />
    </div>
  </div>
</template>

<style scoped>
.hierarchy-item {
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

.content .label {
  color: hsl(0, 0%, 40%);
}

.label {
  height: 1.5rem;
  font-size: 0.9rem;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.tags {
  gap: 2px;

  .tag-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
  }
}

.chevron {
  font-size: 0.75rem;
  color: hsl(0, 0%, 45%);
}
</style>
