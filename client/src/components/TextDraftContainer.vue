<script setup lang="ts">
import { ComponentPublicInstance, computed, onMounted, ref, useTemplateRef } from "vue";
import Button from "primevue/button";
import Textarea from "primevue/textarea";
import { NodeStatusObject, TextNode } from "../models/types";
import { createContentNodeStatusObject, filterBaseNodeLabel } from "../utils/helper/helper";

const props = defineProps<{
  nodeLabels: string[];
}>();

const emit = defineEmits<{
  (e: "textAdded", text: NodeStatusObject<TextNode>): void;
  (e: "textDiscarded"): void;
}>();

const textInput = useTemplateRef<ComponentPublicInstance>("text-input");

const additionalNodeLabels: string[] = filterBaseNodeLabel(props.nodeLabels);

const draft = ref<NodeStatusObject<TextNode>>(createContentNodeStatusObject({ additionalNodeLabels }));

const isEmptyDraft = computed<boolean>(() => draft.value.node.data.text.trim().length === 0);

onMounted(() => {
  textInput.value?.$el?.focus();
});

function handleSubmit(): void {
  if (isEmptyDraft.value) {
    return;
  }

  draft.value.node.data.text = draft.value.node.data.text.replace(/(\r\n|\n|\r)/g, " ");

  emit("textAdded", draft.value);
}

function handleDiscardClick(): void {
  emit("textDiscarded");
}
</script>

<template>
  <form class="flex flex-col gap-3 my-2 p-4 text-left" @submit.prevent="handleSubmit">
    <!-- eslint-disable-next-line vuejs-accessibility/label-has-for -- Eslint config does not recognize PrimeVue's component -->
    <label for="text-value" class="sr-only">Text</label>
    <Textarea
      id="text-value"
      ref="text-input"
      v-model="draft.node.data.text"
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
