<script setup lang="ts">
import { SECTION_HEADING_TOP } from "../utils/formLayout";
</script>

<template>
  <!-- The heading of a form section, sticky right below the form heading -->
  <h3 class="sticky z-10 py-1 flex items-center bg-white" :style="{ top: SECTION_HEADING_TOP }">
    <slot />
  </h3>
</template>
