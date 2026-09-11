<script setup lang="ts">
import { computed } from "vue";
import { resolveNodeIcon } from "../config/icons";
import { filterBaseNodeLabel } from "../utils/helper/helper";

const props = defineProps<{
  nodeLabels: string[];
}>();

const nodeLabels = computed<string[]>(() => filterBaseNodeLabel(props.nodeLabels));
</script>

<template>
  <i :class="resolveNodeIcon(nodeLabels)" :title="nodeLabels.join(', ')" />
</template>

<style scoped></style>
