<script setup lang="ts">
import EditorHistoryButton from "./EditorHistoryButton.vue";
import EditorImportButton from "./EditorImportButton.vue";
import EditorExportButton from "./EditorExportButton.vue";
</script>

<template>
  <div class="header">
    <div class="header-buttons flex justify-content-end mb-2">
      <div class="flex">
        <EditorHistoryButton action="undo" />
        <EditorHistoryButton action="redo" />
        <EditorImportButton />
        <EditorExportButton />
      </div>
    </div>
  </div>
</template>

<style scoped></style>
