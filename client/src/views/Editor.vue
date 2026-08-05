<script setup lang="ts">
import { ComputedRef, computed, onUnmounted, ref, toValue, watch } from "vue";
import { RouteLocationNormalizedLoaded, useRoute, onBeforeRouteUpdate, onBeforeRouteLeave } from "vue-router";
import { EditorContent } from "@tiptap/vue-3";
import { useEventListener, useTitle } from "@vueuse/core";
import EditorAnnotationPanel from "../components/EditorAnnotationPanel.vue";
import EditorSidebar from "../components/EditorSidebar.vue";
import EditorHeader from "../components/EditorHeader.vue";
import EditorActionButtonsPane from "../components/EditorActionButtonsPane.vue";
import EditorAnnotations from "../components/EditorAnnotations.vue";
import EditorError from "../components/EditorError.vue";
import EditorFilter from "../components/EditorFilter.vue";
import EditorResizer from "../components/EditorResizer.vue";
import SemanticBlockLines from "../components/SemanticBlockLines.vue";
import EditorMetadata from "../components/EditorMetadata.vue";
import LoadingSpinner from "../components/LoadingSpinner.vue";
import Message from "primevue/message";
import {
  NodeDto,
  IndexMap,
  PropertyConfig,
  TextAccessObject,
  Annotation,
  Node,
  NodeStatusObject,
  EntityNode,
  TextNode,
  CollectionNode,
  AnnotationNode,
  BaseNodeData,
  TextUpdateDto,
  NodeStatus,
  BuiltinStructuralType,
} from "../models/types.ts";
import { useEditorStore } from "../store/editor.ts";
import { useShortcutsStore } from "../store/shortcuts.ts";
import { useTextStore } from "../store/text.ts";
import { useAppStore } from "../store/app.ts";
import PageOverlay from "../components/PageOverlay.vue";
import { useTiptapStore } from "../store/tiptap.ts";
import EditorAnnotationButtonPane from "../components/EditorAnnotationButtonPane.vue";
import { Node as DocNode } from "@tiptap/pm/model";
import { collectSemanticBlocks } from "../utils/helper/tiptapHelper.ts";
import { useCreateIndexMaps } from "../composables/useCreateIndexMaps.ts";
import { useGuidelinesStore } from "../store/guidelines.ts";
import { IAnnotation } from "../models/IAnnotation.ts";
import EditorToC from "../components/EditorToC.vue";
import { cloneDeep, setNodeTreeStatus } from "../utils/helper/helper.ts";

interface SidebarConfig {
  isCollapsed: boolean;
  resizerActive: boolean;
  width: number;
}
const route: RouteLocationNormalizedLoaded = useRoute();
const textUuid = computed<string>(() => route.params.uuid as string);

const {
  annotations,
  initialStructuralAnnotations,
  initialAnnotations,
  tiptap,
  destroyTiptap,
  hasUnsavedChanges,
  initializeTiptap,
  resetToInitialState,
  setNewInitialState,
} = useTiptapStore();

const {
  getStructuralAnnotationConfig,
  getAnnotationType,
  getAnnotationBehaviour,
  getEditorOwnedProperties,
  isBuiltinStructuralType,
  isZeroPoint,
} = useGuidelinesStore();

onUnmounted(() => destroyTiptap());

onBeforeRouteUpdate(() => preventUserFromRouteLeaving());
onBeforeRouteLeave(() => preventUserFromRouteLeaving());

useEventListener("mouseup", handleMouseUp);
useEventListener("mousedown", handleMouseDown);
useEventListener("beforeunload", handleBeforeUnload);
useEventListener("keydown", handleKeyDown);

// Initial page load
const isLoading = ref<boolean>(true);
const isValidText = computed<boolean>(() => !textFetchError.value);

// For fetch during save/cancel action
const asyncOperationRunning = ref<boolean>(false);

const { api, addToastMessage } = useAppStore();

