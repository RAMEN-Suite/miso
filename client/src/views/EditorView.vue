<script setup lang="ts">
import { ComputedRef, computed, nextTick, onUnmounted, ref, watch } from "vue";
import { RouteLocationNormalizedLoaded, useRoute, useRouter, onBeforeRouteUpdate, onBeforeRouteLeave } from "vue-router";
import { EditorContent } from "@tiptap/vue-3";
import ConfirmDialog from "primevue/confirmdialog";
import { useConfirm } from "primevue/useconfirm";
import type { ConfirmationOptions } from "primevue/confirmationoptions";
import { useEventListener, useTitle } from "@vueuse/core";
import EditorAnnotationPanel from "../components/EditorAnnotationPanel.vue";
import EditorSidebar from "../components/EditorSidebar.vue";
import EditorHeader from "../components/EditorHeader.vue";
import EditorActionButtonsPane from "../components/EditorActionButtonsPane.vue";
import EditorAnnotations from "../components/EditorAnnotations.vue";
import EditorError from "../components/EditorError.vue";
import EditorResizer from "../components/EditorResizer.vue";
import BlockClassificationLines from "../components/BlockClassificationLines.vue";
import EditorMetadata from "../components/EditorMetadata.vue";
import LoadingSpinner from "../components/LoadingSpinner.vue";
import { Annotation, ContentNode, EditGraph, WriteResponse } from "../models/types.ts";
import { useTextStore } from "../store/text.ts";
import { useAppStore } from "../store/app.ts";
import PageOverlay from "../components/PageOverlay.vue";
import { useTiptapStore } from "../store/tiptap.ts";
import EditorAnnotationButtonPane from "../components/EditorAnnotationButtonPane.vue";
import { Node as DocNode } from "@tiptap/pm/model";
import { useConfigStore } from "../store/config.ts";
import EditorToC from "../components/EditorToC.vue";
import { cloneDeep } from "../utils/helper/helper.ts";
import { type StandoffParseIssue, createAnnotationChangeCollector, normalizeAnnotation } from "../editors/text/src";
import { toContentSaveGraph } from "../utils/helper/writePayload.ts";
import { useEditStructuralAnnotation } from "../composables/useEditStructuralAnnotation.ts";
import { useInsertLineBreak } from "../composables/useInsertLineBreak.ts";
import { useAnnotateSelection } from "../composables/useAnnotateSelection.ts";

interface SidebarConfig {
  isCollapsed: boolean;
  resizerActive: boolean;
  width: number;
}
const route: RouteLocationNormalizedLoaded = useRoute();
const router = useRouter();
const confirm: ReturnType<typeof useConfirm> = useConfirm();
const textUuid = computed<string>(() => route.params.uuid as string);

const {
  initialStructuralAnnotations,
  initialAnnotations,
  tiptap,
  destroyTiptap,
  hasUnsavedChanges,
  initializeTiptap,
  resetToInitialState,
  setNewInitialState,
} = useTiptapStore();

const { getShapeOfRole, getModelContext } = useConfigStore();
const { openStructuralAnnotationEditor } = useEditStructuralAnnotation();
const { insertLineBreak } = useInsertLineBreak();
const { annotateByShapeRef } = useAnnotateSelection();

onUnmounted(() => destroyTiptap());

onBeforeRouteUpdate(() => preventUserFromRouteLeaving());
onBeforeRouteLeave(() => preventUserFromRouteLeaving());

useEventListener("mouseup", handleMouseUp);
useEventListener("mousedown", handleMouseDown);
useEventListener("beforeunload", handleBeforeUnload);

// Initial page load
const isLoading = ref<boolean>(true);
const isValidText = computed<boolean>(() => !textFetchError.value);

// For fetch during save/cancel action
const asyncOperationRunning = ref<boolean>(false);

const { api, addToastMessage } = useAppStore();

const { error: textFetchError, text, initialText, fetchAndInitializeText } = useTextStore();

useTitle(computed(() => `Text | ${text.value?.nodeLabels.join(", ") ?? ""}`));

const resizerWidth = 5;

const mainWidth: ComputedRef<number> = computed(() => {
  const leftSidebarWidth: number = sidebars.value.left.isCollapsed ? 0 : sidebars.value.left.width;
  const rightSidebarWidth: number = sidebars.value.right.isCollapsed ? 0 : sidebars.value.right.width;
  return window.innerWidth - leftSidebarWidth - rightSidebarWidth - resizerWidth * 2;
});

