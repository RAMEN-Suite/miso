<script setup lang="ts">
import TopBar from "../components/TopBar.vue";
</script>

<template>
  <div class="layout flex flex-column h-screen">
    <TopBar />
    <main class="flex-grow-1 min-h-0 overflow-y-auto">
      <slot></slot>
    </main>
  </div>
</template>

<style scoped></style>
