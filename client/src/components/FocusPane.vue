<script setup lang="ts">
import { computed } from "vue";
import { useHierarchyStore } from "../store/hierarchy";
import CollectionEditPane from "./CollectionEditPane.vue";
import ContentFocusPane from "./ContentFocusPane.vue";
import MultiSelectionPane from "./MultiSelectionPane.vue";
import ProgressSpinner from "primevue/progressspinner";
import { CollectionFocus, ContentFocus } from "../models/types";

const { focus, isFetchingFocus, multiSelection } = useHierarchyStore();

const collectionFocus = computed<CollectionFocus | null>(() => (focus.value?.kind === "collection" ? focus.value : null));
const contentFocus = computed<ContentFocus | null>(() => (focus.value?.kind === "content" ? focus.value : null));
</script>

<template>
  <MultiSelectionPane v-if="multiSelection" :selection="multiSelection" />
  <div v-else-if="isFetchingFocus" class="w-full h-full flex justify-center items-center">
    <ProgressSpinner
      style="width: 80px; height: 80px"
      stroke-width="2"
      fill="transparent"
      animation-duration="1.5s"
      aria-label="Loading focus data"
      :dt="{ root: { colorOne: 'black', colorTwo: 'black', colorThree: 'black', colorFour: 'black' } }"
    />
  </div>

  <CollectionEditPane v-else-if="collectionFocus" :focus="collectionFocus" />
  <ContentFocusPane v-else-if="contentFocus" :focus="contentFocus" />

  <div v-else class="empty-state w-full h-full flex flex-col items-center justify-center gap-2 text-center text-sm">
    <i class="icon-square-dashed-mouse-pointer text-2xl" />
    <small>Nothing selected</small>
  </div>
</template>

<style scoped>
.empty-state {
  color: var(--p-text-muted-color);
}
</style>
