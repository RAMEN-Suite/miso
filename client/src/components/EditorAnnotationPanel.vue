<script setup lang="ts">
import { computed } from "vue";
import EditorAnnotationPreviewCard from "./EditorAnnotationPreviewCard.vue";
import { useFilterStore } from "../store/filter.ts";
import { Annotation } from "../models/types.ts";
import { useTiptapStore } from "../store/tiptap.ts";
import { collectInlineAnnotations } from "../utils/helper/tiptapHelper.ts";

const { tiptap } = useTiptapStore();
const { selectedOptions } = useFilterStore();

// TODO: A max number of annotations should be shown to keep UI from freezing
const annotationsInSelection = computed<Annotation[]>(() => {
  if (!tiptap.value?.state.selection) {
    return [];
  }

  const { from, to } = tiptap.value.state.selection;

  return [...collectInlineAnnotations(tiptap.value.state, { from, to }).values()];
});
</script>

<template>
  <div class="annotation-details-panel h-full flex flex-col overflow-y-auto">
    <div class="header flex items-center gap-2 my-6">
      <h3 class="m-0 font-bold">Annotations</h3>
    </div>
    <div class="annotation-list grow overflow-y-auto p-1">
      <template v-for="annotation in annotationsInSelection" :key="annotation.node.data.uuid">
        <EditorAnnotationPreviewCard v-if="[...selectedOptions].includes(annotation.node.data.type)" :annotation="annotation" />
        <div v-if="annotation.node.data.type === 'paragraph'">Paragraph</div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.annotation-list {
  scrollbar-gutter: stable;
}
</style>
