<script setup lang="ts">
import { computed } from "vue";
import NodeCard from "./NodeCard.vue";
import { TextNode, NodeStatusObject } from "../models/types";
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

const node = defineModel<NodeStatusObject<TextNode>>({ required: true });

const PREVIEW_LENGTH = 100 as const;

const displayedText = computed<string>(
  () => node.value.node.data.text.slice(0, PREVIEW_LENGTH) + (node.value.node.data.text.length > PREVIEW_LENGTH ? "..." : ""),
);

const htmlTitle = computed<string>(() => {
  return `Open ${filterBaseNodeLabel(node.value.node.nodeLabels).join(", ")} in Editor`;
});

// A created node does not exist in the database yet, so there is nothing to open in the Editor
const isCreated = computed<boolean>(() => node.value.meta.status === "created");

const href = computed<string | null>(() => (isCreated.value ? null : `/contents/${node.value.node.data.uuid}`));
</script>

<template>
  <NodeCard
    v-model:node="node"
    :mode="props.mode"
    :show-badge="props.showBadge"
    :href="href"
    :title="isCreated ? 'Text is created once the changes are saved' : htmlTitle"
    @remove-node="emit('remove-node')"
  >
    <div class="text-xs wrap-break-word min-w-0">
      {{ displayedText }}
    </div>
  </NodeCard>
</template>
