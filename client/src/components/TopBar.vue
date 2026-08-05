<script setup lang="ts">
import { useTemplateRef } from "vue";
import Button from "primevue/button";
import Menu from "primevue/menu";
import type { MenuItem } from "primevue/menuitem";
import EditorSettingsButton from "./EditorSettingsButton.vue";
import BookmarkButton from "./BookmarkButton.vue";

const appsMenu = useTemplateRef<InstanceType<typeof Menu>>("appsMenu");

const appItems: MenuItem[] = [
  {
    label: "Tori",
    icon: "pi pi-wrench",
    url: "/api/tools/tori",
    target: "_blank",
  },
  {
    label: "Shoyu",
    icon: "pi pi-wrench",
    url: "/api/tools/shoyu",
    target: "_blank",
  },
];

function toggleAppsMenu(event: PointerEvent): void {
  appsMenu.value?.toggle(event);
}
</script>

<template>
  <header class="top-bar flex justify-content-between align-items-center gap-2 p-1">
    <nav class="flex align-items-center gap-2">
      <RouterLink to="/">
        <Button icon="pi pi-home" aria-label="Home" class="w-2rem h-2rem" title="Go to overview"></Button>
      </RouterLink>
    </nav>
    <div class="flex align-items-center gap-2">
      <BookmarkButton />
      <EditorSettingsButton />
      <Button
        icon="pi pi-ellipsis-v"
        severity="secondary"
        aria-label="Open apps"
        aria-haspopup="true"
        aria-controls="apps-menu"
        title="Open apps"
        class="w-2rem h-2rem"
        @click="toggleAppsMenu"
      />
      <Menu id="apps-menu" ref="appsMenu" :model="appItems" :popup="true" />
    </div>
  </header>
</template>

<style scoped>
.top-bar {
  flex-shrink: 0;
  /* TODO: This should be a theme variable */
  border-bottom: 1px solid var(--p-splitter-gutter-background);
}
</style>
