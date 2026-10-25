<script setup lang="ts">
import { computed, ComputedRef, useTemplateRef } from "vue";
import Button from "primevue/button";
import { Annotation, AnnotationType, PropertyConfig } from "../models/types";
import { useGuidelinesStore } from "../store/guidelines";
import AnnotationTypeIcon from "./AnnotationTypeIcon.vue";
import NodePropertiesTable from "./NodePropertiesTable.vue";
import AnnotationReferencesSection from "./AnnotationReferencesSection.vue";
import NodePreviewPopover from "./NodePreviewPopover.vue";

const annotation = defineModel<Annotation>({ required: true });

const props = defineProps<{
  collectionNodeLabels: string[];
  /** Blocks all interaction with the note, e.g. while it is being deleted. */
  disabled?: boolean;
}>();

const emit = defineEmits<{
  edit: [];
  /** Removal requested, the parent asks for confirmation. */
  remove: [event: Event];
}>();

const { getCollectionAnnotationConfig, getCollectionAnnotationFields } = useGuidelinesStore();

const popover = useTemplateRef<InstanceType<typeof NodePreviewPopover>>("popover");

const propertyFields: ComputedRef<PropertyConfig[]> = computed(() =>
  getCollectionAnnotationFields(props.collectionNodeLabels, annotation.value.node.data.type),
);

const config: ComputedRef<AnnotationType | undefined> = computed(() =>
  getCollectionAnnotationConfig(props.collectionNodeLabels, annotation.value.node.data.type),
);

const label: ComputedRef<string> = computed(() => String(annotation.value.node.data.subType ?? annotation.value.node.data.type));

/**
 * Shows or hides the details popover, unless the note is disabled.
 *
 * @param {Event} event - The click or key event, used to anchor the popover.
 * @returns {void} This function does not return any value.
 */
function handleTogglePopover(event: Event): void {
  if (props.disabled) {
    return;
  }

  popover.value?.toggle(event);
}

/**
 * Closes the details popover and requests editing.
 *
 * @param {MouseEvent} event - The click event.
 * @returns {void} This function does not return any value.
 */
function handleEditFromPopover(event: MouseEvent): void {
  popover.value?.toggle(event);
  emit("edit");
}
</script>

<template>
  <div
    class="note"
    :class="{ 'is-disabled': props.disabled }"
    role="button"
    tabindex="0"
    :aria-disabled="props.disabled"
    :title="`Show ${label} details`"
    :data-annotation-uuid="annotation.node.data.uuid"
    @click="handleTogglePopover"
    @keydown.enter.self.prevent="handleTogglePopover"
    @keydown.space.self.prevent="handleTogglePopover"
  >
    <div class="note-info">
      <span class="note-icon"><AnnotationTypeIcon :config="config" /></span>
      <span class="note-label">{{ label }}</span>
    </div>
    <Button
      class="note-remove"
      icon="icon-x"
      severity="secondary"
      variant="text"
      size="small"
      :aria-label="`Remove ${label}`"
      :title="`Remove ${label}`"
      :disabled="props.disabled"
      @click.stop="emit('remove', $event)"
    />

    <NodePreviewPopover ref="popover">
      <NodePropertiesTable :data="annotation.node.data" :fields="propertyFields" />
      <AnnotationReferencesSection v-model="annotation.connectedNodes" mode="view" />
      <div class="flex justify-center">
        <Button
          icon="icon-pencil"
          severity="secondary"
          variant="text"
          size="small"
          :aria-label="`Edit ${label}`"
          :title="`Edit ${label}`"
          :disabled="props.disabled"
          @click="handleEditFromPopover"
        />
      </div>
    </NodePreviewPopover>
  </div>
</template>

<style scoped>
.note {
  display: flex;
  align-items: center;
  padding: 0.25rem 0 0.25rem 0.5rem;
  border: 1px solid var(--p-form-field-border-color);
  border-radius: var(--p-border-radius-md, 5px);
  overflow: hidden;
  background: var(--p-panel-background);
  cursor: pointer;
  user-select: none;
  transition: border-color 0.15s;
}

.note:hover,
.note:focus-within {
  border-color: var(--p-primary-color);
}

.note:focus-visible {
  outline: none;
}

.note-info {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  min-width: 0;
}

.note-icon {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
}

.note-label {
  font-weight: bold;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.note-remove {
  flex-shrink: 0;
  width: 1.75rem !important;
  height: 1.75rem !important;
  margin-right: 0.25rem;
  opacity: 0;
  transition: opacity 0.15s;
}

.note:hover .note-remove,
.note:focus-within .note-remove {
  opacity: 1;
}

.note.is-disabled {
  opacity: 0.6;
  border-color: var(--p-form-field-border-color);
  cursor: not-allowed;
}
</style>
