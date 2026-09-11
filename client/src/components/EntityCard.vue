<script setup lang="ts">
import { EntityNode, NodeStatus, NodeStatusObject } from "../models/types";
import Button from "primevue/button";
import { Popover } from "primevue";
import NodeCardHeader from "./NodeCardHeader.vue";
import NodePropertiesTable from "./NodePropertiesTable.vue";
import { useTemplateRef } from "vue";

const props = defineProps<{
  mode: "edit" | "view";
}>();

const emit = defineEmits<(e: "remove-node") => void>();

const node = defineModel<NodeStatusObject<EntityNode>>({ required: true });

const infoIcon = useTemplateRef("info-icon");

function handleRemoveNode(): void {
  if (node.value.meta.status === "added") {
    emit("remove-node");
  } else {
    setNodeStatus("removed");
  }
}

function setNodeStatus(status: NodeStatus): void {
  node.value.meta.status = status;
}

function togglePopover(event: MouseEvent): void {
  infoIcon.value?.toggle(event);
}

/**
 * Handles a click event on the Card component, which will open the corresponding entity in the tool
 * that manages Entities. The URL is resolved server-side.
 *
 * @param {PointerEvent | KeyboardEvent} event - The click or enter/space key event.
 * @returns {void} This function does not return any value.
 */
function handleSelectContainer(event: PointerEvent | KeyboardEvent): void {
  if ((event.target as HTMLElement).closest("button")) {
    return;
  }

  window.open(`/api/tools/tori/entity/${node.value.node.data.uuid}`, "_blank", "noopener noreferrer");
}
</script>

<template>
  <div
    class="node-card-container"
    title="Open entity in external tool"
    tabindex="0"
    role="link"
    @click="handleSelectContainer"
    @keydown.enter="handleSelectContainer"
    @keydown.space.prevent="handleSelectContainer"
  >
    <NodeCardHeader :node="node!" :mode="props.mode" @remove="handleRemoveNode" />
    <span>
      {{ node!.node.data.label }}
    </span>
    <Button
      icon="pi pi-info-circle"
      size="small"
      severity="secondary"
      class="ml-2"
      title="Click to show preview of entity data"
      @click="togglePopover"
    ></Button>

    <Popover
      ref="info-icon"
      :pt="{
        root: {
          class: 'w-25rem',
          style: {
            zIndex: 'var(--z-index-max)',
          },
        },
      }"
    >
      <NodePropertiesTable :data="node!.node.data" />
    </Popover>
  </div>
</template>

<style scoped>
.node-card-container {
  cursor: pointer;
  border: 1px solid gray;
  border-radius: 5px;
  margin-bottom: 0.5rem;
  padding: 0.5rem;

  & button {
    width: 1rem;
    height: 1rem;
    padding: 10px;
  }
}
</style>
