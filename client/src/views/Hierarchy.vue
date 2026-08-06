<script setup lang="ts">
import Button from "primevue/button";
import Splitter from "primevue/splitter";
import SplitterPanel from "primevue/splitterpanel";
import { useHierarchyStore } from "../store/hierarchy";
import HierarchyBreadcrumbs from "../components/HierarchyBreadcrumbs.vue";
import HierarchyColumn from "../components/HierarchyColumn.vue";
import HierarchySidebar from "../components/HierarchySidebar.vue";
import FocusPane from "../components/FocusPane.vue";
import { onBeforeRouteLeave } from "vue-router";
import { useAppStore } from "../store/app";
import PageOverlay from "../components/PageOverlay.vue";

const { addToastMessage } = useAppStore();
const { canGoBack, canGoForward, canNavigate, levels, path, clearSelection, goBack, goForward, initialize, updatePath } =
  useHierarchyStore();

initialize();

onBeforeRouteLeave(() => {
  if (!canNavigate.value) {
    showUnsavedChangesWarning();
    return false;
  }

  return true;
});

function handleBreadcrumbItemClick(data: { index: number; uuid: string }): void {
  if (!canNavigate.value) {
    showUnsavedChangesWarning();
    return;
  }

  updatePath(path.value.slice(0, data.index + 1));
}

function handleBreadcrumbHomeClick(): void {
  if (!canNavigate.value) {
    showUnsavedChangesWarning();
    return;
  }

  clearSelection();
}

function showUnsavedChangesWarning() {
  addToastMessage({
    severity: "warn",
    summary: "You have unsaved changes.",
    detail: "Please save or discard your changes before selecting other collections.",
    life: 3000,
  });
}
</script>

<template>
  <div class="page flex h-full">
    <HierarchySidebar />
    <div class="container flex flex-column flex-grow-1 min-w-0 h-full">
      <PageOverlay v-if="canNavigate === false" @click="showUnsavedChangesWarning"></PageOverlay>
      <div class="main flex-grow-1 flex flex-column">
        <div class="breadcrumb-bar flex align-items-center gap-1 pl-1">
          <!-- <Button
            size="small"
            severity="secondary"
            text
            icon="pi pi-arrow-left"
            title="Back to the previous selection"
            :disabled="!canGoBack"
            @click="goBack"
          />
          <Button
            size="small"
            severity="secondary"
            text
            icon="pi pi-arrow-right"
            title="Forward to the next selection"
            :disabled="!canGoForward"
            @click="goForward"
          /> -->
          <HierarchyBreadcrumbs
            :path="path"
            class="flex-grow-1 min-w-0"
            @item-clicked="handleBreadcrumbItemClick"
            @home-clicked="handleBreadcrumbHomeClick"
          />
        </div>

        <div class="edit-area flex-grow-1">
          <Splitter
            class="h-full gap-2"
            :pt="{
              gutter: {
                style: {
                  width: '4px',
                  zIndex: 'var(--z-index-gutter)',
                },
              },
              gutterHandle: {
                style: {
                  width: '6px',
                  position: 'absolute',
                  backgroundColor: 'darkgray',
                  height: '40px',
                },
              },
            }"
          >
            <SplitterPanel class="overflow-y-auto">
              <div class="columns-container h-full flex overflow-x-scroll">
                <!-- eslint-disable-next-line vue/valid-v-for -- No key needed currently,
                 column fetches it's new state all the time. TODO: This will likely be refactored in the near future though -->
                <HierarchyColumn v-for="(_, index) in levels" :index="index" :parent-uuid="levels[index].parentUuid" />
              </div>
            </SplitterPanel>
            <SplitterPanel :size="20" class="overflow-y-auto">
              <FocusPane />
            </SplitterPanel>
          </Splitter>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.container {
  outline: 1px solid green;

  .main,
  .edit-area {
    overflow-y: hidden;
  }
}
</style>
