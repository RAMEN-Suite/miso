<script setup lang="ts">
import { computed } from "vue";
import Button from "primevue/button";
import { ContentFocus, IconSpec } from "../models/types";
import { resolveNodeIcon } from "../config/icons";
import RAMENNodeIcon from "./RAMENNodeIcon.vue";
import TagAssignmentButton from "./TagAssignmentButton.vue";
import { useHierarchyStore } from "../store/hierarchy.ts";
import { useDeleteHierarchySelection } from "../composables/useDeleteHierarchySelection.ts";
import { getContentLabelText } from "../utils/helper/helper.ts";
import { filterBaseNodeLabels } from "../config/ramen.ts";
import TextPreview from "./TextPreview.vue";

const props = defineProps<{
  focus: ContentFocus;
}>();

const { hasPendingUpdates } = useHierarchyStore();
const { deleteSelection } = useDeleteHierarchySelection();

const contentNode = computed(() => props.focus.content.node);
const icon = computed<IconSpec>(() => resolveNodeIcon(contentNode.value.nodeLabels));
/** The Content's type label (e.g. "Text"), empty if it has none. Shown as the heading. */
const labelText = computed<string>(() => getContentLabelText(contentNode.value.nodeLabels));

/** The type label shown in UI texts like button titles, "text" if the Content has none. */
const displayLabel = computed<string>(() => labelText.value || "text");

const editorUrl = computed<string>(() => `/contents/${contentNode.value.data.uuid}`);
</script>

<template>
  <div class="content-focus-pane h-full flex flex-col items-center p-2">
    <div class="main grow flex flex-col w-full">
      <div class="buttons flex justify-between gap-1">
        <div class="buttons-start flex justify-start gap-1">
          <TagAssignmentButton :nodes="[contentNode]" />
        </div>
        <div class="buttons-end flex justify-end gap-1"></div>
      </div>

      <div class="label-section">
        <h3 class="label-heading" aria-label="Type">
          <RAMENNodeIcon
            v-tooltip.hover.top="{ value: filterBaseNodeLabels(contentNode.nodeLabels).join(', '), showDelay: 50 }"
            :spec="icon"
            :size="30"
          />
          <span v-if="labelText" class="label-text">{{ labelText }}</span>
        </h3>
      </div>

      <div class="content-preview">
        <TextPreview :text="contentNode.data.text" :annotations="focus.annotations" />
      </div>
    </div>

    <div class="buttons flex justify-center gap-2 pt-2">
      <Button
        as="a"
        :href="editorUrl"
        target="_blank"
        rel="noopener noreferrer"
        icon="icon-external-link"
        size="small"
        text
        label="Open in Editor"
        severity="contrast"
        :title="`Open this ${displayLabel} in the Editor`"
      />
      <Button
        :disabled="hasPendingUpdates"
        icon="icon-trash"
        size="small"
        text
        :title="`Delete this ${displayLabel}`"
        severity="danger"
        @click="deleteSelection"
      ></Button>
    </div>
  </div>
</template>

<style scoped>
.content-focus-pane {
  outline: 1px solid grey;
}

.content-focus-pane,
.main {
  overflow-y: hidden;
}

.label-section {
  line-break: auto;
  min-height: 3rem;
  flex-shrink: 0;
  text-align: center;
  padding: 0 5px;

  h3 {
    margin: 0;
  }
}

.label-heading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.label-text {
  font-weight: bold;
  padding: 0.25rem 0.5rem;
}

/* The preview clips its text itself, so this area never scrolls */
.content-preview {
  flex-grow: 1;
  min-height: 0;
  overflow: hidden;
}
</style>
