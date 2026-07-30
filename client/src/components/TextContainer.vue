<script setup lang="ts">
import { NodeStatusObject, TextNode } from "../models/types";
import Card from "primevue/card";
import NodeTag from "./NodeTag.vue";
import Button from "primevue/button";
import Textarea from "primevue/textarea";
import { computed } from "vue";
import NodeStatusBadge from "./NodeStatusBadge.vue";
import { filterBaseNodeLabel } from "../utils/helper/helper.ts";

const props = defineProps<{
  text: NodeStatusObject<TextNode>;
}>();

const emit = defineEmits<(e: "textAdded" | "textRemoved", text: NodeStatusObject<TextNode>) => void>();

const additionalNodeLabels = computed<string[]>(() => filterBaseNodeLabel(props.text.node.nodeLabels));

const isEmptyDraft = computed<boolean>(() => props.text.node.data.text.trim().length === 0);

const shouldBeDisplayed = computed<boolean>(() => {
  if (props.text.meta.status === "removed" || props.text.meta.status === "deleted") {
    return false;
  }

  return true;
});
</script>

<template>
  <Card
    class="my-2 text-left"
    :pt="{
      root: {
        style: {
          border: '1px solid gray',
          cursor: 'pointer',
          display: shouldBeDisplayed ? 'block' : 'none',
        },
      },
      body: {
        style: {
          padding: '15px',
        },
      },
    }"
  >
    <template #title>
      <div class="header">
        <div class="button-pane flex justify-content-end align-items-center">
          <NodeStatusBadge :status="props.text.meta.status" :style="{ marginRight: 'auto' }" />
        </div>
        <div class="node-labels-container">
          <NodeTag v-for="nodeLabel in additionalNodeLabels" :key="nodeLabel" type="Content" :content="nodeLabel" class="mr-1" />
        </div>
      </div>
    </template>

    <template #content>
      <Textarea v-model="text.node.data.text" class="w-full" placeholder="Add text" />
    </template>

    <template #footer>
      <div class="flex justify-content-center gap-2">
        <Button
          class="w-2"
          icon="pi pi-check"
          :disabled="isEmptyDraft"
          :title="isEmptyDraft ? 'Enter a text first' : 'Confirm new text'"
          @click.stop="handleAddTextClick"
        />
      </div>
    </template>
  </Card>
</template>

<style scoped>
.text a {
  color: inherit;
  display: block;
}

*:has(.text):hover {
  background-color: #efefef;
  transition: background-color 0.2s;
}
</style>
