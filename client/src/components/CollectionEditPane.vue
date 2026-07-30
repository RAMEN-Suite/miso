<script setup lang="ts">
import { computed, ComputedRef, ref, useTemplateRef, watch } from "vue";
import Button from "primevue/button";
import { useHierarchyStore } from "../store/hierarchy";
import { useGuidelinesStore } from "../store/guidelines";
import {
  AnnotationType,
  CollectionNode,
  CollectionFocus,
  HierarchyEntry,
  PropertyConfig,
  NodeDto,
  NodeStatusObject,
} from "../models/types";
import { capitalize, cloneDeep, getDefaultValueForProperty, filterBaseNodeLabel } from "../utils/helper/helper";
import DataInputComponent from "./DataInputComponent.vue";
import DataInputGroup from "./DataInputGroup.vue";
import { useDialog } from "primevue";
import ConfirmPopup from "primevue/confirmpopup";
import AnnotationTypeIcon from "./AnnotationTypeIcon.vue";
import Panel from "primevue/panel";
import Fieldset from "primevue/fieldset";
import FormPropertiesSection from "./FormPropertiesSection.vue";
import { useAppStore } from "../store/app";
import { useRouter } from "vue-router";
import NodeDeleteModal from "./NodeDeleteModal.vue";
import AppError from "../utils/errors/app.error";
import ValidationError from "../utils/errors/validation.error";
import { useBookmarks } from "../composables/useBookmarks";
import AnnotationButton from "./AnnotationButton.vue";
import { useCreateAnnotation } from "../composables/useCreateAnnotation";
import AnnotationReferencesSection from "./AnnotationReferencesSection.vue";
import NodeStatusBadge from "./NodeStatusBadge.vue";
import { resolveNodeIcon } from "../config/icons.ts";

const props = defineProps<{
  focus: CollectionFocus;
}>();

const router = useRouter();
const { api, addToastMessage, createModalInstance, destroyModalInstance } = useAppStore();

const dialog: ReturnType<typeof useDialog> = useDialog();
const form = useTemplateRef<HTMLFormElement>("form");

const {
  guidelines,
  getCollectionAnnotationFields,
  getCollectionAnnotationConfig,
  getCollectionConfigFields,
  getAllCollectionConfigFields,
  getAvailableCollectionLabels,
  getAvailableCollectionAnnotationConfigs,
} = useGuidelinesStore();
const { levels, mode, path, findEntryInHierarchy, getUrlPath, setMode } = useHierarchyStore();

const { bookmarks, toggleBookmark } = useBookmarks();
const { createCollectionAnnotation: createAnnotation } = useCreateAnnotation("Collection");

const temporaryWorkData = ref<CollectionFocus | null>(null);
const initialTemporaryWorkData = ref<CollectionFocus | null>(null);

const asyncOperationRunning = ref<boolean>(false);
const propertiesAreCollapsed = ref<boolean>(false);

const isBookmarked = computed<boolean>(() => {
  return bookmarks.value.some((b) => b.data.data.uuid === temporaryWorkData.value?.collection.node.data.uuid);
});

const collectionFields: ComputedRef<PropertyConfig[]> = computed(() => {
  return guidelines.value ? getCollectionConfigFields(temporaryWorkData.value.collection.node.nodeLabels) : [];
});

const availableCollectionLabels = computed(getAvailableCollectionLabels);
const availabeAnnotationTypes: ComputedRef<AnnotationType[]> = computed(() =>
  getAvailableCollectionAnnotationConfigs(temporaryWorkData.value.collection.node.nodeLabels),
);

// Writable computed since "Collection" should be stripped from all visual displays/selection options
const collectionNodeLabels = computed<string[]>({
  get: () => filterBaseNodeLabel(temporaryWorkData.value.collection.node.nodeLabels),
  set: (labels: string[]) =>
    (temporaryWorkData.value.collection.node.nodeLabels = ["Collection", ...filterBaseNodeLabel(labels)]),
});

