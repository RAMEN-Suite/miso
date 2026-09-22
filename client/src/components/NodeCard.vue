<script setup lang="ts">
import { computed } from "vue";
import { IconSpec, NodeStatusObject } from "../models/types";
import Button from "primevue/button";
import NodeStatusBadge from "./NodeStatusBadge.vue";
import RAMENNodeIcon from "./RAMENNodeIcon.vue";
import { resolveNodeIcon } from "../config/icons.ts";
import { filterBaseNodeLabel } from "../utils/helper/helper.ts";

const props = withDefaults(
  defineProps<{
    mode: "edit" | "view";
    /** The URL opened in a new tab when the card is selected. `null` makes the card non-interactive. */
    href: string | null;
    title: string;
    showBadge?: boolean;
  }>(),
  {
    showBadge: true,
  },
);

const node = defineModel<NodeStatusObject>("node", { required: true });
const emit = defineEmits<(e: "remove-node") => void>();

const icon = computed<IconSpec>(() => resolveNodeIcon(node.value.node.nodeLabels));
const iconTooltip = computed<string>(() => filterBaseNodeLabel(node.value.node.nodeLabels).join(", "));

const hasVisibleBadge = computed<boolean>(() => props.showBadge && node.value.meta.status !== "unchanged");

// Only render the header when it actually shows something, so it does not take up space otherwise
const needsHeader = computed<boolean>(() => props.mode === "edit" || hasVisibleBadge.value);

/**
 * Removes the node from its parent when it was never persisted ("added" or "created"), otherwise marks the existing
 * relationship as "removed" so that the backend detaches it on the next save.
 *
 * @returns {void} This function does not return any value.
 */
function handleRemoveNode(): void {
  if (node.value.meta.status === "added" || node.value.meta.status === "created") {
    emit("remove-node");
  } else {
    node.value.meta.status = "removed";
  }
}

/**
 * Handles a click event on the card, which will open `href` in a new tab. The event is ignored if the card has no
 * `href` or if the click target is part of a button.
 *
 * @param {PointerEvent | KeyboardEvent} event - The click or enter/space key event.
 * @returns {void} This function does not return any value.
 */
function handleSelectContainer(event: PointerEvent | KeyboardEvent): void {
  if (!props.href) {
    return;
  }

  if ((event.target as HTMLElement).closest("button")) {
    return;
  }

  window.open(props.href, "_blank", "noopener noreferrer");
}
</script>

<template>
  <div
    class="node-card-container"
    :class="{ 'no-link': !props.href }"
    :title="props.title"
    tabindex="0"
    :role="props.href ? 'link' : undefined"
    @click="handleSelectContainer"
    @keydown.enter="handleSelectContainer"
    @keydown.space.prevent="handleSelectContainer"
  >
    <div v-if="needsHeader" class="row-slot mb-1">
      <NodeStatusBadge v-if="hasVisibleBadge" :status="node.meta.status" />
      <Button
        v-if="props.mode === 'edit'"
        icon="icon-x"
        size="small"
        severity="danger"
        class="ml-auto"
        title="Remove reference"
        @click="handleRemoveNode"
      ></Button>
    </div>
    <div class="flex items-center gap-2">
      <div class="row-slot">
        <RAMENNodeIcon v-tooltip.top="iconTooltip" :spec="icon" :size="20" />
      </div>
      <div class="row-slot flex-1 min-w-0 gap-2">
        <slot></slot>
      </div>
    </div>
  </div>
</template>

<style scoped>
.node-card-container {
  cursor: pointer;
  border: 1px solid gray;
  border-radius: 5px;
  margin-bottom: 0.5rem;
  padding: 0.5rem;
  transition: background-color 0.2s ease;

  &.no-link {
    cursor: auto;
  }

  & :deep(button) {
    width: 1rem;
    height: 1rem;
    padding: 10px;
  }

  &:hover {
    background-color: var(--p-button-secondary-background);
  }
}

.row-slot {
  display: flex;
  align-items: center;
  min-height: 1.5rem;
}
</style>