const sidebars = ref<Record<string, SidebarConfig>>({
  left: {
    isCollapsed: false,
    resizerActive: false,
    width: 350,
  },
  right: {
    isCollapsed: false,
    resizerActive: false,
    width: 350,
  },
});

const activeResizer = ref<string>("");

/** What each kind of parse issue means for the user. Shown in the toast (warnings) and in the parse error dialog (errors). */
const PARSE_ISSUE_CONSEQUENCES: Record<StandoffParseIssue["reason"], string> = {
  clampedGap: "The repaired structure is stored with the next save.",
  textMismatch: "Annotations may be displayed at the wrong position, and saving can write these positions to the database.",
  unconfiguredType:
    "Annotations of types that are not in the model were found. Saving removes their data that the model doesn't define.",
};

/** The parse errors of the current document, displayed in the parse error dialog. */
const parseErrors = ref<StandoffParseIssue[]>([]);

/** The consequences of the current parse errors, one per kind of error. */
const parseErrorConsequences = computed<string[]>(() =>
  [...new Set(parseErrors.value.map((e) => e.reason))].map((reason) => PARSE_ISSUE_CONSEQUENCES[reason]),
);

function cleanUpAfterSave(
  updatedText: ContentNode,
  updatedAnnotations: { annotations: Annotation[]; structureElements: Annotation[] },
  deletedOrphans: string[],
): void {
  text.value = cloneDeep(updatedText);

  const savedAnnotations: Map<string, Annotation> = cleanUpAnnotations(
    updatedAnnotations.annotations,
    initialAnnotations.value,
    deletedOrphans,
  );
  const savedStructuralAnnotations: Map<string, Annotation> = cleanUpAnnotations(
    updatedAnnotations.structureElements,
    initialStructuralAnnotations.value,
    deletedOrphans,
  );

  // Needs to happen before the new initial state is set, since the document is part of it. Range annotations are
  // updated in their decorations, zero-points and structural annotations in the document.
  tiptap.value?.commands.applySavedAnnotations(savedAnnotations);
  tiptap.value?.commands.applySavedDocAnnotations(savedStructuralAnnotations, deletedOrphans);

  setNewInitialState();
}

/**
 * Updates the initial annotations to the saved state.
 *
 * @param {Annotation[]} updatedAnnotations - The saved annotations, including the deleted ones.
 * @param {Map<string, Annotation> | undefined} initial - The initial annotations of the same kind, changed in place.
 * @param {string[]} deletedOrphans - uuids of the annotations the server deleted as orphans.
 * @returns {Map<string, Annotation>} The saved (not deleted) annotations by uuid, to be written back into the editor.
 */
function cleanUpAnnotations(
  updatedAnnotations: Annotation[],
  initial: Map<string, Annotation> | undefined,
  deletedOrphans: string[],
): Map<string, Annotation> {
  const saved = new Map<string, Annotation>();

  updatedAnnotations.forEach((annotation: Annotation) => {
    const uuid: string = annotation.node.properties.uuid;

    if (annotation.status === "deleted") {
      initial?.delete(uuid);
    } else {
      // Two separate clones, since the editor takes over the annotation object itself
      initial?.set(uuid, normalizeAnnotation(annotation, deletedOrphans));
      saved.set(uuid, normalizeAnnotation(annotation, deletedOrphans));
    }
  });

  return saved;
}

function getEmptyNodes(): DocNode[] {
  const emptyNodes: DocNode[] = [];

  if (!tiptap.value) {
    return emptyNodes;
  }

  tiptap.value.state.doc.descendants((node: DocNode) => {
    if (node.isInline) {
      return false;
    }

    if (!node.isText && node.textContent === "") {
      emptyNodes.push(node);
      return false;
    }
  });

  return emptyNodes;
}

