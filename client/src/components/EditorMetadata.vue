<script setup lang="ts">
import Button from "primevue/button";
import Fieldset from "primevue/fieldset";
import InputText from "primevue/inputtext";
import Panel from "primevue/panel";
import { ref, watch } from "vue";
import { useAppStore } from "../store/app.ts";
import { NodeAncestry } from "../models/types.ts";
import HierarchyBreadcrumbs from "./HierarchyBreadcrumbs.vue";

const { api } = useAppStore();

const props = defineProps<{
  contentUuid: string;
}>();

const paths = ref<NodeAncestry[]>([]);

async function handleCopy(): Promise<void> {
  await navigator.clipboard.writeText(props.contentUuid);
}

watch(
  () => props.contentUuid,
  async () => {
    const ancestries: NodeAncestry[] = await api.getHierarchyNodeAncestry(props.contentUuid);
    const shortenedPaths: NodeAncestry[] = ancestries
      .filter((a) => a.length > 0)
      .map((nodeAncestry: NodeAncestry) => [nodeAncestry[nodeAncestry.length - 1]]);

    paths.value = shortenedPaths;
  },
  { immediate: true },
);
</script>

<template>
  <Panel
    header="Metadata"
    class="metadata-container mb-3"
    toggleable
    collapsed
    :toggle-button-props="{
      severity: 'secondary',
      title: 'Toggle full view',
      rounded: true,
      text: true,
    }"
  >
    <template #toggleicon="{ collapsed }">
      <i :class="`pi pi-chevron-${collapsed ? 'down' : 'up'}`"></i>
    </template>
    <div class="mb-3">
      <div class="flex align-items-center gap-3">
        <InputText
          id="uuid"
          :disabled="true"
          :value="props.contentUuid"
          class="flex-auto w-full"
          size="small"
          spellcheck="false"
        />
        <Button
          icon="pi pi-copy"
          severity="secondary"
          size="small"
          aria-label="Copy UUID"
          title="Copy UUID"
          @click="handleCopy"
        />
      </div>
      <small>Text UUID</small>
    </div>

    <Fieldset legend="Ancestry path" toggleable>
      <template #toggleicon="{ collapsed }">
        <span :class="`pi pi-chevron-${collapsed ? 'down' : 'up'}`"></span>
      </template>
      <div class="flex justify-content-center align-items-center">
        <template v-for="path in paths">
          <HierarchyBreadcrumbs :path="path" />
        </template>
      </div>
    </Fieldset>
  </Panel>
</template>

<style scoped>
.metadata-container {
  outline: 1px solid var(--p-primary-color);
}
</style>
