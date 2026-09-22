<script setup lang="ts">
import { computed } from "vue";
import { AnnotationNode, NodeStatusObject } from "../models/types";
import AnnotationCard from "./AnnotationCard.vue";

const node = defineModel<NodeStatusObject<AnnotationNode>>({ required: true });

const props = defineProps<{
  mode: "edit" | "view";
}>();

const childCount = computed<number>(
  () => node.value.connectedNodes.filter((n) => n.meta.status !== "deleted" && n.meta.status !== "removed").length,
);
</script>

<template>
  <div class="annotation-tree-node" :data-mode="props.mode">
    <AnnotationCard v-model="node" mode="view" />

    <p v-if="childCount > 0" class="nested-hint text-(color:--p-text-muted-color) text-xs">
      <span class="icon-network"></span>
      {{ childCount }} nested node{{ childCount === 1 ? "" : "s" }} - tree view coming soon
    </p>
  </div>
</template>

<style scoped>
.annotation-tree-node {
  /* Indentation / tree connectors will be added with the recursive tree UI. */
}

.nested-hint {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin: 0.25rem 0 0.5rem 0.5rem;
}
</style>
