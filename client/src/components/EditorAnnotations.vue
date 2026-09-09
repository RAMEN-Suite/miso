<script setup lang="ts">
import { computed, ComputedRef, ref, watch } from "vue";
import { useGuidelinesStore } from "../store/guidelines";
import { capitalize, toggleTextHightlighting } from "../utils/helper/helper";
import { AnnotationType, NodeStatusObject, AnnotationNode } from "../models/types";
import Panel from "primevue/panel";
import Tree from "primevue/tree";
import AnnotationTypeIcon from "./AnnotationTypeIcon.vue";
import { useTiptapStore } from "../store/tiptap";

export interface TreeNode {
  annotationCount?: number;
  children?: TreeNode[];
  data?: NodeStatusObject;
  key: string;
  label: string;
  type: "category" | "type" | "annotation";
}

const { groupedAndSortedAnnotationTypes } = useGuidelinesStore();
const { annotations } = useTiptapStore();

const displayedAnnotations = ref<NodeStatusObject<AnnotationNode>[]>([]);

const expandedKeys = ref<Record<string, boolean>>({});

watch(
  () => annotations.value?.size,
  () => {
    if (!annotations.value) {
      displayedAnnotations.value = [];
    } else {
      displayedAnnotations.value = [...annotations.value.values()].filter((a: NodeStatusObject) => a.meta.status !== "deleted");
    }
  },
  { deep: false, immediate: true },
);

const nodes: ComputedRef<TreeNode[]> = computed(() => {
  const nodes: TreeNode[] = [];

  Object.entries(groupedAndSortedAnnotationTypes.value).forEach(([category, annotationType], i: number) => {
    const newCategory = {
      key: i.toString(),
      label: category,
      type: "category",
      children: [],
      annotationCount: 0,
    } satisfies TreeNode;

    annotationType.forEach((annoType: AnnotationType, j: number) => {
      const newAnnotationType = {
        key: i.toString() + "-" + j.toString(),
        label: annoType.type,
        type: "type",
        children: [],
      } satisfies TreeNode;

      const annos: NodeStatusObject[] = displayedAnnotations.value.filter((a) => a.node.data.type === annoType.type);

      annos.forEach((anno: NodeStatusObject, k: number) => {
        const newAnnotation: TreeNode = {
          key: i.toString() + "-" + j.toString() + "-" + k.toString(),
          label: anno.node.data.text,
          type: "annotation",
          data: anno,
        };

        newAnnotationType.children.push(newAnnotation);
      });

      newCategory.annotationCount += annos.length;

      if (newAnnotationType.children.length > 0) {
        newCategory.children.push(newAnnotationType);
      }
    });

    if (newCategory.children.length > 0) {
      nodes.push(newCategory);
    }
  });

  return nodes;
});

// Set initially expanded nodes -> Categories
nodes.value.forEach((node) => {
  expandedKeys.value[node.key] = true;
});

function handleAnnotationSelect(event: MouseEvent | KeyboardEvent): void {
  const annotationUuid: string | undefined = (event.target as HTMLElement).dataset.annotationUuid;

  if (!annotationUuid) {
    return;
  }
}
</script>

<template>
  <Panel
    class="annotations-container mb-3"
    toggleable
    :toggle-button-props="{
      severity: 'secondary',
      title: 'Toggle full view',
      rounded: true,
      text: true,
    }"
  >
    <template #header>
      <div class="header font-bold">Annotations [{{ displayedAnnotations.length }}]</div>
    </template>
    <template #toggleicon="{ collapsed }">
      <i :class="`pi pi-chevron-${collapsed ? 'down' : 'up'}`"></i>
    </template>
    <div class="tree">
      <div class="flex justify-center">
        <Tree
          v-model:expanded-keys="expandedKeys"
          :value="nodes"
          selection-mode="single"
          :meta-key-selection="false"
          class="w-full"
        >
          <template #default="slotProps">
            <div v-if="slotProps.node.type === 'category'">
              <div class="name-container ml-2 font-bold">
                {{ capitalize(slotProps.node.label!) }} [{{ slotProps.node.annotationCount }}]
              </div>
            </div>
            <div v-else-if="slotProps.node.type === 'type'" class="flex align-items-center">
              <div class="icon-container">
                <AnnotationTypeIcon :annotation-type="slotProps.node.label" />
              </div>
              <div class="name-container ml-2">{{ slotProps.node.label }} [{{ slotProps.node.children.length }}]</div>
            </div>
            <div
              v-else
              tabindex="0"
              :style="{ 'text-wrap': 'nowrap' }"
              @mouseover="toggleTextHightlighting(slotProps.node.data, 'on')"
              @mouseout="toggleTextHightlighting(slotProps.node.data, 'off')"
              @focus="toggleTextHightlighting(slotProps.node.data, 'on')"
              @blur="toggleTextHightlighting(slotProps.node.data, 'off')"
              @click="handleAnnotationSelect"
              @keydown.enter="handleAnnotationSelect"
              @keydown.space.prevent="handleAnnotationSelect"
            >
              <div class="ml-2 anno-entry preview" :data-annotation-uuid="slotProps.node.data.node.data.uuid">
                {{ slotProps.node.data.node.data.text }}
              </div>
            </div>
          </template>
        </Tree>
      </div>
    </div>
  </Panel>
</template>

<style scoped>
.annotations-container {
  outline: 1px solid var(--p-primary-color);
  scrollbar-gutter: stable;
}

.preview {
  text-wrap: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  font-style: italic;
}

.icon-container {
  width: 15px;
  height: 15px;
}
</style>
