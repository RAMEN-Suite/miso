<script setup lang="ts">
import { DeepReadonly, useTemplateRef } from "vue";
import Button from "primevue/button";
import Menu from "primevue/menu";
import { MenuItem } from "primevue/menuitem";
import { SmartView } from "../models/types";

const SMART_VIEW_ICON: string = "icon-folder-cog";
const SMART_VIEW_ICON_ACTIVE: string = "icon-folder-cog";

const props = defineProps<{
  view: DeepReadonly<SmartView>;
  isActive: boolean;
}>();

const emit = defineEmits<(e: "select" | "edit" | "delete") => void>();

const menu = useTemplateRef<InstanceType<typeof Menu>>("menu");

const menuItems: MenuItem[] = [
  { label: "Edit", icon: "icon-pencil", command: () => emit("edit") },
  { label: "Delete", icon: "icon-trash-2", command: () => emit("delete") },
];

function handleOpenMenu(event: Event): void {
  menu.value?.toggle(event);
}
</script>

<template>
  <li>
    <div
      class="nav-item flex items-center gap-2 p-1"
      :class="{ active: props.isActive }"
      role="link"
      tabindex="0"
      :aria-current="props.isActive ? 'true' : undefined"
      :title="`Show everything matching ${props.view.label}`"
      @click="emit('select')"
      @keydown.enter.self="emit('select')"
      @keydown.space.self="emit('select')"
    >
      <i :class="[props.isActive ? SMART_VIEW_ICON_ACTIVE : SMART_VIEW_ICON, 'shrink-0']" />

      <span
        role="button"
        tabindex="0"
        class="text-sm grow min-w-0 text-ellipsis overflow-hidden whitespace-nowrap select-none"
        @dblclick="emit('edit')"
        @keydown.enter="emit('edit')"
        @keydown.space="emit('edit')"
      >
        {{ props.view.label }}
      </span>

      <Button
        class="row-action"
        icon="icon-ellipsis-vertical"
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
</style>
