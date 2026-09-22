<script setup lang="ts">
import { computed } from "vue";
import { resolveNodeIcon } from "../config/icons";
import { filterBaseNodeLabel } from "../utils/helper/helper";
import RAMENNodeIconIcon from "./RAMENNodeIcon.vue";

const props = defineProps<{
  nodeLabels: string[];
}>();

const additionalNodeLabels = computed<string>(() => filterBaseNodeLabel(props.nodeLabels).join(", "));
</script>

<template>
  <RAMENNodeIconIcon
    :spec="resolveNodeIcon(props.nodeLabels)"
    v-tooltip.hover.top="{ value: additionalNodeLabels, showDelay: 50 }"
  />
</template>

<style scoped></style>