watch(
  () => props.focus.collection.node.data.uuid,
  () => {
    temporaryWorkData.value = cloneDeep(props.focus);
    initialTemporaryWorkData.value = cloneDeep(props.focus);
  },
  { immediate: true },
);

/**
 * Checks the validity of the Collection edit pane data and throws errors if criteria are not met.
 *
 * @returns {boolean} Whether the collection data are valid.
 * @throws {AppError} If the collection data are not valid.
 */
function checkValidity(): boolean {
  if (!form.value.reportValidity()) {
    return false;
  }

  // Collections must have an additional node label (if options exist)
  if (availableCollectionLabels.value.length > 0 && temporaryWorkData.value.collection.node.nodeLabels.length === 0) {
    throw new ValidationError("A Collection MUST have an additional node label.");
  }

  // Label property must always be a meaningful string
  const labelProp: string = temporaryWorkData.value.collection.node.data.label;

  if (labelProp === "") {
    throw new ValidationError('The "label" property must not be empty.');
  }

  if (labelProp.trim() === "") {
    throw new ValidationError('The "label" property must not consist of only whitespace characters.');
  }

  return true;
}

function setAnnotationDeleted(uuid: string): void {
  const found: NodeStatusObject | undefined = temporaryWorkData.value.annotations.find((a) => a.node.data.uuid === uuid);

  if (!found) {
    console.error(`Annotation with UUID ${uuid} not found in existing annotations.`);

    return;
  }

  found.meta.status = "deleted";
}

/**
 * Fills in any missing collection properties with the type-specific default value.
 *
 * @returns {void} This function does not return any value.
 */
function enrichCollectionData(): void {
  const allPossibleFields: PropertyConfig[] = getAllCollectionConfigFields();

  allPossibleFields.forEach((field) => {
    if (!(field.name in temporaryWorkData.value.collection.node.data)) {
      temporaryWorkData.value.collection.node.data[field.name] = field?.required ? getDefaultValueForProperty(field.type) : null;
    }
  });
}

function handleAnnotationButtonClick(data: { type: string; subType?: string | number }) {
  const newAnnotation: NodeStatusObject = createAnnotation({
    ...data,
    nodeLabels: temporaryWorkData.value.collection.node.nodeLabels,
  });

  temporaryWorkData.value.annotations.push(newAnnotation);
}

function handleClickEditButton(): void {
  enrichCollectionData();
  setMode("edit");
}

function handleDiscardChanges(): void {
  temporaryWorkData.value = cloneDeep(initialTemporaryWorkData.value);

  setMode("view");
}

function handleRemoveAnnotation(event: MouseEvent, uuid: string): void {
  setAnnotationDeleted(uuid);
}

function transferDataToListItem(uuid: string, index: number, data: NodeDto<CollectionNode>): void {
  const entry: HierarchyEntry | null = findEntryInHierarchy(uuid, index);

  if (entry) {
    entry.data.node.data = data.node.data;
    entry.data.node.nodeLabels = data.node.nodeLabels;
  }
}

async function handleApplyChanges(): Promise<void> {
  try {
    if (!checkValidity()) {
      return;
    }
  } catch (error: unknown) {
    addToastMessage({
      severity: "warn",
      summary: (error as AppError).name,
      detail: (error as AppError)?.message ?? "",
      life: 3000,
    });

    return;
  }

  asyncOperationRunning.value = true;

  try {
    const result = await updateCollection();

    // Update the column entry with the returned collection data
    const pathIndex: number = path.value.length - 1;

    transferDataToListItem(result.node.data.uuid, pathIndex, result);

    initialTemporaryWorkData.value = cloneDeep(temporaryWorkData.value);

    showMessage("success");
    setMode("view");
  } catch (error: unknown) {
    showMessage("error", error as Error);
    console.error("Error updating collection:", error);
  } finally {
    asyncOperationRunning.value = false;
  }
}

