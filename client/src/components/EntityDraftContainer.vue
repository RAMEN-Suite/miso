<script setup lang="ts">
import { ComponentPublicInstance, computed, onMounted, ref, useTemplateRef } from "vue";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import InputGroup from "primevue/inputgroup";
import InputGroupAddon from "primevue/inputgroupaddon";
import { EntityNode, NodeStatusObject } from "../models/types.ts";
import RAMENNodeIcon from "./RAMENNodeIcon.vue";
import { resolveNodeIcon } from "../config/icons.ts";
import { createEntityNodeStatusObject, filterBaseNodeLabel } from "../utils/helper/helper.ts";

const props = defineProps<{
  nodeLabels: string[];
}>();

const emit = defineEmits<{
  (e: "entityAdded", entity: NodeStatusObject<EntityNode>): void;
  (e: "entityDiscarded"): void;
}>();

const labelInput = useTemplateRef<ComponentPublicInstance>("label-input");

const additionalNodeLabels: string[] = filterBaseNodeLabel(props.nodeLabels);

const draft = ref<NodeStatusObject<EntityNode>>(createEntityNodeStatusObject({ additionalNodeLabels }));

const isEmptyDraft = computed<boolean>(() => draft.value.node.data.label.trim().length === 0);

onMounted(() => {
  labelInput.value?.$el?.focus();
});

function handleSubmit(): void {
  if (isEmptyDraft.value) {
    return;
  }

  draft.value.node.data.label = draft.value.node.data.label.trim();

  emit("entityAdded", draft.value);
}

function handleDiscardClick(): void {
  emit("entityDiscarded");
}
</script>

<template>
  <form class="flex flex-col gap-3 my-2 p-4 text-left" @submit.prevent="handleSubmit">
    <div class="flex flex-col gap-1">
      <!-- eslint-disable-next-line vuejs-accessibility/label-has-for -- Eslint config does not recognize PrimeVue's component -->
      <label for="entity-label" class="sr-only">Label</label>
      <InputGroup>
        <InputGroupAddon class="w-12">
          <RAMENNodeIcon :spec="resolveNodeIcon(draft.node.nodeLabels)" />
        </InputGroupAddon>
        <InputText
          id="entity-label"
          ref="label-input"
          v-model="draft.node.data.label"
          :placeholder="`Add ${additionalNodeLabels.join(', ')} label`"
          autocomplete="off"
          spellcheck="false"
        />
        <Button
          type="submit"
          size="small"
          icon="icon-check"
          :disabled="isEmptyDraft"
          :title="isEmptyDraft ? 'Enter a label first' : 'Confirm new entity'"
        />
        <Button
          type="button"
          size="small"
          icon="icon-x"
          severity="secondary"
          title="Discard new entity"
          @click="handleDiscardClick"
        />
      </InputGroup>
    </div>
  </form>
</template>
