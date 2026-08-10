<script setup lang="ts">
import { computed, ref, useTemplateRef } from "vue";
import { useEventListener } from "@vueuse/core";
import Button from "primevue/button";
import ConfirmPopup from "primevue/confirmpopup";
import { useConfirm } from "primevue/useconfirm";
import { useTags } from "../composables/useTags";
import { useHierarchyStore } from "../store/hierarchy";
import { useAppStore } from "../store/app";
import TagFormPopover from "./TagFormPopover.vue";
import { Tag } from "../models/types";
import { normalizeTagColor } from "../config/tags";

const MIN_WIDTH = 200;
const MAX_WIDTH = 600;
const CONFIRM_GROUP = "tags";

const { tags, deleteTag } = useTags();
const { root, canNavigate, setRoot } = useHierarchyStore();
const { addToastMessage } = useAppStore();
const confirm: ReturnType<typeof useConfirm> = useConfirm();

const tagForm = useTemplateRef<InstanceType<typeof TagFormPopover>>("tag-form");

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
 * Selects a tag from a click on its row, unless the click came from one of the row's action buttons.
 *
 * The buttons deliberately do **not** stop propagation: `ConfirmPopup` only positions itself from
 * the document-level click listener it binds while opening, so a stopped click leaves it
 * unanchored in the top-left corner of the page. Filtering here instead of there keeps both
 * working.
 *
 * @param {MouseEvent} event - The click event.
 * @param {string} uuid - The tag UUID.
 * @returns {void} This function does not return any value.
 */
function handleRowClick(event: MouseEvent, uuid: string): void {
  if ((event.target as HTMLElement).closest(".action-buttons")) {
    return;
  }

  handleSelectTag(uuid);
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
 * Opens the tag form, blank for a new tag or prefilled to edit an existing one.
 *
 * @param {Event} event - The click event, used to anchor the popover.
 * @param {Tag} [tag] - The tag to edit. Omitted when creating.
 * @returns {void} This function does not return any value.
 */
function handleOpenTagForm(event: Event, tag?: Tag): void {
  if (!canNavigate.value) {
    showUnsavedChangesWarning();
    return;
  }

  tagForm.value?.open(event, tag);
}

/**
 * Asks before deleting a tag. Deletion only drops the tag and its references — the nodes it
 * pointed at are untouched — so the message says so rather than reading as a graph deletion.
 *
 * @param {Event} event - The click event, used to anchor the confirmation.
 * @param {Tag} tag - The tag to delete.
 * @returns {void} This function does not return any value.
 */
function handleDeleteTag(event: Event, tag: Tag): void {
  if (!canNavigate.value) {
    showUnsavedChangesWarning();
    return;
  }

  confirm.require({
    // Other views render their own ungrouped ConfirmPopup; without a group they would all answer
    // this request and stack duplicate popups on the same button
    group: CONFIRM_GROUP,
    target: event.currentTarget as HTMLElement,
    message: `Delete "${tag.label}"`,
    icon: "pi pi-exclamation-triangle",
    defaultFocus: "reject",
    rejectProps: { label: "Cancel", severity: "secondary", size: "small" },
    acceptProps: { label: "Delete", severity: "danger", size: "small" },
    accept: () => confirmDeleteTag(tag.uuid),
  });
}

/**
 * Performs the deletion. If the deleted tag was the active listing, the columns fall back to the
 * database hierarchy — otherwise the view stays rooted in a tag that no longer exists.
 *
 * @param {string} uuid - The tag UUID.
 * @returns {void} This function does not return any value.
 */
function confirmDeleteTag(uuid: string): void {
  const wasActive: boolean = isTagActive(uuid);

  deleteTag(uuid);

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
      <div class="sidebar-header p-3 font-bold">Collections</div>

      <div class="sidebar-content flex flex-column gap-3 p-3">
        <nav aria-label="Collection navigation">
          <ul class="nav-list flex flex-column gap-1 list-none p-0 m-0">
            <li>
              <div
                class="nav-item flex align-items-center gap-2 p-2 border-round"
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
          <h4 class="m-0">Tags</h4>
          <Button
            icon="pi pi-plus"
            severity="secondary"
            text
            rounded
            size="small"
            title="Create a new tag"
            aria-label="Create a new tag"
            @click="handleOpenTagForm($event)"
          />
        </div>

        <p v-if="tags.length === 0" class="m-0 text-sm font-italic opacity-70">No tags yet.</p>

        <ul v-else class="nav-list flex flex-column gap-1 list-none p-0 m-0">
          <li v-for="tag in tags" :key="tag.uuid">
            <div
              class="nav-item flex align-items-center gap-2 p-2 border-round"
              :class="{ active: isTagActive(tag.uuid) }"
              role="link"
              tabindex="0"
              :aria-current="isTagActive(tag.uuid) ? 'true' : undefined"
              :title="`Show everything tagged ${tag.label}`"
              @click="handleRowClick($event, tag.uuid)"
              @keydown.enter.prevent="handleSelectTag(tag.uuid)"
              @keydown.space.prevent="handleSelectTag(tag.uuid)"
            >
              <span class="tag-dot flex-shrink-0" :style="{ backgroundColor: normalizeTagColor(tag.appearance?.color) }" />
              <span
                class="text-sm flex-grow-1 min-w-0 text-overflow-ellipsis overflow-hidden white-space-nowrap"
                :style="{ color: normalizeTagColor(isTagActive(tag.uuid) ? tag.appearance?.color : '#000000') }"
              >
                {{ tag.label }}
              </span>
              <div class="action-buttons">
                <Button
                  class="row-action"
                  icon="pi pi-pencil"
                  severity="secondary"
                  text
                  rounded
                  size="small"
                  :title="`Edit ${tag.label}`"
                  :aria-label="`Edit ${tag.label}`"
                  @click="handleOpenTagForm($event, tag as Tag)"
                />
                <Button
                  class="row-action"
                  icon="pi pi-trash"
                  severity="danger"
                  text
                  rounded
                  size="small"
                  :title="`Delete ${tag.label}`"
                  :aria-label="`Delete ${tag.label}`"
                  @click="handleDeleteTag($event, tag as Tag)"
                />
              </div>
            </div>
          </li>
        </ul>
      </div>
    </div>

    <div class="resizer flex-shrink-0" :class="{ active: isResizing }" @mousedown.prevent="isResizing = true"></div>

    <TagFormPopover ref="tag-form" />
    <ConfirmPopup :group="CONFIRM_GROUP" />
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

  .tag-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .nav-list .nav-item {
    cursor: pointer;
    transition: background-color 0.1s;

    &:hover {
      background-color: hsl(0, 0%, 90%);
    }

    &.active {
      background-color: hsl(0, 0%, 87%);
      font-weight: 600;
    }

    /* Edit/delete stay out of the way until the row is hovered or keyboard-focused */
    .row-action {
      opacity: 0;
      transition: opacity 0.1s;
    }

    &:hover .row-action,
    &:focus-within .row-action {
      opacity: 1;
    }
  }
}
</style>
