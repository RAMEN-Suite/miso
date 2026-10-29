<script setup lang="ts">
import { ref, inject, watch, computed, toValue, Ref } from "vue";
import Button from "primevue/button";
import { useRoute } from "vue-router";
import { CollectionNode, CollectionTemplate, HierarchyNode, NodeDto, NodeStatusObject } from "../models/types";
import FormPropertiesSection from "./FormPropertiesSection.vue";
import CollectionLabelInput from "./CollectionLabelInput.vue";
import { useAppStore } from "../store/app";
import { useGuidelinesStore } from "../store/guidelines";
import { useTemplates } from "../composables/useTemplates";
import { createCollectionNode } from "../config/ramen";
import { isRequiredValueMissing } from "../utils/helper/helper";
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
const { applyCollectionTemplate } = useTemplates();

const parentCollection: CollectionNode | null = dialogRef.value.data.parentCollection;
const additionalNodeLabel: string = dialogRef.value.data.additionalNodeLabel;
/** The template chosen in the menu for creating nodes, if any. Its properties prefill the form. */
const template: CollectionTemplate | null = dialogRef.value.data.template ?? null;

const initialNode: CollectionNode = createCollectionNode();

const isLoading = ref<boolean>(false);
const newCollectionNode = ref<CollectionNode>({
  ...initialNode,
  data: { ...template?.properties, ...initialNode.data },
});
const nodeLabels = computed<string[]>(() => ["Collection", additionalNodeLabel]);
const collectionFields = computed(() => getCollectionConfigFields(nodeLabels.value).filter((f) => f.name !== "label"));

const inputIsValid = computed<boolean>(
  () =>
    newCollectionNode.value.data.label.trim().length > 0 &&
    collectionFields.value.every((field) => !isRequiredValueMissing(newCollectionNode.value.data[field.name], field)),
);

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
 * @param {CollectionTemplate | null} template - The template whose nodes are created below the new node, if any.
 * @returns {NodeStatusObject} The ownership tree to persist.
 */
function wrapDataForCreation(
  collectionNode: CollectionNode,
  parent: CollectionNode | null,
  template: CollectionTemplate | null,
): NodeStatusObject {
  const created: NodeStatusObject = {
    node: collectionNode,
    connectedNodes: [],
    meta: { status: "created" },
  };

  const nodeStatusObject: NodeStatusObject = template ? applyCollectionTemplate(created, template) : created;

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
  if (isLoading.value) {
    return;
  }

  const collectionNodeToAdd: CollectionNode = { ...newCollectionNode.value, nodeLabels: toValue(nodeLabels.value) };

  isLoading.value = true;

  try {
    const updateObj: NodeStatusObject = wrapDataForCreation(collectionNodeToAdd, parentCollection, template);

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
  <div class="modal-container flex flex-col gap-4 py-2">
    <!-- eslint-disable vuejs-accessibility/no-autofocus -- Intended initial focus inside modal -->
    <CollectionLabelInput
      v-model:label="newCollectionNode.data.label"
      :placeholder="`Provide a ${additionalNodeLabel} label`"
      autofocus
    />
    <!-- eslint-enable vuejs-accessibility/no-autofocus -->

    <div class="modal-body flex flex-col gap-1 px-1">
      <FormPropertiesSection v-model="newCollectionNode.data" :fields="collectionFields" mode="edit" />
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
