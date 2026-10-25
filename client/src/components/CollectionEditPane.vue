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
} from "../models/types";
import {
  camelCaseToTitleCase,
  cloneDeep,
  getDefaultValueForProperty,
  isRequiredValueMissing,
  setNodeTreeStatus,
  pruneDeletedNodes,
} from "../utils/helper/helper";
import { isArray, isBoolean } from "../utils/helper/propertyTypeHelper";
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
import CreateCollectionAnnotationModal from "./CreateCollectionAnnotationModal.vue";
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

/** Save state of a single property, shown as an indicator at its field. */
interface FieldSaveState {
  state: "saving" | "error";
  /** Why the field could not be saved (validation or request error). */
  message?: string;
}

/** A save that takes longer than this is aborted. */
const SAVE_TIMEOUT_MS: number = 15_000;

const { api, addToastMessage, createModalInstance, destroyModalInstance } = useAppStore();

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

// `temporaryWorkData` holds what the inputs show, `initialTemporaryWorkData` what is saved
const temporaryWorkData = ref<CollectionFocus>(cloneDeep(props.focus));
const initialTemporaryWorkData = ref<CollectionFocus>(cloneDeep(props.focus));

/** Save state per property name of the shown Collection. Properties without a state are idle. */
const fieldStates = ref<Record<string, FieldSaveState>>({});

/** Number of property saves still running. */
const pendingSaves = ref<number>(0);

// Annotations are saved directly and are not part of the Collection draft (`temporaryWorkData`)
const annotations = ref<Annotation[]>(cloneDeep(props.focus.annotations));

// The annotation the removal confirmation is open for, and whether its deletion is running
const annotationPendingRemoval = ref<string | null>(null);
const removalRunning = ref<boolean>(false);

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
 * Opens the annotation type menu, or the modal directly if there is only one type without subtypes.
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
    fieldStates.value = {};

    enrichCollectionData();
  },
);

onBeforeUnmount(commitActiveField);

/**
 * Blurs the focused element inside the pane, which saves it via the focusout/blur handlers.
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
 * Compares two property values. `undefined` equals `null`, array order matters.
 *
 * @param {unknown} a - The first value.
 * @param {unknown} b - The second value.
 * @returns {boolean} Whether both values are the same.
 */
function isSameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Sets or clears the save state of a property, unless the pane shows another Collection by now.
 *
 * @param {CollectionFocus} saved - The saved state of the Collection the property belongs to.
 * @param {string} name - The property name.
 * @param {FieldSaveState | null} state - The new state, `null` to clear it.
 * @returns {void} This function does not return any value.
 */
function setFieldState(saved: CollectionFocus, name: string, state: FieldSaveState | null): void {
  if (initialTemporaryWorkData.value !== saved) {
    return;
  }

  if (state) {
    fieldStates.value[name] = state;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- Safe to delete
    delete fieldStates.value[name];
  }
}

/**
 * Returns a readable message for a failed request.
 *
 * @param {unknown} error - The caught error.
 * @returns {string} The message.
 */
function getErrorMessage(error: unknown): string {
  const err: Error = error as Error;

  if (err?.name === "TimeoutError") {
    return `No response after ${SAVE_TIMEOUT_MS / 1000} seconds.`;
  }

  return err?.message || "Unknown error";
}

/**
 * Saves a single property if it changed and is valid. Invalid values are marked at the field instead.
 * The value counts as saved right away and is rolled back if the request fails.
 *
 * @param {string} name - The property name.
 * @param {(value: unknown) => string | null} validate - Returns a message if the value is invalid.
 * @returns {Promise<void>} Resolves when the save is done.
 */
async function commitProperty(name: string, validate: (value: unknown) => string | null): Promise<void> {
  const saved: CollectionFocus = initialTemporaryWorkData.value;
  const collectionUuid: string = saved.collection.node.data.uuid;
  const value: unknown = cloneDeep(temporaryWorkData.value.collection.node.data[name]);
  const previous: unknown = saved.collection.node.data[name];

  if (isSameValue(value, previous)) {
    setFieldState(saved, name, null);

    return;
  }

  const invalidMessage: string | null = validate(value);

  if (invalidMessage) {
    setFieldState(saved, name, { state: "error", message: invalidMessage });

    return;
  }

  const pathIndex: number = path.value.length - 1;
  saved.collection.node.data[name] = value;
  setFieldState(saved, name, { state: "saving" });
  pendingSaves.value++;

  try {
    const result: NodeDto<CollectionNode> = await api.patchCollection(
      saved.collection.node,
      { [name]: value ?? null },
      AbortSignal.timeout(SAVE_TIMEOUT_MS),
    );

    transferDataToListItem(collectionUuid, pathIndex, result);

    // A newer value of the same property might be on its way already
    if (saved.collection.node.data[name] === value) {
      setFieldState(saved, name, null);
    }
  } catch (error: unknown) {
    const message: string = getErrorMessage(error);

    if (saved.collection.node.data[name] === value) {
      saved.collection.node.data[name] = previous;
    }

    setFieldState(saved, name, { state: "error", message });
    addToastMessage({ severity: "error", summary: "Not saved", detail: message, life: 4000 });
  } finally {
    pendingSaves.value--;
  }
}

