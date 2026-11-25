<script setup lang="ts">
import { CollectionNode, NodeStatus } from "../models/types";
import Button from "primevue/button";
import NodeCard from "./NodeCard.vue";
import NodePreviewPopover from "./NodePreviewPopover.vue";
import NodePropertiesTable from "./NodePropertiesTable.vue";
import { computed, useTemplateRef } from "vue";
import { filterBaseNodeLabels } from "../config/ramen.ts";

const props = withDefaults(
  defineProps<{
    node: CollectionNode;
    /** The edit status shown as badge */
    status?: NodeStatus;
    mode: "edit" | "view";
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

const infoIcon = useTemplateRef<InstanceType<typeof NodePreviewPopover>>("info-icon");

const htmlTitle = computed<string>(() => {
  return `Open ${filterBaseNodeLabels(props.node.nodeLabels).join(",")} in Editor`;
});

function togglePopover(event: MouseEvent): void {
  infoIcon.value?.toggle(event);
}
</script>

<template>
  <NodeCard
    :node="props.node"
    :status="props.status"
    :mode="props.mode"
    :show-badge="props.showBadge"
    :disabled="props.disabled"
    :href="`/collections/${props.node.properties.uuid}`"
    :title="htmlTitle"
    @remove-node="emit('remove-node')"
  >
    <span class="wrap-break-word min-w-0">
      {{ props.node.properties.label }}
    </span>
    <Button
      icon="icon-info"
      size="small"
      severity="secondary"
      class="shrink-0"
      title="Click to show preview of collection data"
      @click="togglePopover"
    ></Button>

    <NodePreviewPopover ref="info-icon">
      <NodePropertiesTable :properties="props.node.properties" />
    </NodePreviewPopover>
  </NodeCard>
</template>
