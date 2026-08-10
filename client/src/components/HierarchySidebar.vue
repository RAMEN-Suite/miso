<script setup lang="ts">
import { computed, ref } from "vue";
import { useEventListener } from "@vueuse/core";
import Button from "primevue/button";
import { useTags } from "../composables/useTags";
import { useHierarchyStore } from "../store/hierarchy";
import { useAppStore } from "../store/app";

const MIN_WIDTH = 200;
const MAX_WIDTH = 600;

/** Placeholder labels and appearances for the mock tags, until a real create dialog exists. */
const MOCK_LABELS: string[] = [
  "Workspace",
  "In Review",
  "Needs OCR",
  "To Verify",
  "Draft",
  "Priority",
  "Archive",
  "Reading List",
];

const MOCK_ICONS: string[] = [
  "pi pi-tag",
  "pi pi-star",
  "pi pi-heart",
  "pi pi-flag",
  "pi pi-bolt",
  "pi pi-inbox",
  "pi pi-briefcase",
  "pi pi-compass",
];

const MOCK_COLORS: string[] = ["#e11d48", "#ea580c", "#ca8a04", "#16a34a", "#0891b2", "#2563eb", "#7c3aed", "#db2777"];

const { tags, createTag, deleteTag } = useTags();
const { root, canNavigate, setRoot } = useHierarchyStore();
const { addToastMessage } = useAppStore();

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
 * Deletes a tag. If it is the one currently displayed, the columns fall back to the database
 * hierarchy — otherwise the listing would be rooted in a tag that no longer exists.
 *
 * @param {string} uuid - The tag UUID.
 * @returns {void} This function does not return any value.
 */
function handleDeleteTag(uuid: string): void {
  if (!canNavigate.value) {
    showUnsavedChangesWarning();
    return;
  }

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

/**
 * Picks a random element of an array.
 *
 * @param {T[]} values - The array to pick from.
 * @returns {T} A random element.
 */
function pickRandom<T>(values: T[]): T {
  return values[Math.floor(Math.random() * values.length)];
}

/**
 * Creates a throwaway tag with a random label and appearance.
 *
 * Placeholder for the real create flow (label input + icon/colour picker). It exists so the tag
 * list and the tag popover in the focus panes can be exercised.
 *
 * @returns {void} This function does not return any value.
 */
function handleCreateTag(): void {
  createTag({
    label: pickRandom(MOCK_LABELS),
    appearance: {
      icon: pickRandom(MOCK_ICONS),
      color: pickRandom(MOCK_COLORS),
    },
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
            @click="handleCreateTag"
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
              @click="handleSelectTag(tag.uuid)"
              @keydown.enter.prevent="handleSelectTag(tag.uuid)"
              @keydown.space.prevent="handleSelectTag(tag.uuid)"
            >
              <i
                :class="tag.appearance?.icon ?? 'pi pi-tag'"
                class="flex-shrink-0"
                :style="{ color: tag.appearance?.color ?? 'inherit' }"
              />
              <span class="text-sm flex-grow-1 min-w-0 text-overflow-ellipsis overflow-hidden white-space-nowrap">
                {{ tag.label }}
              </span>
              <Button
                icon="pi pi-trash"
                severity="danger"
                text
                rounded
                size="small"
                title="Delete this tag"
                aria-label="Delete this tag"
                @click.stop="handleDeleteTag(tag.uuid)"
              />
              <span class="text-xs opacity-60">{{ tag.entries.length }}</span>
            </div>
          </li>
        </ul>
      </div>
    </div>

    <div class="resizer flex-shrink-0" :class="{ active: isResizing }" @mousedown.prevent="isResizing = true"></div>
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
