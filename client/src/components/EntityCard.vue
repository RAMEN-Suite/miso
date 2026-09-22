<script setup lang="ts">
import { EntityNode, NodeStatusObject } from "../models/types";
import Button from "primevue/button";
import { Popover } from "primevue";
import NodeCard from "./NodeCard.vue";
import NodePropertiesTable from "./NodePropertiesTable.vue";
import { computed, useTemplateRef } from "vue";
import { filterBaseNodeLabel } from "../utils/helper/helper.ts";

const props = withDefaults(
  defineProps<{
    mode: "edit" | "view";
    showBadge?: boolean;
  }>(),
  {
    showBadge: true,
  },
);

const emit = defineEmits<(e: "remove-node") => void>();

const node = defineModel<NodeStatusObject<EntityNode>>({ required: true });

const infoIcon = useTemplateRef("info-icon");

const htmlTitle = computed<string>(() => {
  return `Open ${filterBaseNodeLabel(node.value.node.nodeLabels).join(", ")} in external tool`;
});

function togglePopover(event: MouseEvent): void {
  infoIcon.value?.toggle(event);
}
</script>

<template>
  <!-- Opens the entity in the tool that manages Entities. The URL is resolved server-side. -->
  <NodeCard
    v-model:node="node"
    :mode="props.mode"
    :show-badge="props.showBadge"
    :href="`/api/tools/tori/entity/${node.node.data.uuid}`"
    :title="htmlTitle"
    @remove-node="emit('remove-node')"
  >
    <span class="wrap-break-word min-w-0">
      {{ node.node.data.label }}
    </span>
    <Button
      icon="icon-info"
      size="small"
      severity="secondary"
      class="shrink-0"
      title="Click to show preview of entity data"
      @click="togglePopover"
    ></Button>

    <Popover
      ref="info-icon"
      :pt="{
        root: {
          class: 'w-100',
          style: {
            zIndex: 'var(--z-index-max)',
          },
        },
      }"
    >
      <NodePropertiesTable :data="node.node.data" />
    </Popover>
  </NodeCard>
</template>
