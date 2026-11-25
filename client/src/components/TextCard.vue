<script setup lang="ts">
import { computed } from "vue";
import NodeCard from "./NodeCard.vue";
import { ContentNode, ElementStatus } from "../models/types";
import { filterBaseNodeLabels } from "../config/ramen.ts";

const props = withDefaults(
  defineProps<{
    node: ContentNode;
    /** The edit status shown as badge */
    status?: ElementStatus;
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

const PREVIEW_LENGTH = 100 as const;

const displayedText = computed<string>(
  () => props.node.properties.text.slice(0, PREVIEW_LENGTH) + (props.node.properties.text.length > PREVIEW_LENGTH ? "..." : ""),
);

const htmlTitle = computed<string>(() => {
  return `Open ${filterBaseNodeLabels(props.node.nodeLabels).join(", ")} in Editor`;
});

// A created node does not exist in the database yet, so there is nothing to open in the Editor
const isCreated = computed<boolean>(() => props.status === "created");

const href = computed<string | null>(() => (isCreated.value ? null : `/contents/${props.node.properties.uuid}`));
</script>

<template>
  <NodeCard
    :node="props.node"
    :status="props.status"
    :mode="props.mode"
    :show-badge="props.showBadge"
    :disabled="props.disabled"
    :href="href"
    :title="isCreated ? 'Text is created once the changes are saved' : htmlTitle"
    @remove-node="emit('remove-node')"
  >
    <div class="text-xs wrap-break-word min-w-0">
      {{ displayedText }}
    </div>
  </NodeCard>
</template>
