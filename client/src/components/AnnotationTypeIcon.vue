<script setup lang="ts">
import { computed } from "vue";
import { IconSpecInput, ModelAnnotationShape } from "../models/types";
import { resolveAnnotationIcon } from "../config/icons";
import RAMENNodeIcon from "./RAMENNodeIcon.vue";

const props = withDefaults(
  defineProps<{
    /** The annotation shape whose configured icon is shown */
    shape: ModelAnnotationShape | undefined;
    size?: number;
  }>(),
  {
    size: 18,
  },
);

const icon = computed<IconSpecInput | undefined>(() => resolveAnnotationIcon(props.shape));
</script>

<template>
  <RAMENNodeIcon v-if="icon" :spec="icon" :size="props.size" />
</template>
