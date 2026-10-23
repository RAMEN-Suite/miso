<script setup lang="ts">
import { computed, ComputedRef, ref, useTemplateRef } from "vue";
import Button from "primevue/button";
import { Annotation, AnnotationType, PropertyConfig } from "../models/types";
import { useGuidelinesStore } from "../store/guidelines";
import { CollectionAnnotationVariant } from "../config/constants";
import { camelCaseToTitleCase, formatPropertyValue } from "../utils/helper/helper";
import AnnotationTypeIcon from "./AnnotationTypeIcon.vue";
import NodePropertiesTable from "./NodePropertiesTable.vue";
import AnnotationReferencesSection from "./AnnotationReferencesSection.vue";
import NodePreviewPopover from "./NodePreviewPopover.vue";

const annotation = defineModel<Annotation>({ required: true });

const props = defineProps<{
  variant: CollectionAnnotationVariant;
  collectionNodeLabels: string[];
  disabled?: boolean;
}>();

const emit = defineEmits<{
  edit: [];
  /** Removal requested, the parent asks for confirmation. */
  remove: [event: Event];
  /** Removal already confirmed inside the note (`popover` variant). */
  "remove-confirmed": [];
}>();

const { getCollectionAnnotationConfig, getCollectionAnnotationFields } = useGuidelinesStore();

const popover = useTemplateRef<InstanceType<typeof NodePreviewPopover>>("popover");

const LIST_SUMMARY_FIELD_COUNT: number = 2;
const CARD_SUMMARY_FIELD_COUNT: number = 3;

const confirmingRemoval = ref<boolean>(false);

const propertyFields: ComputedRef<PropertyConfig[]> = computed(() =>
  getCollectionAnnotationFields(props.collectionNodeLabels, annotation.value.node.data.type),
);

const config: ComputedRef<AnnotationType | undefined> = computed(() =>
  getCollectionAnnotationConfig(props.collectionNodeLabels, annotation.value.node.data.type),
);

const label: ComputedRef<string> = computed(() => String(annotation.value.node.data.subType ?? annotation.value.node.data.type));

/** Formatted, non-empty property values (without the subtype, which is already the label). */
const summaryEntries: ComputedRef<{ name: string; label: string; value: string }[]> = computed(() =>
  propertyFields.value
    .filter((field) => field.visible && field.name !== "subType")
    .map((field) => ({ field, value: annotation.value.node.data[field.name] }))
    .filter(({ value }) => value !== null && value !== undefined && value !== "")
    .map(({ field, value }) => ({
      name: field.name,
      label: camelCaseToTitleCase(field.name),
      value: formatPropertyValue(value, field),
    })),
);

const listSummary: ComputedRef<string> = computed(() =>
  summaryEntries.value
    .slice(0, LIST_SUMMARY_FIELD_COUNT)
    .map((entry) => entry.value)
    .join(" · "),
);

function handleTogglePopover(event: MouseEvent): void {
  confirmingRemoval.value = false;
  popover.value?.toggle(event);
}

function handleEditFromPopover(event: MouseEvent): void {
  popover.value?.toggle(event);
  emit("edit");
}
</script>

<template>
  <div class="note" :class="`note-${props.variant}`" :data-annotation-uuid="annotation.node.data.uuid">
    <template v-if="props.variant === 'popover'">
      <button type="button" class="note-main" :title="`Show ${label} details`" @click="handleTogglePopover">
        <span class="note-header">
          <span class="annotation-type-icon-container"><AnnotationTypeIcon :config="config" /></span>
          <span class="note-label">{{ label }}</span>
        </span>
      </button>

      <NodePreviewPopover ref="popover">
        <NodePropertiesTable :data="annotation.node.data" :fields="propertyFields" />
        <AnnotationReferencesSection v-model="annotation.connectedNodes" mode="view" />
        <div v-if="confirmingRemoval" class="popover-footer">
          <span class="grow">Remove this annotation?</span>
          <Button label="Cancel" severity="secondary" variant="outlined" size="small" @click="confirmingRemoval = false" />
          <Button
            label="Remove"
            severity="danger"
            size="small"
            :loading="props.disabled"
            @click="emit('remove-confirmed')"
          />
        </div>
        <div v-else class="popover-footer justify-end">
          <Button
            icon="icon-trash-2"
            label="Remove"
            severity="danger"
            variant="text"
            size="small"
            :disabled="props.disabled"
            @click="confirmingRemoval = true"
          />
          <Button icon="icon-pencil" label="Edit" size="small" :disabled="props.disabled" @click="handleEditFromPopover" />
        </div>
      </NodePreviewPopover>
    </template>

    <template v-else>
      <button type="button" class="note-main" :title="`Edit ${label}`" :disabled="props.disabled" @click="emit('edit')">
        <span class="note-header">
          <span class="annotation-type-icon-container"><AnnotationTypeIcon :config="config" /></span>
          <span class="note-label">{{ label }}</span>
        </span>
        <span v-if="props.variant === 'list' && listSummary" class="note-summary">{{ listSummary }}</span>
        <span v-if="props.variant === 'card'" class="note-properties">
          <template v-for="entry in summaryEntries.slice(0, CARD_SUMMARY_FIELD_COUNT)" :key="entry.name">
            <span class="note-property-name">{{ entry.label }}</span>
            <span class="note-property-value">{{ entry.value }}</span>
          </template>
          <span v-if="summaryEntries.length === 0" class="note-property-empty">No details</span>
        </span>
      </button>
      <Button
        class="note-remove"
        icon="icon-x"
        severity="secondary"
        variant="text"
        size="small"
        :aria-label="`Remove ${label}`"
        :title="`Remove ${label}`"
        :disabled="props.disabled"
        @click="emit('remove', $event)"
      />
    </template>
  </div>
</template>

<style scoped>
.note {
  position: relative;
  display: flex;
  align-items: center;
  border: 1px solid var(--p-form-field-border-color);
  border-radius: var(--p-border-radius-md, 5px);
  overflow: hidden;
  background: var(--p-panel-background);
  transition: border-color 0.15s;
}

.note:hover,
.note:focus-within {
  border-color: var(--p-primary-color);
}

.note-main {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  min-width: 0;
  padding: 0.375rem 0.75rem;
  background: none;
  border: none;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
  user-select: none;
}

.note-main:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: -2px;
}

.note-main:disabled {
  cursor: progress;
}

.note-header {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  min-width: 0;
}

.note-label {
  font-weight: bold;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.annotation-type-icon-container {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
}

/* Always keeps its space (only fades in), so hovering never shifts the layout */
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

.note-chip .note-main {
  padding-right: 0;
}

.note-list {
  width: 100%;
}

.note-list .note-main {
  flex-grow: 1;
}

.note-summary {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--p-text-muted-color);
}

.note-card {
  align-items: stretch;
  height: 100%;
}

.note-card .note-main {
  flex-direction: column;
  align-items: stretch;
  gap: 0.5rem;
  width: 100%;
  padding: 0.5rem 0.75rem 0.625rem;
}

/* Space for the remove button in the corner */
.note-card .note-header {
  padding-right: 1.25rem;
}

.note-card .note-remove {
  position: absolute;
  top: 0.25rem;
  right: 0;
}

.note-properties {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  column-gap: 0.5rem;
  row-gap: 0.125rem;
  font-size: 0.8125rem;
}

.note-property-name {
  color: var(--p-text-muted-color);
  white-space: nowrap;
}

.note-property-value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note-property-empty {
  grid-column: 1 / -1;
  color: var(--p-text-muted-color);
  font-style: italic;
}

.popover-footer {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.75rem;
}
</style>
