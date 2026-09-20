<script setup lang="ts">
import { computed, inject, Ref, ref, watch } from "vue";
import Button from "primevue/button";
import { useRoute } from "vue-router";
import FormPropertiesSection from "./FormPropertiesSection.vue";
import { Annotation, AnnotationType, PropertyConfig } from "../models/types";
import { useGuidelinesStore } from "../store/guidelines";
import AnnotationReferencesSection from "./AnnotationReferencesSection.vue";
import { DynamicDialogInstance } from "primevue/dynamicdialogoptions";
import { checkAnnotationValidity } from "../utils/helper/helper.ts";

const route = useRoute();
const dialogRef = inject<Ref<DynamicDialogInstance>>("dialogRef");

if (!dialogRef) {
  throw new Error("dialogRef not provided - component must be used inside a DynamicDialog");
}

const emit = defineEmits<{
  (e: "close"): void;
  (e: "submit", annotation: Annotation): void;
}>();

const { getAnnotationConfig, getAnnotationFields } = useGuidelinesStore();

const annotationTemplate: Annotation = dialogRef.value.data.annotation;
/**
 * Optional: Collection annotations pass these in, text annotations resolve them here.
 * Necessary hack, TODO: Will be resolved as soon as Nori Export is implemented
 */
const config: AnnotationType = dialogRef.value.data.config ?? getAnnotationConfig(annotationTemplate.node.data.type);
// TODO: Filter directly in methods. Must be done in several places. Done when Nori export is implemented
const propertyFields: PropertyConfig[] = (
  (dialogRef.value.data.propertyFields ?? getAnnotationFields(annotationTemplate.node.data.type)) as PropertyConfig[]
).filter((f) => f.visible);

const asyncOperationRunning = ref<boolean>(false);

const inputIsValid = computed<boolean>(() => checkAnnotationValidity(annotationTemplate, config));

watch(() => route.path, closeModal);

function closeModal(): void {
  dialogRef?.value.close();
}

function handleSubmitClick(): void {
  closeModal();

  emit("submit", annotationTemplate);
}
</script>

<template>
  <div class="flex flex-col gap-4 annotation-create-modal">
    <div class="content">
      <FormPropertiesSection v-model="annotationTemplate.node.data" :fields="propertyFields" mode="edit" />
      <AnnotationReferencesSection v-model="annotationTemplate.connectedNodes" mode="edit" />
    </div>

    <div class="footer flex justify-center gap-2 w-full">
      <Button
        :disabled="!inputIsValid"
        type="submit"
        icon="icon-plus"
        label="Add"
        title="Add annotation"
        severity="primary"
        :loading="asyncOperationRunning"
        @click="handleSubmitClick"
      ></Button>
    </div>
  </div>
</template>

<style scoped>
.annotation-create-modal {
  padding: 0.25rem;
  height: 100%;
}

.content {
  overflow-y: auto;
  scrollbar-gutter: stable;
  flex-grow: 1;
}

.annotation-type-icon-container {
  width: 20px;
  height: 20px;
}
</style>
