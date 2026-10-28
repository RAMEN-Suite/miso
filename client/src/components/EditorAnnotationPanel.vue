<script setup lang="ts">
import { computed, ref } from "vue";
import SelectButton from "primevue/selectbutton";
import EditorAnnotationPreviewCard from "./EditorAnnotationPreviewCard.vue";
import EditorFilter from "./EditorFilter.vue";
import { useFilterStore } from "../store/filter.ts";
import { Annotation } from "../models/types.ts";
import { useTiptapStore } from "../store/tiptap.ts";
import { collectInlineAnnotations } from "../editors/text/src";

type CardCollapseMode = "collapsed" | "expanded";

const { tiptap } = useTiptapStore();
const { selectedOptions } = useFilterStore();

const collapseModeOptions: { value: CardCollapseMode; label: string; icon: string }[] = [
  { value: "collapsed", label: "Show preview", icon: "icon-rows-3" },
  { value: "expanded", label: "Show full view", icon: "icon-panel-top-open" },
];

/** How cards appear when they were not toggled by hand. */
const collapseMode = ref<CardCollapseMode>("collapsed");

/** Manual per-card toggles, keyed by annotation uuid. Cards without an entry fall back to {@linkcode collapseMode}. */
const collapseOverrides = ref<Map<string, boolean>>(new Map());

// TODO: A max number of annotations should be shown to keep UI from freezing
const annotationsInSelection = computed<Annotation[]>(() => {
  if (!tiptap.value?.state.selection) {
    return [];
  }

  const { from, to } = tiptap.value.state.selection;

  return [...collectInlineAnnotations(tiptap.value.state, { from, to }).values()];
});

/** Whether at least one annotation in the selection passes the type filter and is rendered as a card. */
const hasVisibleAnnotations = computed<boolean>(() =>
  annotationsInSelection.value.some((annotation) => isTypeSelected(annotation.node.data.type)),
);

/**
 * Discards manual toggles so all cards follow {@linkcode collapseMode} again. Runs on every click on the mode
 * buttons, because clicking the already active option does not emit a model update.
 *
 * @returns {void} This function does not return any value.
 */
function resetCollapseOverrides(): void {
  collapseOverrides.value.clear();
}

function isTypeSelected(type: string): boolean {
  return selectedOptions.value.includes(type);
}

function isCardCollapsed(uuid: string): boolean {
  return collapseOverrides.value.get(uuid) ?? collapseMode.value === "collapsed";
}

function setCardCollapsed(uuid: string, value: boolean): void {
  collapseOverrides.value.set(uuid, value);
}
</script>

<template>
  <div class="annotation-details-panel h-full flex flex-col gap-3">
    <div class="toolbar flex items-center gap-2">
      <EditorFilter />
      <SelectButton
        v-model="collapseMode"
        class="ml-auto"
        :options="collapseModeOptions"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        size="small"
        aria-label="Card display mode"
        @click="resetCollapseOverrides"
      >
        <template #option="{ option }">
          <i :class="option.icon" :title="option.label" :aria-label="option.label" />
        </template>
      </SelectButton>
    </div>
    <div class="annotation-list grow min-h-0 overflow-y-auto p-1">
      <div
        v-if="!hasVisibleAnnotations"
        class="empty-state h-full flex flex-col items-center justify-center gap-2 text-center text-sm"
      >
        <i :class="annotationsInSelection.length === 0 ? 'icon-square-dashed-mouse-pointer' : 'icon-filter-x'" class="text-2xl" />
        <small v-if="annotationsInSelection.length === 0">No annotations in the current selection</small>
        <small v-else>All annotations in the current selection are hidden by the filter</small>
      </div>
      <template v-for="annotation in annotationsInSelection" :key="annotation.node.data.uuid">
        <EditorAnnotationPreviewCard
          v-if="isTypeSelected(annotation.node.data.type)"
          :annotation="annotation"
          :collapsed="isCardCollapsed(annotation.node.data.uuid)"
          @update:collapsed="setCardCollapsed(annotation.node.data.uuid, $event)"
        />
        <div v-if="annotation.node.data.type === 'paragraph'">Paragraph</div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.annotation-list {
  scrollbar-gutter: stable;
}

.empty-state {
  color: var(--p-text-muted-color);
}
</style>
