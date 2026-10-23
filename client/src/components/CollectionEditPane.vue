<script setup lang="ts">
import { computed, ComputedRef, onBeforeUnmount, ref, useTemplateRef, watch } from "vue";
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
import {
  camelCaseToTitleCase,
  cloneDeep,
  getDefaultValueForProperty,
  isRequiredValueMissing,
  setNodeTreeStatus,
  pruneDeletedNodes,
  pruneUnconfiguredProperties,
} from "../utils/helper/helper";
import { isArray, isBoolean } from "../utils/helper/propertyTypeHelper";
import { FieldSaveState, SaveJobMeta, useCollectionSave } from "../composables/useCollectionSave";
import { INTRINSIC_ANNOTATION_PROPERTIES, PRUNE_UNCONFIGURED_ANNOTATION_TYPES } from "../config/editor";
import { filterBaseNodeLabels } from "../config/ramen";
import DataInputComponent from "./DataInputComponent.vue";
import DataInputGroup from "./DataInputGroup.vue";
import { useDialog } from "primevue";
import { ANNOTATION_MODAL_PROPS, BASE_MODAL_PROPS } from "../config/modals";
import AnnotationTypeIcon from "./AnnotationTypeIcon.vue";
import { useAppStore } from "../store/app";
import NodeDeleteModal from "./NodeDeleteModal.vue";
import TieredMenu from "primevue/tieredmenu";
import ConfirmPopup from "primevue/confirmpopup";
import { useConfirm } from "primevue/useconfirm";
import { MenuItem } from "primevue/menuitem";
import { COLLECTION_ANNOTATION_VARIANT, COLLECTION_FIELD_STYLE, CollectionAnnotationVariant } from "../config/constants";
import AnnotationDetailsModal from "./AnnotationDetailsModal.vue";
import { useCreateAnnotation } from "../composables/useCreateAnnotation";
import TagAssignmentButton from "./TagAssignmentButton.vue";
import CollectionLabelInput from "./CollectionLabelInput.vue";
import RAMENNodeIcon from "./RAMENNodeIcon.vue";
import { resolveNodeIcon } from "../config/icons";
import CollectionAnnotationNote from "./CollectionAnnotationNote.vue";

const props = defineProps<{
  focus: CollectionFocus;
}>();

// Union types can't be written inline in the template, since the linter reads `|` as a (deprecated) filter
type ArrayPropertyValue = unknown[] | null;

const { addToastMessage, createModalInstance, destroyModalInstance } = useAppStore();

const dialog: ReturnType<typeof useDialog> = useDialog();
const confirm: ReturnType<typeof useConfirm> = useConfirm();
const pane = useTemplateRef<HTMLDivElement>("pane");

const {
  guidelines,
  annotationHasConstraints,
  getCollectionAnnotationFields,
  getCollectionAnnotationConfig,
  getCollectionConfigFields,
  getAllCollectionConfigFields,
  getAvailableCollectionAnnotationConfigs,
} = useGuidelinesStore();
const { levels, path, findEntryInHierarchy, updatePath, setMode } = useHierarchyStore();

const { createCollectionAnnotation: createAnnotation } = useCreateAnnotation("Collection");

const { status: saveStatus, lastError, pendingCount, enqueue, skip, clearFieldState, getFieldState } = useCollectionSave();

// Every property is always editable and saved on its own: `temporaryWorkData` holds what is shown in the inputs,
// `initialTemporaryWorkData` what is in the database
const temporaryWorkData = ref<CollectionFocus>(cloneDeep(props.focus));
const initialTemporaryWorkData = ref<CollectionFocus>(cloneDeep(props.focus));

// Values that are queued for saving but not saved yet, per saved state. Changes are compared against them, so a value
// changed back while a save is still queued is not mistaken for "unchanged"
const queuedValues = new WeakMap<CollectionFocus, Record<string, unknown>>();

// Annotations are saved directly and are not part of the Collection draft (`temporaryWorkData`)
const annotations = ref<Annotation[]>(cloneDeep(props.focus.annotations));

const annotationOperationRunning = ref<boolean>(false);

/** Wording of the annotation modal's submit button, since it saves directly instead of applying to a draft. */
const ANNOTATION_SUBMIT_BUTTON = { label: "Save", title: "Save annotation" } as const;