async function handleSaveChanges(): Promise<void> {
  if (asyncOperationRunning.value || !tiptap.value || !text.value) {
    return;
  }

  const nodesWithoutChildrenOrText = getEmptyNodes();
  const joined: string = nodesWithoutChildrenOrText.map((n) => getShapeOfRole(n.type.name)?.type ?? n.type.name).join(",");

  if (nodesWithoutChildrenOrText.length > 0) {
    console.warn("Some nodes have no text: ", joined);

    addToastMessage({
      severity: "warn",
      summary: "Empty block",
      detail: "Some nodes do not contain text or children. Please delete them or add text: " + joined,
      life: 3000,
    });

    return;
  }

  const affectedAnnotations = createAnnotationChangeCollector(tiptap.value.state, {
    annotations: initialAnnotations.value,
    structuralAnnotations: initialStructuralAnnotations.value,
  }).collectAnnotationChanges();

  const { structureElements, annotations } = affectedAnnotations;

  const savedContent: ContentNode = {
    properties: {
      uuid: text.value.properties.uuid,
      text: tiptap.value.state.doc.textContent,
    },
    nodeLabels: [...text.value.nodeLabels],
    classifierRef: text.value.classifierRef,
  };

  const graph: EditGraph = toContentSaveGraph(getModelContext(), savedContent, [...structureElements, ...annotations]);

  asyncOperationRunning.value = true;
  try {
    const result: WriteResponse = await api.saveGraph(graph);

    // Update all initial values: Annotations, structuralAnnotations and text
    cleanUpAfterSave(savedContent, affectedAnnotations, result.deletedOrphans);

    showMessage("success");
  } catch (error: unknown) {
    showMessage("error", error as Error);
    console.error("Error updating text:", error);
  } finally {
    asyncOperationRunning.value = false;
  }
}

function handleCancelChanges(): void {
  if (asyncOperationRunning.value) {
    return;
  }

  text.value = cloneDeep(initialText.value);

  resetToInitialState();
}

function toggleSidebar(position: "left" | "right", wasCollapsed: boolean): void {
  const sidebar = sidebars.value[position];
  sidebar.isCollapsed = !wasCollapsed;
}

function handleResize(event: MouseEvent): void {
  const sidebar: SidebarConfig = sidebars.value[activeResizer.value];
  sidebar.width = activeResizer.value === "left" ? event.clientX : window.innerWidth - event.clientX;
}

function handleMouseDown(event: MouseEvent): void {
  if (!(event.target as Element).classList.contains("resizer")) {
    return;
  }

  const side: string | null = (event.target as Element).getAttribute("resizer-id");

  if (!side || !(side === "left" || side === "right")) {
    return;
  }

  activeResizer.value = side;

  window.addEventListener("mousemove", handleResize);
}

function handleMouseUp(): void {
  activeResizer.value = "";
  window.removeEventListener("mousemove", handleResize);
}

function handleBeforeUnload(event: BeforeUnloadEvent): void {
  preventUserFromPageLeaving(event);
}

/**
 * Informs the user about problems that were found while the document was parsed.
 *
 * Warnings (the document was repaired, nothing is lost) are only shown as a toast. Errors (the document does not
 * match the stored data or contains annotations of unconfigured types, so saving it can corrupt the stored data)
 * open a dialog in which the user decides whether to continue or to leave the editor.
 *
 * @param {StandoffParseIssue[]} issues - The problems returned by the parser.
 * @returns {void} This function does not return any value.
 */
function showParseIssues(issues: StandoffParseIssue[]): void {
  const warnings: StandoffParseIssue[] = issues.filter((i) => i.severity === "warning");
  const errors: StandoffParseIssue[] = issues.filter((i) => i.severity === "error");

  if (warnings.length > 0) {
    addToastMessage({
      severity: "warn",
      summary: "Document structure was repaired",
      detail:
        `${warnings.length} text passage(s) belonged to no structural element and were merged into a neighbouring one. ` +
        PARSE_ISSUE_CONSEQUENCES.clampedGap,
      life: 6000,
    });
  }

  parseErrors.value = errors;

  if (errors.length > 0) {
    const options: ConfirmationOptions & { closeOnEscape: boolean } = {
      header: "Problems found in this document",
      message: errors.map((e) => e.message).join(" "),
      closeOnEscape: false,
      rejectProps: { label: "Back to overview", severity: "secondary", autofocus: true },
      acceptProps: { label: "Open anyway", severity: "danger" },
      reject: () => void router.push("/"),
    };

    confirm.require(options);
  }
}

function showMessage(result: "success" | "error", error?: Error) {
  addToastMessage({
    severity: result,
    summary: result === "success" ? "Changes saved successfully" : "Error saving changes",
    detail: error?.message ?? "",
    life: 2000,
  });
}

function preventUserFromPageLeaving(event: BeforeUnloadEvent): void {
  if (!isValidText.value) {
    return;
  }

  if (!hasUnsavedChanges()) {
    return;
  }

  event.preventDefault();
}

