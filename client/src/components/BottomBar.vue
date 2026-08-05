<script setup lang="ts">
import Button from "primevue/button";
</script>

<template>
  <footer class="bottom-bar flex align-items-center justify-content-end gap-2 px-1 flex-shrink-0">
    <Button
      href="https://ramen-schema.org/"
      target="_blank"
      rel="noopener noreferrer"
      label="RAMEN"
      link
      size="small"
      title="Open the RAMEN specification"
      class="bar-link"
    >
      <template #icon>
        <span class="ramen-icon" aria-hidden="true"></span>
      </template>
    </Button>
    <Button
      href="https://github.com/RAMEN-Suite"
      target="_blank"
      rel="noopener noreferrer"
      label="RAMEN Suite"
      icon="pi pi-github"
      link
      size="small"
      title="Open the RAMEN Suite on GitHub"
      class="bar-link"
    />
  </footer>
</template>

<style scoped>
.bottom-bar {
  height: 30px;
}

.bar-link {
  height: 1.5rem;
  padding: 0 0.25rem;
}

.ramen-icon {
  display: inline-block;
  width: 1rem;
  height: 1rem;
  background-image: url("../../public/icons/ramen.svg");
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}
</style>