/** Layout of the annotations container, per display variant. */
const ANNOTATION_PANE_CLASSES: Record<CollectionAnnotationVariant, string> = {
  chip: "flex flex-wrap items-center",
  popover: "flex flex-wrap items-center",
  list: "flex flex-col",
  card: "annotation-card-grid",
};

const collectionFields: ComputedRef<PropertyConfig[]> = computed(() => {
  return guidelines.value
    ? getCollectionConfigFields(temporaryWorkData.value.collection.node.nodeLabels).filter((field) => field.visible)
    : [];
});

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
        ? getCollectionAnnotationFields(temporaryWorkData.value.collection.node.nodeLabels, type.type).find(
            (field) => field.name === "subType",
          )?.options ?? []
        : [];

      if (subTypeOptions.length === 0) {
        return {
          label: type.type,
          annotationConfig: type,
          command: () => handleAnnotationButtonClick({ type: type.type }),
        };
      }

      return {
        label: type.type,
        annotationConfig: type,
        items: subTypeOptions.map((option: string | number) => ({
          label: option.toString(),
          annotationConfig: type,
          command: () => handleAnnotationButtonClick({ type: type.type, subType: option }),
        })),
      };
    });
});

/**
 * Opens the annotation type menu. If there is only a single type without subtypes, the menu is skipped.
 *
 * @param {Event} event - The click event, used to anchor the menu.
 * @returns {void} This function does not return any value.
 */
function handleAddAnnotationClick(event: Event): void {
  const items: MenuItem[] = annotationMenuItems.value;

  if (items.length === 1 && !items[0].items) {
    items[0].command?.({ originalEvent: event, item: items[0] });
  } else {
    annotationMenu.value?.toggle(event);
  }
}

enrichCollectionData();

watch(
  () => props.focus.collection.node.data.uuid,
  () => {
    // Runs before the DOM switches, so a field that is still being edited is saved to the previous Collection
    commitActiveField();

    temporaryWorkData.value = cloneDeep(props.focus);
    initialTemporaryWorkData.value = cloneDeep(props.focus);
    annotations.value = cloneDeep(props.focus.annotations);

    enrichCollectionData();
  },
);

onBeforeUnmount(commitActiveField);

/**
 * Blurs the focused element if it's inside the pane, which saves it via the regular focusout/blur handlers.
 *
 * @returns {void} This function does not return any value.
 */
function commitActiveField(): void {
  const active: Element | null = document.activeElement;

  if (active instanceof HTMLElement && pane.value?.contains(active)) {
    active.blur();
  }
}

/**
 * Compares two property values. A missing value and `null` are the same, arrays are compared including their order.
 *
 * @param {unknown} a - The first value.
 * @param {unknown} b - The second value.
 * @returns {boolean} Whether both values are the same.
 */
function isSameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Returns the value a property will have in the database once all queued saves are done.
 *
 * @param {CollectionFocus} saved - The saved state of the Collection.
 * @param {string} name - The property name.
 * @returns {unknown} The saved or queued value.
 */
function getBaselineValue(saved: CollectionFocus, name: string): unknown {
  const queued: Record<string, unknown> | undefined = queuedValues.get(saved);

  return queued && name in queued ? queued[name] : saved.collection.node.data[name];
}

/**
 * Builds the request for a single property change: the saved Collection data plus the changed value, pruned to the
 * configured properties. Is called when the save starts, so it includes the results of earlier saves.
 *
 * @param {CollectionFocus} saved - The saved state of the Collection.
 * @param {string} name - The property name.
 * @param {unknown} value - The new value.
 * @returns {NodeStatusObject} The request payload.
 */
function buildPropertyPayload(saved: CollectionFocus, name: string, value: unknown): NodeStatusObject {
  const node: CollectionNode = saved.collection.node;
  const data: CollectionNode["data"] = { ...cloneDeep(node.data), [name]: value };

  pruneUnconfiguredProperties(data, getCollectionConfigFields(node.nodeLabels), ["uuid"]);

  return { node: { ...node, data }, meta: { status: "modified" }, connectedNodes: [] };
}

/**
 * Saves a single property if it changed and is valid. Invalid values are not sent, but marked at the field.
 *
 * @param {string} name - The property name.
 * @param {(value: unknown) => string | null} validate - Returns a message if the value is invalid.
 * @returns {void} This function does not return any value.
 */