function handleBookmarkAction(): void {
  if (!temporaryWorkData.value) {
    return;
  }

  toggleBookmark({ data: temporaryWorkData.value.collection.node });
}

function handleDeleteColletion(): void {
  createModalInstance(
    dialog.open(NodeDeleteModal, {
      props: {
        modal: true,
        closable: false,
        closeOnEscape: false,
        showHeader: false,
        style: { width: "25rem" },
      },
      data: {
        action: "delete",
        node: temporaryWorkData.value?.collection.node,
      },
      emits: {
        onDeleted: handleSuccessfullDeletion,
      },
      onClose: destroyModalInstance,
    }),
  );
}

async function handleSuccessfullDeletion() {
  showMessage("success");
  destroyModalInstance();
  await updateView();
}

async function updateView() {
  const currentUuids: string[] = getUrlPath();

  const pathIndex: number = path.value.length - 1;
  const newUuids: string[] = currentUuids.slice(0, pathIndex);

  await router.push({ query: { path: newUuids.join(",") } });

  // Remove the deleted collection from its column explicitly (the watcher keeps/refetches columns,
  // but not this specific removal)
  levels.value[newUuids.length].entries = levels.value[newUuids.length].entries.filter(
    (e) => e.data.node.data.uuid !== temporaryWorkData.value.collection.node.data.uuid,
  );

  setMode("view");
}

/**
 * Removes any data entries that are not configured according to the current node labels, before saving.
 *
 * @returns {void} This function does not return any value.
 */
function removeUnnecessaryDataBeforeSave(): void {
  const configuredFieldNames: string[] = getCollectionConfigFields(temporaryWorkData.value.collection.node.nodeLabels).map(
    (f) => f.name,
  );

  Object.keys(temporaryWorkData.value.collection.node.data).forEach((key) => {
    if (!configuredFieldNames.includes(key) && key !== "uuid") {
      delete temporaryWorkData.value.collection.node.data[key];
    }
  });
}

function wrapDataInSingleStructure(data: CollectionFocus): NodeStatusObject {
  const { collection, annotations } = data;

  // Collection and its annotations are set to "modified". The status handling could be more
  // granular, but this keeps things simple (Collections have few annotations, query stays performant)
  const updatedCollection: NodeStatusObject = { ...collection, meta: { status: "modified" } };
  const updatedAnnotations: NodeStatusObject[] = annotations.map((a) => {
    const newStatus = a.meta.status === "unchanged" ? "modified" : a.meta.status;

    return { ...a, meta: { status: newStatus } };
  });

  return {
    ...updatedCollection,
    connectedNodes: [...updatedAnnotations],
  };
}

async function updateCollection(): Promise<NodeDto<CollectionNode>> {
  removeUnnecessaryDataBeforeSave();

  const updateObj = wrapDataInSingleStructure(temporaryWorkData.value);

  const json = await api.updateCollection(temporaryWorkData.value.collection.node.data.uuid, updateObj);

  return json;
}

function showMessage(result: "success" | "error", error?: Error) {
  addToastMessage({
    severity: result,
    summary: result === "success" ? "Changes saved successfully" : "Error saving changes",
    detail: error?.message ?? "",
    life: 2000,
  });
}
</script>

