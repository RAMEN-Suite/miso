<script setup lang="ts">
import { computed } from "vue";
import Button from "primevue/button";
import { ContentFocus } from "../models/types";
import NodeTag from "./NodeTag.vue";
import { filterBaseNodeLabel } from "../utils/helper/helper";
import { useBookmarks } from "../composables/useBookmarks";
import { resolveNodeIcon } from "../config/icons";
import { useAppStore } from "../store/app.ts";
import { useDialog } from "primevue";
import NodeDeleteModal from "./NodeDeleteModal.vue";
import { useHierarchyStore } from "../store/hierarchy.ts";
import { useRouter } from "vue-router";

const props = defineProps<{
  focus: ContentFocus;
}>();

const router = useRouter();
const { addToastMessage, createModalInstance, destroyModalInstance } = useAppStore();
const { asyncOperationRunning, levels, mode, path, getUrlPath, setMode } = useHierarchyStore();
const { bookmarks, toggleBookmark } = useBookmarks();
const dialog: ReturnType<typeof useDialog> = useDialog();

const contentNode = computed(() => props.focus.content.node);
const contentLabels = computed<string[]>(() => filterBaseNodeLabel(contentNode.value.nodeLabels));
const icon = computed<string>(() => resolveNodeIcon(contentNode.value.nodeLabels));

const isBookmarked = computed<boolean>(() => bookmarks.value.some((b) => b.data.data.uuid === contentNode.value.data.uuid));

const editorUrl = computed<string>(() => `/contents/${contentNode.value.data.uuid}`);

function handleBookmarkAction(): void {
  toggleBookmark({ data: contentNode.value });
}

function handleDeleteContent(): void {
  createModalInstance(
    dialog.open(NodeDeleteModal, {
      props: {
        modal: true,
        closable: false,
        closeOnEscape: false,
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

async function handleSuccessfullDeletion() {
  showMessage("success");
  destroyModalInstance();
  await updateView();
}

async function updateView() {
  const currentUuids: string[] = getUrlPath();

  const pathIndex: number = path.value.length - 1;
  const newUuids: string[] = currentUuids.slice(0, pathIndex);

  await router.push({ query: { path: newUuids.join(",") } });

  // Remove the deleted content from its column explicitly (the watcher keeps/refetches columns,
  // but not this specific removal)
  levels.value[newUuids.length].entries = levels.value[newUuids.length].entries.filter(
    (e) => e.data.node.data.uuid !== props.focus.content.node.data.uuid,
  );

  setMode("view");
}
</script>

<template>
  <div class="content-focus-pane h-full flex flex-column align-items-center p-2">
    <div class="main flex-grow-1 flex flex-column w-full">
      <div class="buttons flex justify-content-end gap-1">
        <Button
          type="button"
          severity="secondary"
          :icon="`pi pi-bookmark${isBookmarked ? '-fill' : ''}`"
          size="small"
          :title="isBookmarked ? 'Remove Content from bookmarks' : 'Add Content to bookmarks'"
          :pt="{ icon: { style: isBookmarked ? { color: 'var(--p-primary-color)' } : {} } }"
          @click="handleBookmarkAction"
        />
      </div>

      <div class="label-section flex align-items-center justify-content-center gap-2">
        <i :class="icon" />
        <div class="node-labels flex gap-1">
          <template v-if="contentLabels.length > 0">
            <NodeTag v-for="label in contentLabels" :key="label" :content="label" type="Content" />
          </template>
          <span v-else class="font-italic">Content</span>
        </div>
      </div>

      <div class="content-preview">
        <p class="preview-text">{{ contentNode.data.text.slice(0, 500) }}</p>
      </div>
    </div>

    <div class="buttons flex justify-content-center gap-2 pt-2">
      <Button
        as="a"
        :href="editorUrl"
        target="_blank"
        rel="noopener noreferrer"
        label="Open in Editor"
        icon="pi pi-external-link"
        severity="contrast"
        title="Open this Content in the Editor"
      />
      <Button
        v-if="mode === 'view'"
        :disabled="asyncOperationRunning"
        icon="pi pi-trash"
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
  min-height: 3rem;
  flex-shrink: 0;
}

.content-preview {
  flex-grow: 1;
  overflow-y: auto;
  scrollbar-gutter: stable;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
