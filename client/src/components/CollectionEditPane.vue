<script setup lang="ts">
import { computed, ComputedRef, ref, useTemplateRef, watch } from "vue";
import Button from "primevue/button";
import { useHierarchyStore } from "../store/hierarchy";
import { useGuidelinesStore } from "../store/guidelines";
import {
  Annotation,
  AnnotationType,
  CollectionNode,
  CollectionFocus,
  HierarchyEntry,
  PropertyConfig,
  NodeDto,
  NodeStatusObject,
} from "../models/types";
import { capitalize, cloneDeep, getDefaultValueForProperty, setNodeTreeStatus, pruneDeletedNodes } from "../utils/helper/helper";
import DataInputComponent from "./DataInputComponent.vue";
import DataInputGroup from "./DataInputGroup.vue";
import { useDialog } from "primevue";
import AnnotationTypeIcon from "./AnnotationTypeIcon.vue";
import NodePropertiesTable from "./NodePropertiesTable.vue";
import { useAppStore } from "../store/app";
import NodeDeleteModal from "./NodeDeleteModal.vue";
import AppError from "../utils/errors/app.error";
import ValidationError from "../utils/errors/validation.error";
import AnnotationButton from "./AnnotationButton.vue";
import AnnotationEditModal from "./AnnotationEditModal.vue";
import { useCreateAnnotation } from "../composables/useCreateAnnotation";
import AnnotationReferencesSection from "./AnnotationReferencesSection.vue";
import NodeStatusBadge from "./NodeStatusBadge.vue";
import TagAssignmentButton from "./TagAssignmentButton.vue";
import CollectionLabelInput from "./CollectionLabelInput.vue";
import NodeIcon from "./NodeIcon.vue";

const props = defineProps<{
  focus: CollectionFocus;
}>();

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
const { levels, mode, path, findEntryInHierarchy, updatePath, setMode } = useHierarchyStore();

const { createCollectionAnnotation: createAnnotation } = useCreateAnnotation("Collection");

const temporaryWorkData = ref<CollectionFocus | null>(null);
const initialTemporaryWorkData = ref<CollectionFocus | null>(null);

const asyncOperationRunning = ref<boolean>(false);

const expandedAnnotationUuids = ref<Set<string>>(new Set());

function isAnnotationExpanded(uuid: string): boolean {
  return expandedAnnotationUuids.value.has(uuid);
}

function toggleAnnotationExpanded(uuid: string): void {
  if (expandedAnnotationUuids.value.has(uuid)) {
    expandedAnnotationUuids.value.delete(uuid);
  } else {
    expandedAnnotationUuids.value.add(uuid);
  }
}

const collectionFields: ComputedRef<PropertyConfig[]> = computed(() => {
  return guidelines.value
    ? getCollectionConfigFields(temporaryWorkData.value.collection.node.nodeLabels).filter((field) => field.visible)
    : [];
});

const availableCollectionLabels = computed(getAvailableCollectionLabels);
const availabeAnnotationTypes: ComputedRef<AnnotationType[]> = computed(() =>
  getAvailableCollectionAnnotationConfigs(temporaryWorkData.value.collection.node.nodeLabels),
);

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

function findAnnotationByUuid(uuid: string): NodeStatusObject | undefined {
  const found: NodeStatusObject | undefined = temporaryWorkData.value.annotations.find((a) => a.node.data.uuid === uuid);

  if (!found) {
    console.error(`Annotation with UUID ${uuid} not found in existing annotations.`);

    return;
  }

  return found;
}

