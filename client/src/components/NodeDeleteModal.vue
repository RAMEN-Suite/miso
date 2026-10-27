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
const nodes = computed<HierarchyNode[]>(() => {
  return dialogRef?.value?.data?.nodes ?? [];
});

// Nested Collections are not deleted (yet), only the direct Contents
const deleteMessage = computed<string>(() => {
  if (nodes.value.length > 1) {
    return `${nodes.value.length} entries will be deleted, together with their annotations and the texts directly inside them. This can NOT be undone. Are you sure?`;
  }

  const node: HierarchyNode | undefined = nodes.value[0];

  if (node?.nodeLabels.includes("Collection")) {
    const label: string = (node as CollectionNode).data.label ?? "";

    return `"${label}" will be deleted, together with its annotations and the texts directly inside it. Nested entries are not deleted. This can NOT be undone. Are you sure?`;
  } else {
    return `This text and its annotations will be deleted. This can NOT be undone. Are you sure?`;
  }
});

watch(() => route.path, closeModal);

/**
 * Deletes the nodes in one all-or-nothing request.
 *
 * @returns {Promise<string[]>} The UUIDs of the removed nodes: the requested ones (deleted now or already gone, which
 * the server skips) plus Contents deleted together with their Collection.
 */
async function deleteNodes(): Promise<string[]> {
  const requestedUuids: string[] = nodes.value.map((node: HierarchyNode) => node.data.uuid);
  const deletedUuids: string[] = await api.deleteHierarchyNodes(requestedUuids);

  return [...new Set<string>([...requestedUuids, ...deletedUuids])];
}

async function handleSubmitClick(): Promise<void> {
  if (asyncOperationRunning.value || nodes.value.length === 0) {
    return;
  }

  asyncOperationRunning.value = true;

  try {
    const deletedUuids: string[] = await deleteNodes();

    closeModal();

    emit("deleted", deletedUuids);
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
    summary: result === "success" ? "Deleted" : "Not deleted",
    detail: error?.message ?? "",
    life: 2000,
  });
}

function handleCancelClick(): void {
  if (asyncOperationRunning.value) {
    return;
  }

  closeModal();
}
</script>

<template>
  <div class="content text-center mb-2">
    <p class="my-4">
      {{ deleteMessage }}
    </p>
  </div>

  <div class="button-container flex justify-center gap-2">
    <Button
      type="submit"
      label="Yes, delete"
      severity="danger"
      :disabled="asyncOperationRunning"
      :loading="asyncOperationRunning"
      @click="handleSubmitClick"
    ></Button>
    <!-- eslint-disable vuejs-accessibility/no-autofocus -- Intended initial focus inside modal -->
    <Button
      type="button"
      label="Cancel"
      title="Cancel"
      severity="secondary"
      :disabled="asyncOperationRunning"
      autofocus
      @click="handleCancelClick"
    ></Button>
    <!-- eslint-enable vuejs-accessibility/no-autofocus -->
  </div>
</template>

<style scoped></style>
