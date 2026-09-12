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
import { useAppStore } from "../store/app";
import NodeDeleteModal from "./NodeDeleteModal.vue";
import AppError from "../utils/errors/app.error";
import ValidationError from "../utils/errors/validation.error";
import TieredMenu from "primevue/tieredmenu";
import { MenuItem } from "primevue/menuitem";
import AnnotationEditModal from "./AnnotationEditModal.vue";
import AnnotationCreateModal from "./AnnotationCreateModal.vue";
import { useCreateAnnotation } from "../composables/useCreateAnnotation";
import TagAssignmentButton from "./TagAssignmentButton.vue";
import CollectionLabelInput from "./CollectionLabelInput.vue";
import NodeIcon from "./NodeIcon.vue";
import CollectionAnnotationNote from "./CollectionAnnotationNote.vue";

const props = defineProps<{
  focus: CollectionFocus;
}>();

const { api, addToastMessage, createModalInstance, destroyModalInstance } = useAppStore();

const dialog: ReturnType<typeof useDialog> = useDialog();
const form = useTemplateRef<HTMLFormElement>("form");

const {
  guidelines,
  annotationHasConstraints,
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

const collectionFields: ComputedRef<PropertyConfig[]> = computed(() => {
  return guidelines.value
    ? getCollectionConfigFields(temporaryWorkData.value.collection.node.nodeLabels).filter((field) => field.visible)
    : [];
});

const availableCollectionLabels = computed(getAvailableCollectionLabels);
const availabeAnnotationTypes: ComputedRef<AnnotationType[]> = computed(() =>
  getAvailableCollectionAnnotationConfigs(temporaryWorkData.value.collection.node.nodeLabels),
);

const SHOW_ANNOTATION_SUBTYPES: boolean = true;

const annotationMenu = useTemplateRef<InstanceType<typeof TieredMenu>>("annotation-menu");

const annotationMenuItems: ComputedRef<MenuItem[]> = computed(() => {
  return availabeAnnotationTypes.value
    .toSorted((a, b) => a.type.localeCompare(b.type))
    .map((type: AnnotationType) => {
      const subTypeOptions: (string | number)[] = SHOW_ANNOTATION_SUBTYPES
        ? getCollectionAnnotationFields(temporaryWorkData.value?.collection.node.nodeLabels ?? [], type.type).find(
            (field) => field.name === "subType",
          )?.options ?? []
        : [];

      if (subTypeOptions.length === 0) {
        return {
          label: type.type,
          annotationType: type.type,
          command: () => handleAnnotationButtonClick({ type: type.type }),
        };
      }

      return {
        label: type.type,
        annotationType: type.type,
        items: subTypeOptions.map((option: string | number) => ({
          label: option.toString(),
          annotationType: option,
          command: () => handleAnnotationButtonClick({ type: type.type, subType: option }),
        })),
      };
    });
});

function openAnnotationMenu(event: Event): void {
  annotationMenu.value?.toggle(event);
}

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

function findAnnotationByUuid(uuid: string): Annotation | undefined {
  const found: Annotation | undefined = temporaryWorkData.value?.annotations.find((a) => a.node.data.uuid === uuid);

  if (!found) {
    console.error(`Annotation with UUID ${uuid} not found in existing annotations.`);

    return;
  }

  return found;
}

function setAnnotationDeleted(uuid: string): void {
  const found: Annotation | undefined = findAnnotationByUuid(uuid);

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

function handleAnnotationButtonClick(data: { type: string; subType?: string | number }): void {
  const nodeLabels: string[] = temporaryWorkData.value.collection.node.nodeLabels;
  const newAnnotation: Annotation = createAnnotation({ ...data, nodeLabels });
  const config: AnnotationType = getCollectionAnnotationConfig(nodeLabels, data.type);

  // TODO: Remove "|| true" once annotationHasConstraints() covers Collection annotations
  if (annotationHasConstraints(config) || true) {
    openAnnotationCreateModal(newAnnotation, config, getCollectionAnnotationFields(nodeLabels, data.type));
  } else {
    temporaryWorkData.value.annotations.push(newAnnotation);
  }
}

/**
 * Opens the {@linkcode AnnotationCreateModal} for a new Collection annotation. Adds it to the Collection on submit only.
 *
 * @param {Annotation} annotation - The annotation template to fill in.
 * @param {AnnotationType} config - The Collection-scoped annotation config.
 * @param {PropertyConfig[]} propertyFields - The Collection-scoped property fields.
 * @returns {void} This function does not return any value.
 */
function openAnnotationCreateModal(annotation: Annotation, config: AnnotationType, propertyFields: PropertyConfig[]): void {
  createModalInstance(
    dialog.open(AnnotationCreateModal, {
      props: {
        modal: true,
        closable: false,
        closeOnEscape: true,
        dismissableMask: true,
        style: { width: "25rem", height: "35rem" },
      },
      data: { annotation, config, propertyFields },
      emits: {
        onSubmit: (created: Annotation) => {
          temporaryWorkData.value.annotations.push(created);

          destroyModalInstance();
        },
      },
      onClose: destroyModalInstance,
    }),
  );
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
  const annotation: Annotation | undefined = findAnnotationByUuid(uuid);

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
  const target: Annotation | undefined = findAnnotationByUuid(uuid);

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
        <div class="annotations-pane flex flex-wrap align-items-center gap-1 mb-4">
          <template v-for="(annotation, index) in temporaryWorkData.annotations" :key="annotation.node.data.uuid">
            <CollectionAnnotationNote
              v-if="annotation.meta.status !== 'deleted'"
              v-model="temporaryWorkData.annotations[index]"
              :mode="mode"
              :collection-node-labels="temporaryWorkData.collection.node.nodeLabels"
              @edit="handleEditAnnotation(annotation.node.data.uuid)"
              @remove="handleRemoveAnnotation(annotation.node.data.uuid)"
            />
          </template>
          <div v-if="mode === 'edit' && availabeAnnotationTypes.length > 0" class="annotation-button-pane">
            <Button
              icon="pi pi-plus"
              severity="secondary"
              outlined
              size="small"
              title="Add new annotation"
              aria-haspopup="true"
              @click="openAnnotationMenu($event)"
            />
            <TieredMenu ref="annotation-menu" :model="annotationMenuItems" popup>
              <template #item="{ item, props: itemProps, hasSubmenu }">
                <a class="annotation-menu-item flex align-items-center gap-2" v-bind="itemProps.action">
                  <span class="annotation-menu-icon">
                    <AnnotationTypeIcon :annotation-type="item.annotationType" />
                  </span>
                  <span>{{ item.label }}</span>
                  <i v-if="hasSubmenu" class="pi pi-angle-right ml-auto"></i>
                </a>
              </template>
            </TieredMenu>
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

    <div class="buttons flex justify-content-center gap-2 mt-2">
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

.annotation-menu-item {
  line-height: 1.4;
}

.annotation-menu-icon {
  display: block;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
}
</style>
