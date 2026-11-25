<script setup lang="ts">
import { ref, inject, watch, computed, Ref } from "vue";
import Button from "primevue/button";
import Textarea from "primevue/textarea";
import { useRoute } from "vue-router";
import { CollectionNode, EditGraph, HierarchyNode, ModelContext, NodeTypeOption, TextNode } from "../models/types";
import { useAppStore } from "../store/app";
import { useConfigStore } from "../store/config";
import { BASE_NODE_REF, createTextNode } from "../config/ramen";
import { addExistingNode, addRelation, createNode, toGraphNode } from "../utils/helper/editGraph";
import { relationRefOf } from "../utils/helper/writePayload";
import { DynamicDialogInstance } from "primevue/dynamicdialogoptions";

const dialogRef = inject<Ref<DynamicDialogInstance>>("dialogRef");

if (!dialogRef) {
  throw new Error("dialogRef not provided - component must be used inside a DynamicDialog");
}

const emit = defineEmits<{
  (e: "close"): void;
  (e: "success", content: HierarchyNode): void;
}>();

const route = useRoute();

const { api, addToastMessage } = useAppStore();
const { getModelContext } = useConfigStore();

const parentCollection: CollectionNode | null = dialogRef.value.data.parentCollection;
const nodeType: NodeTypeOption = dialogRef.value.data.nodeType;

const isLoading = ref<boolean>(false);
const newContentNode = ref<TextNode>(createTextNode(nodeType));

const inputIsValid = computed<boolean>(() => newContentNode.value.properties.text.trim().length > 0);

watch(() => route.path, closeModal);

function closeModal() {
  dialogRef?.value?.close();
}

/**
 * The graph for the create endpoint: the new Content, and its `PART_OF` relation to the parent unless it is created at
 * top level.
 *
 * @param {TextNode} contentNode - The new content node.
 * @param {CollectionNode | null} parent - The parent collection, or null for top-level.
 * @returns {EditGraph} The graph to save.
 */
function toCreationGraph(contentNode: TextNode, parent: CollectionNode | null): EditGraph {
  const context: ModelContext = getModelContext();
  const graph: EditGraph = { nodes: [], relations: [] };

  createNode(graph, toGraphNode(context, contentNode));

  if (parent) {
    addExistingNode(graph, toGraphNode(context, parent));
    addRelation(graph, {
      from: contentNode.properties.uuid,
      relationRef: relationRefOf(
        context,
        contentNode.classifierRef ?? BASE_NODE_REF.Content,
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

  const text: string = newContentNode.value.properties.text.replace(/(\r\n|\n|\r)/g, " ");

  const contentNodeToAdd: TextNode = {
    ...newContentNode.value,
    properties: { ...newContentNode.value.properties, text },
  };

  isLoading.value = true;

  try {
    await api.saveGraph(toCreationGraph(contentNodeToAdd, parentCollection));

    emit("success", contentNodeToAdd);

    dialogRef?.value.close({ content: contentNodeToAdd });
  } catch {
    addToastMessage({
      severity: "error",
      summary: "Error",
      detail: "Failed to create content.",
      life: 3000,
    });
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div class="modal-container flex flex-col gap-4">
    <div class="modal-body">
      <!-- eslint-disable vuejs-accessibility/no-autofocus -- Intended initial focus inside modal -->
      <Textarea
        id="text-input"
        v-model="newContentNode.properties.text"
        class="w-full"
        rows="6"
        placeholder="Add some text"
        :disabled="isLoading"
        autofocus
      />
      <!-- eslint-enable vuejs-accessibility/no-autofocus -->
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
}

.modal-footer {
  flex-shrink: 0;
}
</style>
