<script setup lang="ts">
import { inject, watch, computed, ref, Ref } from "vue";
import Button from "primevue/button";
import ButtonGroup from "primevue/buttongroup";
import Message from "primevue/message";
import Textarea from "primevue/textarea";
import { useExport } from "../composables/useExport";
import { RouteLocationNormalizedLoaded, useRoute } from "vue-router";
import { useTiptapStore } from "../store/tiptap";
import { DynamicDialogInstance } from "primevue/dynamicdialogoptions";

const dialogRef = inject<Ref<DynamicDialogInstance>>("dialogRef");

if (!dialogRef) {
  throw new Error("dialogRef not provided - component must be used inside a DynamicDialog");
}

const route: RouteLocationNormalizedLoaded = useRoute();

const { jsonToExport, status, errorMessages, buildJson, copyToClipboard, downloadJson, reset } = useExport();
const { hasUnsavedChanges } = useTiptapStore();

const totalCharacters = ref([]);
const totalAnnotations = ref([]);

const textHasUnsavedChanges = hasUnsavedChanges();

const copyLabel = computed<string>(() => (status.value === "copied" ? "Copied!" : "Copy"));
const copyIcon = computed<string>(() => (status.value === "copied" ? "icon-check" : "icon-copy"));

watch(() => route.path, closeModal);

// Build the JSON as soon as the modal is opened
buildJson();

function handleCopyClick(): void {
  void copyToClipboard();
}

function handleDownloadClick(): void {
  downloadJson();
}

function handleCloseClick(): void {
  reset();
  closeModal();
}

function closeModal(): void {
  dialogRef.value.close();
}
</script>

<template>
  <h2 class="w-full text-center m-0">Export as Standoff JSON</h2>

  <div class="flex flex-col gap-4 mt-4">
    <Message v-for="msg of errorMessages" :key="msg.id" :severity="msg.severity" closable>
      {{ msg.content }}
    </Message>

    <Message v-if="textHasUnsavedChanges" severity="warn" icon="icon-alert-circle" close-icon="icon-x" class="w-full my-2" closable>
      When there are unsaved changes, they will not be exported. Please save your work before exporting to ensure everything is
      exported correctly.
    </Message>

    <Message v-if="status !== 'error'" icon="icon-info" class="my-2 w-full" severity="info">
      <div class="info">
        You are going to export
        <ul class="m-0 pl-12">
          <li class="list-disc">{{ totalCharacters.length.toLocaleString() }} characters</li>
          <li class="list-disc">{{ totalAnnotations.length.toLocaleString() }} annotations</li>
        </ul>
        <p>Please note that other nodes connected to the annotations (entities, more texts etc.) can not yet be exported.</p>
      </div>
    </Message>

    <Textarea v-model="jsonToExport" rows="10" class="w-full" readonly spellcheck="false" placeholder="No data to export." />

    <div class="flex justify-center gap-2">
      <ButtonGroup>
        <Button
          :label="copyLabel"
          :icon="copyIcon"
          severity="primary"
          title="Copy JSON to clipboard"
          :disabled="!jsonToExport"
          @click="handleCopyClick"
        />
        <Button
          label="Download"
          icon="icon-download"
          severity="primary"
          title="Download as standoff-export.json"
          :disabled="!jsonToExport"
          @click="handleDownloadClick"
        />
      </ButtonGroup>

      <Button label="Close" severity="secondary" title="Close" @click="handleCloseClick" />
    </div>
  </div>
</template>
