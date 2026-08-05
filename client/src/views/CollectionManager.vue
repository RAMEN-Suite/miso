<script setup lang="ts">
import { ref, watch } from "vue";
import LoadingSpinner from "../components/LoadingSpinner.vue";
import Splitter from "primevue/splitter";
import SplitterPanel from "primevue/splitterpanel";
import { useHierarchyStore } from "../store/hierarchy";
import HierarchyBreadcrumbs from "../components/HierarchyBreadcrumbs.vue";
import HierarchyColumn from "../components/HierarchyColumn.vue";
import FocusPane from "../components/FocusPane.vue";
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from "vue-router";
import { HierarchyPath } from "../models/types";
import CollectionPathError from "../components/CollectionPathError.vue";
import { useAppStore } from "../store/app";
import PageOverlay from "../components/PageOverlay.vue";
import { LocationQueryValue } from "vue-router";

// Initial pageload
const isLoading = ref<boolean>(true);
const isPathValid = ref<boolean>(false);

const route = useRoute();

const { addToastMessage } = useAppStore();
const { canNavigate, levels, path, createNewUrlPath, restoreDefaultView, validatePath, updateLevelsAndFetchData } =
  useHierarchyStore();

const router = useRouter();

watch(
  () => route.query.path,
  async (newValue: LocationQueryValue | LocationQueryValue[]) => {
    // TODO: This can be refactored...
    // On first page load
    if (isLoading.value) {
      try {
        // If path exists on page load, validate it. Else, just fetch top-level nodes
        const newPath: HierarchyPath = newValue ? await validatePath(newValue as string) : [];
        await updateLevelsAndFetchData(newPath);

        isPathValid.value = true;
      } catch {
        isPathValid.value = false;
      } finally {
        isLoading.value = false;
      }

      return;
    }

    // Empty path query -> Restore default view
    if (!newValue || newValue === "") {
      restoreDefaultView();
      return;
    }

    try {
      const newPath: HierarchyPath = await validatePath(newValue as string);
      await updateLevelsAndFetchData(newPath);

      isPathValid.value = true;
    } catch {
      isPathValid.value = false;
    } finally {
      isLoading.value = false;
    }
  },
  { immediate: true },
);

onBeforeRouteLeave(() => {
  if (!canNavigate.value) {
    showUnsavedChangesWarning();
    return false;
  }

  return true;
});

onBeforeRouteUpdate(() => {
  if (!canNavigate.value) {
    showUnsavedChangesWarning();
    return false;
  }

  return true;
});

async function handleBreadcrumbItemClick(data: { index: number; uuid: string }): Promise<void> {
  if (!canNavigate.value) {
    showUnsavedChangesWarning();
    return;
  }

  const { index, uuid } = data;

  await router.push({ query: { path: createNewUrlPath(uuid, index) } });
}

async function handleBreadcrumbHomeClick(): Promise<void> {
  if (!canNavigate.value) {
    showUnsavedChangesWarning();
    return;
  }

  await router.push({ query: {} });
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
  <template v-if="!isLoading && !isPathValid">
    <CollectionPathError />
  </template>
  <template v-else>
    <LoadingSpinner v-if="isLoading === true" />

    <div v-else class="container flex flex-column h-full">
      <PageOverlay v-if="canNavigate === false" @click="showUnsavedChangesWarning"></PageOverlay>
      <div class="main flex-grow-1 flex flex-column">
        <HierarchyBreadcrumbs :path="path" @item-clicked="handleBreadcrumbItemClick" @home-clicked="handleBreadcrumbHomeClick" />

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
  </template>
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
