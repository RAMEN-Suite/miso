<script setup lang="ts">
import { computed } from "vue";
import { resolveNodeIcon } from "../config/icons";
import { filterBaseNodeLabel } from "../utils/helper/helper";
import AppIcon from "./AppIcon.vue";

const props = defineProps<{
  nodeLabels: string[];
}>();

const additionalNodeLabels = computed<string>(() => filterBaseNodeLabel(props.nodeLabels).join(", "));
</script>

<template>
  <AppIcon
    :spec="resolveNodeIcon(props.nodeLabels)"
    v-tooltip.hover.top="{ value: additionalNodeLabels, showDelay: 50 }"
  />
</template>

<style scoped></style>
