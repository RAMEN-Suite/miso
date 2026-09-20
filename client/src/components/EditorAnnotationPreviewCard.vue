<script setup lang="ts">
import { computed, ref } from "vue";
import { useEditorStore } from "../store/editor.ts";
import { useGuidelinesStore } from "../store/guidelines.ts";
import Button from "primevue/button";
import ConfirmPopup from "primevue/confirmpopup";
import { useDialog } from "primevue/usedialog";
import { ANNOTATION_MODAL_PROPS } from "../config/modals";
import { Annotation, AnnotationNode, AnnotationType, NodeStatusObject, PropertyConfig } from "../models/types.ts";
import AnnotationTypeIcon from "./AnnotationTypeIcon.vue";
import NodePropertiesTable from "./NodePropertiesTable.vue";
import AnnotationEditModal from "./AnnotationEditModal.vue";
import { useTiptapStore } from "../store/tiptap.ts";
import AnnotationReferencesSection from "./AnnotationReferencesSection.vue";
import { cloneDeep } from "../utils/helper/helper.ts";
import { Range } from "../models/types.ts";
import { findDecorationBoundariesByUuid, findNodeBoundariesByUuid } from "../utils/helper/tiptapHelper.ts";
import { DecorationSet } from "@tiptap/pm/view";
import { ANNOTATION_DECORATION_KEY } from "../editors/text/extensions/annotationDecoration.ts";
import { useAppStore } from "../store/app.ts";

const props = defineProps<{
  annotation: NodeStatusObject<AnnotationNode>;
}>();

const dialog = useDialog();

const { createModalInstance, destroyModalInstance } = useAppStore();
const { tiptap, annotations, initialAnnotations } = useTiptapStore();

/** Last saved state of the annotation. `undefined` if the annotation was not saved yet. */
const initialData = computed<NodeStatusObject<AnnotationNode> | undefined>(() =>
  initialAnnotations.value?.get(props.annotation.node.data.uuid),
);

/** Current state of the annotation. Falls back to the prop in case the entry was removed from the store. */
const currentData = computed<NodeStatusObject<AnnotationNode>>(
  () => annotations.value?.get(props.annotation.node.data.uuid) ?? props.annotation,
);

const { isRedrawMode, redrawMode } = useEditorStore();
const { getAnnotationConfig, getAnnotationFields, getAnnotationBehaviour } = useGuidelinesStore();

const config: AnnotationType = getAnnotationConfig(currentData.value.node.data.type);
// TODO: Maybe give whole config instead of only fields...?
const propertyFields: PropertyConfig[] = getAnnotationFields(currentData.value.node.data.type);

const isCollapsed = ref<boolean>(true);
const previewText = computed<string>(() => {
  const sliced: string = currentData.value.node.data.text?.slice(0, 10);

  return currentData.value.node.data.text?.length >= 10 ? sliced + "..." : currentData.value.node.data.text;
});

/* eslint-disable -- Will be needed when redraw modes is re-implemented */
const redrawButtonicon = computed<string>(() => (redrawMode.value?.direction === "on" ? "icon-x" : "icon-pencil"));
const redrawButtonTitle = computed<string>(() => (isRedrawMode.value ? "Cancel redraw operation" : "Redraw annotation"));

function handleDeleteAnnotation(): void {
  // Do NOT set status to 'deleted'or change the store in any way - this is determined during save preprocessing
  // when checked what annotations are in the document
  const annoEntry: Annotation | undefined = annotations.value?.get(currentData.value.node.data.uuid);

  if (!annoEntry) {
    return;
  }

  // TODO: Include removing zero point annotations
  tiptap.value?.commands.removeAnnotationDecoration(currentData.value.node);
}

/**
 * Opens the {@linkcode AnnotationEditModal} for this annotation. The form itself stays read-only -
 * all editing happens in the modal, which works on its own copy and emits the result on "Update".
 *
 * @returns {void} This function does not return any value.
 */
