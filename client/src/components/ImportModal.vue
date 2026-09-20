<script setup lang="ts">
import { ref, computed, useTemplateRef, inject, watch, Ref } from "vue";
import { useEventListener } from "@vueuse/core";
import { formatFileSize } from "../utils/helper/helper";
import ProgressBar from "primevue/progressbar";
import Button from "primevue/button";
import ButtonGroup from "primevue/buttongroup";
import FileUpload from "primevue/fileupload";
import Message from "primevue/message";
import Textarea from "primevue/textarea";
import ToggleButton from "primevue/togglebutton";
import { useImport } from "../composables/useImport";
import { RouteLocationNormalizedLoaded, useRoute } from "vue-router";
import { DynamicDialogInstance } from "primevue/dynamicdialogoptions";

const dialogRef = inject<Ref<DynamicDialogInstance>>("dialogRef");

if (!dialogRef) {
  throw new Error("dialogRef not provided - component must be used inside a DynamicDialog");
}

const route: RouteLocationNormalizedLoaded = useRoute();

const {
  currentStep,
  errorMessages,
  rawJson,
  addErrorMessage,
  cancel: cancelImport,
  finish: finishImport,
  importJson,
} = useImport();

const totalCharacters = ref([]);
const totalAnnotations = ref([]);

const fileupload = useTemplateRef("fileupload");

const chooseOption = ref<"raw" | "file">("file");

const inputIsValid = computed<boolean>(() => {
  if (chooseOption.value === "raw") {
    return rawJson.value.length > 0;
  } else {
    return fileupload.value?.files.length === 1;
  }
});

const editorContainsText = computed<boolean>(() => {
  return true;
});

// Needs to be instantiated at top-level to make Vue track changes better
const reader: FileReader = new FileReader();

// eslint-disable-next-line @typescript-eslint/no-misused-promises -- TODO: Apparently useEventListener can not handle asyncs -> fix later
useEventListener(reader, "load", async () => {
  rawJson.value = reader.result as string;
  await importJson();
});

useEventListener(reader, "error", (event: ProgressEvent) => {
  const error: DOMException = (event.target as FileReader).error;
  addErrorMessage(error);
});

watch(() => route.path, closeModal);

function handleFinishClick(): void {
  finishImport();

  closeModal();
}

/**
 * Handles the import of the chosen file or raw JSON input. If the option is `raw`, the import process is started directly.
 * If the option is `file`, the chosen file is read which triggers the "load" event where the import logic is handled.
 *
 * @return {Promise<void>} This function does not return any value.
 */
async function handleImport(): Promise<void> {
  if (chooseOption.value === "raw") {
    await importJson();
  } else {
    const file: File = fileupload.value.files[0];

    // This triggers the "load" event listener attached to the reader which handles the further logic
    reader.readAsText(file);
  }
}

function handleCancelClick(): void {
  cancelImport();
  closeModal();
}

function toggleViewMode(direction: "raw" | "file"): void {
  chooseOption.value = direction;
}

function closeModal(): void {
  dialogRef.value.close();
}
</script>

<template>
  <h2 v-if="currentStep === null || currentStep === 'validating'" class="w-full text-center m-0">Select JSON to import</h2>
  <div v-if="currentStep === null || currentStep === 'validating'" class="choose-panel">
    <Message v-if="editorContainsText" severity="warn" icon="pi pi-exclamation-circle" class="w-full my-2" closable>
      Careful: This document already contains text that will be lost after the import has finished.
    </Message>
    <ButtonGroup class="w-full flex mb-2">
      <ToggleButton
        :model-value="chooseOption === 'file'"
        class="w-full"
        on-label="File"
        off-label="File"
        title="Import JSON file"
        badge="2"
        @change="toggleViewMode('file')"
      />
      <ToggleButton
        :model-value="chooseOption === 'raw'"
        class="w-full"
        on-label="Raw"
        off-label="Raw"
        title="Import raw JSON"
        badge="2"
        @change="toggleViewMode('raw')"
      />
    </ButtonGroup>
    <Message v-for="msg of errorMessages" :key="msg.id" :severity="msg.severity" closable>{{ msg.content }}</Message>
    <form @submit.prevent="handleImport">
      <div :style="{ height: '15rem' }">
        <Textarea
          v-if="chooseOption === 'raw'"
          v-model="rawJson"
          rows="10"
          class="w-full"
          placeholder="Enter some valid JSON"
          spellcheck="false"
        />
        <FileUpload v-else ref="fileupload" name="import" :file-limit="1" :multiple="false" accept=".json,.txt">
          <template #header="{ chooseCallback }">
            <div class="flex justify-center w-full">
              <Button
                v-if="!inputIsValid"
                label="Browse files"
                icon="pi pi-plus"
                severity="contrast"
                title="Choose file to import (.json or .txt)"
                :disabled="inputIsValid"
                @click="chooseCallback()"
              ></Button>
            </div>
          </template>
          <template #content="{ files, removeFileCallback }">
            <div
              v-for="(file, index) of files"
              :key="file.name + file.type + file.size"
              class="flex justify-between items-center h-8"
            >
              <div class="flex gap-6">
                <div class="font-semibold">
                  {{ file.name }}
                </div>
                <div>{{ formatFileSize(file.size) }}</div>
              </div>
              <Button
                label="Remove"
                size="small"
                :style="{ height: '2rem' }"
                severity="danger"
                outlined
                title="Remove file"
                aria-label="Remove file"
                @click="removeFileCallback(index)"
              />
            </div>
          </template>

          <template #empty>
            <div class="flex flex-col items-center justify-center">
              <p class="mt-0 mb-6 italic">or</p>
              <p class="m-0 p-4 h-24 rounded-xl drop-area flex justify-center gap-2 items-center">
                <i class="pi pi-file-arrow-up" style="font-size: 1rem" />
                <span> Drag and drop files to here to upload.</span>
              </p>
            </div>
          </template>
        </FileUpload>
      </div>
      <div class="button-container flex justify-center gap-2 mt-2">
        <Button type="button" label="Cancel" title="Cancel" severity="secondary" @click="handleCancelClick"></Button>
        <Button type="submit" label="Import" title="Import JSON" :disabled="!inputIsValid"></Button>
      </div>
    </form>
  </div>
  <div v-else-if="currentStep === 'importing'" class="card flex flex-col items-center gap-6">
    <span> Importing data... </span>
    <ProgressBar mode="indeterminate" style="height: 5px; width: 100%"></ProgressBar>
  </div>
  <div v-else class="flex flex-col items-center">
    <Message icon="pi pi-check" class="my-2 w-full" severity="success">
      <div class="info">
        Text imported successfully
        <ul class="m-0 pl-12">
          <li class="list-disc">{{ totalCharacters.length.toLocaleString() }} characters</li>
          <li class="list-disc">{{ totalAnnotations.length.toLocaleString() }} annotations</li>
        </ul>
      </div>
    </Message>
    <Message icon="pi pi-info-circle" class="my-2 w-full" severity="info">
      Currently, the text is dangling (not saved in the database). You can edit the text, but to get a better performance, save
      the text and reload the page.
    </Message>
    <Button type="button" label="Ok" severity="contrast" class="w-1/4 mt-6" @click="handleFinishClick"></Button>
  </div>
</template>

<style scoped>
.drop-area {
  border: 2px dashed var(--p-primary-500);
}
</style>