<template>
  <div v-if="temporaryWorkData" class="edit-pane-container h-full flex flex-column align-items-center p-2">
    <div class="main flex-grow-1 flex flex-column w-full">
      <div class="buttons flex justify-content-end gap-1">
        <Button
          type="button"
          severity="secondary"
          :icon="`pi pi-bookmark${isBookmarked ? '-fill' : ''}`"
          size="small"
          :title="isBookmarked ? 'Remove collection from bookmarks' : 'Add collection to bookmarks'"
          :pt="{
            icon: {
              style: isBookmarked ? { color: 'var(--p-primary-color)' } : {},
            },
          }"
          @click="handleBookmarkAction"
        />
        <Button
          as="a"
          :href="`/api/tools/ora/collections/${temporaryWorkData.collection.node.data.uuid}`"
          target="_blank"
          rel="noopener"
          severity="secondary"
          icon="pi pi-external-link"
          size="small"
          title="View collection on website"
        />
      </div>

      <div class="label-section">
        <h3 class="label-heading">
          <i :class="resolveNodeIcon(temporaryWorkData.collection.node.nodeLabels)" />
          <span
            v-if="mode === 'edit'"
            v-contenteditable="temporaryWorkData.collection.node.data.label"
            class="label-text"
            contenteditable="true"
            role="textbox"
            aria-multiline="false"
            data-placeholder="No label provided"
            title="Click to edit the label"
            @input="(e) => (temporaryWorkData.collection.node.data.label = (e.target as HTMLSpanElement).innerText.trim())"
          ></span>
          <span
            v-else
            v-contenteditable="temporaryWorkData.collection.node.data.label"
            class="label-text"
            data-placeholder="No label provided"
          ></span>
          <i v-if="mode === 'edit'" class="pi pi-pencil label-edit-icon" aria-hidden="true"></i>
        </h3>
      </div>
      <div class="content">
        <div class="annotations-pane">
          <div v-if="mode === 'edit'" class="annotation-button-pane flex flex-wrap gap-3 py-3">
            <AnnotationButton
              v-for="type in availabeAnnotationTypes"
              :key="type.type"
              :type="type.type"
              :disabled="false"
              :config="getCollectionAnnotationConfig(temporaryWorkData.collection.node.nodeLabels, type.type)"
              @clicked="handleAnnotationButtonClick($event)"
            />
          </div>

          <Panel
            v-for="(annotation, index) in temporaryWorkData.annotations"
            :key="annotation.node.data.uuid"
            class="annotation-form mb-3"
            :data-annotation-uuid="annotation.node.data.uuid"
            toggleable
            :collapsed="true"
            :toggle-button-props="{
              severity: 'secondary',
              title: 'Toggle full view',
              rounded: true,
              text: true,
            }"
            :pt="{
              root: {
                style: {
                  display: temporaryWorkData.annotations[index].meta.status === 'deleted' ? 'none' : 'block',
                },
              },
            }"
          >
            <template #header>
              <div class="flex items-center gap-1 align-items-center flex-grow-1">
                <div class="icon-container">
                  <AnnotationTypeIcon :annotation-type="annotation.node.data.type" />
                </div>
                <div class="annotation-type-container">
                  <span class="font-bold">{{ annotation.node.data.type }}</span>
                </div>
              </div>
              <NodeStatusBadge :status="annotation.meta.status" />
            </template>
            <template #toggleicon="{ collapsed }">
              <i :class="`pi pi-chevron-${collapsed ? 'down' : 'up'}`"></i>
            </template>
            <Fieldset
              legend="Properties"
              :toggle-button-props="{
                title: `${propertiesAreCollapsed ? 'Expand' : 'Collapse'} properties`,
              }"
              :toggleable="true"
              @toggle="propertiesAreCollapsed = !propertiesAreCollapsed"
            >
              <template #toggleicon>
                <span :class="`pi pi-chevron-${propertiesAreCollapsed ? 'down' : 'up'}`"></span>
              </template>
              <FormPropertiesSection
                v-model="annotation.node.data"
                :fields="getCollectionAnnotationFields(temporaryWorkData.collection.node.nodeLabels, annotation.node.data.type)"
                :mode="mode"
              />
            </Fieldset>

            <AnnotationReferencesSection v-model="annotation.connectedNodes" :mode="mode" />

            <div class="action-buttons flex justify-content-center">
              <Button
                v-if="mode === 'edit'"
                label="Remove"
                title="Remove annotation from Collection"
                severity="danger"
                icon="pi pi-trash"
                size="small"
                @click="handleRemoveAnnotation($event, annotation.node.data.uuid)"
              />
            </div>
            <ConfirmPopup></ConfirmPopup>
          </Panel>
        </div>
        <div class="properties-pane">
          <form ref="form">
            <div v-for="field in collectionFields" :key="field.name" class="input-container">
              <div class="flex align-items-center gap-3 mb-3">
                <label :for="field.name" class="w-10rem font-semibold">{{ capitalize(field.name) }} </label>
                <DataInputGroup
                  v-if="field.type === 'array'"
                  v-model="temporaryWorkData.collection.node.data[field.name]"
                  :config="field"
                  :mode="mode"
                />
                <DataInputComponent
                  v-else
                  v-model="temporaryWorkData.collection.node.data[field.name]"
                  :config="field"
                  :mode="mode"
                />
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>

    <div class="buttons flex justify-content-center gap-2">
      <Button
        v-if="mode === 'view'"
        icon="pi pi-pencil"
        title="Edit collection"
        severity="contrast"
        @click="handleClickEditButton"
      ></Button>
      <Button
        v-if="mode === 'view'"
        :disabled="asyncOperationRunning"
        icon="pi pi-trash"
        title="Delete collection"
        severity="danger"
        @click="handleDeleteColletion"
      ></Button>
      <Button
        v-if="mode === 'edit'"
        :loading="asyncOperationRunning"
        label="Save"
        icon="pi pi-save"
        title="Save changes"
        @click="handleApplyChanges"
      ></Button>
      <Button
        v-if="mode === 'edit'"
        :disabled="asyncOperationRunning"
        label="Cancel"
        icon="pi pi-times"
        title="Cancel changes"
        severity="secondary"
        @click="handleDiscardChanges"
      ></Button>
    </div>
  </div>
