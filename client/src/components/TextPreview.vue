<script setup lang="ts">
import { computed, ref, toRaw, useTemplateRef } from "vue";
import { useResizeObserver } from "@vueuse/core";
import { AnnotationNode, NodeDto } from "../models/types";
import { TextPreview, useTextPreview } from "../composables/useTextPreview";
import TextPreviewNode from "./TextPreviewNode.vue";

/**
 * Read-only preview of the beginning of a text, showing its structure (paragraphs, headings, lists, tables, line
 * breaks). Inline annotations are not shown. Fills the height of its parent and clips everything that doesn't fit,
 * it never scrolls.
 */
const props = withDefaults(
  defineProps<{
    text: string;
    /** All annotations of the text, the structural ones are picked from them. */
    annotations: NodeDto<AnnotationNode>[];
    /**
     * Number of characters to show at most (roughly). The cut is moved to the end of the paragraph or heading it
     * falls into, but never beyond twice this length.
     */
    maxLength?: number;
  }>(),
  { maxLength: 3000 },
);

const { createTextPreview } = useTextPreview();

const viewportElement = useTemplateRef<HTMLDivElement>("viewport");
const documentElement = useTemplateRef<HTMLDivElement>("document");

/** Whether the rendered document is higher than the visible area. */
const isOverflowing = ref<boolean>(false);

// Raw, so filtering thousands of annotations doesn't create a reactive proxy for each of them
const preview = computed<TextPreview>(() => createTextPreview(props.text, toRaw(props.annotations), props.maxLength));

/** Whether only a part of the text is visible, either cut by the length limit or clipped by the available height. */
const isCut = computed<boolean>(() => preview.value.isTruncated || isOverflowing.value);

// Both: the viewport changes with the pane size, the document with the shown text
useResizeObserver([viewportElement, documentElement], updateOverflow);

/**
 * Checks whether the rendered document fits into the visible area.
 *
 * @returns {void} This function does not return any value.
 */
function updateOverflow(): void {
  if (viewportElement.value && documentElement.value) {
    isOverflowing.value = documentElement.value.offsetHeight > viewportElement.value.clientHeight;
  }
}
</script>

<template>
  <div class="text-preview">
    <div ref="viewport" class="viewport" :class="{ cut: isCut }">
      <div ref="document" class="tiptap-editor-pane">
        <TextPreviewNode v-for="(child, index) in preview.document.content" :key="index" :node="child" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.text-preview {
  height: 100%;
  display: flex;
  flex-direction: column;
  word-break: break-word;
}

.viewport {
  flex-grow: 1;
  min-height: 0;
  overflow: hidden;
}

/* Like the editor (ProseMirror), so unannotated line breaks and spaces in the text stay visible */
.tiptap-editor-pane {
  min-height: 0;
  font-size: 0.875rem;
  white-space: pre-wrap;
}

.cut {
  mask-image: linear-gradient(to bottom, black calc(100% - 4rem), transparent);
}
</style>
