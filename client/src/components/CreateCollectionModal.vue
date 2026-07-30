<script setup lang="ts">
import { ref, inject, watch, computed, toValue, Ref } from "vue";
import Button from "primevue/button";
import { useRoute } from "vue-router";
import { CollectionNode, HierarchyNode, NodeDto, NodeStatusObject } from "../models/types";
import FormPropertiesSection from "./FormPropertiesSection.vue";
import { useAppStore } from "../store/app";
import { useGuidelinesStore } from "../store/guidelines";
import { createCollectionNode } from "../utils/helper/helper";
import { DynamicDialogInstance } from "primevue/dynamicdialogoptions";

const dialogRef = inject<Ref<DynamicDialogInstance>>("dialogRef");

if (!dialogRef) {
  throw new Error("dialogRef not provided - component must be used inside a DynamicDialog");
}

const emit = defineEmits<{
  (e: "close"): void;
  (e: "success", collection: NodeDto<HierarchyNode>): void;
}>();

const route = useRoute();

const { api, addToastMessage } = useAppStore();
const { getCollectionConfigFields } = useGuidelinesStore();

const parentCollection: CollectionNode | null = dialogRef.value.data.parentCollection;
const additionalNodeLabel: string = dialogRef.value.data.additionalNodeLabel;

const isLoading = ref<boolean>(false);
const newCollectionNode = ref<CollectionNode>(createCollectionNode());
const nodeLabels = computed<string[]>(() => ["Collection", additionalNodeLabel]);
const collectionFields = computed(() => getCollectionConfigFields(nodeLabels.value));

const inputIsValid = computed<boolean>(() => newCollectionNode.value.data.label.trim().length > 0);

watch(() => route.path, closeModal);

function closeModal() {
  dialogRef?.value?.close();
}

/**
 * Wraps the new node in an ownership tree for the create endpoint: the parent as root with the new
 * node attached, or the new node alone when created at top level.
 *
 * @param {CollectionNode} collectionNode - The new collection node.
 * @param {CollectionNode | null} parent - The parent collection, or null for top-level.
 * @returns {NodeStatusObject} The ownership tree to persist.
 */
function wrapDataForCreation(collectionNode: CollectionNode, parent: CollectionNode | null): NodeStatusObject {
  const nodeStatusObject: NodeStatusObject<CollectionNode> = {
    node: collectionNode,
    connectedNodes: [],
    meta: { status: "created" },
  };

  if (!parent) {
    return nodeStatusObject;
  }

  return {
    node: parent,
    connectedNodes: [nodeStatusObject],
    meta: { status: "unchanged" },
  };
}

async function handleSubmit() {
  const collectionNodeToAdd: CollectionNode = { ...newCollectionNode.value, nodeLabels: toValue(nodeLabels.value) };

  isLoading.value = true;

  try {
    const updateObj: NodeStatusObject = wrapDataForCreation(collectionNodeToAdd, parentCollection);

    const result: NodeDto<HierarchyNode> = await api.createHierarchyNode(collectionNodeToAdd.data.uuid, updateObj);

    emit("success", toValue(result));

    dialogRef?.value.close({ collection: result.node });
  } catch {
    addToastMessage({
      severity: "error",
      summary: "Error",
      detail: "Failed to create collection.",
      life: 3000,
    });
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div class="container flex flex-column gap-3">
    <div class="flex flex-column gap-1">
      <FormPropertiesSection v-model="newCollectionNode.data" :fields="collectionFields" mode="edit" />
    </div>

    <div class="flex justify-content-center gap-2">
      <Button :disabled="!inputIsValid" :loading="isLoading" label="Create" icon="pi pi-plus" @click="handleSubmit" />
    </div>
  </div>
</template>

<style scoped>
.container {
  min-width: 350px;
}
</style>
