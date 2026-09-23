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
import EntityContainer from "./EntityContainer.vue";
import { createContentNodeStatusObject, createEntityNodeStatusObject } from "../utils/helper/helper";
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

const canCreateNode = computed<boolean>(() => baseNodeLabel === "Content" || baseNodeLabel === "Entity");
const draftText = ref<NodeStatusObject<TextNode> | null>(null);
const draftEntity = ref<NodeStatusObject<EntityNode> | null>(null);

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
  if (baseNodeLabel === "Entity") {
    draftEntity.value = createEntityNodeStatusObject({ additionalNodeLabels: [additionalNodeLabel] });
  } else {
    draftText.value = createContentNodeStatusObject({ additionalNodeLabels: [additionalNodeLabel] });
  }
}

function handleDiscardDraft(): void {
  draftText.value = null;
  draftEntity.value = null;
}

/**
 * Takes over the finished draft Content node as the node to add.
 *
 * @param {NodeStatusObject<TextNode>} newNode - The drafted Content node.
 * @returns {void} This function does not return any value.
 */
function handleTextDraftConfirmed(newNode: NodeStatusObject<TextNode>): void {
  newNode.node.data.text = newNode.node.data.text.replace(/(\r\n|\n|\r)/g, " ");

  setNode(newNode);
  setPipelineStep("finishing");

  draftText.value = null;
}

/**
 * Takes over the finished draft Entity node as the node to add.
 *
 * @param {NodeStatusObject<EntityNode>} newNode - The drafted Entity node.
 * @returns {void} This function does not return any value.
 */
function handleEntityDraftConfirmed(newNode: NodeStatusObject<EntityNode>): void {
  newNode.node.data.label = newNode.node.data.label.trim();

  setNode(newNode);
  setPipelineStep("finishing");

  draftEntity.value = null;
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
  <div class="modal-container">
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

        <TextContainer
          v-if="draftText"
          :text="draftText"
          @text-added="handleTextDraftConfirmed"
          @text-removed="handleDiscardDraft"
        />
        <EntityContainer
          v-else-if="draftEntity"
          :entity="draftEntity"
          @entity-added="handleEntityDraftConfirmed"
          @entity-discarded="handleDiscardDraft"
        />
        <Button
          v-else
          :label="`Create new ${additionalNodeLabel}`"
          icon="icon-plus"
          severity="secondary"
          class="w-full"
          :title="`Create a new ${additionalNodeLabel} node`"
          @click="handleStartDraft"
        />
      </template>
    </template>
    <template v-if="currentStep === 'finishing'">
      <CollectionCard v-if="baseNodeLabel === 'Collection'" :model-value="nodeAsCollection" mode="view" :show-badge="false" />
      <TextCard v-if="baseNodeLabel === 'Content'" :model-value="nodeAsText" mode="view" :show-badge="false" />
      <EntityCard v-if="baseNodeLabel === 'Entity'" :model-value="nodeAsEntity" mode="view" :show-badge="false" />
      <div class="flex justify-center gap-2 mt-6 w-full">
        <Button label="Add" icon="icon-plus" @click="handleFinishClick" />
        <Button label="Go back" icon="icon-arrow-left" severity="secondary" @click="handleGoBack" />
      </div>
    </template>
  </div>
</template>

<style scoped>
/* The dialog has a fixed height, so the searchbar plus the draft area need to stay scrollable */
.modal-container {
  height: 100%;
  overflow-y: auto;
}
</style>
