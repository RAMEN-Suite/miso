<script setup lang="ts">
import EditorHistoryButton from "./EditorHistoryButton.vue";
</script>

<template>
  <div class="header">
    <div class="header-buttons flex justify-end mb-2">
      <div class="flex">
        <EditorHistoryButton action="undo" />
        <EditorHistoryButton action="redo" />
      </div>
    </div>
  </div>
</template>

<style scoped></style>