/**
 * Validates a value against its config and the native constraints of its inputs.
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

/**
 * Validates the Collection label.
 *
 * @param {unknown} value - The label.
 * @returns {string | null} The validation message, or `null` if the label is valid.
 */
function validateLabel(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? null : "The name must not be empty.";
}

/**
 * Whether a property saves on change instead of on leaving the field, since its value is picked, not typed.
 *
 * @param {PropertyConfig} field - The property config.
 * @returns {boolean} Whether the property saves on change.
 */
function savesOnChange(field: PropertyConfig): boolean {
  return isBoolean(field) || (Boolean(field.options) && !isArray(field));
}

/**
 * Saves an editable property, validated against its config and the inputs in its row.
 *
 * @param {PropertyConfig} field - The property config.
 * @param {HTMLElement | null} row - The table row of the property, for the native input constraints.
 * @returns {void} This function does not return any value.
 */
function commitField(field: PropertyConfig, row: HTMLElement | null): void {
  if (!field.editable) {
    return;
  }

  void commitProperty(field.name, (value) => validateField(field, value, row));
}

/**
 * Writes an input value to the draft and saves it right away if the property saves on change.
 *
 * @param {PropertyConfig} field - The property config.
 * @param {unknown} value - The new value.
 * @returns {void} This function does not return any value.
 */
function handleFieldInput(field: PropertyConfig, value: unknown): void {
  temporaryWorkData.value.collection.node.data[field.name] = value;

  // Picked values have no native constraints to check, so no row is needed for validation
  if (savesOnChange(field)) {
    commitField(field, null);
  }
}

/**
 * Returns the icon classes for a field's save state.
 *
 * @param {FieldSaveState | undefined} state - The save state.
 * @returns {string} The icon classes, empty if there is no state.
 */
function getFieldStatusIcon(state: FieldSaveState | undefined): string {
  if (state?.state === "saving") {
    return "icon-loader-circle animate-spin";
  } else if (state?.state === "error") {
    return "icon-alert-circle";
  }

  return "";
}

/**
 * Saves the property once the focus leaves its row (not when moving between the inputs of a multi-value property).
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

/**
 * Leaves a text or number input on Enter, which saves it.
 *
 * @param {KeyboardEvent} event - The keydown event of the row.
 * @returns {void} This function does not return any value.
 */
function handleFieldEnter(event: KeyboardEvent): void {
  if (event.target instanceof HTMLInputElement && event.target.type !== "checkbox") {
    event.target.blur();
  }
}

/**
 * Restores the saved value of a property and clears its error.
 *
 * @param {string} name - The property name.
 * @returns {void} This function does not return any value.
 */
function revertProperty(name: string): void {
  const saved: CollectionFocus = initialTemporaryWorkData.value;

  temporaryWorkData.value.collection.node.data[name] = cloneDeep(saved.collection.node.data[name] ?? null);
  setFieldState(saved, name, null);
}

/**
 * Restores the saved value on Escape and leaves the field.
 *
 * @param {PropertyConfig} field - The property config.
 * @param {KeyboardEvent} event - The keydown event of the row.
 * @returns {void} This function does not return any value.
 */
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
 * Saves an annotation without a modal (create or delete by its status) and updates the pane on success.
 *
 * @param {Annotation} annotation - The annotation to save.
 * @returns {Promise<boolean>} Whether the annotation was saved.
 */
async function saveAnnotation(annotation: Annotation): Promise<boolean> {
  try {
    await api.updateCollectionAnnotation(initialTemporaryWorkData.value.collection.node, annotation);

    applyPersistedAnnotation(annotation);

    return true;
  } catch (error: unknown) {
    addToastMessage({ severity: "error", summary: "Not saved", detail: (error as Error).message, life: 4000 });

    return false;
  }
}

