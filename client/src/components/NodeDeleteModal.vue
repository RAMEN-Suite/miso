<script setup lang="ts">
import { computed, inject, Ref, ref, watch } from "vue";
import Button from "primevue/button";
import { CollectionNode, HierarchyNode } from "../models/types";
import { useAppStore } from "../store/app";
import { useRoute } from "vue-router";
import { DynamicDialogInstance } from "primevue/dynamicdialogoptions";

const dialogRef = inject<Ref<DynamicDialogInstance>>("dialogRef");

if (!dialogRef) {
  throw new Error("dialogRef not provided - component must be used inside a DynamicDialog");
}

const emit = defineEmits(["deleted", "canceled"]);

const route = useRoute();

const { api, addToastMessage } = useAppStore();

const asyncOperationRunning = ref<boolean>(false);

// Must be computed since PrimeVue's Dialog Service does not allow custom props for components
const node = computed<HierarchyNode>(() => {
  return dialogRef?.value?.data?.node;
});

const kind = computed<"Collection" | "Content">(() => {
  if (node.value.nodeLabels.includes("Collection")) {
    return "Collection";
  } else {
    return "Content";
  }
});

const deleteMessage = computed<string>(() => {
  if (kind.value === "Collection") {
    const label: string = (node.value as CollectionNode).data.label ?? "";

    return `The Collection "${label}" and everything below it (Content, Annotations) will be deleted. This can NOT be undone. Are you sure?`;
  } else {
    return `This Content will be deleted. This can NOT be undone. Are you sure?`;
  }
});

watch(() => route.path, closeModal);

async function handleSubmitClick(): Promise<void> {
  asyncOperationRunning.value = true;

  try {
    await api.deleteHierarchyNode(node.value.data.uuid);

    closeModal();

    emit("deleted");
  } catch (error: unknown) {
    showMessage("error", error as Error);
  } finally {
    asyncOperationRunning.value = false;
  }
}

function closeModal(): void {
  dialogRef?.value.close();
}

function showMessage(result: "success" | "error", error?: Error) {
  addToastMessage({
    severity: result,
    summary: result === "success" ? "Changes saved successfully" : "Error saving changes",
    detail: error?.message ?? "",
    life: 2000,
  });
}

function handleCancelClick(): void {
  closeModal();
}
</script>

<template>
  <div class="content text-center mb-2">
    <p>
      {{ deleteMessage }}
    </p>
  </div>

  <div class="button-container flex justify-content-center gap-2">
    <Button
      type="submit"
      label="Yes, delete"
      severity="danger"
      :loading="asyncOperationRunning"
      @click="handleSubmitClick"
    ></Button>
    <Button type="button" label="Cancel" title="Cancel" severity="secondary" @click="handleCancelClick"></Button>
  </div>
</template>

<style scoped></style>
