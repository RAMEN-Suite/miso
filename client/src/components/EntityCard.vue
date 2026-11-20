<script setup lang="ts">
import { EntityNode, NodeStatusObject } from "../models/types";
import Button from "primevue/button";
import NodeCard from "./NodeCard.vue";
import NodePreviewPopover from "./NodePreviewPopover.vue";
import NodePropertiesTable from "./NodePropertiesTable.vue";
import { computed, useTemplateRef } from "vue";
import { filterBaseNodeLabels } from "../config/ramen.ts";

const props = withDefaults(
  defineProps<{
    mode: "edit" | "view";
    showBadge?: boolean;
    /** Locks the remove button temporarily, e.g. while a request is pending */
    disabled?: boolean;
  }>(),
  {
    showBadge: true,
    disabled: false,
  },
);

const emit = defineEmits<(e: "remove-node") => void>();

const node = defineModel<NodeStatusObject<EntityNode>>({ required: true });

const infoIcon = useTemplateRef<InstanceType<typeof NodePreviewPopover>>("info-icon");

const htmlTitle = computed<string>(() => {
  return `Open ${filterBaseNodeLabels(node.value.node.nodeLabels).join(", ")} in external tool`;
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
    :disabled="props.disabled"
    :href="`/api/tools/tori/entity/${node.node.properties.uuid}`"
    :title="htmlTitle"
    @remove-node="emit('remove-node')"
  >
    <span class="wrap-break-word min-w-0">
      {{ node.node.properties.label }}
    </span>
    <Button
      icon="icon-info"
      size="small"
      severity="secondary"
      class="shrink-0"
      title="Click to show preview of entity data"
      @click="togglePopover"
    ></Button>

    <NodePreviewPopover ref="info-icon">
      <NodePropertiesTable :properties="node.node.properties" />
    </NodePreviewPopover>
  </NodeCard>
</template>