const { isRedrawMode, redrawMode, toggleRedrawMode } = useEditorStore();
const { error: textFetchError, text, initialText, fetchAndInitializeText } = useTextStore();
const { shortcutMap, normalizeKeys } = useShortcutsStore();

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

function cleanUpAfterSave(
  updatedText: NodeStatusObject<TextNode>,
  updatedAnnotations: { annotations: Annotation[]; structureElements: Annotation[] },
): void {
  text.value = cloneDeep(updatedText.node);

  cleanUpAnnotations(updatedAnnotations.annotations);
  cleanUpStructureElements(updatedAnnotations.structureElements);

  setNewInitialState();
}

function cleanUpAnnotations(updatedAnnotations: NodeStatusObject[]): void {
  updatedAnnotations.forEach((a) => {
    if (a.meta.status === "deleted") {
      // Can be removed from the map safely
      annotations.value?.delete(a.node.data.uuid);
    } else {
      // Recursively set all nodes to "unchanged"
      setNodeTreeStatus(a, "unchanged");

      // Update value
      annotations.value?.set(a.node.data.uuid, a as Annotation);
    }
  });

  // Reset
  initialAnnotations.value = cloneDeep(annotations.value);
}

function cleanUpStructureElements(structureElements: NodeStatusObject[]): void {
  structureElements.forEach((elm: NodeStatusObject) => {
    const uuid: string = elm.node.data.uuid;

    if (elm.meta.status === "deleted") {
      // Can be removed from the map safely
      initialStructuralAnnotations.value?.delete(uuid);
    } else {
      // Recursively set all nodes to "unchanged". Technically, this is currently not necessary
      // since the structure elements can not have any connected nodes.
      setNodeTreeStatus(elm, "unchanged");

      // Update value
      initialStructuralAnnotations.value?.set(uuid, elm as Annotation);
    }
  });

  // const docNodes = new Map<string, DocNode>();

  // tiptap.value?.state.doc.descendants(node => {
  //   if (isStructureElement(node)) {
  //     docNodes.set(node.attrs.uuid, node);
  //   }
  // });

  // console.log(docNodes);
  // console.log(initialStructuralAnnotations.value);
  // Reset
}

/**
 * Checks if a node is a structure element editor-wise, meaning that it is either a block element that contains text or other block elmements
 * (div, paragraph) or a `hardBreak`.
 *
 * @param {DocNode} node - Tiptap node to be checked
 */
function isStructureElement(node: DocNode): boolean {
  if (node.type.isBlock || node.type.name === "hardBreak") {
    return true;
  }

  return false;
}

function getEmptyNodes(): DocNode[] {
  const emptyNodes: DocNode[] = [];

  if (!tiptap.value) {
    return emptyNodes;
  }

  tiptap.value.state.doc.descendants((node: DocNode) => {
    if (node.type.name === "zeroPointAnnotation" || node.type.name === "hardBreak") {
      return false;
    }

    if (!node.isText && node.textContent === "") {
      emptyNodes.push(node);
      return false;
    }
  });

  return emptyNodes;
}

