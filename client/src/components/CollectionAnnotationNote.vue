<script setup lang="ts">
import { computed, ComputedRef, useTemplateRef } from "vue";
import Button from "primevue/button";
import Popover from "primevue/popover";
import { Annotation, PropertyConfig } from "../models/types";
import { useGuidelinesStore } from "../store/guidelines";
import AnnotationTypeIcon from "./AnnotationTypeIcon.vue";
import NodePropertiesTable from "./NodePropertiesTable.vue";
import AnnotationReferencesSection from "./AnnotationReferencesSection.vue";
import NodeStatusBadge from "./NodeStatusBadge.vue";

const annotation = defineModel<Annotation>({ required: true });

const props = defineProps<{
  mode: "edit" | "view";
  collectionNodeLabels: string[];
}>();

const emit = defineEmits<{
  (e: "edit"): void;
  (e: "remove"): void;
}>();

const { getCollectionAnnotationFields } = useGuidelinesStore();

const popover = useTemplateRef<InstanceType<typeof Popover>>("popover");

const propertyFields: ComputedRef<PropertyConfig[]> = computed(() =>
  getCollectionAnnotationFields(props.collectionNodeLabels, annotation.value.node.data.type),
);

function handleToggleView(event: MouseEvent): void {
  popover.value?.toggle(event);
}
</script>

<template>
  <div class="note" :data-annotation-uuid="annotation.node.data.uuid">
    <div class="header">
      <div class="flex items-center gap-1 align-items-center flex-grow-1">
        <div class="icon-container">
          <AnnotationTypeIcon :annotation-type="annotation.node.data.subType ?? annotation.node.data.type" />
        </div>
        <span class="font-bold">{{ annotation.node.data.subType ?? annotation.node.data.type }}</span>
        <NodeStatusBadge :status="annotation.meta.status" />
      </div>
      <div class="action-buttons flex">
        <Button
          ref="view-button"
          icon="pi pi-info-circle"
          severity="secondary"
          variant="text"
          size="small"
          title="Show annotation details"
          :style="{ width: '20px', height: '20px' }"
          @click="handleToggleView"
        />
        <Button
          v-if="props.mode === 'edit'"
          icon="pi pi-pencil"
          severity="secondary"
          variant="text"
          size="small"
          title="Edit annotation"
          :style="{ width: '20px', height: '20px' }"
          @click="emit('edit')"
        />
        <Button
          v-if="props.mode === 'edit'"
          icon="pi pi-trash"
          severity="danger"
          variant="text"
          size="small"
          title="Remove annotation"
          :style="{ width: '20px', height: '20px' }"
          @click="emit('remove')"
        />
      </div>
    </div>

    <Popover
      ref="popover"
      :pt="{
        root: {
          class: 'w-25rem',
          style: {
            zIndex: 'var(--z-index-max)',
          },
        },
      }"
    >
      <NodePropertiesTable :data="annotation.node.data" :fields="propertyFields" />
      <AnnotationReferencesSection v-model="annotation.connectedNodes" mode="view" />
    </Popover>
  </div>
</template>

<style scoped>
.note {
  border: 1px solid var(--p-form-field-border-color);
  border-radius: var(--p-border-radius-md, 5px);
  overflow: hidden;
  background: var(--p-panel-background);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  user-select: none;
  gap: 5px;
}

.icon-container {
  width: 20px;
  height: 20px;
}
</style>
