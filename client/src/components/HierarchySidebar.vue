<script setup lang="ts">
import { ref } from "vue";
import { useEventListener } from "@vueuse/core";
import Button from "primevue/button";

const MIN_WIDTH = 200;
const MAX_WIDTH = 600;

const width = ref<number>(280);
const isResizing = ref<boolean>(false);

const navItems: { label: string; icon: string }[] = [
  { label: "Collections", icon: "pi pi-folder" },
  { label: "Bookmarked", icon: "pi pi-bookmark" },
];

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
        <Button label="New" icon="pi pi-plus" class="align-self-start" />

        <nav aria-label="Collection navigation">
          <ul class="nav-list flex flex-column gap-1 list-none p-0 m-0">
            <li v-for="item in navItems" :key="item.label">
              <div class="nav-item flex align-items-center gap-2 p-2 border-round" role="link" tabindex="0">
                <i :class="item.icon" class="flex-shrink-0" />
                <span class="text-sm">{{ item.label }}</span>
              </div>
            </li>
          </ul>
        </nav>
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
  }
}
</style>
