<script setup lang="ts">
import { computed, ref } from "vue";
import { useGuidelinesStore } from "../store/guidelines.ts";
import Button from "primevue/button";
import ConfirmPopup from "primevue/confirmpopup";
import { useDialog } from "primevue/usedialog";
import { ANNOTATION_MODAL_PROPS } from "../config/modals";
import { Annotation, AnnotationNode, AnnotationType, NodeStatusObject, PropertyConfig } from "../models/types.ts";
import AnnotationTypeIcon from "./AnnotationTypeIcon.vue";
import NodePropertiesTable from "./NodePropertiesTable.vue";
import AnnotationDetailsModal from "./AnnotationDetailsModal.vue";
import { useTiptapStore } from "../store/tiptap.ts";
import AnnotationReferencesSection from "./AnnotationReferencesSection.vue";
import { cloneDeep, ellipsize } from "../utils/helper/helper.ts";
import { Range } from "../models/types.ts";
import { findDecorationBoundariesByUuid, findNodeBoundariesByUuid } from "../utils/helper/tiptapHelper.ts";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { ANNOTATION_DECORATION_KEY } from "../editors/text/extensions/annotationDecoration.ts";
import { useAppStore } from "../store/app.ts";

const props = defineProps<{
  annotation: NodeStatusObject<AnnotationNode>;
}>();

const dialog = useDialog();

const { createModalInstance, destroyModalInstance } = useAppStore();
const { tiptap, initialAnnotations } = useTiptapStore();

/** Last saved state of the annotation. `undefined` if the annotation was not saved yet. */
const initialData = computed<NodeStatusObject<AnnotationNode> | undefined>(() =>
  initialAnnotations.value?.get(props.annotation.node.data.uuid),
);

const { getAnnotationConfig, getAnnotationFields, getAnnotationExtent } = useGuidelinesStore();

const config: AnnotationType = getAnnotationConfig(props.annotation.node.data.type);

const isZeroPointAnnotation: boolean = getAnnotationExtent(config.type) === "zeroPoint";
// TODO: Maybe give whole config instead of only fields...?
const propertyFields: PropertyConfig[] = getAnnotationFields(props.annotation.node.data.type);

const isCollapsed = ref<boolean>(true);

const previewText = computed<string>(() => {
  if (!tiptap.value) {
    return "";
  }

  const decorations: DecorationSet = ANNOTATION_DECORATION_KEY.getState(tiptap.value.view.state)?.all ?? DecorationSet.empty;

  const decoration: Decoration | undefined = decorations.find(
    undefined,
    undefined,
    (spec) => spec._uuid === props.annotation.node.data.uuid,
  )[0];

  // Zero-point annotations have no decoration and cover no text
  if (!decoration) {
    return "";
  }

  const { from, to } = decoration;

  const annotatedText: string = tiptap.value?.state.doc.textBetween(from, to) ?? "";

  return ellipsize(annotatedText, 10);
});

function handleDeleteAnnotation(): void {
  if (isZeroPointAnnotation) {
    tiptap.value?.commands.removeZeroPointAnnotation(props.annotation);
  } else {
    tiptap.value?.commands.removeAnnotationDecoration(props.annotation);
  }
}

/**
 * Opens the {@linkcode AnnotationDetailsModal} for this annotation. The form itself stays read-only -
 * all editing happens in the modal, which works on its own copy and emits the result on "Update".
 *
 * @returns {void} This function does not return any value.
 */
function handleEditAnnotation(): void {
  createModalInstance(
    dialog.open(AnnotationDetailsModal, {
      props: {
        ...ANNOTATION_MODAL_PROPS,
        header: `Edit ${props.annotation.node.data.subType ?? props.annotation.node.data.type} annotation`,
      },

      data: { annotation: props.annotation, config, mode: "edit" },
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

function handleSpyClick() {
  if (!tiptap.value) {
    return;
  }

  let range: Range | null = null;

  const uuid: string = props.annotation.node.data.uuid;
  const renderType: "range" | "zeroPoint" = getAnnotationExtent(config.type) === "zeroPoint" ? "zeroPoint" : "range";

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
    console.error(`Annotation with uuid ${props.annotation.node.data.uuid} not found`);
    return;
  }

  tiptap.value?.chain().focus().toggleAnnotationHighlight("off", uuid, { renderType }).setTextSelection(range.to).run();
}

function handleSpyHover(direction: "on" | "off"): void {
  const renderType: "range" | "zeroPoint" = getAnnotationExtent(config.type) === "zeroPoint" ? "zeroPoint" : "range";

  tiptap.value?.commands.toggleAnnotationHighlight(direction, props.annotation.node.data.uuid, { renderType });
}

function toggleCollapsed(newState?: boolean): void {
  isCollapsed.value = newState ?? !isCollapsed.value;
}

/**
 * Writes the data edited in the {@linkcode AnnotationDetailsModal} back into the editor.
 *
 * @param {Annotation} updated - The annotation data as returned by the modal
 * @returns {void} This function does not return any value.
 */
function updateData(updated: Annotation): void {
  const newData: NodeStatusObject<AnnotationNode> = cloneDeep(updated);

  // Annotations which are not part of the last saved state are not persisted yet and therefore still "created"
  if (!initialData.value) {
    newData.meta.status = "created";
  } else {
    newData.meta.status = "modified";
  }

  if (isZeroPointAnnotation) {
    tiptap.value?.commands.updateZeroPointAnnotation(newData);
  } else {
    tiptap.value?.commands.updateAnnotationDecoration(newData);
  }
}
</script>

<template>
  <div :id="props.annotation.node.data.uuid" class="annotation-card mb-4" :data-annotation-uuid="props.annotation.node.data.uuid">
    <div class="annotation-card-header">
      <div class="flex items-center gap-1 grow">
        <div class="annotation-type-icon-container">
          <AnnotationTypeIcon :config="config" />
        </div>
        <span class="font-bold">{{ props.annotation.node.data.subType ?? props.annotation.node.data.type }}</span>
        <span class="italic text-xs text-(color:--p-text-muted-color)" :title="props.annotation.node.data.text">
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
      <NodePropertiesTable :data="props.annotation.node.data" :fields="propertyFields" />
      <AnnotationReferencesSection :model-value="props.annotation.connectedNodes" mode="view" />
    </div>

    <div class="annotation-card-footer">
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
