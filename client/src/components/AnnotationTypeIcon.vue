<script setup lang="ts">
import { computed } from "vue";
import { AnnotationType, IconSpecInput } from "../models/types";
import { resolveAnnotationIcon } from "../config/icons";
import RAMENNodeIcon from "./RAMENNodeIcon.vue";

const props = withDefaults(
  defineProps<{
    config: AnnotationType | undefined;
    size?: number;
  }>(),
  {
    size: 18,
  },
);

const icon = computed<IconSpecInput | undefined>(() => resolveAnnotationIcon(props.config));
</script>

<template>
  <RAMENNodeIcon v-if="icon" :spec="icon" :size="props.size" />
</template>