function findChangedAnnotations(indexMap: IndexMap, plainText: string): Annotation[] {
  const affectedAnnos: Annotation[] = [];

  // Loop through annotations currently in the editor
  indexMap.forEach((value, uuid) => {
    const currentEntry: Annotation | undefined = annotations.value?.get(uuid);
    const initialEntry: Annotation | undefined = initialAnnotations.value?.get(uuid);

    // Should not happen actually
    if (!currentEntry) {
      console.error(`The annotation with uuid ${uuid} could not be found`);
      return;
    }

    const { startIndex, endIndex } = value;

    // Zero-point annotations (including hardBreaks) occupy an offset between characters - they have no
    // range and therefore no text content
    const isZeroPointAnno: boolean = isZeroPoint(currentEntry.node);
    const textSlice: string = isZeroPointAnno ? "" : plainText.slice(startIndex, endIndex + 1);

    const hasNewStart: boolean = initialEntry?.node.data.startIndex !== startIndex;
    const hasNewEnd: boolean = initialEntry?.node.data.endIndex !== endIndex;
    const hasChangedText: boolean = isZeroPointAnno ? false : initialEntry?.node.data.text !== textSlice;
    const isEditedOrDeleted: boolean = ["created", "deleted", "modified"].includes(currentEntry.meta.status);

    if (hasNewStart || hasNewEnd || hasChangedText || isEditedOrDeleted) {
      // Needs to be cloned object to keep editor data clean. Otherwise, a failed operation would make problems
      // ("status" field is updated, doc history not clean etc.)
      const cloned: Annotation = cloneDeep(currentEntry);

      // Apply indices to cloned object (for existing or new annotations)
      if (hasNewStart || currentEntry.meta.status === "created") {
        cloned.node.data.startIndex = value.startIndex;
      }

      if (hasNewEnd || currentEntry.meta.status === "created") {
        cloned.node.data.endIndex = value.endIndex;
      }

      // Get slice of plain text
      cloned.node.data.text = textSlice;

      // Presence-only zero-point marker: keep persisted data self-describing about the index semantics.
      if (isZeroPointAnno) {
        cloned.node.data.isZeroPoint = true;
      } else {
        delete cloned.node.data.isZeroPoint;
      }

      // Update status explicitly for changed indices. Otherwised changed/added/deleted annotations keep their status
      if (currentEntry.meta.status !== "created" && (hasNewStart || hasNewEnd)) {
        cloned.meta.status = "modified";
      }

      affectedAnnos.push(cloned);
    }
  });

  // Get elements which are deleted in editor
  const uuidsInEditor = new Set<string>([...indexMap.keys()]);
  const initialUuids = new Set<string>([...(initialAnnotations.value?.keys() ?? [])]);
  const deletedUuids = initialUuids.difference(uuidsInEditor);

  deletedUuids.forEach((uuid) => {
    const annoEntry: Annotation | undefined = initialAnnotations.value?.get(uuid);

    if (!annoEntry) {
      console.error(`The annotation with uuid ${uuid} could not be found in the initial annotations`);
      return;
    }

    const cloned: Annotation = { ...cloneDeep(annoEntry), meta: { status: "deleted" } };

    affectedAnnos.push(cloned);
  });

  return affectedAnnos;
}

/**
 * Collects and returns all properties for the neo4j payload of a structural annotation node.
 *
 * Single assembly point for a structural node's das which merges the different sources of truth:
 * - Domain props from the tiptap node's `_annotationData` attribute,
 * - Editor-owned props from the live tiptap-native attrs (e.g. `level` for headings),
 * - uuid from the UniqueID extension
 * - The annotation type itself from the node's editor role (if a mapping between built-in and custom name was configured)
 *
 * @param {DocNode} node The Tiptap node from where the data should be collected.
 * @returns {Record<string, any>} The collected properties
 */
function assembleStructuralAnnotationData(node: DocNode): Record<string, any> {
  const neo4jProperties: Record<string, any> = {};

  const editorRole: BuiltinStructuralType = node.type.name as BuiltinStructuralType;
  const annotationType: string = getAnnotationType(editorRole);
  const annotationData = node.attrs._annotationData ?? {};

  const editorOwned = getEditorOwnedProperties(annotationType);

  // 1. Domain properties: read from `_annotationData`, skipping the editor-owned ones.
  const fields: PropertyConfig[] = getStructuralAnnotationConfig(annotationType)?.properties ?? [];

  fields.forEach((field: PropertyConfig) => {
    if (editorOwned.some((map) => map.property === field.name)) {
      return;
    }

    if (field.name in annotationData) {
      neo4jProperties[field.name] = annotationData[field.name];
    }
  });

  // 2. Editor-owned properties: read the live native node's attribute (level/colspan/rowspan) and store it
  // under its configured project property name (e.g. native `level` -> project `n`).
  for (const { property, attribute } of editorOwned) {
    if (node.attrs[attribute] !== undefined) {
      neo4jProperties[property] = node.attrs[attribute];
    }
  }

  // 3. Authorative properties: type and uuid non-configurable, must always exist
  neo4jProperties.uuid = node.attrs.uuid;
  neo4jProperties.type = annotationType;

  // Structural zero-points (hardBreaks) carry the presence-only marker like any other zero-point.
  if (getAnnotationBehaviour(annotationType) === "zeroPoint") {
    neo4jProperties.isZeroPoint = true;
  }

  return neo4jProperties;
}

