<script setup lang="ts">
import ProgressSpinner from "primevue/progressspinner";
import { computed } from "vue";

const props = withDefaults(defineProps<{ size?: number; color?: string }>(), { size: 80 });

/** Default PrimeVue colors. */
const DEFAULT_COLORS = ["#F16667", "#8DCC93", "#F79767", "#4C8EDA"] as const;

const colors = computed(() => ({
  colorOne: props.color ?? DEFAULT_COLORS[0],
  colorTwo: props.color ?? DEFAULT_COLORS[1],
  colorThree: props.color ?? DEFAULT_COLORS[2],
  colorFour: props.color ?? DEFAULT_COLORS[3],
}));
</script>

<template>
  <ProgressSpinner
    class="loading-spinner"
    :style="{ width: `${props.size}px`, height: `${props.size}px` }"
    stroke-width="2"
    fill="transparent"
    animation-duration="1.5s"
    aria-label="Custom ProgressSpinner"
    :dt="{ root: colors }"
  />
</template>

<style scoped>
.loading-spinner {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}
</style>
