<script setup lang="ts">
import { computed } from "vue";
import NodeCardHeader from "./NodeCardHeader.vue";
import { TextNode, NodeStatusObject, NodeStatus } from "../models/types";

const props = defineProps<{
  mode: "edit" | "view";
}>();

const emit = defineEmits<(e: "remove-node") => void>();

const node = defineModel<NodeStatusObject<TextNode>>({ required: true });

const PREVIEW_LENGTH: number = 100;

const displayedText = computed<string>(
  () => node.value.node.data.text.slice(0, PREVIEW_LENGTH) + (node.value.node.data.text.length > PREVIEW_LENGTH ? "..." : ""),
);

// A created node does not exist in the database yet, so there is nothing to open in the Editor
const isCreated = computed<boolean>(() => node.value.meta.status === "created");

/**
 * Handles a click event on the Card component, which will the corresponding text in a new tab. The click event is ignored
 * if the click target is part of button.
 *
 * @param {PointerEvent | KeyboardEvent} event - The click or enter/space key event.
 * @returns {void} This function does not return any value.
 */
function handleSelectContainer(event: PointerEvent | KeyboardEvent): void {
  if (isCreated.value) {
    return;
  }

  if ((event.target as HTMLElement).closest("button")) {
    return;
  }

  window.open(`/contents/${node.value.node.data.uuid}`, "_blank", "noopener noreferrer");
}

/**
 * Removes the node from its parent when it was never persisted ("added" or "created"), otherwise marks the existing
 * relationship as "removed" so that the backend detaches it on the next save.
 *
 * @returns {void} This function does not return any value.
 */
function handleRemoveNode(): void {
  if (node.value.meta.status === "added" || isCreated.value) {
    emit("remove-node");
  } else {
    setNodeStatus("removed");
  }
}

function setNodeStatus(status: NodeStatus): void {
  node.value.meta.status = status;
}
</script>

<template>
  <div
    class="node-card-container"
    :class="{ 'is-created': isCreated }"
    :title="isCreated ? 'Text is created once the changes are saved' : 'Open text in Editor'"
    :tabindex="isCreated ? -1 : 0"
    @click="handleSelectContainer"
    @keydown.enter="handleSelectContainer"
    @keydown.space.prevent="handleSelectContainer"
  >
    <NodeCardHeader :node="node!" :mode="props.mode" @remove="handleRemoveNode" />
    <div class="text-xs">
      {{ displayedText }}
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

  &.is-created {
    cursor: auto;
  }

  & button {
    width: 1rem;
    height: 1rem;
    padding: 10px;
  }

  &:hover {
    background-color: var(--p-button-secondary-background);
  }
}
</style>
