<script setup lang="ts">
import { computed } from "vue";
import Button from "primevue/button";
import { ToCItem } from "../models/types";
import { ellipsize } from "../utils/helper/helper.ts";

// Unchanged items keep their identity across transactions (see buildDocChildren), so Vue skips re-rendering
// them: a row only re-renders when its own item changes or its key is toggled in the reactive `expandedKeys`.
const props = defineProps<{
  item: ToCItem;
  expandedKeys: ReadonlySet<string>;
  level: number;
}>();

const emit = defineEmits<{
  itemClick: [item: ToCItem];
  toggle: [key: string];
  openMenu: [event: Event, item: ToCItem];
}>();

const hasChildren = computed<boolean>(() => props.item.children.length > 0);
const isExpanded = computed<boolean>(() => props.expandedKeys.has(props.item.key));

const displayedText = computed<string>(() => ellipsize(props.item.data.text, 20));
const displayedLabel = computed<string>(() => {
  const item: ToCItem = props.item;

  if (item.data.nodeType === "heading") {
    return `h${item.data.level}`;
  } else if (item.data.nodeType === "paragraph") {
    return "p";
  } else {
    return item.data.type;
  }
});

function handleNodeSelect(): void {
  emit("itemClick", props.item);
}

function handleToggle(): void {
  emit("toggle", props.item.key);
}

function handleArrowRight(): void {
  if (hasChildren.value && !isExpanded.value) {
    handleToggle();
  }
}

function handleArrowLeft(): void {
  if (isExpanded.value) {
    handleToggle();
  }
}
</script>

<template>
  <li role="treeitem" :aria-level="level" :aria-expanded="hasChildren ? isExpanded : undefined" aria-selected="false">
    <div class="toc-row flex items-center gap-2">
      <button
        v-if="hasChildren"
        type="button"
        class="toggle-button flex items-center justify-center"
        :title="isExpanded ? 'Collapse' : 'Expand'"
        tabindex="-1"
        @click="handleToggle"
      >
        <i :class="`icon-chevron-${isExpanded ? 'down' : 'right'}`" aria-hidden="true"></i>
      </button>
      <span v-else class="toggle-button flex items-center justify-center">
        <i class="icon-minus" aria-hidden="true"></i>
      </span>
      <div
        class="type-container ml-1 flex items-center gap-4 grow"
        tabindex="0"
        role="button"
        @click="handleNodeSelect"
        @keydown.enter="handleNodeSelect"
        @keydown.space.prevent="handleNodeSelect"
        @keydown.right.prevent="handleArrowRight"
        @keydown.left.prevent="handleArrowLeft"
      >
        <span> {{ displayedLabel }} </span>
        <small :title="props.item.data.text" class="italic">
          {{ displayedText }}
        </small>
      </div>
      <Button
        class="row-action"
        icon="icon-ellipsis-vertical"
        severity="secondary"
        text
        rounded
        size="small"
        :title="`More options for ${displayedLabel}`"
        :aria-label="`More options for ${displayedLabel}`"
        @click.stop="emit('openMenu', $event, props.item)"
      />
    </div>
    <ul v-if="hasChildren && isExpanded" role="group" class="pl-4">
      <EditorToCItem
        v-for="child in item.children"
        :key="child.key"
        :item="child"
        :expanded-keys="expandedKeys"
        :level="level + 1"
        @item-click="emit('itemClick', $event)"
        @toggle="emit('toggle', $event)"
        @open-menu="(event: Event, child: ToCItem) => emit('openMenu', event, child)"
      />
    </ul>
  </li>
</template>

<style scoped>
.toggle-button {
  width: 1.75rem;
  height: 1.75rem;
  flex-shrink: 0;
  border-radius: 50%;
  color: var(--p-text-muted-color);
}

button.toggle-button {
  cursor: pointer;
  transition: background-color 0.15s;

  &:hover {
    background: var(--p-content-hover-background);
  }
}

/* The menu button stays out of the way until the row is hovered or keyboard-focused */
.toc-row {
  .row-action {
    opacity: 0;
    transition: opacity 0.1s;
  }

  &:hover .row-action,
  &:focus-within .row-action {
    opacity: 1;
  }
}

.type-container {
  cursor: pointer;
  border-radius: var(--p-content-border-radius);
  transition: background-color 0.15s;

  &:hover {
    background: var(--p-content-hover-background);
  }
}
</style>
