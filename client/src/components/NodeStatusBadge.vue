<script setup lang="ts">
import { computed } from "vue";
import { NodeStatus } from "../models/types";
import { Tag } from "primevue";
import { capitalize } from "../utils/helper/helper";

const props = withDefaults(
  defineProps<{
    status: NodeStatus;
    badgeStyle?: "character" | "dot";
  }>(),
  {
    badgeStyle: "character",
  },
);

const capital = computed<string>(() => props.status.charAt(0).toUpperCase());
const htmlTitle = computed<string>(() => capitalize(props.status));

const severity = computed<string>(() => {
  switch (props.status) {
    case "added":
      return "success";
    case "created":
      return "info";
    case "removed":
      return "danger";
    case "modified":
      return "warn";
    default:
      return "secondary";
  }
});
</script>

<template>
  <Tag
    v-if="props.status !== 'unchanged'"
    :class="`tag-${props.badgeStyle}`"
    :value="props.badgeStyle === 'character' ? capital : ''"
    :title="htmlTitle"
    :severity="severity"
  />
</template>

<style scoped>
.tag-character {
  font-size: 0.7rem;
  padding: 2px 4px;
  line-height: 100%;
  width: 16px;
  height: 16px;
}

.tag-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  padding: 0;
}
</style>
