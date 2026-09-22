<script setup lang="ts">
import { computed, inject, ref, toValue, watch } from "vue";
import { useRoute } from "vue-router";
import Button from "primevue/button";
import { Annotation, AnnotationType, PropertyConfig } from "../models/types";
import { useGuidelinesStore } from "../store/guidelines";
import FormPropertiesSection from "./FormPropertiesSection.vue";
import AnnotationReferencesSection from "./AnnotationReferencesSection.vue";
import { checkAnnotationValidity, cloneDeep } from "../utils/helper/helper.ts";
import { DynamicDialogInstance } from "primevue/dynamicdialogoptions";
import { Ref } from "vue";

const dialogRef = inject<Ref<DynamicDialogInstance>>("dialogRef");

if (!dialogRef) {
  throw new Error("dialogRef not provided - component must be used inside a DynamicDialog");
}

const route: ReturnType<typeof useRoute> = useRoute();
const { getAnnotationConfig, getAnnotationFields } = useGuidelinesStore();

/** Must be passed - contains the annotation data to be edited */
const annotation = ref<Annotation>(cloneDeep(dialogRef.value.data.annotation));

/** Optional as a hack - collection annotations load the config before, text annotations do it inside the modal */
const config: AnnotationType = dialogRef.value.data.config ?? getAnnotationConfig(annotation.value.node.data.type);

// TODO: Filter directly in methods. Must be done in several places. Done when Nori export is implemented
const propertyFields: PropertyConfig[] = (
  (dialogRef.value.data.propertyFields ?? getAnnotationFields(annotation.value.node.data.type)) as PropertyConfig[]
).filter((f) => f.visible);
const inputIsValid = computed<boolean>(() => checkAnnotationValidity(annotation.value, config));

const emit = defineEmits<(e: "submit", data: Annotation) => void>();

watch(() => route.path, closeModal);

function handleUpdateClick(): void {
  if (annotation.value.meta.status !== "created") {
    annotation.value.meta.status = "modified";
  }

  emit("submit", toValue(annotation));
  closeModal();
}

function closeModal(): void {
  dialogRef?.value?.close();
}
</script>

<template>
  <div class="flex flex-col gap-4 annotation-edit-modal">
    <div class="content">
      <FormPropertiesSection v-model="annotation.node.data" :fields="propertyFields" mode="edit" />
      <AnnotationReferencesSection v-model="annotation.connectedNodes" mode="edit" />
    </div>

    <div class="footer flex justify-center gap-2 w-full">
      <Button :disabled="!inputIsValid" label="Update" icon="icon-check" title="Update annotation" @click="handleUpdateClick" />
    </div>
  </div>
</template>

<style scoped>
.annotation-edit-modal {
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
