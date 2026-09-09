<script setup lang="ts">
import { computed } from "vue";
import { ToCItem } from "../models/types";
import { ellipsize } from "../utils/helper/helper.ts";

const props = defineProps<{
  item: ToCItem;
}>();

const emit = defineEmits<(e: "itemClick", node: ToCItem) => void>();

const displayedText = computed<string>(() => ellipsize(props.item.data.text, 20));
const displayedLabel = computed<string>(() => {
  const item: ToCItem = props.item;

  if (item.data.nodeType === "heading") {
    return `h${item.data.level}`;
  } else if (item.data.nodeType === "paragraph") {
    return "p";
  } else {
    return item.data._annotationData.type;
  }
});

function handleNodeSelect() {
  emit("itemClick", props.item);
}
</script>

<template>
  <div class="flex align-items-center gap-2">
    <div
      class="type-container ml-1 flex align-items-center gap-3 flex-grow-1"
      tabindex="0"
      role="button"
      @click="handleNodeSelect"
      @keydown.enter="handleNodeSelect"
      @keydown.space.prevent="handleNodeSelect"
    >
      <span> {{ displayedLabel }} </span>
      <small :title="props.item.data.text" class="font-italic">
        {{ displayedText }}
      </small>
    </div>
  </div>
</template>
