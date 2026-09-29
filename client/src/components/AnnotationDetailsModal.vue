<script setup lang="ts">
import { computed, inject, Ref, ref, toValue, watch } from "vue";
import { useRoute } from "vue-router";
import Button from "primevue/button";
import { Annotation, AnnotationType, PropertyConfig } from "../models/types";
import { useGuidelinesStore } from "../store/guidelines";
import FormPropertiesSection from "./FormPropertiesSection.vue";
import AnnotationReferencesSection from "./AnnotationReferencesSection.vue";
import { checkAnnotationValidity, cloneDeep } from "../utils/helper/helper.ts";
import { DynamicDialogInstance } from "primevue/dynamicdialogoptions";

const dialogRef = inject<Ref<DynamicDialogInstance>>("dialogRef");

if (!dialogRef) {
  throw new Error("dialogRef not provided - component must be used inside a DynamicDialog");
}

const route: ReturnType<typeof useRoute> = useRoute();
const { getAnnotationFields } = useGuidelinesStore();

const mode: "create" | "edit" = dialogRef.value.data.mode ?? "edit";

const submitButtonConfig = {
  create: { icon: "icon-plus", label: "Add", title: "Add annotation" },
  edit: { icon: "icon-check", label: "Update", title: "Update annotation" },
} as const;

const annotation = ref<Annotation>(cloneDeep(dialogRef.value.data.annotation));

const config: AnnotationType = dialogRef.value.data.config;

// TODO: Filter directly in guidelines methods, since this must be done in several places. Done when Nori export is implemented
const propertyFields: PropertyConfig[] = (
  (dialogRef.value.data.propertyFields ?? getAnnotationFields(annotation.value.node.data.type)) as PropertyConfig[]
).filter((f) => f.visible);

const inputIsValid = computed<boolean>(() => checkAnnotationValidity(annotation.value, config));

const emit = defineEmits<(e: "submit", data: Annotation) => void>();

watch(() => route.path, closeModal);

function handleSubmitClick(): void {
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
  <div class="flex flex-col gap-4 annotation-modal">
    <div class="content">
      <FormPropertiesSection v-model="annotation.node.data" :fields="propertyFields" mode="edit" />
      <AnnotationReferencesSection v-model="annotation.connectedNodes" mode="edit" />
    </div>

    <div class="footer flex justify-center gap-2 w-full">
      <Button :disabled="!inputIsValid" v-bind="submitButtonConfig[mode]" @click="handleSubmitClick" />
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
