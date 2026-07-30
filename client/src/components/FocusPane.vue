<script setup lang="ts">
import { computed } from "vue";
import { useHierarchyStore } from "../store/hierarchy";
import CollectionEditPane from "./CollectionEditPane.vue";
import ContentFocusPane from "./ContentFocusPane.vue";
import ProgressSpinner from "primevue/progressspinner";
import { CollectionFocus, ContentFocus } from "../models/types";

const { focus, isFetchingFocus } = useHierarchyStore();

const collectionFocus = computed<CollectionFocus | null>(() => (focus.value?.kind === "collection" ? focus.value : null));
const contentFocus = computed<ContentFocus | null>(() => (focus.value?.kind === "content" ? focus.value : null));
</script>

<template>
  <div v-if="isFetchingFocus" class="w-full h-full flex justify-content-center align-items-center">
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

  <div v-else class="w-full h-full flex justify-content-center align-items-center font-italic">
    <div class="text-center">
      <p>No node selected</p>
    </div>
  </div>
</template>

<style scoped></style>
