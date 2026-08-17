<script setup lang="ts">
import { ComponentPublicInstance, computed, DeepReadonly, ref, useTemplateRef } from "vue";
import Button from "primevue/button";
import Menu from "primevue/menu";
import { MenuItem } from "primevue/menuitem";
import { useTagsStore } from "../store/tags";
import TagColorPopover from "./TagColorPopover.vue";
import { Tag } from "../models/types";
import { normalizeTagColor } from "../config/tags";

const props = defineProps<{
  tag: DeepReadonly<Tag>;
  isActive: boolean;
}>();

const emit = defineEmits<(e: "select" | "delete") => void>();

const { updateTag } = useTagsStore();

const menu = useTemplateRef<InstanceType<typeof Menu>>("menu");
const colorPopover = useTemplateRef<InstanceType<typeof TagColorPopover>>("color-popover");

const isRenaming = ref<boolean>(false);
const renameDraft = ref<string>("");

const menuItems: MenuItem[] = [
  { label: "Rename", icon: "pi pi-pencil", command: startRename },
  { label: "Delete", icon: "pi pi-trash", command: () => emit("delete") },
];

/**
 * The tag's colour as a writable model. The store owns the value and `tags` is readonly, so the
 * setter has to go through {@linkcode updateTag} — wrapping that in a computed is what lets the
 * chooser stay a plain `v-model` component instead of an event relay. The rest of the appearance
 * is carried over, so an icon set elsewhere survives a recolour.
 */
const color = computed<string>({
  get: () => normalizeTagColor(props.tag.appearance?.color),
  set: (value: string) => {
    updateTag({
      tagUuid: props.tag.uuid,
      appearance: { ...props.tag.appearance, color: normalizeTagColor(value) },
    });
  },
});

function handleOpenMenu(event: Event): void {
  menu.value?.toggle(event);
}

function handleOpenColorPopover(event: Event): void {
  colorPopover.value?.toggle(event);
}

/**
 * Turns the label into an input. Reached from the row menu and from a double click on the label.
 *
 * @returns {void} This function does not return any value.
 */
function startRename(): void {
  isRenaming.value = true;
  renameDraft.value = props.tag.label;
}

/**
 * Focuses the rename input and selects its text, so typing replaces the old label.
 *
 * A function ref rather than a named one: it runs on mount, which saves waiting a tick for the
 * element to exist. Vue re-runs a ref on every patch of its vnode, so this only acts while the
 * input does not already hold the focus — without that guard every keystroke re-selects the text,
 * and the next one replaces the whole label.
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
 * An empty label is discarded rather than saved — a nameless tag cannot be told apart in the list.
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

  updateTag({ tagUuid: props.tag.uuid, label });
}

/**
 * Handles keys inside the rename input, and keeps every one of them from reaching the row: the row
 * treats Enter and Space as "select this tag", which would otherwise swallow the space bar.
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
      :title="`Show everything tagged ${props.tag.label}`"
      @click="emit('select')"
      @keydown.enter.self="emit('select')"
      @keydown.space.self="emit('select')"
    >
      <button
        type="button"
        class="tag-dot flex-shrink-0"
        :style="{ backgroundColor: color }"
        :title="`Change the colour of ${props.tag.label}`"
        :aria-label="`Change the colour of ${props.tag.label}`"
        @click.stop="handleOpenColorPopover"
      ></button>

      <input
        v-if="isRenaming"
        :ref="focusRenameInput"
        v-model="renameDraft"
        class="rename-input text-sm flex-grow-1 min-w-0"
        spellcheck="false"
        :aria-label="`Rename ${props.tag.label}`"
        @blur="handleCommitRename"
        @keydown="handleRenameKeydown"
      />
      <span
        v-else
        role="button"
        tabindex="0"
        class="text-sm flex-grow-1 min-w-0 text-overflow-ellipsis overflow-hidden white-space-nowrap select-none"
        :style="{ color: props.isActive ? color : 'inherit' }"
        @dblclick="startRename"
        @keydown.enter="startRename"
        @keydown.space="startRename"
      >
        {{ props.tag.label }}
      </span>

      <Button
        class="row-action"
        icon="pi pi-ellipsis-v"
        severity="secondary"
        text
        rounded
        size="small"
        :title="`More options for ${props.tag.label}`"
        :aria-label="`More options for ${props.tag.label}`"
        @click.stop="handleOpenMenu"
      />
    </div>

    <Menu ref="menu" :model="menuItems" popup dismissable close-on-escape />

    <TagColorPopover ref="color-popover" v-model:color="color" />
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

.tag-dot {
  width: 9px;
  height: 9px;
  padding: 0;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.1s;

  &:hover {
    transform: scale(1.3);
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
