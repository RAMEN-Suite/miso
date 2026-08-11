<script setup lang="ts">
import { RouterLink } from "vue-router";
import { useTextStore } from "../store/text";
import Button from "primevue/button";
import Fieldset from "primevue/fieldset";
import InputText from "primevue/inputtext";
import Panel from "primevue/panel";
import NodeTag from "./NodeTag.vue";
import { MenuItem } from "primevue/menuitem";
import Breadcrumb from "primevue/breadcrumb";
import { ref } from "vue";

const { text, correspondingCollection } = useTextStore();

const breadcrumbRoot = ref<MenuItem>({
  role: "Collection",
  label: correspondingCollection.value?.data.label,
  uuid: correspondingCollection.value?.data.uuid,
});
const breadcrumbItems = ref<MenuItem[]>([{ role: "Content", labels: text.value.nodeLabels }]);

async function handleCopy(): Promise<void> {
  await navigator.clipboard.writeText(text.value.data.uuid);
}
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
        <InputText id="uuid" :disabled="true" :value="text.data.uuid" class="flex-auto w-full" size="small" spellcheck="false" />
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
    <Fieldset legend="Text labels" toggleable>
      <template #toggleicon="{ collapsed }">
        <span :class="`pi pi-chevron-${collapsed ? 'down' : 'up'}`"></span>
      </template>
      <div class="flex gap-2">
        <template v-if="text.nodeLabels.length > 0">
          <NodeTag v-for="label in text.nodeLabels" :key="label" :content="label" type="Content" class="mr-1" />
        </template>
        <div v-else>
          <i v-if="correspondingCollection"
            >This text has no labels yet. To add some, go to the
            <RouterLink :to="`/collections/${correspondingCollection.data.uuid}`"
              >Collection page.<i class="pi pi-external-link ml-2"></i></RouterLink
          ></i>
        </div>
      </div>
    </Fieldset>

    <Fieldset legend="Ancestry path" toggleable>
      <template #toggleicon="{ collapsed }">
        <span :class="`pi pi-chevron-${collapsed ? 'down' : 'up'}`"></span>
      </template>
      <div class="flex justify-content-center align-items-center">
        <Breadcrumb :home="breadcrumbRoot" :model="breadcrumbItems">
          <template #item="{ item }">
            <div v-if="item.role === 'Collection'">
              <RouterLink :to="`/collections/${item.uuid}`" severity="contrast" :title="`Collection: ${item.label}`">
                {{ item.label }}
              </RouterLink>
            </div>
            <div v-else class="text-labels">
              <template v-if="item.labels.length > 0">
                <NodeTag v-for="label in item.labels" :key="label" :content="label" type="Content" class="mr-1 mb-1" />
              </template>
              <span v-else class="font-italic" title="This Text has no labels yet">No Text labels yet</span>
            </div>
          </template>
        </Breadcrumb>
      </div>
    </Fieldset>
  </Panel>
</template>

<style scoped>
.metadata-container {
  outline: 1px solid var(--p-primary-color);
}
</style>
