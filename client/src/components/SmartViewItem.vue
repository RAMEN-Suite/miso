<script setup lang="ts">
import { ComponentPublicInstance, DeepReadonly, ref, useTemplateRef } from "vue";
import Button from "primevue/button";
import Menu from "primevue/menu";
import { MenuItem } from "primevue/menuitem";
import { useSmartViewsStore } from "../store/smartViews";
import { SmartView } from "../models/types";

const SMART_VIEW_ICON: string = "pi pi-folder";
const SMART_VIEW_ICON_ACTIVE: string = "pi pi-folder";

const props = defineProps<{
  view: DeepReadonly<SmartView>;
  isActive: boolean;
}>();

const emit = defineEmits<(e: "select" | "edit" | "delete") => void>();

const { updateSmartView } = useSmartViewsStore();

const menu = useTemplateRef<InstanceType<typeof Menu>>("menu");

const isRenaming = ref<boolean>(false);
const renameDraft = ref<string>("");

const menuItems: MenuItem[] = [
  { label: "Rename", icon: "pi pi-pencil", command: startRename },
  { label: "Edit", icon: "pi pi-sliders-h", command: () => emit("edit") },
  { label: "Delete", icon: "pi pi-trash", command: () => emit("delete") },
];

function handleOpenMenu(event: Event): void {
  menu.value?.toggle(event);
}

/**
 * Turns the label into an input. Reached from the row menu and from a double click on the label.
 *
 * @returns {void} This function does not return any value.
 */
function startRename(): void {
  isRenaming.value = true;
  renameDraft.value = props.view.label;
}

/**
 * Focuses the rename input and selects its text, so typing replaces the old label.
 *
 * @param {Element | ComponentPublicInstance | null} element - The input, or null on unmount.
 * @returns {void} This function does not return any value.
 */
function focusRenameInput(element: Element | ComponentPublicInstance | null): void {
  if (!(element instanceof HTMLInputElement) || document.activeElement === element) {
    return;
  }

  element.focus();
  element.select();
}

/**
 * Persists the rename. Called from both Enter and blur, hence the guard: leaving edit mode
 * unmounts the input, which can itself fire a blur.
 *
 * An empty label is discarded rather than saved — a nameless view cannot be told apart in the list.
 *
 * @returns {void} This function does not return any value.
 */
function handleCommitRename(): void {
  if (!isRenaming.value) {
    return;
  }

  const label: string = renameDraft.value.trim();

  isRenaming.value = false;

  if (label === "") {
    return;
  }

  updateSmartView({ uuid: props.view.uuid, label });
}

/**
 * Handles keys inside the rename input, and keeps every one of them from reaching the row: the row
 * treats Enter and Space as "select this view", which would otherwise swallow the space bar.
 *
 * @param {KeyboardEvent} event - The keydown event.
 * @returns {void} This function does not return any value.
 */
function handleRenameKeydown(event: KeyboardEvent): void {
  if (event.key === "Enter") {
    event.preventDefault();
    handleCommitRename();
  } else if (event.key === "Escape") {
    event.preventDefault();
    isRenaming.value = false;
  }
}
</script>

<template>
  <li>
    <div
      class="nav-item flex align-items-center gap-2 p-1"
      :class="{ active: props.isActive }"
      role="link"
      tabindex="0"
      :aria-current="props.isActive ? 'true' : undefined"
      :title="`Show everything matching ${props.view.label}`"
      @click="emit('select')"
      @keydown.enter.self="emit('select')"
      @keydown.space.self="emit('select')"
    >
      <i :class="[props.isActive ? SMART_VIEW_ICON_ACTIVE : SMART_VIEW_ICON, 'flex-shrink-0']" />

      <input
        v-if="isRenaming"
        :ref="focusRenameInput"
        v-model="renameDraft"
        class="rename-input text-sm flex-grow-1 min-w-0"
        spellcheck="false"
        :aria-label="`Rename ${props.view.label}`"
        @blur="handleCommitRename"
        @keydown="handleRenameKeydown"
      />
      <span
        v-else
        role="button"
        tabindex="0"
        class="text-sm flex-grow-1 min-w-0 text-overflow-ellipsis overflow-hidden white-space-nowrap select-none"
        @dblclick="startRename"
        @keydown.enter="startRename"
        @keydown.space="startRename"
      >
        {{ props.view.label }}
      </span>

      <Button
        class="row-action"
        icon="pi pi-ellipsis-v"
        severity="secondary"
        text
        rounded
        size="small"
        :title="`More options for ${props.view.label}`"
        :aria-label="`More options for ${props.view.label}`"
        @click.stop="handleOpenMenu"
      />
    </div>

    <Menu ref="menu" :model="menuItems" popup dismissable close-on-escape />
  </li>
</template>

<style scoped>
.nav-item {
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

  /* The menu button stays out of the way until the row is hovered or keyboard-focused */
  .row-action {
    opacity: 0;
    transition: opacity 0.1s;
  }

  &:hover .row-action,
  &:focus-within .row-action {
    opacity: 1;
  }
}

.rename-input {
  padding: 0;
  background: none;
  border: none;
  border-bottom: 1px solid var(--p-primary-color);
  outline: none;
  font-family: inherit;
}
</style>
