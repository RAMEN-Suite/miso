<script setup lang="ts">
import { computed, inject, ref, toValue, watch } from "vue";
import { useRoute } from "vue-router";
import Button from "primevue/button";
import { Annotation, AnnotationType, PropertyConfig } from "../models/types";
import { useGuidelinesStore } from "../store/guidelines";
import FormPropertiesSection from "./FormPropertiesSection.vue";
import AnnotationReferencesSection from "./AnnotationReferencesSection.vue";
import AnnotationTypeIcon from "./AnnotationTypeIcon.vue";
import { checkAnnotationValidity, cloneDeep } from "../utils/helper/helper.ts";
import { DynamicDialogInstance } from "primevue/dynamicdialogoptions";
import { Ref } from "vue";

const dialogRef = inject<Ref<DynamicDialogInstance>>("dialogRef");

if (!dialogRef) {
  throw new Error("dialogRef not provided - component must be used inside a DynamicDialog");
}

const route: ReturnType<typeof useRoute> = useRoute();
const { getAnnotationConfig, getAnnotationFields } = useGuidelinesStore();

const annotation = ref<Annotation>(cloneDeep(dialogRef.value.data.annotation));
const config: AnnotationType | undefined = getAnnotationConfig(annotation.value.node.data.type);
const propertyFields: PropertyConfig[] = getAnnotationFields(annotation.value.node.data.type);

const inputIsValid = computed<boolean>(() => checkAnnotationValidity(annotation.value, config));

watch(() => route.path, closeModal);

const emit = defineEmits<(e: "submit", data: Annotation) => void>();

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
  <div class="container flex flex-column gap-3 annotation-edit-modal">
    <div class="flex items-center gap-2">
      <div class="icon-container">
        <AnnotationTypeIcon :annotation-type="annotation.node.data.subType ?? annotation.node.data.type" />
      </div>
      <span class="font-bold">{{ annotation.node.data.subType ?? annotation.node.data.type }}</span>
    </div>

    <div class="content">
      <FormPropertiesSection v-model="annotation.node.data" :fields="propertyFields" mode="edit" />
      <AnnotationReferencesSection v-model="annotation.connectedNodes" mode="edit" />
    </div>
  </div>
  <div class="footer flex justify-content-center gap-2 mt-4 w-full">
    <Button :disabled="!inputIsValid" label="Update" icon="pi pi-check" title="Update annotation" @click="handleUpdateClick" />
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

.icon-container {
  width: 20px;
  height: 20px;
}
</style>