function commitProperty(name: string, validate: (value: unknown) => string | null): void {
  const saved: CollectionFocus = initialTemporaryWorkData.value;
  const collectionUuid: string = saved.collection.node.data.uuid;
  const meta: SaveJobMeta = { kind: "field", target: name, collectionUuid };
  const value: unknown = cloneDeep(temporaryWorkData.value.collection.node.data[name]);

  if (isSameValue(value, getBaselineValue(saved, name))) {
    skip(meta, "unchanged");

    return;
  }

  const invalidMessage: string | null = validate(value);

  if (invalidMessage) {
    skip(meta, "invalid", invalidMessage);

    return;
  }

  const queued: Record<string, unknown> = queuedValues.get(saved) ?? {};
  const pathIndex: number = path.value.length - 1;

  queued[name] = value;
  queuedValues.set(saved, queued);

  void enqueue({
    ...meta,
    buildPayload: () => buildPropertyPayload(saved, name, value),
    onSuccess: (result: NodeDto<CollectionNode>) => {
      saved.collection.node.data[name] = value;
      transferDataToListItem(collectionUuid, pathIndex, result);
    },
  }).finally(() => {
    // Only drop it if no newer value was queued in the meantime
    if (queued[name] === value) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- Safe to delete
      delete queued[name];
    }
  });
}

/**
 * Validates a property value against its config and the native constraints of its inputs (min/max, lengths).
 *
 * @param {PropertyConfig} field - The property config.
 * @param {unknown} value - The value to check.
 * @param {HTMLElement | null} row - The table row with the inputs of the property.
 * @returns {string | null} The validation message, or `null` if the value is valid.
 */
function validateField(field: PropertyConfig, value: unknown, row: HTMLElement | null): string | null {
  if (isRequiredValueMissing(value, field)) {
    return "A value is required.";
  }

  const invalidInput: HTMLInputElement | null | undefined = row?.querySelector<HTMLInputElement>("input:invalid");

  return invalidInput ? invalidInput.validationMessage : null;
}

function validateLabel(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? null : "The name must not be empty.";
}

/**
 * Whether a property is saved as soon as its value changes (instead of when its field is left), since its value is
 * picked, not typed.
 *
 * @param {PropertyConfig} field - The property config.
 * @returns {boolean} Whether the property saves on change.
 */
function savesOnChange(field: PropertyConfig): boolean {
  return isBoolean(field) || (Boolean(field.options) && !isArray(field));
}

function commitField(field: PropertyConfig, row: HTMLElement | null): void {
  if (!field.editable) {
    return;
  }

  commitProperty(field.name, (value) => validateField(field, value, row));
}

function handleFieldInput(field: PropertyConfig, value: unknown): void {
  temporaryWorkData.value.collection.node.data[field.name] = value;

  // Picked values have no native constraints to check, so no row is needed for validation
  if (savesOnChange(field)) {
    commitField(field, null);
  }
}

/**
 * Returns the save state of a property of the shown Collection, for the indicator next to it.
 *
 * @param {string} name - The property name.
 * @returns {FieldSaveState | undefined} The state, or `undefined` if there is nothing to show.
 */
function getShownFieldState(name: string): FieldSaveState | undefined {
  return getFieldState(temporaryWorkData.value.collection.node.data.uuid, name);
}

function getFieldStatusIcon(state: FieldSaveState | undefined): string {
  if (state?.state === "saving") {
    return "icon-loader-circle animate-spin";
  } else if (state?.state === "error") {
    return "icon-alert-circle";
  }

  return "";
}

/**
 * Saves the property once the focus leaves its row. Moving between the inputs of a multi-value property does not
 * count, so half-finished lists are not saved.
 *
 * @param {PropertyConfig} field - The property config.
 * @param {FocusEvent} event - The focusout event of the row.
 * @returns {void} This function does not return any value.
 */
function handleFieldFocusOut(field: PropertyConfig, event: FocusEvent): void {
  const row: HTMLElement = event.currentTarget as HTMLElement;

  if (event.relatedTarget instanceof Node && row.contains(event.relatedTarget)) {
    return;
  }

  commitField(field, row);
}

function handleFieldEnter(event: KeyboardEvent): void {
  if (event.target instanceof HTMLInputElement && event.target.type !== "checkbox") {
    event.target.blur();
  }
}

/**
 * Restores the saved (or queued) value of a property and leaves the field.
 *
 * @param {string} name - The property name.
 * @returns {void} This function does not return any value.
 */