</template>

<style scoped>
.edit-pane-container {
  outline: 1px solid grey;
}

.annotation-form {
  border: 1px solid grey;
}

.edit-pane-container,
.edit-pane-container * {
  position: relative;
  z-index: var(--z-index-edit-pane);
}

.edit-pane-container,
.main {
  overflow-y: hidden;
}

.label-section {
  --label-field-background: var(--p-inputtext-background);
  --label-field-border: var(--p-inputtext-border-color);
  --label-field-border-hover: var(--p-inputtext-hover-border-color);
  --label-field-radius: var(--p-inputtext-border-radius);
  --label-placeholder-color: var(--p-inputtext-placeholder-color);
  --label-accent: var(--p-primary-color);

  line-break: auto;
  min-height: 3rem;
  flex-shrink: 0;
  text-align: center;
  padding: 0 5px;

  h3 {
    margin: 0;
  }
}

.label-heading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.label-text {
  padding: 0.25rem 0.5rem;
  border: 1px solid transparent;
  border-radius: var(--label-field-radius);
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}

.label-text[contenteditable="true"] {
  border-style: dashed;
  border-color: var(--label-field-border);
  background: var(--label-field-background);
  cursor: text;
}

.label-text[contenteditable="true"]:hover,
.label-text:focus {
  border-style: solid;
  border-color: var(--label-field-border-hover);
}

.label-text:focus {
  outline: none;
  box-shadow: var(--box-shadow-focus);
}

/* The placeholder lives in CSS, so it can never be mistaken for the value and saved */
.label-text:empty::before {
  content: attr(data-placeholder);
  color: var(--label-placeholder-color);
  font-style: italic;
  font-weight: normal;
}

.label-edit-icon {
  font-size: 0.75rem;
  opacity: 0.55;
  transition:
    color 0.2s,
    opacity 0.2s;
}

.label-heading:hover .label-edit-icon,
.label-text:focus + .label-edit-icon {
  color: var(--label-accent);
  opacity: 1;
}

.content {
  margin-top: 1rem;
  flex-grow: 1;
  overflow-y: auto;
  scrollbar-gutter: stable;
}

.icon-container {
  width: 20px;
  height: 20px;
}
</style>