function findChangedStructureElements(indexMap: IndexMap, plainText: string): Annotation[] {
  const affectedElements: Annotation[] = [];

  const docNodes = new Map<string, DocNode>();

  tiptap.value?.state.doc.descendants((node) => {
    if (isStructureElement(node)) {
      docNodes.set(node.attrs.uuid, node);
    }
  });

  // Loop through nodes currently in the editor
  indexMap.forEach(({ startIndex, endIndex }, uuid) => {
    const docNode: DocNode | undefined = docNodes.get(uuid);

    // Should not happen actually
    if (!docNode) {
      console.error(`The annotation with uuid ${uuid} could not be found`);
      return;
    }

    const initialEntry: Annotation | undefined = initialStructuralAnnotations.value?.get(uuid);

    const textSlice: string = plainText.slice(startIndex, endIndex + 1);

    // TODO: Always "modified" for now since it is likely anyway (changed text). Fix later maybe
    const status: NodeStatus = initialEntry ? "modified" : "created";

    // Create annotation object (needed)
    const annotation: Annotation = {
      node: {
        data: {
          ...assembleStructuralAnnotationData(docNode),
          startIndex,
          endIndex,
          text: textSlice,
        } as IAnnotation,
        nodeLabels: ["Annotation"],
      },
      connectedNodes: [],
      meta: {
        status: status,
      },
    };

    affectedElements.push(annotation);
  });

  // Get elements which are deleted in editor.
  // Only consider built-in structural types here — semantic block deletions are handled
  // separately by `findChangedLabelAnnotations` to avoid false deletions.
  const uuidsInEditor = new Set<string>(indexMap.keys());

  const initialUuids = new Set<string>(
    (initialStructuralAnnotations.value?.entries() ?? [])
      .filter(([_, anno]) => isBuiltinStructuralType(anno.node.data.type))
      .map(([uuid]) => uuid),
  );
  const deletedUuids: Set<string> = initialUuids.difference(uuidsInEditor);

  deletedUuids.forEach((uuid) => {
    const annoEntry: Annotation | undefined = initialStructuralAnnotations.value?.get(uuid);

    if (!annoEntry) {
      console.error(`The annotation with uuid ${uuid} could not be found in the initial structural annotations`);
      return;
    }

    const cloned: Annotation = { ...cloneDeep(annoEntry), meta: { status: "deleted" } };

    affectedElements.push(cloned);
  });

  return affectedElements;
}

/**
 * Builds the save payload node for a semantic block from its `_semanticBlocks` attr entry.
 *
 * The entry is a whole `Annotation` (the doc is the source of truth); this clones it and
 * overwrites the derived fields (start/end index, text) from the live index map plus the
 * save-time derived status, leaving `node.nodeLabels`/`connectedNodes` untouched.
 *
 * TODO: this should be very similar to assembleStructuralAnnotationData -> refactor
 *
 * @param {Annotation} entry - The annotation node read from the doc attrs.
 * @param {number} startIndex - Character start index from the semantic-block index map.
 * @param {number} endIndex - Character end index from the semantic-block index map.
 * @param {string} text - The plain-text slice for the block's range.
 * @param {NodeStatus} status - The save-time derived status (created/modified).
 * @returns {Annotation} The assembled annotation node for the save payload.
 */
