<script setup lang="ts">
import { computed, inject, Ref, ref, watch } from "vue";
import Button from "primevue/button";
import { useRoute } from "vue-router";
import FormPropertiesSection from "./FormPropertiesSection.vue";
import { Annotation, AnnotationType, PropertyConfig } from "../models/types";
import { useGuidelinesStore } from "../store/guidelines";
import AnnotationReferencesSection from "./AnnotationReferencesSection.vue";
import AnnotationAnnotationsSection from "./AnnotationAnnotationsSection.vue";
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
const config: AnnotationType = getAnnotationConfig(annotationTemplate.node.data.type);
const propertyFields: PropertyConfig[] = getAnnotationFields(annotationTemplate.node.data.type);

const asyncOperationRunning = ref<boolean>(false);

const inputIsValid = computed<boolean>(() => checkAnnotationValidity(annotationTemplate, config));

watch(() => route.path, closeModal);

function closeModal(): void {
  dialogRef?.value.close();
}

function handleCancelClick(): void {
  closeModal();
}

function handleSubmitClick(): void {
  closeModal();

  emit("submit", annotationTemplate);
}
</script>

<template>
  <div class="container flex flex-column">
    <h2 class="w-full m-0 text-center">
      Add new <span class="font-italic">{{ annotationTemplate.node.data.type }}</span> Annotation
    </h2>

    <div v-if="annotationTemplate" class="content mb-2">
      <FormPropertiesSection v-model="annotationTemplate.node.data" :fields="propertyFields" mode="edit" />
      <AnnotationReferencesSection v-model="annotationTemplate.connectedNodes" mode="edit" />
      <AnnotationAnnotationsSection v-model="annotationTemplate.connectedNodes" mode="edit" />
    </div>

    <div class="footer flex justify-content-center gap-2">
      <Button
        type="button"
        label="Cancel"
        icon="pi pi-times"
        title="Cancel"
        severity="secondary"
        @click="handleCancelClick"
      ></Button>
      <Button
        :disabled="!inputIsValid"
        type="submit"
        icon="pi pi-plus"
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
.container {
  height: 100%;
}

.content {
  overflow-y: auto;
  scrollbar-gutter: stable;
  flex-grow: 1;
}
</style>
