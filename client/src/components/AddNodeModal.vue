<script setup lang="ts">
import { computed, inject, ref, watch, toValue, Ref } from "vue";
import Button from "primevue/button";
import Divider from "primevue/divider";
import { useAddNode } from "../composables/useAddNode";
import { RouteLocationNormalizedLoaded, useRoute } from "vue-router";
import { NodeStatusObject, CollectionNode, TextNode, EntityNode, ReferenceNodeLabel } from "../models/types";
import NodeSearchbar from "./NodeSearchbar.vue";
import CollectionCard from "./CollectionCard.vue";
import TextCard from "./TextCard.vue";
import TextContainer from "./TextContainer.vue";
import EntityCard from "./EntityCard.vue";
import { createContentNodeStatusObject } from "../utils/helper/helper";
import { DynamicDialogInstance } from "primevue/dynamicdialogoptions";

const dialogRef = inject<Ref<DynamicDialogInstance>>("dialogRef");

if (!dialogRef) {
  throw new Error("dialogRef not provided - component must be used inside a DynamicDialog");
}

const route: RouteLocationNormalizedLoaded = useRoute();

const { currentStep, node: nodeToAdd, setPipelineStep, setNode, finish: finishProcess } = useAddNode();

const baseNodeLabel: ReferenceNodeLabel = dialogRef.value.data.baseNodeLabel;
const additionalNodeLabel: string = dialogRef.value.data.additionalNodeLabel;

if (!additionalNodeLabel) {
  throw new Error("additionalNodeLabel not provided - the node label must be chosen before opening the modal");
}

const emit = defineEmits<{
  (e: "close"): void;
  (e: "submit", node: NodeStatusObject): void;
}>();

const nodeAsCollection = computed(() => (nodeToAdd.value ?? undefined) as NodeStatusObject<CollectionNode> | undefined);
const nodeAsText = computed(() => (nodeToAdd.value ?? undefined) as NodeStatusObject<TextNode> | undefined);
const nodeAsEntity = computed(() => (nodeToAdd.value ?? undefined) as NodeStatusObject<EntityNode> | undefined);

const canCreateNode = computed<boolean>(() => baseNodeLabel === "Content");
const draftNode = ref<NodeStatusObject<TextNode> | null>(null);

watch(() => route.path, closeModal);

function handleFinishClick(): void {
  if (!nodeToAdd.value) {
    return;
  }

  emit("submit", toValue(nodeToAdd.value));

  finishProcess();
  closeModal();
}

function handleSearchItemSelected(item: CollectionNode | TextNode | EntityNode) {
  setNode({
    node: item,
    connectedNodes: [],
    meta: { status: "added" },
  });

  setPipelineStep("finishing");
}

function handleStartDraft(): void {
  draftNode.value = createContentNodeStatusObject({ additionalNodeLabels: [additionalNodeLabel] });
}

function handleDiscardDraft(): void {
  draftNode.value = null;
}

/**
 * Takes over the finished draft node as the node to add.
 *
 * @param {NodeStatusObject<TextNode>} newNode - The drafted Content node.
 * @returns {void} This function does not return any value.
 */
function handleDraftConfirmed(newNode: NodeStatusObject<TextNode>): void {
  newNode.node.data.text = newNode.node.data.text.replace(/(\r\n|\n|\r)/g, " ");

  setNode(newNode);
  setPipelineStep("finishing");

  draftNode.value = null;
}

function handleGoBack(): void {
  setNode(null);
  setPipelineStep("choosing");
}

function closeModal(): void {
  dialogRef?.value?.close();
}
</script>

<template>
  <div class="container">
    <template v-if="currentStep === 'choosing'">
      <NodeSearchbar
        :base-node-label="baseNodeLabel"
        :additional-node-label="additionalNodeLabel"
        @item-selected="handleSearchItemSelected"
      />

      <template v-if="canCreateNode">
        <Divider align="center">
          <span class="text-sm">or create a new one</span>
        </Divider>

        <TextContainer v-if="draftNode" :text="draftNode" @text-added="handleDraftConfirmed" @text-removed="handleDiscardDraft" />
        <Button
          v-else
          :label="`Create new ${additionalNodeLabel}`"
          icon="pi pi-plus"
          severity="secondary"
          class="w-full"
          :title="`Create a new ${additionalNodeLabel} node`"
          @click="handleStartDraft"
        />
      </template>
    </template>
    <template v-if="currentStep === 'finishing'">
      <CollectionCard v-if="baseNodeLabel === 'Collection'" :model-value="nodeAsCollection" mode="view" />
      <TextCard v-if="baseNodeLabel === 'Content'" :model-value="nodeAsText" mode="view" />
      <EntityCard v-if="baseNodeLabel === 'Entity'" :model-value="nodeAsEntity" mode="view" />
      <div class="flex justify-content-center gap-2 mt-4 w-full">
        <Button label="Add" icon="pi pi-plus" @click="handleFinishClick" />
        <Button label="Go back" icon="pi pi-arrow-left" severity="secondary" @click="handleGoBack" />
      </div>
    </template>
  </div>
</template>

<style scoped>
/* The dialog has a fixed height, so the searchbar plus the draft area need to stay scrollable */
.container {
  height: 100%;
  overflow-y: auto;
}
</style>
