<script setup lang="ts">
import { ComponentPublicInstance, computed, onMounted, useTemplateRef } from "vue";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import InputGroup from "primevue/inputgroup";
import InputGroupAddon from "primevue/inputgroupaddon";
import { EntityNode, NodeStatusObject } from "../models/types.ts";
import RAMENNodeIcon from "./RAMENNodeIcon.vue";
import { resolveNodeIcon } from "../config/icons.ts";
import { filterBaseNodeLabel } from "../utils/helper/helper.ts";

const props = defineProps<{
  entity: NodeStatusObject<EntityNode>;
}>();

const emit = defineEmits<(e: "entityAdded" | "entityDiscarded", entity: NodeStatusObject<EntityNode>) => void>();

const labelInput = useTemplateRef<ComponentPublicInstance>("label-input");

const additionalNodeLabels = computed<string[]>(() => filterBaseNodeLabel(props.entity.node.nodeLabels));
const isEmptyDraft = computed<boolean>(() => props.entity.node.data.label.trim().length === 0);

onMounted(() => {
  labelInput.value?.$el?.focus();
});

function handleSubmit(): void {
  if (isEmptyDraft.value) {
    return;
  }

  emit("entityAdded", props.entity);
}

function handleDiscardClick(): void {
  emit("entityDiscarded", props.entity);
}
</script>

<template>
  <form class="flex flex-col gap-3 my-2 p-4 text-left" @submit.prevent="handleSubmit">
    <div class="flex flex-col gap-1">
      <label for="entity-label" class="sr-only">Label</label>
      <InputGroup>
        <InputGroupAddon class="w-12">
          <RAMENNodeIcon :spec="resolveNodeIcon(props.entity.node.nodeLabels)" />
        </InputGroupAddon>
        <InputText
          id="entity-label"
          ref="label-input"
          v-model="entity.node.data.label"
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
