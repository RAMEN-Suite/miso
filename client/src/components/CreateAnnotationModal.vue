<script setup lang="ts">
import { computed, inject, onMounted, Ref, ref, useTemplateRef, watch } from "vue";
import { useRoute } from "vue-router";
import Button from "primevue/button";
import { DynamicDialogInstance } from "primevue/dynamicdialogoptions";
import { Annotation, AnnotationType, CollectionNode, PropertyConfig } from "../models/types";
import { useAppStore } from "../store/app";
import { useGuidelinesStore } from "../store/guidelines";
import { INTRINSIC_ANNOTATION_PROPERTIES, PRUNE_UNCONFIGURED_ANNOTATION_TYPES } from "../config/editor";
import { checkAnnotationValidity, cloneDeep, pruneUnconfiguredProperties } from "../utils/helper/helper";
import { createLogger, Logger } from "../utils/logger";
import FormPropertiesSection from "./FormPropertiesSection.vue";
import AnnotationReferencesSection from "./AnnotationReferencesSection.vue";

const dialogRef = inject<Ref<DynamicDialogInstance>>("dialogRef");

if (!dialogRef) {
  throw new Error("dialogRef not provided - component must be used inside a DynamicDialog");
}

const emit = defineEmits<{
  saved: [annotation: Annotation];
}>();

const logger: Logger = createLogger("collection-annotation");

const route = useRoute();
const { api, addToastMessage } = useAppStore();
const { getCollectionAnnotationConfig, getCollectionAnnotationFields } = useGuidelinesStore();

const collection: CollectionNode = dialogRef.value.data.collection;
const config: AnnotationType = dialogRef.value.data.config;
const mode: "create" | "edit" = dialogRef.value.data.mode;

const annotation = ref<Annotation>(cloneDeep(dialogRef.value.data.annotation));

const propertyFields: PropertyConfig[] = getCollectionAnnotationFields(collection.nodeLabels, annotation.value.node.data.type).filter(
  (f) => f.visible,
);

const propertiesSection = useTemplateRef<InstanceType<typeof FormPropertiesSection>>("propertiesSection");
const referencesSection = useTemplateRef<InstanceType<typeof AnnotationReferencesSection>>("referencesSection");

const isLoading = ref<boolean>(false);

const inputIsValid = computed<boolean>(() => checkAnnotationValidity(annotation.value, config));

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
 * Returns a copy of the annotation, ready to send: status set and pruned to the configured properties.
 *
 * @returns {Annotation} The annotation to save.
 */
function prepareAnnotation(): Annotation {
  const prepared: Annotation = cloneDeep(annotation.value);
  const type: string = prepared.node.data.type;

  prepared.meta.status = mode === "create" ? "created" : "modified";

  if (getCollectionAnnotationConfig(collection.nodeLabels, type) || PRUNE_UNCONFIGURED_ANNOTATION_TYPES) {
    pruneUnconfiguredProperties(prepared.node.data, getCollectionAnnotationFields(collection.nodeLabels, type), INTRINSIC_ANNOTATION_PROPERTIES);
  }

  return prepared;
}

/**
 * Saves the annotation, emits `saved` and closes the modal. Stays open on failure.
 *
 * @returns {Promise<void>} Resolves when the save is done.
 */
async function handleSubmit(): Promise<void> {
  if (isLoading.value) {
    return;
  }

  const prepared: Annotation = prepareAnnotation();
  const stopTimer = logger.time();

  isLoading.value = true;

  try {
    await api.updateCollectionAnnotation(collection, prepared);

    stopTimer("Saved", { mode, uuid: prepared.node.data.uuid });
    emit("saved", prepared);
    closeModal();
  } catch (error: unknown) {
    stopTimer("Failed", { mode, uuid: prepared.node.data.uuid, message: (error as Error).message }, "error");
    addToastMessage({ severity: "error", summary: "Not saved", detail: (error as Error).message, life: 4000 });
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-4 annotation-modal">
    <div class="content px-1">
      <FormPropertiesSection ref="propertiesSection" v-model="annotation.node.data" :fields="propertyFields" mode="edit" />
      <AnnotationReferencesSection ref="referencesSection" v-model="annotation.connectedNodes" mode="edit" />
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
