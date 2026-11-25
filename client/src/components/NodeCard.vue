<script setup lang="ts">
import { computed } from "vue";
import { BaseNodeProperties, ElementStatus, IconSpec, Node } from "../models/types";
import Button from "primevue/button";
import NodeStatusBadge from "./NodeStatusBadge.vue";
import RAMENNodeIcon from "./RAMENNodeIcon.vue";
import { resolveNodeIcon } from "../config/icons.ts";
import { filterBaseNodeLabels } from "../config/ramen.ts";

const props = withDefaults(
  defineProps<{
    node: Node<BaseNodeProperties>;
    /** The edit status shown as badge */
    status?: ElementStatus;
    mode: "edit" | "view";
    /** The URL opened in a new tab when the card is selected. `null` makes the card non-interactive. */
    href: string | null;
    title: string;
    showBadge?: boolean;
    /** Locks the remove button temporarily, e.g. while a request is pending */
    disabled?: boolean;
  }>(),
  {
    status: "unchanged",
    showBadge: true,
    disabled: false,
  },
);

const emit = defineEmits<(e: "remove-node") => void>();

const icon = computed<IconSpec>(() => resolveNodeIcon(props.node));
const iconTooltip = computed<string>(() => filterBaseNodeLabels(props.node.nodeLabels).join(", "));

const hasVisibleBadge = computed<boolean>(() => props.showBadge && props.status !== "unchanged");

// Only render the header when it actually shows something, so it does not take up space otherwise
const needsHeader = computed<boolean>(() => props.mode === "edit" || hasVisibleBadge.value);

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
    role="link"
    :aria-disabled="!props.href"
    @click="handleSelectContainer"
    @keydown.enter="handleSelectContainer"
    @keydown.space.prevent="handleSelectContainer"
  >
    <div v-if="needsHeader" class="row-slot mb-1">
      <NodeStatusBadge v-if="hasVisibleBadge" :status="props.status" />
      <Button
        v-if="props.mode === 'edit'"
        icon="icon-x"
        size="small"
        severity="danger"
        class="ml-auto"
        title="Remove reference"
        :disabled="props.disabled"
        @click="emit('remove-node')"
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
