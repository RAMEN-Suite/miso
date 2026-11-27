<script setup lang="ts">
import { computed, inject, onMounted, Ref, ref, useTemplateRef, watch } from "vue";
import { useRoute } from "vue-router";
import Button from "primevue/button";
import { DynamicDialogInstance } from "primevue/dynamicdialogoptions";
import { AnnotationNode, EditGraph, EditNode, ModelAttribute, WriteResponse } from "../models/types";
import { isVisible } from "../utils/helper/modelHelper";
import { useAppStore } from "../store/app";
import { useConfigStore } from "../store/config";
import { checkAnnotationValidity, cloneDeep, pruneUnconfiguredProperties } from "../utils/helper/helper";
import { findNode, referencesOf, updateNode } from "../utils/helper/editGraph";
import FormPropertiesSection from "./FormPropertiesSection.vue";
import AnnotationReferencesSection from "./AnnotationReferencesSection.vue";

const dialogRef = inject<Ref<DynamicDialogInstance>>("dialogRef");

if (!dialogRef) {
  throw new Error("dialogRef not provided - component must be used inside a DynamicDialog");
}

const emit = defineEmits<{
  /** The graph as it was saved, with its statuses, and the annotations the server deleted as orphans */
  saved: [graph: EditGraph, deletedOrphans: string[]];
}>();

const route = useRoute();
const { api, addToastMessage } = useAppStore();
const { getAnnotationNodeProperties, getAnnotationProperties, getMissingAnnotationReferences, getModelContext } =
  useConfigStore();

const uuid: string = dialogRef.value.data.annotationUuid;

/** A copy of the pane's graph, with the new annotation already in it when creating */
const graph = ref<EditGraph>(cloneDeep(dialogRef.value.data.graph));

const annotationNode = computed<AnnotationNode>(() => findNode(graph.value, uuid) as unknown as AnnotationNode);

const allProperties: ModelAttribute[] = getAnnotationProperties(annotationNode.value);
const propertyFields: ModelAttribute[] = allProperties.filter((field) => isVisible(getModelContext(), field));

const propertiesSection = useTemplateRef<InstanceType<typeof FormPropertiesSection>>("propertiesSection");
const referencesSection = useTemplateRef<InstanceType<typeof AnnotationReferencesSection>>("referencesSection");

const isLoading = ref<boolean>(false);

/** Valid properties and no missing required references; the save button stays disabled until then */
const inputIsValid = computed<boolean>(
  () =>
    checkAnnotationValidity(annotationNode.value, allProperties, getModelContext()) &&
    getMissingAnnotationReferences(annotationNode.value, referencesOf(graph.value, uuid)).length === 0,
);

watch(() => route.path, closeModal);

onMounted(focusFirstInput);

function closeModal(): void {
  dialogRef?.value?.close();
}

function focusFirstInput(): void {
  const firstField: Element | null | undefined = propertiesSection.value?.$el.querySelector(
    'input:not([disabled]), textarea:not([disabled]), [role="combobox"]:not([tabindex="-1"])',
  );

  (firstField ?? referencesSection.value?.addButton?.$el)?.setAttribute("autofocus", "");
}

/**
 * Returns a copy of the graph, ready to send: the annotation marked as changed and pruned to the configured properties.
 *
 * @returns {EditGraph} The graph to save.
 * @throws {Error} If the annotation is missing from the graph.
 */
function prepareGraph(): EditGraph {
  const prepared: EditGraph = cloneDeep(graph.value);
  const found: EditNode | undefined = findNode(prepared, uuid);

  if (!found) {
    throw new Error(`Annotation ${uuid} not found in graph.`);
  }

  const node: EditNode = cloneDeep(found);
  const annotation: AnnotationNode = node as unknown as AnnotationNode;

  pruneUnconfiguredProperties(
    node.properties,
    getAnnotationProperties(annotation).map((field) => field.attribute.name),
    getAnnotationNodeProperties(annotation),
  );

  updateNode(prepared, node);

  return prepared;
}

/**
 * Saves the graph, emits `saved` and closes the modal. Stays open on failure.
 *
 * @returns {Promise<void>} Resolves when the save is done.
 */
async function handleSubmit(): Promise<void> {
  if (isLoading.value) {
    return;
  }

  isLoading.value = true;

  try {
    const prepared: EditGraph = prepareGraph();
    const result: WriteResponse = await api.saveGraph(prepared);

    emit("saved", prepared, result.deletedOrphans);
    closeModal();
  } catch (error: unknown) {
    addToastMessage({ severity: "error", summary: "Not saved", detail: (error as Error).message, life: 4000 });
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-4 annotation-modal">
    <div class="content px-1">
      <FormPropertiesSection
        ref="propertiesSection"
        v-model="annotationNode.properties"
        :fields="propertyFields"
        mode="edit"
        :disabled="isLoading"
      />
      <AnnotationReferencesSection
        ref="referencesSection"
        v-model="graph"
        :annotation-uuid="uuid"
        mode="edit"
        :disabled="isLoading"
      />
    </div>

    <div class="footer flex justify-center gap-2 w-full">
      <Button
        icon="icon-save"
        label="Save"
        title="Save annotation"
        :disabled="!inputIsValid || isLoading"
        :loading="isLoading"
        @click="handleSubmit"
      />
    </div>
  </div>
</template>

<style scoped>
.annotation-modal {
  padding: 0.25rem;
  height: 100%;
}

.content {
  overflow-y: auto;
  scrollbar-gutter: stable;
  flex-grow: 1;

  > * {
    margin-bottom: 2rem;
  }
}
</style>