function assembleSemanticBlockData(
  entry: Annotation,
  startIndex: number,
  endIndex: number,
  text: string,
  status: NodeStatus,
): Annotation {
  const assembled: Annotation = cloneDeep(entry);

  assembled.node.data = { ...assembled.node.data, startIndex, endIndex, text };
  assembled.meta = { status };

  return assembled;
}

function findChangedSemanticBlocks(indexMap: IndexMap, plainText: string): Annotation[] {
  const affectedElements: Annotation[] = [];

  // The doc is the source of truth: read the whole annotation node from the attrs.
  const semanticBlocks: Map<string, Annotation> = tiptap.value ? collectSemanticBlocks(tiptap.value.state.doc) : new Map();

  // Updated/created label annotations: derive live startIndex/endIndex from the doc
  indexMap.forEach(({ startIndex, endIndex }, uuid) => {
    const entry: Annotation | undefined = semanticBlocks.get(uuid);

    if (!entry) {
      return;
    }

    const status: NodeStatus = initialStructuralAnnotations.value?.has(uuid) ? "modified" : "created";
    const text: string = plainText.slice(startIndex, endIndex + 1);

    affectedElements.push(assembleSemanticBlockData(entry, startIndex, endIndex, text, status));
  });

  // Deleted: was semantic block annotation in the initial snapshot but no longer present in the doc
  const uuidsInEditor = new Set<string>(indexMap.keys());

  initialStructuralAnnotations.value?.forEach((anno, uuid) => {
    if (!isBuiltinStructuralType(anno.node.data.type) && !uuidsInEditor.has(uuid)) {
      affectedElements.push({ ...cloneDeep(anno), meta: { status: "deleted" } });
    }
  });

  return affectedElements;
}

function getAffectedAnnotations(): { annotations: Annotation[]; structureElements: Annotation[] } {
  const plainText: string = tiptap.value?.state.doc.textContent ?? "";

  const { decorationIndexMap, structureBlockIndexMap, semanticBlockIndexMap, zeroPointIndexMap, hardBreakIndexMap } =
    useCreateIndexMaps().buildIndexMaps();

  // Zero point and range annotation are stored in the same store and can therefore share the same index map
  const changedAnnotations = findChangedAnnotations(new Map([...decorationIndexMap, ...zeroPointIndexMap]), plainText);

  // hardBreaks and blocks are stored in the same store and can therefore share the same index map
  const affectedStructureBlocks = findChangedStructureElements(
    new Map([...structureBlockIndexMap, ...hardBreakIndexMap]),
    plainText,
  );

  // Semantic blocks (closer, address, div) are tracked via _semanticBlocks on block nodes
  const affectedLabelAnnotations = findChangedSemanticBlocks(semanticBlockIndexMap as IndexMap, plainText);

  return {
    annotations: changedAnnotations,
    structureElements: [...affectedStructureBlocks, ...affectedLabelAnnotations],
  };
}

export interface EdgeDescriptor {
  type: string;
  startUuid: string;
  endUuid: string;
}

