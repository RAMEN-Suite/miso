<script setup lang="ts">
import Button from "primevue/button";
import { useDialog } from "primevue";
import { BASE_MODAL_PROPS } from "../config/modals";
import { useAppStore } from "../store/app";
import ExportModal from "./ExportModal.vue";

const dialog = useDialog();

const { createModalInstance, destroyModalInstance } = useAppStore();

function openExportModal(): void {
  createModalInstance(
    dialog.open(ExportModal, {
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
    icon="icon-file-output"
    severity="secondary"
    outlined
    class="w-8! h-8! mr-1"
    title="Export JSON"
    disabled
    @click="openExportModal"
  ></Button>
</template>

<style scoped>
.drop-area {
  border: 2px dashed var(--p-primary-500);
}
</style>
