<script setup lang="ts">
import { ref, inject, watch, computed, Ref } from "vue";
import Button from "primevue/button";
import { useRoute } from "vue-router";
import { CollectionNode, EditGraph, HierarchyNode, ModelContext, NodeTypeOption } from "../models/types";
import FormPropertiesSection from "./FormPropertiesSection.vue";
import CollectionLabelInput from "./CollectionLabelInput.vue";
import { useAppStore } from "../store/app";
import { useConfigStore } from "../store/config";
import { BASE_NODE_REF, createCollectionNode } from "../config/ramen";
import { validateValue } from "../utils/helper/modelHelper";
import { addExistingNode, addRelation, createNode, toGraphNode } from "../utils/helper/editGraph";
import { relationRefOf } from "../utils/helper/writePayload";
import { DynamicDialogInstance } from "primevue/dynamicdialogoptions";

const dialogRef = inject<Ref<DynamicDialogInstance>>("dialogRef");

if (!dialogRef) {
  throw new Error("dialogRef not provided - component must be used inside a DynamicDialog");
}

const emit = defineEmits<{
  (e: "close"): void;
  (e: "success", collection: HierarchyNode): void;
}>();

const route = useRoute();

const { api, addToastMessage } = useAppStore();
const { getCollectionAttributes, getModelContext } = useConfigStore();

const parentCollection: CollectionNode | null = dialogRef.value.data.parentCollection;
const nodeType: NodeTypeOption = dialogRef.value.data.nodeType;

const isLoading = ref<boolean>(false);
const newCollectionNode = ref<CollectionNode>(createCollectionNode(nodeType));
// The label has its own input above the form
const collectionFields = computed(() =>
  getCollectionAttributes(newCollectionNode.value).filter((field) => field.attribute.name !== "label"),
);

const inputIsValid = computed<boolean>(
  () =>
    newCollectionNode.value.properties.label.trim().length > 0 &&
    collectionFields.value.every(
      (field) => validateValue(getModelContext(), field, newCollectionNode.value.properties[field.attribute.name]).length === 0,
    ),
);

watch(() => route.path, closeModal);

function closeModal() {
  dialogRef?.value?.close();
}

/**
 * The graph for the create endpoint: the new node, and its `PART_OF` relation to the parent unless it is created at
 * top level.
 *
 * @param {CollectionNode} collectionNode - The new collection node.
 * @param {CollectionNode | null} parent - The parent collection, or null for top-level.
 * @returns {EditGraph} The graph to save.
 */
function toCreationGraph(collectionNode: CollectionNode, parent: CollectionNode | null): EditGraph {
  const context: ModelContext = getModelContext();
  const graph: EditGraph = { nodes: [], relations: [] };

  createNode(graph, toGraphNode(context, collectionNode));

  if (parent) {
    addExistingNode(graph, toGraphNode(context, parent));
    addRelation(graph, {
      from: collectionNode.properties.uuid,
      relationRef: relationRefOf(
        context,
        collectionNode.classifierRef ?? BASE_NODE_REF.Collection,
        "PART_OF",
        parent.classifierRef ?? BASE_NODE_REF.Collection,
      ),
      to: parent.properties.uuid,
    });
  }

  return graph;
}

async function handleSubmit() {
  if (isLoading.value) {
    return;
  }

  const collectionNodeToAdd: CollectionNode = { ...newCollectionNode.value };

  isLoading.value = true;

  try {
    await api.saveGraph(toCreationGraph(collectionNodeToAdd, parentCollection));

    emit("success", collectionNodeToAdd);

    dialogRef?.value.close({ collection: collectionNodeToAdd });
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
  <div class="modal-container flex flex-col gap-4 py-2">
    <!-- eslint-disable vuejs-accessibility/no-autofocus -- Intended initial focus inside modal -->
    <CollectionLabelInput
      v-model:label="newCollectionNode.properties.label"
      :placeholder="`Provide a ${nodeType.name} label`"
      :disabled="isLoading"
      autofocus
    />
    <!-- eslint-enable vuejs-accessibility/no-autofocus -->

    <div class="modal-body flex flex-col gap-1 px-1">
      <FormPropertiesSection
        v-model="newCollectionNode.properties"
        :fields="collectionFields"
        mode="edit"
        :disabled="isLoading"
      />
    </div>

    <div class="modal-footer flex justify-center gap-2">
      <Button :disabled="!inputIsValid || isLoading" :loading="isLoading" label="Create" icon="icon-plus" @click="handleSubmit" />
    </div>
  </div>
</template>

<style scoped>
.modal-container {
  min-width: 350px;
  flex-grow: 1;
  min-height: 0;
}

.modal-body {
  flex-grow: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
}

.modal-footer {
  flex-shrink: 0;
}
</style>
