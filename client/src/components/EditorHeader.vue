<script setup lang="ts">
import EditorHistoryButton from "./EditorHistoryButton.vue";
import EditorFormattingMarksButton from "./EditorFormattingMarksButton.vue";
import EditorSpecialCharactersButton from "./EditorSpecialCharactersButton.vue";
</script>

<template>
  <div class="header">
    <div class="header-buttons flex justify-end gap-2 mb-2">
      <div class="flex gap-0.5">
        <EditorFormattingMarksButton />
        <EditorSpecialCharactersButton />
      </div>
      <div class="flex gap-0.5">
        <EditorHistoryButton action="undo" />
        <EditorHistoryButton action="redo" />
      </div>
    </div>
  </div>
</template>

<style scoped></style>
