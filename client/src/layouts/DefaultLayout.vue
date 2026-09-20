<script setup lang="ts">
import TopBar from "../components/TopBar.vue";
</script>

<template>
  <div class="layout flex flex-col h-screen">
    <TopBar />
    <main class="grow min-h-0 overflow-y-auto">
      <slot></slot>
    </main>
  </div>
</template>

<style scoped></style>