function setAnnotationDeleted(uuid: string): void {
  const found: NodeStatusObject | undefined = findAnnotationByUuid(uuid);

  if (!found) {
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

function handleRemoveAnnotation(uuid: string): void {
  setAnnotationDeleted(uuid);
}

/**
 * Opens the {@linkcode AnnotationEditModal} for a Collection annotation.
 *
 * @param {string} uuid - UUID of the annotation in `temporaryWorkData.annotations`.
 * @returns {void} This function does not return any value.
 */
function handleEditAnnotation(uuid: string): void {
  const annotation: NodeStatusObject | undefined = findAnnotationByUuid(uuid);

  if (!annotation) {
    return;
  }

  const nodeLabels: string[] = temporaryWorkData.value.collection.node.nodeLabels;

  const config: AnnotationType = getCollectionAnnotationConfig(nodeLabels, annotation.node.data.type);
  const propertyFields: PropertyConfig[] = getCollectionAnnotationFields(nodeLabels, annotation.node.data.type);

  createModalInstance(
    dialog.open(AnnotationEditModal, {
      props: {
        modal: true,
        closable: true,
        closeOnEscape: true,
        header: `Edit ${annotation.node.data.type} annotation`,
        style: { width: "28rem" },
        pt: {
          pcCloseButton: { root: { title: "Close" } },
        },
      },
      data: { annotation, config, propertyFields },
      emits: {
        onSubmit: (updated: Annotation) => {
          updateAnnotationData(uuid, updated);
          destroyModalInstance();
        },
      },
      onClose: destroyModalInstance,
    }),
  );
}

/**
 * Writes the data edited in the {@linkcode AnnotationEditModal} back into the Collection annotation.
 *
 * @param {string} uuid - UUID of the annotation in `temporaryWorkData.annotations`.
 * @param {Annotation} updated - The annotation data as returned by the modal.
 * @returns {void} This function does not return any value.
 */
function updateAnnotationData(uuid: string, updated: Annotation): void {
  const target: NodeStatusObject | undefined = findAnnotationByUuid(uuid);

  if (!target) {
    return;
  }

  target.node.data = updated.node.data;
  target.connectedNodes = updated.connectedNodes;
  target.meta.status = target.meta.status === "created" ? "created" : "modified";
}

function transferDataToListItem(uuid: string, index: number, data: NodeDto<CollectionNode>): void {
  const entry: HierarchyEntry | null = findEntryInHierarchy(uuid, index);

  if (entry) {
    entry.data.node.data = data.node.data;
    entry.data.node.nodeLabels = data.node.nodeLabels;
  }
}

/**
 * Removes stale data from the temporary work data after a successful save operation. This includes filtering out
 * annotations previously marked as "deleted"/"removed" as well as setting the status of all remaining nodes to "unchanged".
 * The edit process has finished, now everything is in sync with the database.
 *
 * @returns {void} This function does not return any value.
 */
function cleanupDataAfterSave(): void {
  temporaryWorkData.value.annotations = temporaryWorkData.value.annotations.filter(
    (a) => a.meta.status !== "deleted" && a.meta.status !== "removed",
  );

  pruneDeletedNodes(temporaryWorkData.value.collection);
  setNodeTreeStatus(temporaryWorkData.value.collection, "unchanged");

  temporaryWorkData.value.annotations.forEach((a) => {
    pruneDeletedNodes(a);
    setNodeTreeStatus(a, "unchanged");
  });
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

    cleanupDataAfterSave();

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

function handleSuccessfullDeletion() {
  showMessage("success");
  destroyModalInstance();
  updateView();
}

function updateView() {
  const parentIndex: number = path.value.length - 1;

  updatePath(path.value.slice(0, parentIndex));

  // Remove the deleted collection from its column explicitly (rebuilding the levels keeps/refetches
  // columns, but not this specific removal)
  levels.value[parentIndex].entries = levels.value[parentIndex].entries.filter(
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
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- Safe to delete
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
    <div class="main flex-grow-1 flex flex-column gap-1 w-full">
      <div class="buttons flex justify-content-end gap-1">
        <TagAssignmentButton :node-uuid="temporaryWorkData.collection.node.data.uuid" />
        <Button
          as="a"
          :href="`/api/tools/shoyu/collections/${temporaryWorkData.collection.node.data.uuid}`"
          target="_blank"
          rel="noopener"
          severity="secondary"
          icon="pi pi-external-link"
          size="small"
          title="View collection on website"
        />
      </div>

      <div class="label-section">
        <h3 class="label-heading" aria-label="Collection label">
          <NodeIcon :node-labels="temporaryWorkData.collection.node.nodeLabels" />
          <CollectionLabelInput v-if="mode === 'edit'" v-model:label="temporaryWorkData.collection.node.data.label" />
          <span v-else class="label-text" data-placeholder="No label provided">
            {{ temporaryWorkData.collection.node.data.label }}
          </span>
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

          <div
            v-for="annotation in temporaryWorkData.annotations"
            v-show="annotation.meta.status !== 'deleted'"
            :key="annotation.node.data.uuid"
            class="annotation-card mb-3"
            :data-annotation-uuid="annotation.node.data.uuid"
          >
            <div class="annotation-card-header">
              <div class="flex items-center gap-1 align-items-center flex-grow-1">
                <div class="icon-container">
                  <AnnotationTypeIcon :annotation-type="annotation.node.data.type" />
                </div>
                <span class="font-bold">{{ annotation.node.data.type }}</span>
                <NodeStatusBadge :status="annotation.meta.status" />
              </div>
              <div class="action-buttons" :style="{ visibility: mode === 'edit' ? 'visible' : 'hidden' }">
                <Button
                  title="Edit annotation"
                  severity="contrast"
                  icon="pi pi-pencil"
                  size="small"
                  :style="{ width: '25px', height: '25px' }"
                  @click="handleEditAnnotation(annotation.node.data.uuid)"
                />
                <Button
                  title="Remove annotation from Collection"
                  severity="danger"
                  icon="pi pi-trash"
                  size="small"
                  :style="{ width: '25px', height: '25px' }"
                  @click="handleRemoveAnnotation(annotation.node.data.uuid)"
                />
              </div>
              <Button
                :icon="`pi pi-chevron-${isAnnotationExpanded(annotation.node.data.uuid) ? 'up' : 'down'}`"
                severity="secondary"
                title="Toggle full view"
                rounded
                text
                size="small"
                @click.stop="toggleAnnotationExpanded(annotation.node.data.uuid)"
              />
            </div>

            <div v-show="isAnnotationExpanded(annotation.node.data.uuid)" class="annotation-card-body">
              <NodePropertiesTable
                :data="annotation.node.data"
                :fields="getCollectionAnnotationFields(temporaryWorkData.collection.node.nodeLabels, annotation.node.data.type)"
              />

              <AnnotationReferencesSection v-model="annotation.connectedNodes" mode="view" />
            </div>

            <div class="annotation-card-footer" :style="{ visibility: mode === 'edit' ? 'visible' : 'hidden' }"></div>
          </div>
        </div>
        <div class="properties-pane">
          <form ref="form">
            <div v-for="field in collectionFields" :key="field.name" class="input-container">
              <div class="flex align-items-center gap-3 mb-3">
                <!-- eslint-disable vuejs-accessibility/label-has-for -- No id as component prop currently -->
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
                <!-- eslint-enable vuejs-accessibility/label-has-for -->
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

.annotation-card {
  border: 1px solid var(--p-primary-color);
  border-radius: var(--p-border-radius-md, 6px);
  overflow: hidden;
  background: var(--p-panel-background);
}

.annotation-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  user-select: none;
}

.annotation-card-body {
  padding: 0.75rem;
}

.annotation-card-footer {
  display: flex;
  gap: 0.25rem;
  padding: 0.5rem;
  justify-content: center;
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
  --label-placeholder-color: var(--p-inputtext-placeholder-color);
  --label-field-radius: var(--p-inputtext-border-radius);

  font-weight: bold;
  padding: 0.25rem 0.5rem;
  border: 1px solid transparent;
  border-radius: var(--label-field-radius);
}

/* The placeholder lives in CSS, so it can never be mistaken for the value and saved */
.label-text:empty::before {
  content: attr(data-placeholder);
  color: var(--label-placeholder-color);
  font-style: italic;
  font-weight: normal;
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