function revertProperty(name: string): void {
  const saved: CollectionFocus = initialTemporaryWorkData.value;

  temporaryWorkData.value.collection.node.data[name] = cloneDeep(getBaselineValue(saved, name) ?? null);
  clearFieldState({ kind: "field", target: name, collectionUuid: saved.collection.node.data.uuid });
}

function handleFieldEscape(field: PropertyConfig, event: KeyboardEvent): void {
  revertProperty(field.name);
  (event.target as HTMLElement).blur();
}

function findAnnotationByUuid(uuid: string): Annotation | undefined {
  const found: Annotation | undefined = annotations.value.find((a) => a.node.data.uuid === uuid);

  if (!found) {
    console.error(`Annotation with UUID ${uuid} not found in existing annotations.`);

    return;
  }

  return found;
}

/**
 * Removes annotation properties that are not configured for the annotation type on this Collection, in place.
 *
 * @param {Annotation} annotation - The annotation to prune. Is mutated in place.
 * @param {string[]} nodeLabels - The node labels of the Collection.
 * @returns {void} This function does not return any value.
 */
function pruneAnnotationData(annotation: Annotation, nodeLabels: string[]): void {
  const type: string = annotation.node.data.type;

  if (!getCollectionAnnotationConfig(nodeLabels, type) && !PRUNE_UNCONFIGURED_ANNOTATION_TYPES) {
    return;
  }

  pruneUnconfiguredProperties(annotation.node.data, getCollectionAnnotationFields(nodeLabels, type), INTRINSIC_ANNOTATION_PROPERTIES);
}

/**
 * Saves a single annotation change (create, update or delete, depending on its status) directly, through the same
 * queue as the properties. The Collection node itself is sent as "unchanged", so it is not touched.
 *
 * @param {Annotation} annotation - The annotation to save. Its status decides the operation.
 * @returns {Promise<boolean>} Whether the annotation was saved.
 */
async function persistAnnotation(annotation: Annotation): Promise<boolean> {
  const saved: CollectionFocus = initialTemporaryWorkData.value;

  pruneAnnotationData(annotation, saved.collection.node.nodeLabels);

  annotationOperationRunning.value = true;

  const success: boolean = await enqueue({
    kind: "annotation",
    target: annotation.node.data.uuid,
    collectionUuid: saved.collection.node.data.uuid,
    buildPayload: () => ({ node: saved.collection.node, meta: { status: "unchanged" }, connectedNodes: [annotation] }),
    onSuccess: () => {
      // The pane might show another Collection by now
      if (initialTemporaryWorkData.value === saved) {
        applyPersistedAnnotation(annotation);
      }
    },
  });

  annotationOperationRunning.value = false;

  return success;
}

/**
 * Deletes the annotation directly, without confirmation.
 *
 * @param {string} uuid - UUID of the annotation in `annotations`.
 * @returns {void} This function does not return any value.
 */
function deleteAnnotation(uuid: string): void {
  const annotation: Annotation | undefined = findAnnotationByUuid(uuid);

  if (!annotation) {
    return;
  }

  const deleted: Annotation = cloneDeep(annotation);

  deleted.meta.status = "deleted";
  void persistAnnotation(deleted);
}

/**
 * Brings the local annotation list in sync with the database after an annotation was saved.
 *
 * @param {Annotation} annotation - The annotation that was saved.
 * @returns {void} This function does not return any value.
 */
function applyPersistedAnnotation(annotation: Annotation): void {
  const uuid: string = annotation.node.data.uuid;

  if (annotation.meta.status === "deleted") {
    annotations.value = annotations.value.filter((a) => a.node.data.uuid !== uuid);

    return;
  }

  pruneDeletedNodes(annotation);
  setNodeTreeStatus(annotation, "unchanged");

  const index: number = annotations.value.findIndex((a) => a.node.data.uuid === uuid);

  if (index === -1) {
    annotations.value.push(annotation);
  } else {
    annotations.value[index] = annotation;
  }
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
      temporaryWorkData.value.collection.node.data[field.name] = field?.required ? getDefaultValueForProperty(field) : null;
    }
  });
}