/**
 * Applies a saved annotation to the local list.
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
    openAnnotationModal(newAnnotation, config, "create", `Add new ${data.subType ?? data.type} annotation`);
  } else {
    void saveAnnotation(newAnnotation);
  }
}

/**
 * Opens the {@linkcode CreateCollectionAnnotationModal}, which saves the annotation itself.
 *
 * @param {Annotation} annotation - The annotation to edit, or the template of a new one.
 * @param {AnnotationType} config - The Collection-scoped annotation config.
 * @param {"create" | "edit"} mode - Whether the annotation is new.
 * @param {string} header - The modal header.
 * @returns {void} This function does not return any value.
 */
function openAnnotationModal(annotation: Annotation, config: AnnotationType, mode: "create" | "edit", header: string): void {
  createModalInstance(
    dialog.open(CreateCollectionAnnotationModal, {
      props: { ...ANNOTATION_MODAL_PROPS, header },
      data: { collection: initialTemporaryWorkData.value.collection.node, annotation, config, mode },
      emits: { onSaved: applyPersistedAnnotation },
      onClose: destroyModalInstance,
    }),
  );
}

/**
 * Opens the removal confirmation next to the annotation.
 *
 * @param {string} uuid - UUID of the annotation in `annotations`.
 * @param {Event} event - The click event, used to anchor the confirmation popup.
 * @returns {void} This function does not return any value.
 */
function handleRemoveAnnotation(uuid: string, event: Event): void {
  const annotation: Annotation | undefined = findAnnotationByUuid(uuid);

  // Don't switch to another annotation while a deletion is running
  if (!annotation || removalRunning.value) {
    return;
  }

  annotationPendingRemoval.value = uuid;

  confirm.require({
    group: "annotation-remove",
    target: event.currentTarget as HTMLElement,
    message: `Remove this “${annotation.node.data.subType ?? annotation.node.data.type}” annotation?`,
  });
}

/**
 * Deletes the annotation of the open confirmation and closes the popup on success.
 *
 * @param {() => void} closePopup - Closes the confirmation popup.
 * @returns {Promise<void>} Resolves when the deletion is done.
 */
async function handleConfirmRemoval(closePopup: () => void): Promise<void> {
  const uuid: string | null = annotationPendingRemoval.value;
  const annotation: Annotation | undefined = uuid ? findAnnotationByUuid(uuid) : undefined;

  if (!annotation || removalRunning.value) {
    return;
  }

  const deleted: Annotation = cloneDeep(annotation);

  deleted.meta.status = "deleted";
  removalRunning.value = true;

  try {
    if (await saveAnnotation(deleted)) {
      annotationPendingRemoval.value = null;
      closePopup();
    }
  } finally {
    removalRunning.value = false;
  }
}

