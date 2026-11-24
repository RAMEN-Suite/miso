<script setup lang="ts">
import { useClipboard } from "@vueuse/core";

/** A small button that copies `text` to the clipboard and says "copied" for a moment */
const props = defineProps<{ text: string }>();

/** How long "copied" shows after a click */
const COPIED_MS = 1500;

const { copy, copied, isSupported } = useClipboard({ copiedDuring: COPIED_MS, legacy: true });
</script>

<template>
  <span v-if="isSupported" class="inline-flex items-center gap-1 align-middle">
    <button
      type="button"
      class="inline-flex items-center justify-center w-5 h-5 rounded cursor-pointer text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      :aria-label="`Copy ${props.text}`"
      title="Copy to the clipboard"
      @click="copy(props.text)"
    >
      <i :class="copied ? 'icon-check text-emerald-600' : 'icon-copy'" class="text-xs" />
    </button>
    <span v-if="copied" class="text-xs text-emerald-600">copied</span>
  </span>
</template>
