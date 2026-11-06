<script setup lang="ts">
import { computed, inject, onMounted, Ref, ref, toValue, useTemplateRef, watch } from "vue";
import { useRoute } from "vue-router";
import Button from "primevue/button";
import { Annotation } from "../models/types";
import { useConfigStore } from "../store/config";
import FormPropertiesSection from "./FormPropertiesSection.vue";
import AnnotationReferencesSection from "./AnnotationReferencesSection.vue";
import { checkAnnotationValidity, cloneDeep } from "../utils/helper/helper.ts";
import { isVisible, type ModelAttribute } from "../utils/helper/modelHelper";
import { DynamicDialogInstance } from "primevue/dynamicdialogoptions";

const dialogRef = inject<Ref<DynamicDialogInstance>>("dialogRef");

if (!dialogRef) {
  throw new Error("dialogRef not provided - component must be used inside a DynamicDialog");
}

const route: ReturnType<typeof useRoute> = useRoute();
const { getTextAnnotationProperties, getModelContext } = useConfigStore();

const mode: "create" | "edit" = dialogRef.value.data.mode ?? "edit";

const submitButtonConfig = {
  create: { icon: "icon-plus", label: "Add", title: "Add annotation" },
  edit: { icon: "icon-check", label: "Update", title: "Update annotation" },
} as const;

const annotation = ref<Annotation>(cloneDeep(dialogRef.value.data.annotation));

/**
 * The properties edited (and validated) in the form: all properties of the annotation's shape, or the subset the opener
 * passes, e.g. without the editor-owned ones that are taken from the editor on save.
 */
const editedProperties: ModelAttribute[] =
  (dialogRef.value.data.propertyFields as ModelAttribute[] | undefined) ??
  getTextAnnotationProperties(annotation.value.node.data.type);
const propertyFields: ModelAttribute[] = editedProperties.filter((field) => isVisible(getModelContext(), field));

const propertiesSection = useTemplateRef<InstanceType<typeof FormPropertiesSection>>("propertiesSection");
const referencesSection = useTemplateRef<InstanceType<typeof AnnotationReferencesSection>>("referencesSection");

const inputIsValid = computed<boolean>(() => checkAnnotationValidity(annotation.value, editedProperties, getModelContext()));

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

function focusFirstInput(): void {
  const firstField: Element | null | undefined = propertiesSection.value?.$el.querySelector(
    'input:not([disabled]), textarea:not([disabled]), [role="combobox"]:not([tabindex="-1"])',
  );

  (firstField ?? referencesSection.value?.addButton?.$el)?.setAttribute("autofocus", "");
}

onMounted(() => focusFirstInput());
</script>

<template>
  <div class="flex flex-col gap-4 annotation-modal">
    <div class="content px-1">
      <FormPropertiesSection ref="propertiesSection" v-model="annotation.node.data" :fields="propertyFields" mode="edit" />
      <AnnotationReferencesSection ref="referencesSection" v-model="annotation.connectedNodes" mode="edit" />
    </div>

    <div class="footer flex justify-center gap-2 w-full shrink-0">
      <Button :disabled="!inputIsValid" v-bind="submitButtonConfig[mode]" @click="handleSubmitClick" />
    </div>
  </div>
</template>

<style scoped>
.annotation-modal {
  padding: 0.25rem;
  flex-grow: 1;
  min-height: 0;
}

.content {
  overflow-y: auto;
  scrollbar-gutter: stable;
  flex-grow: 1;
  min-height: 0;

  > * {
    margin-bottom: 2rem;
  }
}
</style>
