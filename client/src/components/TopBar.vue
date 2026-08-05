<script setup lang="ts">
import Button from "primevue/button";
import EditorSettingsButton from "./EditorSettingsButton.vue";
import BookmarkButton from "./BookmarkButton.vue";
</script>

<template>
  <header class="top-bar flex justify-content-between align-items-center gap-2 p-1">
    <nav class="flex align-items-center gap-2">
      <RouterLink to="/">
        <Button icon="pi pi-home" aria-label="Home" class="w-2rem h-2rem" title="Go to overview"></Button>
      </RouterLink>
    </nav>
    <div class="flex align-items-center gap-2">
      <BookmarkButton />
      <EditorSettingsButton />
    </div>
  </header>
</template>

<style scoped>
.top-bar {
  flex-shrink: 0;
}
</style>
