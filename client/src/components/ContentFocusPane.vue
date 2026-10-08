<script setup lang="ts">
import { computed } from "vue";
import Button from "primevue/button";
import { ContentFocus, IconSpec } from "../models/types";
import { resolveNodeIcon } from "../config/icons";
import RAMENNodeIcon from "./RAMENNodeIcon.vue";
import { useAppStore } from "../store/app.ts";
import { useDialog } from "primevue";
import { BASE_MODAL_PROPS } from "../config/modals";
import NodeDeleteModal from "./NodeDeleteModal.vue";
import TagAssignmentButton from "./TagAssignmentButton.vue";
import { useHierarchyStore } from "../store/hierarchy.ts";
import { ellipsize, getContentLabelText } from "../utils/helper/helper.ts";
import { filterBaseNodeLabels } from "../config/ramen.ts";

const props = defineProps<{
  focus: ContentFocus;
}>();

const { addToastMessage, createModalInstance, destroyModalInstance } = useAppStore();
const { asyncOperationRunning, levels, mode, path, updatePath, setMode } = useHierarchyStore();
const dialog: ReturnType<typeof useDialog> = useDialog();

const contentNode = computed(() => props.focus.content.node);
const icon = computed<IconSpec>(() => resolveNodeIcon(contentNode.value.nodeLabels));
const labelText = computed<string>(() => getContentLabelText(contentNode.value.nodeLabels));

const editorUrl = computed<string>(() => `/contents/${contentNode.value.data.uuid}`);

function handleDeleteContent(): void {
  createModalInstance(
    dialog.open(NodeDeleteModal, {
      props: {
        ...BASE_MODAL_PROPS,
        showHeader: false,
        style: { width: "25rem" },
      },
      data: {
        action: "delete",
        node: props.focus.content.node,
      },
      emits: {
        onDeleted: handleSuccessfullDeletion,
      },
      onClose: destroyModalInstance,
    }),
  );
}

function showMessage(result: "success" | "error", error?: Error) {
  addToastMessage({
    severity: result,
    summary: result === "success" ? "Changes saved successfully" : "Error saving changes",
    detail: error?.message ?? "",
    life: 2000,
  });
}

function handleSuccessfullDeletion() {
  showMessage("success");
  destroyModalInstance();
  updateView();
}

function updateView() {
  const parentIndex: number = path.value.length - 1;

  updatePath(path.value.slice(0, parentIndex));

  // Remove the deleted content from its column explicitly (rebuilding the levels keeps/refetches
  // columns, but not this specific removal)
  levels.value[parentIndex].entries = levels.value[parentIndex].entries.filter(
    (e) => e.data.node.data.uuid !== props.focus.content.node.data.uuid,
  );

  setMode("view");
}
</script>

<template>
  <div class="content-focus-pane h-full flex flex-col items-center p-2">
    <div class="main grow flex flex-col w-full">
      <div class="buttons flex justify-between gap-1">
        <div class="buttons-start flex justify-start gap-1">
          <TagAssignmentButton :node-uuid="contentNode.data.uuid" />
        </div>
        <div class="buttons-end flex justify-end gap-1"></div>
      </div>

      <div class="label-section">
        <h3 class="label-heading" aria-label="Content label">
          <RAMENNodeIcon
            v-tooltip.hover.top="{ value: filterBaseNodeLabels(contentNode.nodeLabels).join(', '), showDelay: 50 }"
            :spec="icon"
            :size="30"
          />
          <span v-if="labelText" class="label-text">{{ labelText }}</span>
        </h3>
      </div>

      <div class="content-preview">
        <p class="preview-text">{{ ellipsize(contentNode.data.text, 500) }}</p>
      </div>
    </div>

    <div class="buttons flex justify-center gap-2 pt-2">
      <Button
        as="a"
        :href="editorUrl"
        target="_blank"
        rel="noopener noreferrer"
        label="Open in Editor"
        icon="icon-external-link"
        severity="contrast"
        title="Open this Content in the Editor"
      />
      <Button
        v-if="mode === 'view'"
        :disabled="asyncOperationRunning"
        icon="icon-trash-2"
        title="Delete collection"
        severity="danger"
        @click="handleDeleteContent"
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

.content-preview {
  flex-grow: 1;
  overflow-y: auto;
  scrollbar-gutter: stable;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
