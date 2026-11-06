<script setup lang="ts">
import { computed } from "vue";
import DataInputComponent from "./DataInputComponent.vue";
import { useConfigStore } from "../store/config";
import { getDefaultValue, getValueType, isRequired } from "../utils/helper/modelHelper";
import type { ModelAttribute, ModelContext } from "../models/types";
import Button from "primevue/button";

const modelValue = defineModel<unknown[] | null>();
const props = defineProps<{
  /** The model attribute (a list attribute) the values belong to */
  attribute: ModelAttribute;
  mode?: "edit" | "view";
}>();

const context: ModelContext = useConfigStore().getModelContext();

// Check if form either in edit mode or no mode is specified at all (assume edit mode)
const isEditable = computed(() => props.mode === "edit" || !props.mode);

/** The cardinality of the list, from the bounds of the attribute (an upper bound of -1 means unlimited) */
const minItems: number = props.attribute.attribute.bounds.lowerBound;
const maxItems: number | undefined =
  props.attribute.attribute.bounds.upperBound === -1 ? undefined : props.attribute.attribute.bounds.upperBound;

const itemCount = computed<number>(() => modelValue.value?.length ?? 0);

/**
 * Adds a new input item to the input group. If the input group's value is null (because the entry did not exist before),
 * a new array is created at first.
 *
 * The added element will be the default value for the type of the attribute.
 *
 * @returns {void} This function does not return any value.
 */
function handleAddItem(): void {
  if (!modelValue.value) {
    modelValue.value = [getDefaultValue(context, props.attribute, true)];
  } else {
    modelValue.value.push(getDefaultValue(context, props.attribute, true));
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
    if (isRequired(props.attribute)) {
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
        <DataInputComponent v-model="modelValue[index]" :attribute="props.attribute" item :mode="props.mode" />
        <Button
          v-if="isEditable"
          title="Delete item"
          :style="{ width: '1rem', height: '1rem', padding: '10px' }"
          severity="danger"
          outlined
          icon="icon-x"
          size="small"
          :disabled="itemCount <= minItems"
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
      :title="`Add new ${getValueType(context, props.attribute)} item`"
      @click="handleAddItem"
    />
  </div>
</template>

<style scoped></style>