function handleAnnotationButtonClick(data: { type: string; subType?: string | number }): void {
  const nodeLabels: string[] = temporaryWorkData.value.collection.node.nodeLabels;
  const newAnnotation: Annotation = createAnnotation({ ...data, nodeLabels });
  const config: AnnotationType | undefined = getCollectionAnnotationConfig(nodeLabels, data.type);

  if (!config) {
    console.error(`No annotation config found for type "${data.type}" on Collection with labels ${nodeLabels.join(", ")}`);
    return;
  }

  // TODO: Remove "|| true" once annotationHasConstraints() covers Collection annotations
  // eslint-disable-next-line no-constant-condition -- Safe to delete
  if (annotationHasConstraints(config) || true) {
    openAnnotationCreateModal(newAnnotation, config, getCollectionAnnotationFields(nodeLabels, data.type));
  } else {
    void persistAnnotation(newAnnotation);
  }
}

/**
 * Opens the {@linkcode AnnotationDetailsModal} for a new Collection annotation. Saves it on submit only.
 *
 * @param {Annotation} annotation - The annotation template to fill in.
 * @param {AnnotationType} config - The Collection-scoped annotation config.
 * @param {PropertyConfig[]} propertyFields - The Collection-scoped property fields.
 * @returns {void} This function does not return any value.
 */
function openAnnotationCreateModal(annotation: Annotation, config: AnnotationType, propertyFields: PropertyConfig[]): void {
  createModalInstance(
    dialog.open(AnnotationDetailsModal, {
      props: {
        ...ANNOTATION_MODAL_PROPS,
        header: `Add new ${annotation.node.data.subType ?? annotation.node.data.type} annotation`,
      },
      data: {
        annotation,
        config,
        propertyFields,
        mode: "create",
        submitButton: ANNOTATION_SUBMIT_BUTTON,
        submitHandler: persistAnnotation,
      },
      onClose: destroyModalInstance,
    }),
  );
}

/**
 * Asks for confirmation and deletes the annotation directly, since this can't be undone with "Cancel".
 *
 * @param {string} uuid - UUID of the annotation in `annotations`.
 * @param {Event} event - The click event, used to anchor the confirmation popup.
 * @returns {void} This function does not return any value.
 */
function handleRemoveAnnotation(uuid: string, event: Event): void {
  const annotation: Annotation | undefined = findAnnotationByUuid(uuid);

  if (!annotation) {
    return;
  }

  confirm.require({
    group: "annotation-remove",
    target: event.currentTarget as HTMLElement,
    message: `Remove this ${annotation.node.data.subType ?? annotation.node.data.type} annotation?`,
    rejectProps: { label: "Cancel", severity: "secondary", outlined: true, size: "small" },
    acceptProps: { label: "Remove", severity: "danger", size: "small" },
    accept: () => deleteAnnotation(uuid),
  });
}

/**
 * Opens the {@linkcode AnnotationDetailsModal} for a Collection annotation and saves it on submit.
 *
 * @param {string} uuid - UUID of the annotation in `annotations`.
 * @returns {void} This function does not return any value.
 */
function handleEditAnnotation(uuid: string): void {
  const annotation: Annotation | undefined = findAnnotationByUuid(uuid);

  if (!annotation) {
    return;
  }

  const nodeLabels: string[] = temporaryWorkData.value.collection.node.nodeLabels;

  const config: AnnotationType | undefined = getCollectionAnnotationConfig(nodeLabels, annotation.node.data.type);

  if (!config) {
    addToastMessage({
      severity: "warn",
      summary: "Annotation type not configured",
      detail: `"${annotation.node.data.type}" annotations can't be edited, since the type is not configured for this Collection.`,
    });
    return;
  }

  const propertyFields: PropertyConfig[] = getCollectionAnnotationFields(nodeLabels, annotation.node.data.type);

  createModalInstance(
    dialog.open(AnnotationDetailsModal, {
      props: {
        ...ANNOTATION_MODAL_PROPS,
        header: `Edit ${annotation.node.data.type} annotation`,
      },
      data: {
        annotation,
        config,
        propertyFields,
        mode: "edit",
        submitButton: ANNOTATION_SUBMIT_BUTTON,
        submitHandler: persistAnnotation,
      },
      onClose: destroyModalInstance,
    }),
  );
}

function transferDataToListItem(uuid: string, index: number, data: NodeDto<CollectionNode>): void {
  const entry: HierarchyEntry | null = findEntryInHierarchy(uuid, index);

  if (entry) {
    entry.data.node.data = data.node.data;
    entry.data.node.nodeLabels = data.node.nodeLabels;
  }
}