function inferRelationship(parent: Node<BaseNodeData>, child: Node<BaseNodeData>): EdgeDescriptor {
  const parentUuid: string = parent.data.uuid;
  const childUuid: string = child.data.uuid;

  const p: string[] = parent.nodeLabels;
  const c: string[] = child.nodeLabels;

  // Annotation → Annotation: sub-annotation (e.g. commentary text)
  if (p.includes("Annotation") && c.includes("Annotation")) {
    return { type: "HAS_ANNOTATION", startUuid: parentUuid, endUuid: childUuid };
  }

  // Annotation → Entity | Collection | Text: referenced nodes
  if (p.includes("Annotation")) {
    return { type: "REFERS_TO", startUuid: parentUuid, endUuid: childUuid };
  }

  // Text | Collection → Annotation
  if (c.includes("Annotation")) {
    return { type: "HAS_ANNOTATION", startUuid: parentUuid, endUuid: childUuid };
  }

  // Collection → Text | Collection → Collection: edge runs (Text|Collection)-[:PART_OF]->(Collection)
  if (p.includes("Collection") && (c.includes("Content") || c.includes("Collection"))) {
    return { type: "PART_OF", startUuid: childUuid, endUuid: parentUuid };
  }

  throw new Error(`Cannot infer relationship between [${p.join(", ")}] and [${c.join(", ")}]`);
}

interface UpdateObject {
  create: (AnnotationNode | CollectionNode | EntityNode | TextNode)[];
  delete: (AnnotationNode | CollectionNode | EntityNode | TextNode)[];
  update: (AnnotationNode | CollectionNode | EntityNode | TextNode)[];
  remove: { startUuid: string; endUuid: string }[];
  attach: { startUuid: string; endUuid: string }[];
}

/** Temporary, used in backend */
function insertNodeIntoObject(parent: NodeStatusObject | null, node: NodeStatusObject, obj: UpdateObject): UpdateObject {
  node.connectedNodes.forEach((child) => insertNodeIntoObject(node, child, obj));

  if (node.meta.status === "deleted") {
    obj.delete.push(node.node);
  }

  if (node.meta.status === "created") {
    obj.create.push(node.node);
  }

  if (node.meta.status === "modified") {
    obj.update.push(node.node);
  }

  // Added/created with existing parent
  if (parent && (node.meta.status === "created" || node.meta.status === "added")) {
    obj.attach.push(inferRelationship(parent.node, node.node));
  }

  // Removed, but parent was deleted anyway
  if (parent && node.meta.status === "removed" && parent.meta.status !== "deleted") {
    obj.remove.push(inferRelationship(parent.node, node.node));
  }

  return obj;
}

/** Temporary, used in backend */
function flattenNodeTree(textDto: TextUpdateDto): UpdateObject {
  const obj: UpdateObject = {
    create: [],
    delete: [],
    update: [],
    remove: [],
    attach: [],
  };

  insertNodeIntoObject(null, { ...textDto.text, connectedNodes: textDto.annotations }, obj);

  return obj;
}

// TODO: Annotations structure has changed, overhaul all methods inside
async function handleSaveChanges(): Promise<void> {
  if (!tiptap.value) {
    return;
  }

  // if (!hasUnsavedChanges()) {
  //   console.log('no changes made, no request needed');
  //   return;
  // }

  const nodesWithoutChildrenOrText = getEmptyNodes();
  const joined: string = nodesWithoutChildrenOrText.map((n) => getAnnotationType(n.type.name)).join(",");

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

  const affectedAnnotations = getAffectedAnnotations();

  const { structureElements, annotations } = affectedAnnotations;

  const annotationsToUpdate: Annotation[] = [...structureElements, ...annotations];
  const newTextNode: NodeStatusObject<TextNode> = {
    node: {
      data: {
        uuid: text.value.data.uuid,
        text: tiptap.value.state.doc.textContent,
      },
      nodeLabels: [...text.value.nodeLabels],
    },
    meta: { status: "modified" },
    connectedNodes: [],
  };

  // Object to send via API
  const textToUpdate: TextUpdateDto = {
    text: toValue(newTextNode),
    annotations: toValue(annotationsToUpdate),
  };

  // Only for testing purposes
  // eslint-disable-next-line -- Testing purposes, might be removed later
  const flattened = flattenNodeTree(textToUpdate);
  // console.log(flattened);

  asyncOperationRunning.value = true;
  try {
    await api.updateText(text.value.data.uuid, textToUpdate);

    // Update all initial values: Annotations, structuralAnnotations and text

    cleanUpAfterSave(newTextNode, affectedAnnotations);

    showMessage("success");
  } catch (error: unknown) {
    showMessage("error", error as Error);
    console.error("Error updating text:", error);
  } finally {
    asyncOperationRunning.value = false;
  }
}

