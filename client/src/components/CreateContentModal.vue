<script setup lang="ts">
import { ref, inject, watch, computed, toValue, Ref } from "vue";
import Button from "primevue/button";
import MultiSelect from "primevue/multiselect";
import Textarea from "primevue/textarea";
import { useRoute } from "vue-router";
import { CollectionNode, NodeDto, NodeStatusObject, TextNode } from "../models/types";
import NodeTag from "./NodeTag.vue";
import { useAppStore } from "../store/app";
import { useGuidelinesStore } from "../store/guidelines";
import { createTextNode } from "../utils/helper/helper";
import { DynamicDialogInstance } from "primevue/dynamicdialogoptions";

const dialogRef = inject<Ref<DynamicDialogInstance>>("dialogRef");

if (!dialogRef) {
  throw new Error("dialogRef not provided - component must be used inside a DynamicDialog");
}

const emit = defineEmits<{
  (e: "close"): void;
  (e: "success", content: NodeDto<TextNode>): void;
}>();

const route = useRoute();

const { api, addToastMessage } = useAppStore();
const { getAvailableContentLabels } = useGuidelinesStore();

const parentCollection: CollectionNode | null = dialogRef.value.data.parentCollection;

const isLoading = ref<boolean>(false);
const newContentNode = ref<TextNode>(createTextNode());
const additionalLabels = ref<string[]>([]);
const allLabels = computed<string[]>(() => ["Content", ...additionalLabels.value]);
const availableContentLabels = getAvailableContentLabels();

const inputIsValid = computed<boolean>(() => newContentNode.value.data.text.trim().length > 0);

watch(() => route.path, closeModal);

function closeModal() {
  dialogRef?.value?.close();
}

/**
 * Wraps the new Content node in an ownership tree for the create endpoint: the parent as root with
 * the Content attached, or the Content alone when created at top level.
 *
 * @param {TextNode} contentNode - The new content node.
 * @param {CollectionNode | null} parent - The parent collection, or null for top-level.
 * @returns {NodeStatusObject} The ownership tree to persist.
 */
function wrapDataForCreation(contentNode: TextNode, parent: CollectionNode | null): NodeStatusObject {
  const nodeStatusObject: NodeStatusObject<TextNode> = {
    node: contentNode,
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
  const text: string = newContentNode.value.data.text.replace(/(\r\n|\n|\r)/g, " ");

  const contentNodeToAdd: TextNode = {
    ...newContentNode.value,
    nodeLabels: allLabels.value,
    data: { ...newContentNode.value.data, text },
  };

  isLoading.value = true;

  try {
    const updateObj: NodeStatusObject = wrapDataForCreation(contentNodeToAdd, parentCollection);

    const result: NodeDto<TextNode> = (await api.createHierarchyNode(contentNodeToAdd.data.uuid, updateObj)) as NodeDto<TextNode>;

    emit("success", toValue(result));

    dialogRef?.value.close({ content: result.node });
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
  <div class="container flex flex-column gap-3">
    <div class="flex flex-column gap-1">
      <h3 class="text-center">Labels</h3>
      <MultiSelect
        v-model="additionalLabels"
        :options="availableContentLabels"
        display="chip"
        placeholder="Select labels"
        :filter="false"
      >
        <template #chip="{ value }">
          <NodeTag :content="value" type="Content" class="mr-1" />
        </template>
      </MultiSelect>
    </div>
    <div class="flex flex-column gap-1">
      <h3 class="text-center">Text</h3>
      <Textarea id="text-input" v-model="newContentNode.data.text" class="w-full" rows="6" placeholder="Enter the content text" />
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
