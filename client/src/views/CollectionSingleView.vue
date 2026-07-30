<script setup lang="ts">
import { RouteLocationNormalized, useRoute } from "vue-router";
import { CollectionNode, NodeAncestry, NodeDto } from "../models/types";
import HierarchyBreadcrumbs from "../components/HierarchyBreadcrumbs.vue";
import Card from "primevue/card";

const route: RouteLocationNormalized = useRoute();

const uuid: string = route.params.uuid as string;

// These two are added to the route in the beforeEnter navigation guard
const collection: NodeDto<CollectionNode> | undefined = route.meta.collection;
const ancestryPaths: NodeAncestry[] = route.meta.ancestryPaths ?? [];
</script>
<template>
  <div class="container text-center">
    <h2>Collection "{{ collection?.node.data.label }}"</h2>

    <p>This collection is part of {{ ancestryPaths.length }} hierarchies. Select one of them:</p>

    <div class="collection-path-pane flex flex-column align-items-center">
      <RouterLink
        v-for="(path, i) in ancestryPaths"
        :key="i"
        :to="`/?path=${[...path.map((n) => n.node.data.uuid), uuid].join(',')}`"
      >
        <Card
          class="path cursor-pointer mb-4"
          title="Open collection in this path"
          :style="{
            boxShadow: 'rgba(0, 0, 0, 0.02) 0px 1px 3px 0px,rgba(27, 31, 35, 0.15) 0px 0px 0px 1px',
            minWidth: '400px',
          }"
        >
          <template #content>
            <div class="flex justify-content-center">
              <HierarchyBreadcrumbs :path="path" />
            </div>
          </template>
        </Card>
      </RouterLink>
    </div>
  </div>
</template>

<style scoped>
.path:hover {
  transition: 200ms;
  background-color: hsl(0, 0%, 90%) !important;
}
</style>
