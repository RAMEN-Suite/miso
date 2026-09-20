<script setup lang="ts">
import { useTemplateRef } from "vue";
import Popover from "primevue/popover";
import Button from "primevue/button";
import ToggleSwitch from "primevue/toggleswitch";
import { useEditorSettingsStore } from "../store/editorSettings";

const { settings } = useEditorSettingsStore();

const popover = useTemplateRef<InstanceType<typeof Popover>>("popover");

function toggle(event: PointerEvent): void {
  popover.value?.toggle(event);
}
</script>

<template>
  <Button severity="secondary" aria-label="View settings" title="View settings" class="w-8! h-8! ml-1" @click="toggle">
    <i class="icon-settings"></i>
  </Button>
  <Popover ref="popover">
    <div class="flex flex-col gap-4 p-2" style="min-width: 16rem">
      <span class="font-bold">Document structures</span>

      <div class="flex items-center justify-between gap-4" title="Toggle line break and paragraph symbols">
        <label for="doc-structures">Show formatting marks</label>
        <ToggleSwitch v-model="settings.documentStructures" input-id="doc-structures" />
      </div>

      <span class="font-bold">Block decorations</span>

      <div class="flex items-center justify-between gap-4" title="Toggle outlines for document blocks (paragraphs, lists)">
        <label for="deco-outline">Show block outlines</label>
        <ToggleSwitch v-model="settings.blockDecorations.outline" input-id="deco-outline" />
      </div>

      <div class="flex items-center justify-between gap-4" title="Display block names (paragraphs, lists) on top of each block">
        <label for="deco-base">Show block names</label>
        <ToggleSwitch v-model="settings.blockDecorations.baseType" input-id="deco-base" />
      </div>
    </div>
  </Popover>
</template>

<style scoped>
label {
  cursor: pointer;
}
</style>
