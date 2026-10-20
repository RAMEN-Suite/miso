<script setup lang="ts">
import Button from "primevue/button";
import { useEditorSettingsStore } from "../store/editorSettings";

const { settings } = useEditorSettingsStore();

function handleClick(): void {
  settings.value.documentStructures = !settings.value.documentStructures;
}
</script>

<template>
  <Button
    icon="icon-pilcrow"
    aria-label="Toggle formatting marks"
    title="Toggle line break and paragraph symbols"
    severity="secondary"
    :aria-pressed="settings.documentStructures"
    :class="['w-8! h-8!', { pressed: settings.documentStructures }]"
    @click="handleClick"
  ></Button>
</template>

<style scoped>
.pressed {
  background: var(--p-button-secondary-active-background);
  border-color: var(--p-button-secondary-active-border-color);
}
</style>
