<script setup lang="ts">
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
import { MenuItem } from "primevue/menuitem";
import { computed, DeepReadonly, nextTick, onMounted, useTemplateRef, watch } from "vue";
import { useSmartViewsStore } from "../store/smartViews.ts";
import { SmartView, Tag } from "../models/types.ts";
import { useTagsStore } from "../store/tags.ts";
import { normalizeTagColor } from "../config/tags";
import { useScroll } from "@vueuse/core";

const { addToastMessage } = useAppStore();
const { canNavigate, levels, path, root, clearSelection, initialize, updatePath } = useHierarchyStore();
const { getSmartView } = useSmartViewsStore();
const { getTag } = useTagsStore();

const breadcrumbHome = computed<MenuItem>(() => {
  if (root.value.kind === "database") {
    return { icon: "icon-home" };
  } else if (root.value.kind === "smartView") {
    const view: SmartView | null = getSmartView(root.value.uuid);

    return { icon: "icon-folder", label: view?.label ?? "" };
  } else {
    const tag: DeepReadonly<Tag> | null = getTag(root.value.uuid);

    return { icon: "icon-tag", label: tag?.label ?? "", color: normalizeTagColor(tag?.appearance?.color) };
  }
});

const columnsContainer = useTemplateRef<HTMLDivElement>("columns-container");
const columnsTrack = useTemplateRef<HTMLDivElement>("columns-track");

initialize();

useScroll(columnsContainer, { onStop: releaseTrackWidth });

watch(path, applyScrollingBehaviour);

onMounted(() => scrollToLastColumn("instant"));

onBeforeRouteLeave(() => {
  if (!canNavigate.value) {
    showUnsavedChangesWarning();
    return false;
  }

  return true;
});

/**
 * Scrolls the last column into view after the path changed.
 *
 * Locks the track width while the old columns are still rendered,
 * then waits for the new columns to render before scrolling.
 * This guarantees smooth scrolling even on backwards navigation.
 *
 * @returns {Promise<void>} Resolves once the scroll has been started.
 */
async function applyScrollingBehaviour(): Promise<void> {
  lockTrackWidth();

  await nextTick();

  scrollToLastColumn("smooth");
}

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

/**
 * Keeps the columns track at its current width, so removed columns do not shrink the scroll pane
 * while the smooth scroll is still running.
 *
 * @returns {void} This function does not return any value.
 */
function lockTrackWidth(): void {
  if (columnsTrack.value) {
    columnsTrack.value.style.minWidth = `${columnsTrack.value.offsetWidth}px`;
  }
}

/**
 * Removes the width lock set by {@linkcode lockTrackWidth}, letting the track shrink to its columns again.
 *
 * @returns {void} This function does not return any value.
 */
function releaseTrackWidth(): void {
  if (columnsTrack.value) {
    columnsTrack.value.style.minWidth = "";
  }
}

/**
 * Scrolls the columns container so the last column ends at its right edge.
 *
 * @param {ScrollBehavior} behavior - How to scroll: `"smooth"` animates, `"instant"` jumps.
 * @returns {void} This function does not return any value.
 */
function scrollToLastColumn(behavior: ScrollBehavior): void {
  const container: HTMLDivElement | null = columnsContainer.value;
  const lastElement: HTMLElement | null = (columnsTrack.value?.lastElementChild as HTMLElement | null) ?? null;

  if (!container || !lastElement) {
    return;
  }

  const target: number = Math.max(0, lastElement.offsetLeft + lastElement.offsetWidth - container.clientWidth);

  if (Math.abs(container.scrollLeft - target) < 1) {
    // Nothing to scroll, so `onStop` would never fire and release the lock
    releaseTrackWidth();

    return;
  }

  container.scrollTo({ left: target, behavior });
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
    <div class="page-container flex flex-col grow min-w-0 h-full">
      <PageOverlay v-if="canNavigate === false" @click="showUnsavedChangesWarning"></PageOverlay>
      <div class="main grow flex flex-col">
        <div class="breadcrumb-bar flex items-center gap-1 pl-1">
          <HierarchyBreadcrumbs
            :home="breadcrumbHome"
            :path="path"
            class="grow min-w-0"
            @item-clicked="handleBreadcrumbItemClick"
            @home-clicked="handleBreadcrumbHomeClick"
          />
        </div>

        <div class="edit-area grow">
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
              <div ref="columns-container" class="columns-container h-full overflow-x-scroll">
                <!-- The "relative" class is important for measuring the track width -->
                <div ref="columns-track" class="relative h-full flex w-max">
                  <!-- eslint-disable-next-line vue/valid-v-for -- No key needed currently, column fetches it's new state all the time. TODO: This will likely be refactored in the near future though -->
                  <HierarchyColumn v-for="(_, index) in levels" :index="index" :parent-uuid="levels[index].parentUuid" />
                </div>
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
.page-container {
  outline: 1px solid green;

  .main,
  .edit-area {
    overflow-y: hidden;
  }
}
</style>
