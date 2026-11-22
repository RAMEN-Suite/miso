<script setup lang="ts">
import { useTemplateRef } from "vue";
import Button from "primevue/button";
import SpecialCharactersPopover from "./SpecialCharactersPopover.vue";
import { useTiptapStore } from "../store/tiptap";

const { tiptap, specialCharacterGroups: groups } = useTiptapStore();

const popover = useTemplateRef<InstanceType<typeof SpecialCharactersPopover>>("popover");

function toggle(event: PointerEvent): void {
  popover.value?.toggle(event);
}
</script>

<template>
  <Button
    icon="icon-omega"
    severity="secondary"
    aria-label="Special characters"
    :title="groups.length > 0 ? 'Insert special characters' : 'No special characters configured for this project'"
    class="w-8! h-8!"
    :disabled="groups.length === 0 || !tiptap"
    @click="toggle"
  ></Button>
  <SpecialCharactersPopover ref="popover" />
</template>
