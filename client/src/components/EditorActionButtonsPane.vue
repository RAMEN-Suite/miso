<script setup lang="ts">
import Button from "primevue/button";

const isDevelopment: boolean = import.meta.env.DEV;

const emit = defineEmits(["save", "cancel", "log-json", "log-text"]);

function handleSave(): void {
  emit("save");
}

function handleLogJson() {
  emit("log-json");
}

function handleLogText() {
  emit("log-text");
}

function handleCancel(): void {
  emit("cancel");
}
</script>

<template>
  <div class="editor-button-container flex justify-center gap-4 p-4">
    <Button aria-label="Save changes" title="Save changes" @click="handleSave">Save</Button>
    <Button severity="secondary" title="Discard changes" aria-label="Cancel changes" @click="handleCancel">Cancel</Button>
    <Button v-if="isDevelopment" aria-label="Log doc" title="Log doc" severity="info" @click="handleLogJson">JSON</Button>

    <Button v-if="isDevelopment" aria-label="Log text" title="Log text" severity="info" @click="handleLogText">Text</Button>
  </div>
</template>

<style scoped></style>
