<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef } from "vue";
import Button from "primevue/button";
import Message from "primevue/message";
import { useConfigDraft, type ApplyModelOptions, type PendingModel } from "../state/useConfigDraft";
import AnnotationForm from "../components/AnnotationForm.vue";
import ClassifierForm from "../components/ClassifierForm.vue";
import ElementTree from "../components/ElementTree.vue";
import FindingsPanel from "../components/FindingsPanel.vue";
import GeneralForm from "../components/GeneralForm.vue";
import ModelUpdateDialog from "../components/ModelUpdateDialog.vue";
import TextEditorForm from "../components/TextEditorForm.vue";

const { draft, context, fileName, findings, isDirty, selection, openConfig, newConfig, readModel, applyModel, exportConfig } =
  useConfigDraft();

const configInput = useTemplateRef<HTMLInputElement>("configInput");
const modelInput = useTemplateRef<HTMLInputElement>("modelInput");
const newConfigInput = useTemplateRef<HTMLInputElement>("newConfigInput");

/** The last error of an action, shown until the next one */
const error = ref<string>();
const isBusy = ref<boolean>(false);
const pendingModel = shallowRef<PendingModel>();

const problemCount = computed<number>(() => findings.value.filter((finding) => finding.severity === "problem").length);
const warningCount = computed<number>(() => findings.value.length - problemCount.value);

/**
 * Runs an action of the toolbar, with its error shown in the page.
 *
 * @param {() => Promise<void> | void} action - The action.
 */
async function run(action: () => Promise<void> | void): Promise<void> {
  if (isBusy.value) {
    return;
  }

  isBusy.value = true;
  error.value = undefined;

  try {
    await action();
  } catch (caught: unknown) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    isBusy.value = false;
  }
}

/** The chosen file of a file input; the input is reset, so the same file can be chosen again */
function takeFile(event: Event): File | undefined {
  const input = event.target as HTMLInputElement;
  const file: File | undefined = input.files?.[0];

  input.value = "";

  return file;
}

function onConfigFile(event: Event): void {
  const file: File | undefined = takeFile(event);

  if (!file) {
    return;
  }

  if (isDirty.value && !window.confirm("Discard the unexported changes and open another config?")) {
    return;
  }

  void run(() => openConfig(file));
}

function onNewConfigFile(event: Event): void {
  const file: File | undefined = takeFile(event);

  if (file) {
    void run(() => newConfig(file));
  }
}

function onModelFile(event: Event): void {
  const file: File | undefined = takeFile(event);

  if (file) {
    void run(async () => {
      pendingModel.value = await readModel(file);
    });
  }
}

function onApplyModel(options: ApplyModelOptions): void {
  if (pendingModel.value) {
    applyModel(pendingModel.value, options);
  }

  pendingModel.value = undefined;
}

function onExport(): void {
  void run(() => exportConfig());
}

/** Asks before the page is left with unexported changes; the draft lives only in memory */
function onBeforeUnload(event: BeforeUnloadEvent): void {
  if (isDirty.value) {
    event.preventDefault();
  }
}

onMounted(() => window.addEventListener("beforeunload", onBeforeUnload));
onBeforeUnmount(() => window.removeEventListener("beforeunload", onBeforeUnload));
</script>