function handleDeleteColletion(): void {
  createModalInstance(
    dialog.open(NodeDeleteModal, {
      props: {
        ...BASE_MODAL_PROPS,
        showHeader: false,
        style: { width: "25rem" },
      },
      data: {
        action: "delete",
        node: temporaryWorkData.value.collection.node,
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
  <div ref="pane" class="edit-pane-container h-full flex flex-col items-center p-2">
    <div class="main grow flex flex-col gap-1 w-full">
      <div class="buttons flex justify-between items-center gap-1">
        <div class="buttons-start flex justify-start gap-1">
          <TagAssignmentButton :node-uuid="temporaryWorkData.collection.node.data.uuid" />
        </div>
        <div class="save-status" :class="`is-${saveStatus}`" role="status" aria-live="polite">
          <template v-if="saveStatus === 'saving'">
            <span class="icon-loader-circle animate-spin" aria-hidden="true"></span>
            <span>Saving…</span>
          </template>
          <template v-else-if="saveStatus === 'saved'">
            <span class="icon-check" aria-hidden="true"></span>
            <span>Saved</span>
          </template>
          <template v-else-if="saveStatus === 'error'">
            <span v-tooltip.bottom="lastError" class="icon-alert-circle" aria-hidden="true"></span>
            <span v-tooltip.bottom="lastError">Not saved</span>
          </template>
        </div>
        <div class="buttons-end flex justify-end gap-1">
          <Button
            as="a"
            :href="`/api/tools/shoyu/collections/${temporaryWorkData.collection.node.data.uuid}`"
            target="_blank"
            rel="noopener"
            severity="secondary"
            icon="icon-external-link"
            size="small"
            title="View collection on website"
          />
        </div>
      </div>

      <div class="label-section">
        <h3 class="label-heading" aria-label="Collection label">
          <RAMENNodeIcon
            v-tooltip.hover.top="{
              value: filterBaseNodeLabels(temporaryWorkData.collection.node.nodeLabels).join(', '),
              showDelay: 50,
            }"
            :spec="resolveNodeIcon(temporaryWorkData.collection.node.nodeLabels)"
            :size="30"
          />
          <CollectionLabelInput
            v-model:label="temporaryWorkData.collection.node.data.label"
            :subtle="COLLECTION_FIELD_STYLE !== 'outlined'"
            @commit="commitProperty('label', validateLabel)"
            @revert="revertProperty('label')"
          />
          <span
            v-if="getShownFieldState('label')"
            v-tooltip.bottom="getShownFieldState('label')?.message"
            class="field-status"
            :class="[`is-${getShownFieldState('label')?.state}`, getFieldStatusIcon(getShownFieldState('label'))]"
          ></span>
        </h3>
      </div>
      <div class="content">
        <div class="annotations-pane gap-1 mb-6" :class="ANNOTATION_PANE_CLASSES[COLLECTION_ANNOTATION_VARIANT]">
          <CollectionAnnotationNote
            v-for="(annotation, index) in annotations"
            :key="annotation.node.data.uuid"
            v-model="annotations[index]"
            :variant="COLLECTION_ANNOTATION_VARIANT"
            :collection-node-labels="temporaryWorkData.collection.node.nodeLabels"
            :disabled="annotationOperationRunning"
            @edit="handleEditAnnotation(annotation.node.data.uuid)"
            @remove="handleRemoveAnnotation(annotation.node.data.uuid, $event)"
            @remove-confirmed="deleteAnnotation(annotation.node.data.uuid)"
          />
          <div v-if="availabeAnnotationTypes.length > 0" class="annotation-button-pane">
            <Button
              class="add-annotation-button"
              :class="{ 'w-full h-full': COLLECTION_ANNOTATION_VARIANT === 'list' || COLLECTION_ANNOTATION_VARIANT === 'card' }"
              icon="icon-plus"
              label="Add annotation"
              severity="secondary"
              variant="outlined"
              size="small"
              aria-haspopup="true"
              :loading="annotationOperationRunning"
              @click="handleAddAnnotationClick($event)"
            />
            <TieredMenu ref="annotation-menu" :model="annotationMenuItems" popup>
              <template #item="{ item, props: itemProps, hasSubmenu }">
                <a class="annotation-menu-item flex items-center gap-2" v-bind="itemProps.action">
                  <span class="annotation-menu-icon">
                    <AnnotationTypeIcon :config="item.annotationConfig" />
                  </span>
                  <span>{{ item.label }}</span>
                  <i v-if="hasSubmenu" class="icon-chevron-right ml-auto"></i>
                </a>
              </template>
            </TieredMenu>
          </div>
          <ConfirmPopup group="annotation-remove" />
        </div>
        <div class="properties-pane">
          <table v-if="collectionFields.length > 0" class="properties-table" :class="`fields-${COLLECTION_FIELD_STYLE}`">
            <tr
              v-for="field in collectionFields"
              :key="field.name"
              class="properties-row"
              :class="{ 'is-multiline': isArray(field) }"
              @focusout="handleFieldFocusOut(field, $event)"
              @keydown.enter="handleFieldEnter"
              @keydown.escape="handleFieldEscape(field, $event)"
            >
              <td class="properties-label">
                <!-- eslint-disable-next-line vuejs-accessibility/label-has-for -- No id as component prop currently -->
                <label :for="field.name">{{ camelCaseToTitleCase(field.name) }}</label>
                <span
                  v-if="getShownFieldState(field.name)"
                  v-tooltip.top="getShownFieldState(field.name)?.message"
                  class="field-status"
                  :class="[`is-${getShownFieldState(field.name)?.state}`, getFieldStatusIcon(getShownFieldState(field.name))]"
                ></span>
              </td>
              <td class="properties-value">
                <DataInputGroup
                  v-if="isArray(field)"
                  :model-value="temporaryWorkData.collection.node.data[field.name] as ArrayPropertyValue"
                  :config="field"
                  mode="edit"
                  @update:model-value="(value) => handleFieldInput(field, value)"
                />
                <DataInputComponent
                  v-else
                  :model-value="temporaryWorkData.collection.node.data[field.name]"
                  :config="field"
                  mode="edit"
                  @update:model-value="(value) => handleFieldInput(field, value)"
                />
              </td>
            </tr>
          </table>
        </div>
      </div>
    </div>

    <div class="buttons flex justify-center gap-2 mt-2">
      <Button
        :disabled="pendingCount > 0"
        icon="icon-trash-2"
        title="Delete collection"
        severity="danger"
        @click="handleDeleteColletion"
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

.content {
  margin-top: 1rem;
  flex-grow: 1;
  overflow-y: auto;
  scrollbar-gutter: stable;
}

.save-status {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.save-status.is-saved {
  color: var(--p-green-600);
}

.save-status.is-error {
  color: var(--p-red-600);
  cursor: help;
}

.field-status {
  margin-left: 0.375rem;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.field-status.is-error {
  color: var(--p-red-600);
  cursor: help;
}

/* Field style "ghost": inputs read like text until hovered or focused */
.fields-ghost :deep(.p-inputtext),
.fields-ghost :deep(.p-select) {
  border-color: transparent;
  background: transparent;
  box-shadow: none;
}

.fields-ghost :deep(.p-inputtext:enabled:hover),
.fields-ghost :deep(.p-select:not(.p-disabled):hover) {
  background: var(--p-content-hover-background);
}

.fields-ghost :deep(.p-inputtext:enabled:focus),
.fields-ghost :deep(.p-select.p-focus) {
  border-color: var(--p-inputtext-focus-border-color);
  background: var(--p-inputtext-background);
}

.fields-ghost :deep(.p-inputnumber-button-group),
.fields-ghost :deep(.p-select-dropdown) {
  opacity: 0;
  transition: opacity 0.15s;
}

.fields-ghost .properties-row:hover :deep(.p-inputnumber-button-group),
.fields-ghost .properties-row:focus-within :deep(.p-inputnumber-button-group),
.fields-ghost .properties-row:hover :deep(.p-select-dropdown),
.fields-ghost .properties-row:focus-within :deep(.p-select-dropdown) {
  opacity: 1;
}

/* Field style "underline": only a bottom border */
.fields-underline :deep(.p-inputtext),
.fields-underline :deep(.p-select) {
  border-color: transparent;
  border-bottom-color: var(--p-inputtext-border-color);
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.fields-underline :deep(.p-inputtext:enabled:focus),
.fields-underline :deep(.p-select.p-focus) {
  border-bottom-color: var(--p-primary-color);
}

/* Missing required values stay visible in all styles */
.fields-ghost :deep(.p-invalid),
.fields-underline :deep(.p-invalid) {
  border-color: var(--p-inputtext-invalid-border-color);
}

.add-annotation-button {
  border-style: dashed;
}

.annotation-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
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