function preventUserFromRouteLeaving(): boolean {
  if (!isValidText.value) {
    return true;
  }

  if (!hasUnsavedChanges()) {
    return true;
  }

  // TODO: Use PrimeVue confirmation dialog instead of browser default?
  const answer: boolean = window.confirm("Do you really want to leave? you have unsaved changes");

  // cancel the navigation and stay on the same page
  if (!answer) {
    return false;
  }

  return true;
}

watch(
  textUuid,
  async () => {
    isLoading.value = true;

    // TODO: This needs refactoring. Centralize fetches, split fetch/initialize logic
    await fetchAndInitializeText(textUuid.value);

    if (!isValidText.value || !text.value) {
      isLoading.value = false;
      return;
    }

    const fetchedAnnotations: Annotation[] = await api.getAnnotations(textUuid.value);

    const standoffObject = { text: text.value.properties.text, annotations: fetchedAnnotations };

    const parseIssues: StandoffParseIssue[] = initializeTiptap(standoffObject, {
      onHardBreakMarkerClick: openStructuralAnnotationEditor,
      onHardBreakShortcut: insertLineBreak,
      onAnnotationShortcut: annotateByShapeRef,
    });

    isLoading.value = false;

    // The confirm dialog is part of the editor layout, which is only rendered once loading has finished
    await nextTick();

    showParseIssues(parseIssues);
  },
  { immediate: true },
);
</script>

<template>
  <PageOverlay v-if="isLoading === true">
    <LoadingSpinner />
  </PageOverlay>
  <EditorError v-else-if="isValidText === false" :uuid="textUuid" />
  <div v-else class="page-container flex h-full">
    <PageOverlay v-if="asyncOperationRunning">
      <LoadingSpinner />
    </PageOverlay>
    <ConfirmDialog :closable="false" class="w-136 max-w-[calc(100vw-2rem)]" :pt="{ footer: { class: 'flex justify-center!' } }">
      <template #message>
        <div class="flex flex-col gap-3">
          <div
            v-for="(error, index) in parseErrors"
            :key="index"
            class="flex items-start gap-3 rounded-md border border-(--p-red-200) bg-(--p-red-50) p-3 text-(--p-red-700)"
          >
            <i class="icon-alert-triangle mt-0.5 shrink-0 text-xl" aria-hidden="true" />
            <span>{{ error.message }}</span>
          </div>
          <div
            v-for="consequence in parseErrorConsequences"
            :key="consequence"
            class="rounded-md border border-(--p-yellow-300) bg-(--p-yellow-50) p-3 text-(--p-yellow-900)"
          >
            {{ consequence }}
          </div>
          <p class="text-center">Do you want to open the document anyway?</p>
        </div>
      </template>
    </ConfirmDialog>

    <EditorSidebar position="left" :is-collapsed="sidebars['left'].isCollapsed === true" :width="sidebars['left'].width">
      <EditorMetadata :content-uuid="textUuid" />
      <EditorToC />
      <EditorAnnotations />
    </EditorSidebar>
    <EditorResizer
      position="left"
      :is-active="activeResizer === 'left'"
      :default-width="resizerWidth"
      :sidebar-is-collapsed="sidebars['left'].isCollapsed === true"
      @toggle-sidebar="toggleSidebar"
    />
    <section class="main flex flex-col grow px-4 pb-0 pt-4" :style="{ width: mainWidth + 'px' }">
      <EditorHeader ref="labelInputRef" />
      <EditorAnnotationButtonPane />
      <BlockClassificationLines />

      <editor-content v-if="tiptap" id="editor" :editor="tiptap" spellcheck="false" />

      <EditorActionButtonsPane
        :disabled="asyncOperationRunning"
        @save="handleSaveChanges"
        @cancel="handleCancelChanges"
        @log-json="console.log(tiptap?.state.doc)"
        @log-text="console.log(tiptap?.state.doc.textContent)"
      />
    </section>
    <EditorResizer
      position="right"
      :is-active="activeResizer === 'right'"
      :default-width="resizerWidth"
      :sidebar-is-collapsed="sidebars['right'].isCollapsed === true"
      @toggle-sidebar="toggleSidebar"
    />
    <EditorSidebar position="right" :is-collapsed="sidebars['right'].isCollapsed === true" :width="sidebars['right'].width">
      <EditorAnnotationPanel />
    </EditorSidebar>
  </div>
</template>

<style>
.highlight,
.highlight * {
  background-color: yellow !important;
}
</style>
