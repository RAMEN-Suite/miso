<script setup lang="ts">
import { computed } from "vue";
import DataInputComponent from "./DataInputComponent.vue";
import { getDefaultValueForProperty } from "../utils/helper/helper";
import { PropertyConfig } from "../models/types";
import Button from "primevue/button";

const modelValue = defineModel<unknown[] | null>();
const props = defineProps<{
  config: Partial<PropertyConfig>;
  mode?: "edit" | "view";
}>();

// Check if form either in edit mode or no mode is specified at all (assume edit mode)
const isEditable = computed(() => props.mode === "edit" || !props.mode);

// Items config is optional in the schema. Without it, items fall back to the defaults of an unconfigured property.
const itemConfig = computed<Partial<PropertyConfig>>(() => props.config.items ?? {});

const minItems: number | undefined = props.config.minItems;
const maxItems: number | undefined = props.config.maxItems;

const itemCount = computed<number>(() => modelValue.value?.length ?? 0);

/**
 * Adds a new input item to the input group. If the input group's value is null (because the entry did not exist before),
 * a new array is created at first.
 *
 * The added element will be the default value for the type of the property as specified in the property configuration.
 *
 * @returns {void} This function does not return any value.
 */
function handleAddItem(): void {
  if (!modelValue.value) {
    modelValue.value = [getDefaultValueForProperty(itemConfig.value)];
  } else {
    modelValue.value.push(getDefaultValueForProperty(itemConfig.value));
  }
}

/**
 * Handles the deletion of a specific input item from input group.
 *
 * If the item to be deleted is the last one in the group and the property is required,
 * the value will be set to null instead of deleting the item (and creating an empty array in the process).
 * This is mainly to keep the data clean, a visual difference does not exist.
 *
 * @param {number} itemIndex - The index of the item to be deleted.
 * @returns {void} This function does not return any value.
 */
function handleDeleteItem(itemIndex: number): void {
  if (!modelValue.value) {
    return;
  }

  if (modelValue.value.length === 1) {
    if (props.config?.required === true) {
      modelValue.value = modelValue.value.filter((_, i) => i !== itemIndex);
    } else {
      modelValue.value = null;
    }
  } else {
    modelValue.value = modelValue.value.filter((_, i) => i !== itemIndex);
  }
}
</script>

<template>
  <div class="w-full">
    <template v-if="modelValue">
      <div v-for="(_, index) in modelValue" :key="index" class="flex gap-1 items-center">
        <DataInputComponent v-model="modelValue[index]" :config="itemConfig" :mode="props.mode" />
        <Button
          v-if="isEditable"
          title="Delete item"
          :style="{ width: '1rem', height: '1rem', padding: '10px' }"
          severity="danger"
          outlined
          icon="icon-x"
          size="small"
          :disabled="itemCount <= (minItems ?? 0)"
          @click="handleDeleteItem(index)"
        />
      </div>
    </template>
    <Button
      v-if="isEditable"
      class="mt-2 w-full h-8"
      icon="icon-plus"
      size="small"
      severity="secondary"
      label="Add item"
      :disabled="maxItems !== undefined && itemCount >= maxItems"
      :title="`Add new ${props.config.type} item`"
      @click="handleAddItem"
    />
  </div>
</template>

<style scoped></style>