function handleCancelChanges(): void {
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

  const side: string = (event.target as Element).getAttribute("resizer-id");
  activeResizer.value = side;
  window.addEventListener("mousemove", handleResize);
}

function handleKeyDown(event: KeyboardEvent): void {
  const keys: string[] = [];

  if (event.ctrlKey) {
    keys.push("ctrl");
  }

  if (event.shiftKey) {
    keys.push("shift");
  }

  if (event.altKey) {
    keys.push("alt");
  }

  if (event.metaKey) {
    keys.push("meta");
  }

  keys.push(event.key.toLowerCase());

  const keyCombo: string = normalizeKeys(keys);

  // Quick hack to remove backdrop from redraw mode
  if (keys.length === 1 && keys[0] === "escape") {
    toggleRedrawMode({ direction: "off", cause: "cancel" });
  }

  // Check if the shortcut combo exists, execute callback function
  if (shortcutMap.value.has(keyCombo)) {
    event.preventDefault();

    if (isRedrawMode.value) {
      return;
    }

    shortcutMap.value.get(keyCombo)();
  }
}

function handleMouseUp(): void {
  activeResizer.value = "";
  window.removeEventListener("mousemove", handleResize);
}

function handleBeforeUnload(event: BeforeUnloadEvent): void {
  preventUserFromPageLeaving(event);
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

    const text: TextAccessObject = await api.getTextAccessObject(textUuid.value);

    if (!isValidText.value) {
      isLoading.value = false;
      return;
    }

    // await fetchAndInitializeCharacters(text.value.data.uuid);

    // if (charactersFetchError.value) {
    //   isLoading.value = false;
    //   return;
    // }

    const fetchedAnnotations: NodeDto[] = await api.getAnnotations("text", textUuid.value);
    // if (annotationFetchError.value) {
    //   isLoading.value = false;
    //   return;
    // }

    const standoffObject = { text: text.text.data.text, annotations: fetchedAnnotations };

    initializeTiptap(standoffObject);

    isLoading.value = false;
  },
  { immediate: true },
);
</script>

<template>
  <PageOverlay v-if="isLoading === true">
    <LoadingSpinner />
  </PageOverlay>
  <EditorError v-else-if="isValidText === false" :uuid="textUuid" />
  <div v-else class="container flex h-full">
    <PageOverlay v-if="asyncOperationRunning">
      <LoadingSpinner />
    </PageOverlay>

    <PageOverlay
      v-if="redrawMode?.direction === 'on'"
      :style="{ backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 'var(--z-index-overlay)' }"
    >
      <div class="flex justify-content-center pt-4">
        <Message class="text-center w-6" severity="info" icon="pi pi-info-circle">
          <p><strong>Edit annotated text</strong></p>
          <p>Select the new text that should belong to this annotation.</p>
          <p>
            To cancel the operation, click the <i class="pi pi-times-circle"></i> button in the annotation panel on the right or
            press <kbd>Esc</kbd>.
          </p>
        </Message>
      </div>
    </PageOverlay>

    <EditorSidebar position="left" :is-collapsed="sidebars['left'].isCollapsed === true" :width="sidebars['left'].width">
      <EditorMetadata />
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
    <section class="main flex flex-column flex-grow-1 px-3 pb-0 pt-3" :style="{ width: mainWidth + 'px' }">
      <EditorHeader ref="labelInputRef" />
      <EditorAnnotationButtonPane />
      <SemanticBlockLines />

      <editor-content v-if="tiptap" id="editor" :editor="tiptap" spellcheck="false" />

      <EditorActionButtonsPane
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
      <EditorFilter />
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
