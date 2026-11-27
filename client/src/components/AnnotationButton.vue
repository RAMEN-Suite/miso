<script setup lang="ts">
import AnnotationTypeIcon from "./AnnotationTypeIcon.vue";
import Button from "primevue/button";
import { resolveAnnotationIcon } from "../config/icons";
import type { ModelAnnotationShape } from "../models/types";

const props = defineProps<{
  type: string;
  disabled: boolean;
  /** The annotation shape of the type */
  shape: ModelAnnotationShape;
}>();

const emit = defineEmits<(e: "clicked", data: { type: string }) => void>();

const hasIcon: boolean = resolveAnnotationIcon(props.shape) !== undefined;

function handleClick(): void {
  emit("clicked", { type: props.type });
}
</script>

<template>
  <Button
    v-tooltip.hover.top="{ value: props.type, showDelay: 50 }"
    severity="secondary"
    outlined
    raised
    :style="{ height: '35px', width: '35px' }"
    :class="hasIcon ? '' : 'button-empty'"
    :disabled="disabled"
    :data-annotation-type="props.type"
    @click="handleClick"
  >
    <template #icon>
      <AnnotationTypeIcon v-if="hasIcon" :shape="props.shape" />
    </template>
    <template #default>
      <span v-if="!hasIcon"> {{ props.type }} </span>
    </template>
  </Button>
</template>

<style scoped>
.button-empty {
  padding: 0 5px;
  width: auto !important;
}
</style>