function handleEditAnnotation(): void {
  const entry: Annotation | undefined = annotations.value?.get(currentData.value.node.data.uuid);

  if (!entry) {
    return;
  }

  createModalInstance(
    dialog.open(AnnotationEditModal, {
      props: {
        ...ANNOTATION_MODAL_PROPS,
        header: `Edit ${currentData.value.node.data.subType ?? currentData.value.node.data.type} annotation`,
      },

      data: { annotation: entry },
      emits: {
        onSubmit: (updated: Annotation) => {
          updateData(updated);
          destroyModalInstance();
        },
      },
      onClose: destroyModalInstance,
    }),
  );
}

function handleRedraw(): void {
  // if (isRedrawMode.value) {
  //   toggleRedrawMode({ direction: 'off', cause: 'cancel' });
  // } else {
  //   toggleRedrawMode({ direction: 'on', annotationUuid: currentData.node.data.uuid });
  // }
}

/* eslint-disable -- These functions will be re-implemented anyway. */

function handleShiftLeft(): void {
  // execCommand('shiftAnnotationLeft', { annotation });
}

function handleShiftRight(): void {
  // execCommand('shiftAnnotationRight', { annotation });
}

function handleExpand(): void {
  // execCommand('expandAnnotation', { annotation });
}

function handleShrink(): void {
  // execCommand('shrinkAnnotation', { annotation });
}

/* eslint-enable */

function handleSpyClick() {
  if (!tiptap.value) {
    return;
  }

  let range: Range | null = null;

  const uuid: string = currentData.value.node.data.uuid;
  const renderType: "range" | "zeroPoint" = getAnnotationBehaviour(config.type) === "zeroPoint" ? "zeroPoint" : "range";

  if (renderType === "range") {
    const decorationSet: DecorationSet | undefined = ANNOTATION_DECORATION_KEY.getState(tiptap.value.state)?.all;

    if (!decorationSet) {
      return;
    }

    range = findDecorationBoundariesByUuid(decorationSet, uuid);
  } else if (renderType === "zeroPoint") {
    range = findNodeBoundariesByUuid(tiptap.value.state.doc, uuid);
  }

  if (!range) {
    console.error(`Annotation with uuid ${currentData.value.node.data.uuid} not found`);
    return;
  }

  tiptap.value?.chain().focus().toggleAnnotationHighlight("off", uuid, { renderType }).setTextSelection(range.to).run();
}

function handleSpyHover(direction: "on" | "off"): void {
  const renderType: "range" | "zeroPoint" = getAnnotationBehaviour(config.type) === "zeroPoint" ? "zeroPoint" : "range";

  tiptap.value?.commands.toggleAnnotationHighlight(direction, props.annotation.node.data.uuid, { renderType });
}

function toggleCollapsed(newState?: boolean): void {
  isCollapsed.value = newState ?? !isCollapsed.value;
}

/**
 * Writes the data edited in the {@linkcode AnnotationEditModal} back into the form and the store.
 *
 * @param {Annotation} updated - The annotation data as returned by the modal
 * @returns {void} This function does not return any value.
 */
function updateData(updated: Annotation): void {
  const uuid: string = currentData.value.node.data.uuid;
  const entry: NodeStatusObject<AnnotationNode> | undefined = annotations.value?.get(uuid);

  if (!entry) {
    return;
  }

  const newData: NodeStatusObject<AnnotationNode> = cloneDeep(updated);

  // Annotations which are not part of the last saved state are not persisted yet and therefore still "created"
  if (!initialData.value) {
    newData.meta.status = "created";
  } else {
    newData.meta.status = "modified";
  }

  // currentData/initialData are derived from the store, so updating the store is sufficient
  annotations.value?.set(uuid, newData);
}
</script>

