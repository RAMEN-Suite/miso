<script setup lang="ts">
import { computed, onMounted, ref, Ref } from "vue";
import { useRouter } from "vue-router";
import { CollectionNode, NodeAncestry, NodeDto } from "../models/types";
import HierarchyBreadcrumbs from "../components/HierarchyBreadcrumbs.vue";
import LoadingSpinner from "../components/LoadingSpinner.vue";
import Card from "primevue/card";
import { useHierarchyStore } from "../store/hierarchy";
import { useAppStore } from "../store/app";

const props = defineProps<{
  uuid: string;
}>();

const router = useRouter();

const { addToastMessage, api } = useAppStore();
const { updatePath } = useHierarchyStore();

const collection: Ref<NodeDto<CollectionNode> | null> = ref(null);
const ancestryPaths = ref<NodeAncestry[]>([]);

const hasChoice = computed<boolean>(() => collection.value !== null && ancestryPaths.value.length > 1);

onMounted(async () => {
  try {
    const [paths, node] = await Promise.all([api.getHierarchyNodeAncestry(props.uuid), api.getCollection(props.uuid)]);

    if (paths.length <= 1) {
      updatePath([...(paths[0] ?? []), node]);

      await router.replace("/");

      return;
    }

    ancestryPaths.value = paths;
    collection.value = node;
  } catch (error: unknown) {
    addToastMessage({
      severity: "error",
      summary: "Collection could not be opened",
      detail: error instanceof Error ? error.message : "",
      life: 3000,
    });

    await router.replace("/");
  }
});

/**
 * Opens the collection in the hierarchy view along the ancestry path the user picked. The path is
 * handed to the store directly — the hierarchy view is not addressable by URL.
 *
 * @param {NodeAncestry} ancestry - The ancestry path to open the collection in.
 * @returns {Promise<void>} Resolves once the hierarchy view has been navigated to.
 */
async function handlePathClick(ancestry: NodeAncestry): Promise<void> {
  if (!collection.value) {
    return;
  }

  updatePath([...ancestry, collection.value]);

  await router.replace("/");
}
</script>
<template>
  <div v-if="hasChoice" class="container text-center">
    <h2>Collection "{{ collection?.node.data.label }}"</h2>

    <p>This collection is part of {{ ancestryPaths.length }} hierarchies. Select one of them:</p>

    <div class="collection-path-pane flex flex-column align-items-center">
      <Card
        v-for="(path, i) in ancestryPaths"
        :key="i"
        class="path cursor-pointer mb-4"
        title="Open collection in this path"
        role="link"
        tabindex="0"
        :style="{
          boxShadow: 'rgba(0, 0, 0, 0.02) 0px 1px 3px 0px,rgba(27, 31, 35, 0.15) 0px 0px 0px 1px',
          minWidth: '400px',
        }"
        @click="handlePathClick(path)"
        @keydown.enter="handlePathClick(path)"
      >
        <template #content>
          <div class="flex justify-content-center">
            <HierarchyBreadcrumbs :path="path" />
          </div>
        </template>
      </Card>
    </div>
  </div>

  <LoadingSpinner v-else />
</template>

<style scoped>
.path:hover {
  transition: 200ms;
  background-color: hsl(0, 0%, 90%) !important;
}
</style>
