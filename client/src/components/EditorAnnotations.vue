<script setup lang="ts">
import { computed, ComputedRef, ref, shallowRef, watch } from "vue";
import { useDebounceFn } from "@vueuse/core";
import { useGuidelinesStore } from "../store/guidelines";
import { capitalize, toggleTextHightlighting } from "../utils/helper/helper";
import { AnnotationType, NodeStatusObject, AnnotationNode } from "../models/types";
import Panel from "primevue/panel";
import Tree from "primevue/tree";
import AnnotationTypeIcon from "./AnnotationTypeIcon.vue";
import { useTiptapStore } from "../store/tiptap";
import { collectInlineAnnotations, getAnnotationRevision } from "../utils/helper/tiptapHelper";

export interface TreeNode {
  annotationCount?: number;
  children?: TreeNode[];
  data?: NodeStatusObject;
  /** Configuration of the annotation type, only set on nodes of type `type` */
  config?: AnnotationType;
  key: string;
  label: string;
  type: "category" | "type" | "annotation";
}

const { groupedAndSortedAnnotationTypes } = useGuidelinesStore();
const { tiptap } = useTiptapStore();

/** Delay in ms before the list is rebuilt after a change in the editor. */
const UPDATE_DELAY: number = 300;

const displayedAnnotations = shallowRef<NodeStatusObject<AnnotationNode>[]>([]);

const expandedKeys = ref<Record<string, boolean>>({});

/** Keys of the categories that were displayed (and expanded) once, so that collapsing them is not undone. */
const knownCategoryKeys = new Set<string>();

function updateDisplayedAnnotations(): void {
  const current: NodeStatusObject<AnnotationNode>[] = tiptap.value
    ? [...collectInlineAnnotations(tiptap.value.state).values()]
    : [];

  const hasChanged: boolean =
    current.length !== displayedAnnotations.value.length || current.some((a, i) => a !== displayedAnnotations.value[i]);

  if (hasChanged) {
    displayedAnnotations.value = current;
  }
}

watch(
  [() => (tiptap.value ? getAnnotationRevision(tiptap.value.state) : 0), () => tiptap.value?.state.doc],
  useDebounceFn(updateDisplayedAnnotations, UPDATE_DELAY),
);

updateDisplayedAnnotations();

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
        config: annoType,
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

watch(
  nodes,
  (newNodes: TreeNode[]) => {
    newNodes.forEach((node) => {
      if (!knownCategoryKeys.has(node.key)) {
        knownCategoryKeys.add(node.key);
        expandedKeys.value[node.key] = true;
      }
    });
  },
  { immediate: true },
);

function handleAnnotationSelect(event: MouseEvent | KeyboardEvent): void {
  const annotationUuid: string | undefined = (event.target as HTMLElement).dataset.annotationUuid;

  if (!annotationUuid) {
    return;
  }
}
</script>

<template>
  <Panel
    class="annotations-container mb-4"
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
      <i :class="`icon-chevron-${collapsed ? 'down' : 'up'}`"></i>
    </template>
    <div class="tree">
      <div class="flex justify-center">
        <Tree
          v-if="nodes.length > 0"
          v-model:expanded-keys="expandedKeys"
          :value="nodes"
          selection-mode="single"
          :meta-key-selection="false"
          class="w-full"
        >
          <template #nodetoggleicon="{ expanded }">
            <i :class="`icon-chevron-${expanded ? 'down' : 'right'}`"></i>
          </template>
          <template #default="slotProps">
            <div v-if="slotProps.node.type === 'category'">
              <div class="name-container ml-2 font-bold">
                {{ capitalize(slotProps.node.label!) }} [{{ slotProps.node.annotationCount }}]
              </div>
            </div>
            <div v-else-if="slotProps.node.type === 'type'" class="flex items-center">
              <div class="annotation-type-icon-container">
                <AnnotationTypeIcon :config="slotProps.node.config" />
              </div>
              <div class="name-container ml-2">{{ slotProps.node.label }} [{{ slotProps.node.children.length }}]</div>
            </div>
            <div
              v-else
              tabindex="0"
              role="button"
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

.annotation-type-icon-container {
  width: 15px;
  height: 15px;
}
</style>