<template>
  <div :id="props.annotation.node.data.uuid" class="annotation-card mb-4" :data-annotation-uuid="currentData.node.data.uuid">
    <div class="annotation-card-header">
      <div class="flex items-center gap-1 grow">
        <div class="annotation-type-icon-container">
          <AnnotationTypeIcon :annotation-type="currentData.node.data.subType ?? currentData.node.data.type" />
        </div>
        <span class="font-bold">{{ currentData.node.data.subType ?? currentData.node.data.type }}</span>
        <span class="italic text-xs text-(color:--p-text-muted-color)" :title="currentData.node.data.text">
          {{ previewText }}
        </span>
        <div
          class="spy icon-eye cursor-pointer"
          title="Show annotated text"
          role="button"
          tabindex="0"
          @mouseover="handleSpyHover('on')"
          @mouseleave="handleSpyHover('off')"
          @focus="handleSpyHover('on')"
          @blur="handleSpyHover('off')"
          @keydown.enter="handleSpyClick"
          @keydown.space.prevent="handleSpyClick"
          @click="handleSpyClick"
        ></div>
      </div>
      <Button
        :icon="`icon-chevron-${isCollapsed ? 'down' : 'up'}`"
        severity="secondary"
        title="Toggle full view"
        rounded
        text
        size="small"
        @click.stop="toggleCollapsed()"
      />
    </div>

    <div v-show="!isCollapsed" class="annotation-card-body">
      <NodePropertiesTable :data="currentData.node.data" :fields="propertyFields" />
      <AnnotationReferencesSection :model-value="currentData.connectedNodes" mode="view" />
    </div>

    <div class="annotation-card-footer">
      <!-- <div class="edit-buttons flex justify-center items-center">
        <Button
          icon="icon-chevron-left"
          size="small"
          severity="secondary"
          rounded
          title="Move annotation left by one character"
          :disabled="true"
          @click="handleShiftLeft"
          :style="{ width: '20px', height: '20px' }"
        />
        <Button
          icon="icon-chevron-right"
          size="small"
          severity="secondary"
          rounded
          title="Move annotation right by one character"
          :disabled="true"
          @click="handleShiftRight"
          :style="{ width: '20px', height: '20px' }"
        />
        <Button
          icon="icon-plus"
          size="small"
          severity="secondary"
          rounded
          title="Expand annotation right by one character"
          :disabled="true || config.isZeroPoint"
          @click="handleExpand"
          :style="{ width: '20px', height: '20px' }"
        />
        <Button
          icon="icon-minus"
          size="small"
          severity="secondary"
          rounded
          title="Shrink annotation from the right by one character"
          :disabled="true || config.isZeroPoint"
          @click="handleShrink"
          :style="{ width: '20px', height: '20px' }"
        />
        <Button
          :icon="redrawButtonicon"
          size="small"
          severity="secondary"
          rounded
          :title="redrawButtonTitle"
          :disabled="true"
          @click="handleRedraw"
          :style="{ width: '20px', height: '20px' }"
        />
      </div> -->
      <div class="action-buttons flex gap-1 justify-center">
        <Button
          title="Edit annotation"
          severity="secondary"
          variant="text"
          icon="icon-pencil"
          size="small"
          :style="{ width: '20px', height: '20px' }"
          @click="handleEditAnnotation"
        />
        <Button
          title="Delete annotation"
          severity="danger"
          variant="text"
          icon="icon-trash-2"
          size="small"
          :style="{ width: '20px', height: '20px' }"
          @click="handleDeleteAnnotation"
        />
      </div>
    </div>

    <ConfirmPopup />
  </div>
</template>

<style scoped>
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
  background: var(--p-panel-header-background);
  user-select: none;
}

.annotation-card-body {
  padding: 0.75rem;
  background: var(--p-panel-content-background);
}

.annotation-card-footer {
  display: flex;
  gap: 0.25rem;
  padding: 0.5rem;
  background: var(--p-panel-header-background);
  justify-content: center;
}

.annotation-type-icon-container {
  width: 20px;
  height: 20px;
}

.hidden {
  display: none;
}
</style>
