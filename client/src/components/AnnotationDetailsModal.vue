<script setup lang="ts">
import { computed, inject, onMounted, Ref, ref, toValue, useTemplateRef, watch } from "vue";
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

// Hosts that persist on submit (instead of applying to a draft) override the wording
const submitButtonProps = {
  ...submitButtonConfig[mode],
  ...(dialogRef.value.data.submitButton as { icon?: string; label?: string; title?: string } | undefined),
};

const annotation = ref<Annotation>(cloneDeep(dialogRef.value.data.annotation));

const config: AnnotationType = dialogRef.value.data.config;

// TODO: Filter directly in guidelines methods, since this must be done in several places. Done when Nori export is implemented
const propertyFields: PropertyConfig[] = (
  (dialogRef.value.data.propertyFields ?? getAnnotationFields(annotation.value.node.data.type)) as PropertyConfig[]
).filter((f) => f.visible);

const propertiesSection = useTemplateRef<InstanceType<typeof FormPropertiesSection>>("propertiesSection");
const referencesSection = useTemplateRef<InstanceType<typeof AnnotationReferencesSection>>("referencesSection");

const inputIsValid = computed<boolean>(() => checkAnnotationValidity(annotation.value, config));

const emit = defineEmits<(e: "submit", data: Annotation) => void>();

/**
 * Optional handler for hosts that save on submit. The modal stays open (with a loading button) until it resolves,
 * and only closes if it resolves to `true`. Without it, the modal emits `submit` and closes immediately.
 */
const submitHandler: ((data: Annotation) => Promise<boolean>) | undefined = dialogRef.value.data.submitHandler;

const submitRunning = ref<boolean>(false);

watch(() => route.path, closeModal);

async function handleSubmitClick(): Promise<void> {
  if (annotation.value.meta.status !== "created") {
    annotation.value.meta.status = "modified";
  }

  if (!submitHandler) {
    emit("submit", toValue(annotation));
    closeModal();

    return;
  }

  submitRunning.value = true;

  // Hand over a copy, so a failed attempt can't leave changes (e.g. pruning) in the form
  const saved: boolean = await submitHandler(cloneDeep(toValue(annotation)));

  submitRunning.value = false;

  if (saved) {
    closeModal();
  }
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

    <div class="footer flex justify-center gap-2 w-full">
      <Button :disabled="!inputIsValid" :loading="submitRunning" v-bind="submitButtonProps" @click="handleSubmitClick" />
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
