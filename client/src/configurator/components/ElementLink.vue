<script setup lang="ts">
import { useConfigDraft, type Selection } from "../state/useConfigDraft";

defineProps<{
  /** What the form shows after the click */
  to: Selection;
}>();

const { selection } = useConfigDraft();
</script>

<template>
  <!-- A link into the configurator, inline in a text -->
  <button
    type="button"
    class="inline p-0 font-medium text-emerald-700 underline decoration-dotted underline-offset-2 cursor-pointer hover:decoration-solid hover:text-emerald-900"
    @click="selection = to"
  >
    <slot />
  </button>
</template>
