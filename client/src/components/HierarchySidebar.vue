<script setup lang="ts">
import { computed, DeepReadonly, ref, useTemplateRef } from "vue";
import { useEventListener } from "@vueuse/core";
import Button from "primevue/button";
import { useTagsStore } from "../store/tags";
import { useHierarchyStore } from "../store/hierarchy";
import { useAppStore } from "../store/app";
import CreateTagPopover from "./CreateTagPopover.vue";
import TagItem from "./TagItem.vue";
import { Tag } from "../models/types";

const MIN_WIDTH = 200;
const MAX_WIDTH = 600;

const { tags, deleteTag } = useTagsStore();
const { root, canNavigate, setRoot } = useHierarchyStore();
const { addToastMessage } = useAppStore();

const createTagPopover = useTemplateRef<InstanceType<typeof CreateTagPopover>>("tag-popover");

const width = ref<number>(280);
const isResizing = ref<boolean>(false);

/** True while the database hierarchy is the active listing. */
const isDatabaseActive = computed<boolean>(() => root.value.kind === "database");

/**
 * Checks whether a tag is the active listing.
 *
 * @param {string} uuid - The tag UUID.
 * @returns {boolean} Whether that tag is currently displayed.
 */
function isTagActive(uuid: string): boolean {
  return root.value.kind === "tag" && root.value.uuid === uuid;
}

/**
 * Switches the columns back to the database hierarchy.
 *
 * @returns {void} This function does not return any value.
 */
function handleSelectDatabase(): void {
  if (!canNavigate.value) {
    showUnsavedChangesWarning();
    return;
  }

  if (isDatabaseActive.value) {
    return;
  }

  setRoot({ kind: "database" });
}

/**
 * Switches the columns to a tag: the first column then lists the nodes carrying it, which may sit
 * anywhere in the graph, and navigating into one of them follows `PART_OF` as usual.
 *
 * @param {string} uuid - The tag UUID.
 * @returns {void} This function does not return any value.
 */
function handleSelectTag(uuid: string): void {
  if (!canNavigate.value) {
    showUnsavedChangesWarning();
    return;
  }

  if (isTagActive(uuid)) {
    return;
  }

  setRoot({ kind: "tag", uuid });
}

/**
 * Opens the blank creation form. Existing tags are edited in place, in their own row.
 *
 * @param {Event} event - The click event, used to anchor the popover.
 * @returns {void} This function does not return any value.
 */
function handleOpenTagPopover(event: Event): void {
  if (!canNavigate.value) {
    showUnsavedChangesWarning();
    return;
  }

  createTagPopover.value?.open(event);
}

/**
 * Deletes a tag its row has already asked about. If the deleted tag was the active listing, the
 * columns fall back to the database hierarchy — otherwise the view stays rooted in a tag that no
 * longer exists.
 *
 * @param {DeepReadonly<Tag>} tag - The tag to delete.
 * @returns {void} This function does not return any value.
 */
function handleDeleteTag(tag: DeepReadonly<Tag>): void {
  if (!canNavigate.value) {
    showUnsavedChangesWarning();
    return;
  }

  const wasActive: boolean = isTagActive(tag.uuid);

  deleteTag(tag.uuid);

  if (wasActive) {
    setRoot({ kind: "database" });
  }
}

/**
 * Warns that the current edit has to be resolved before the listing can be switched.
 *
 * @returns {void} This function does not return any value.
 */
function showUnsavedChangesWarning(): void {
  addToastMessage({
    severity: "warn",
    summary: "You have unsaved changes.",
    detail: "Please save or discard your changes before navigating.",
    life: 3000,
  });
}

useEventListener(window, "mousemove", (event: MouseEvent) => {
  if (!isResizing.value) {
    return;
  }

  width.value = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, event.clientX));
});

useEventListener(window, "mouseup", () => {
  isResizing.value = false;
});
</script>

<template>
  <aside class="sidebar flex flex-shrink-0 h-full" :style="{ width: width + 'px' }">
    <div class="sidebar-body flex flex-column flex-grow-1 min-w-0 overflow-y-auto">
      <div class="sidebar-content flex flex-column gap-3 p-3">
        <nav aria-label="Collection navigation">
          <ul class="nav-list flex flex-column gap-1 list-none p-0 m-0">
            <li>
              <div
                class="nav-item flex align-items-center gap-2 p-2"
                :class="{ active: isDatabaseActive }"
                role="link"
                tabindex="0"
                :aria-current="isDatabaseActive ? 'true' : undefined"
                title="Show the full hierarchy"
                @click="handleSelectDatabase"
                @keydown.enter.prevent="handleSelectDatabase"
                @keydown.space.prevent="handleSelectDatabase"
              >
                <i class="pi pi-folder flex-shrink-0" />
                <span class="text-sm">Collections</span>
              </div>
            </li>
          </ul>
        </nav>

        <div class="tags-header flex align-items-center justify-content-between gap-2">
          <h4 class="m-0 font-normal">Tags</h4>
          <Button
            icon="pi pi-plus"
            severity="secondary"
            text
            rounded
            size="small"
            title="Create a new tag"
            aria-label="Create a new tag"
            @click="handleOpenTagPopover($event)"
          />
        </div>

        <p v-if="tags.length === 0" class="m-0 text-sm font-italic opacity-70">No tags yet.</p>

        <ul v-else class="nav-list flex flex-column gap-1 list-none p-0 m-0">
          <TagItem
            v-for="tag in tags"
            :key="tag.uuid"
            :tag="tag"
            :is-active="isTagActive(tag.uuid)"
            @select="handleSelectTag(tag.uuid)"
            @delete="handleDeleteTag(tag)"
          />
        </ul>
      </div>
    </div>

    <div
      class="resizer flex-shrink-0"
      :class="{ active: isResizing }"
      role="button"
      tabindex="0"
      @mousedown.prevent="isResizing = true"
    ></div>

    <CreateTagPopover ref="tag-popover" />
  </aside>
</template>

<style scoped>
.sidebar {
  .resizer {
    width: 5px;
    cursor: col-resize;
    background-color: whitesmoke;
    border-right: 1px solid var(--p-content-border-color);

    &:hover,
    &.active {
      background-color: var(--p-primary-color);
      transition: background-color 200ms;
    }
  }

  .nav-list .nav-item {
    border-radius: 10px;
    cursor: pointer;
    transition: background-color 0.1s;

    &:hover {
      background-color: hsl(0, 0%, 90%);
    }

    &.active {
      background-color: hsl(0, 0%, 87%);
      font-weight: 600;
    }
  }
}
</style>
