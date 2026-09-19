<script setup lang="ts">
import { computed } from "vue";
import Button from "primevue/button";
import { useDialog } from "primevue";
import { BASE_MODAL_PROPS } from "../config/modals";
import ImportModal from "./ImportModal.vue";
import { useAppStore } from "../store/app";

const dialog = useDialog();

const { createModalInstance, destroyModalInstance } = useAppStore();

const editorContainsText = computed<boolean>(() => {
  return true;
});

function openImportModal(): void {
  createModalInstance(
    dialog.open(ImportModal, {
      props: {
        ...BASE_MODAL_PROPS,
        style: { width: "30rem" },
      },
      onClose: () => destroyModalInstance(),
    }),
  );
}
</script>

<template>
  <Button
    icon="pi pi-file-import"
    severity="secondary"
    outlined
    class="h-8 mr-1"
    title="Import JSON"
    :disabled="editorContainsText"
    @click="openImportModal"
  ></Button>
</template>

<style scoped>
.drop-area {
  border: 2px dashed var(--p-primary-500);
}
</style>
