<script setup lang="ts">
import FormHeader from "./FormHeader.vue";
import MappingsForm from "./MappingsForm.vue";
</script>

<template>
  <!-- The settings of the text editor (`editors.text`) -->
  <div class="flex flex-col gap-6">
    <FormHeader>
      <h2 class="text-xl font-semibold">Text editor</h2>
      <p class="text-sm text-slate-500">Settings only the text editor uses · <code class="text-xs">editors.text</code></p>
    </FormHeader>

    <MappingsForm />
  </div>
</template>