<template>
  <div class="h-screen flex flex-col">
    <header class="flex items-center gap-2 px-3 py-2 border-b border-slate-200 shrink-0">
      <h1 class="font-semibold">Miso configurator</h1>
      <span class="text-xs px-1.5 rounded bg-amber-100 text-amber-900">dev only</span>
      <span v-if="fileName" class="text-sm text-slate-500 truncate" :title="fileName">
        {{ fileName }}<span v-if="isDirty" title="Unexported changes"> ●</span>
      </span>
      <span v-if="draft" class="text-sm ml-2">
        <span :class="problemCount ? 'text-red-600' : 'text-slate-500'">{{ problemCount }} problem(s)</span>,
        <span :class="warningCount ? 'text-amber-600' : 'text-slate-500'">{{ warningCount }} warning(s)</span>
      </span>

      <div class="ml-auto flex items-center gap-2">
        <input
          ref="configInput"
          type="file"
          accept=".json,application/json"
          class="hidden"
          aria-label="Config file"
          @change="onConfigFile"
        />
        <input
          ref="modelInput"
          type="file"
          accept=".json,application/json"
          class="hidden"
          aria-label="Model file"
          @change="onModelFile"
        />
        <input
          ref="newConfigInput"
          type="file"
          accept=".json,application/json"
          class="hidden"
          aria-label="Model file of a new config"
          @change="onNewConfigFile"
        />
        <Button
          label="Open config"
          icon="icon-folder-open"
          size="small"
          severity="secondary"
          :disabled="isBusy"
          @click="configInput?.click()"
        />
        <Button
          label="Update model"
          icon="icon-refresh-cw"
          size="small"
          severity="secondary"
          :disabled="!draft || isBusy"
          title="Load a new RamenFile (e.g. a Nori export) and see what changes"
          @click="modelInput?.click()"
        />
        <Button
          label="Export"
          icon="icon-download"
          size="small"
          :disabled="!draft || problemCount > 0 || isBusy"
          :title="problemCount > 0 ? 'Fix the problems first' : 'Download the config as JSON'"
          @click="onExport"
        />
      </div>
    </header>

    <Message v-if="error" severity="error" closable class="m-2 shrink-0" @close="error = undefined">
      <pre class="whitespace-pre-wrap text-sm font-sans">{{ error }}</pre>
    </Message>

    <!-- Start: open a config, or start one for a model -->
    <div v-if="!draft || !context" class="flex-1 flex items-center justify-center p-6">
      <div class="flex flex-col gap-6 items-center max-w-2xl">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
          <section class="flex flex-col gap-3 rounded border border-slate-200 p-5">
            <h2 class="font-semibold flex items-center gap-2"><i class="icon-folder-open text-slate-500" />Open a config</h2>
            <p class="text-sm text-slate-600 flex-1">Edit the settings of an existing config file, with the model it contains.</p>
            <Button label="Open config" icon="icon-folder-open" class="self-start" :disabled="isBusy" @click="configInput?.click()" />
          </section>
          <section class="flex flex-col gap-3 rounded border border-slate-200 p-5">
            <h2 class="font-semibold flex items-center gap-2"><i class="icon-file-plus text-slate-500" />New config</h2>
            <p class="text-sm text-slate-600 flex-1">
              Start a config without settings for a model file (a RamenFile, e.g. a Nori export).
            </p>
            <Button
              label="Choose model"
              icon="icon-file-plus"
              severity="secondary"
              class="self-start"
              :disabled="isBusy"
              @click="newConfigInput?.click()"
            />
          </section>
        </div>
        <p class="text-sm text-slate-500 text-center">
          Changes stay in this page until you export them; nothing is written to disk or to the server.
        </p>
      </div>
    </div>

    <div v-else class="flex-1 min-h-0 grid grid-cols-[18rem_1fr_24rem]">
      <!-- The columns keep the scrollbar's space, so the content doesn't shift when it appears.
           No padding on the tree: its sticky lines would stick below it, with lines showing through. -->
      <aside class="overflow-auto scrollbar-gutter-stable border-r border-slate-200">
        <ElementTree />
      </aside>
      <main class="overflow-auto scrollbar-gutter-stable p-6">
        <GeneralForm v-if="selection.kind === 'general'" />
        <TextEditorForm v-else-if="selection.kind === 'textEditor'" />
        <ClassifierForm v-else-if="selection.kind === 'classifier'" :key="`c:${selection.ref}`" :classifier-ref="selection.ref" />
        <AnnotationForm v-else :key="`a:${selection.ref}`" :shape-ref="selection.ref" />
      </main>
      <aside class="overflow-auto scrollbar-gutter-stable border-l border-slate-200">
        <FindingsPanel />
      </aside>
    </div>

    <ModelUpdateDialog v-if="pendingModel" :pending="pendingModel" @cancel="pendingModel = undefined" @apply="onApplyModel" />
  </div>
</template>