/**
 * Opens the {@linkcode CreateCollectionAnnotationModal} for an existing annotation.
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

  openAnnotationModal(annotation, config, "edit", `Edit ${annotation.node.data.type} annotation`);
}

function transferDataToListItem(uuid: string, index: number, data: NodeDto<CollectionNode>): void {
  const entry: HierarchyEntry | null = findEntryInHierarchy(uuid, index);

  if (entry) {
    entry.data.node.data = data.node.data;
    entry.data.node.nodeLabels = data.node.nodeLabels;
  }
}

function handleDeleteColletion(): void {
  if (pendingSaves.value > 0) {
    return;
  }

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
  addToastMessage({ severity: "success", summary: "Deleted", life: 2000 });
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
</script>

<template>
  <div ref="pane" class="edit-pane-container h-full flex flex-col items-center p-2">
    <div class="main grow flex flex-col gap-1 w-full">
      <div class="buttons flex justify-between items-center gap-1">
        <div class="buttons-start flex justify-start gap-1">
          <TagAssignmentButton :node-uuid="temporaryWorkData.collection.node.data.uuid" />
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
        <h3 class="label-heading">
          <span class="sr-only">{{ temporaryWorkData.collection.node.data.label }}</span>
          <RAMENNodeIcon
            v-tooltip.hover.top="{
              value: filterBaseNodeLabels(temporaryWorkData.collection.node.nodeLabels).join(', '),
              showDelay: 50,
            }"
            :spec="resolveNodeIcon(temporaryWorkData.collection.node.nodeLabels)"
            :size="30"
          />
          <span class="label-input-wrapper">
            <CollectionLabelInput
              v-model:label="temporaryWorkData.collection.node.data.label"
              subtle
              @commit="commitProperty('label', validateLabel)"
              @revert="revertProperty('label')"
            />
            <span
              v-if="fieldStates.label"
              v-tooltip.bottom="fieldStates.label.message"
              class="field-status label-status"
              :class="[`is-${fieldStates.label.state}`, getFieldStatusIcon(fieldStates.label)]"
            ></span>
          </span>
        </h3>
      </div>
      <div class="content">
        <div class="annotations-pane flex flex-wrap items-center gap-1 mb-6">
          <CollectionAnnotationNote
            v-for="(annotation, index) in annotations"
            :key="annotation.node.data.uuid"
            v-model="annotations[index]"
            :collection-node-labels="temporaryWorkData.collection.node.nodeLabels"
            :disabled="removalRunning && annotationPendingRemoval === annotation.node.data.uuid"
            @edit="handleEditAnnotation(annotation.node.data.uuid)"
            @remove="handleRemoveAnnotation(annotation.node.data.uuid, $event)"
          />
          <div v-if="availabeAnnotationTypes.length > 0" class="annotation-button-pane">
            <Button
              class="add-annotation-button"
              icon="icon-plus"
              label="Add annotation"
              severity="secondary"
              variant="outlined"
              size="small"
              aria-haspopup="true"
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
          <ConfirmPopup group="annotation-remove">
            <template #container="{ message, acceptCallback }">
              <div class="remove-confirmation">
                <span>{{ message.message }}</span>
                <Button
                  icon="icon-trash-2"
                  label="Remove"
                  severity="danger"
                  size="small"
                  :loading="removalRunning"
                  :disabled="removalRunning"
                  @click="handleConfirmRemoval(acceptCallback)"
                />
              </div>
            </template>
          </ConfirmPopup>
        </div>
        <div class="properties-pane">
          <table v-if="collectionFields.length > 0" class="properties-table">
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
              </td>
              <td class="properties-value value-with-status">
                <span
                  v-if="fieldStates[field.name]"
                  v-tooltip.top="fieldStates[field.name].message"
                  class="field-status input-status"
                  :class="[`is-${fieldStates[field.name].state}`, getFieldStatusIcon(fieldStates[field.name])]"
                ></span>
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
      <Button icon="icon-trash-2" title="Delete collection" severity="danger" @click="handleDeleteColletion"></Button>
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

.field-status {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.value-with-status {
  position: relative;
}

.input-status {
  position: absolute;
  top: 50%;
  right: 0.5rem;
  z-index: 1;
  height: 1em;
  margin-top: -0.5em;
  line-height: 1;
  pointer-events: none;
}

.input-status.is-error {
  pointer-events: auto;
}

.properties-row.is-multiline .input-status {
  top: calc(var(--properties-cell-padding-y) + 1rem);
  right: 2.25rem;
}

.value-with-status :deep(.p-inputtext) {
  padding-right: 1.75rem;
}

.label-input-wrapper {
  position: relative;
}

.label-status {
  position: absolute;
  top: 50%;
  left: 100%;
  height: 1em;
  margin-top: -0.5em;
  margin-left: 0.375rem;
  line-height: 1;
}

.field-status.is-error {
  color: var(--p-red-600);
  cursor: help;
}

.properties-table :deep(.p-inputtext),
.properties-table :deep(.p-select) {
  border-color: transparent;
  background: transparent;
  box-shadow: none;
}

.properties-table :deep(.p-inputtext:enabled:hover),
.properties-table :deep(.p-select:not(.p-disabled):hover) {
  background: var(--p-content-hover-background);
}

.properties-table :deep(.p-inputtext:enabled:focus),
.properties-table :deep(.p-select.p-focus) {
  border-color: var(--p-inputtext-focus-border-color);
  background: var(--p-inputtext-background);
}

.properties-table :deep(.p-inputnumber-button-group),
.properties-table :deep(.p-select-dropdown) {
  opacity: 0;
  transition: opacity 0.15s;
}

.properties-row:hover :deep(.p-inputnumber-button-group),
.properties-row:focus-within :deep(.p-inputnumber-button-group),
.properties-row:hover :deep(.p-select-dropdown),
.properties-row:focus-within :deep(.p-select-dropdown) {
  opacity: 1;
}

.properties-table :deep(.p-invalid) {
  border-color: var(--p-inputtext-invalid-border-color);
}

.add-annotation-button {
  border-style: dashed;
}

.remove-confirmation {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
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
