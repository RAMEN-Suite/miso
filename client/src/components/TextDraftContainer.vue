<script setup lang="ts">
import { ComponentPublicInstance, computed, onMounted, useTemplateRef } from "vue";
import Button from "primevue/button";
import Textarea from "primevue/textarea";
import { NodeStatusObject, TextNode } from "../models/types";
import { filterBaseNodeLabel } from "../utils/helper/helper";

const props = defineProps<{
  text: NodeStatusObject<TextNode>;
}>();

const emit = defineEmits<(e: "textAdded" | "textDiscarded", text: NodeStatusObject<TextNode>) => void>();

const textInput = useTemplateRef<ComponentPublicInstance>("text-input");

const additionalNodeLabels = computed<string[]>(() => filterBaseNodeLabel(props.text.node.nodeLabels));
const isEmptyDraft = computed<boolean>(() => props.text.node.data.text.trim().length === 0);

onMounted(() => {
  textInput.value?.$el?.focus();
});

function handleSubmit(): void {
  if (isEmptyDraft.value) {
    return;
  }

  emit("textAdded", props.text);
}

function handleDiscardClick(): void {
  emit("textDiscarded", props.text);
}
</script>

<template>
  <form class="flex flex-col gap-3 my-2 p-4 text-left" @submit.prevent="handleSubmit">
    <label for="text-value" class="sr-only">Text</label>
    <!-- The textarea is multi-line, so Enter inserts a newline and the draft is confirmed with the button below -->
    <Textarea
      id="text-value"
      ref="text-input"
      v-model="text.node.data.text"
      rows="3"
      auto-resize
      class="w-full"
      :placeholder="`Add ${additionalNodeLabels.join(', ')} text`"
      autocomplete="off"
    />

    <div class="flex justify-center gap-2">
      <Button
        type="submit"
        icon="icon-check"
        size="small"
        :disabled="isEmptyDraft"
        :title="isEmptyDraft ? 'Enter a text first' : 'Confirm new text'"
      />
      <Button
        type="button"
        icon="icon-x"
        size="small"
        severity="secondary"
        title="Discard new text"
        @click="handleDiscardClick"
      />
    </div>
  </form>
</template>
