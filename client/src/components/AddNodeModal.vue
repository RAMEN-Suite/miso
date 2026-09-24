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
import TextDraftContainer from "./TextDraftContainer.vue";
import EntityCard from "./EntityCard.vue";
import EntityDraftContainer from "./EntityDraftContainer.vue";
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
const isDrafting = ref<boolean>(false);

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
  isDrafting.value = true;
}

function handleDiscardDraft(): void {
  isDrafting.value = false;
}

/**
 * Takes over the finished draft node as the node to add.
 *
 * @param {NodeStatusObject} newNode - The drafted Content or Entity node.
 * @returns {void} This function does not return any value.
 */
function handleDraftConfirmed(newNode: NodeStatusObject): void {
  setNode(newNode);
  setPipelineStep("finishing");

  isDrafting.value = false;
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

        <TextDraftContainer
          v-if="isDrafting && baseNodeLabel === 'Content'"
          :node-labels="[baseNodeLabel, additionalNodeLabel]"
          @text-added="handleDraftConfirmed"
          @text-discarded="handleDiscardDraft"
        />
        <EntityDraftContainer
          v-else-if="isDrafting && baseNodeLabel === 'Entity'"
          :node-labels="[baseNodeLabel, additionalNodeLabel]"
          @entity-added="handleDraftConfirmed"
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
