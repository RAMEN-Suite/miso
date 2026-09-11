<script setup lang="ts">
import { AnnotationNode, NodeStatus, NodeStatusObject } from "../models/types";
import Button from "primevue/button";
import { Popover } from "primevue";
import NodeTag from "./NodeTag.vue";
import NodePropertiesTable from "./NodePropertiesTable.vue";
import { useTemplateRef } from "vue";
import { filterDefaultLabels } from "../utils/helper/helper";
import AnnotationTypeIcon from "./AnnotationTypeIcon.vue";

const props = defineProps<{
  mode: "view";
}>();

const node = defineModel<NodeStatusObject<AnnotationNode>>({ required: true });

const infoIcon = useTemplateRef("info-icon");

const filteredLabels: string[] = filterDefaultLabels(node.value.node.nodeLabels);

function handleRemoveNode(): void {
  setNodeStatus("removed");
}

function setNodeStatus(status: NodeStatus): void {
  node.value.meta.status = status;
}

function togglePopover(event: MouseEvent): void {
  infoIcon.value?.toggle(event);
}
</script>

<template>
  <div class="node-card-container">
    <div class="button-pane flex justify-content-between">
      <div class="node-labels-pane flex">
        <NodeTag v-for="label in filteredLabels" :key="label" class="test mr-1" :content="label" type="Annotation" />
        <div class="icon-container">
          <AnnotationTypeIcon :annotation-type="node!.node.data.subType ?? node!.node.data.type" />
        </div>
        <div class="annotation-type-container">
          <small class="font-bold">{{ node!.node.data.subType ?? node!.node.data.type }}</small>
        </div>
      </div>
      <small class="status">{{ node!.meta.status }}</small>

      <Button
        :class="props.mode === 'view' ? 'invisible' : ''"
        icon="pi pi-times"
        size="small"
        severity="danger"
        title="Remove annotation"
        :disabled="props.mode === 'view'"
        @click="handleRemoveNode"
      ></Button>
    </div>
    <Button
      icon="pi pi-info-circle"
      size="small"
      severity="secondary"
      class="ml-2"
      title="Click to show preview of annotation data"
      @click="togglePopover"
    ></Button>

    <Popover
      ref="info-icon"
      :pt="{
        root: {
          class: 'w-25rem overflow-y-scroll',
          style: {
            zIndex: 'var(--z-index-max)',
          },
        },
      }"
    >
      <NodePropertiesTable :data="node!.node.data" />

      <pre>
        {{ JSON.stringify(node!, null, 2) }}
      </pre>
    </Popover>
  </div>
</template>

<style scoped>
.node-card-container {
  cursor: auto;
  border: 1px solid gray;
  border-radius: 5px;
  margin-bottom: 0.5rem;
  padding: 0.5rem;

  & button {
    width: 1rem;
    height: 1rem;
    padding: 10px;

    &.invisible {
      visibility: hidden;
    }
  }

  .icon-container {
    width: 20px;
    height: 20px;
  }
}
</style>
