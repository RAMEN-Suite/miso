<script setup lang="ts">
import { computed, ComputedRef } from "vue";
import { camelCaseToTitleCase, formatPropertyValue } from "../utils/helper/helper";
import { PropertyConfig } from "../models/types";
import DataInputComponent from "../components/DataInputComponent.vue";
import DataInputGroup from "../components/DataInputGroup.vue";

const properties = defineModel<any>();

const props = defineProps<{
  fields: PropertyConfig[];
  mode?: "edit" | "view";
}>();

const isViewMode: ComputedRef<boolean> = computed(() => props.mode === "view");

const visibleFields: ComputedRef<PropertyConfig[]> = computed(() => props.fields.filter((field) => field.visible));

/**
 * Formats a property for read-only display in the properties table.
 *
 * @param {PropertyConfig} field - The property config of the field to display.
 * @returns {string} The formatted, human-readable value.
 */
function displayValue(field: PropertyConfig): string {
  return formatPropertyValue(properties.value?.[field.name], field.type);
}
</script>

<template>
  <form>
    <table v-if="visibleFields.length > 0" class="properties-table">
      <tr
        v-for="field in visibleFields"
        :key="field.name"
        class="properties-row"
        :class="{ 'is-multiline': !isViewMode && field.type === 'array' }"
      >
        <!-- eslint-disable-next-line vuejs-accessibility/label-has-for -- No id as component prop currently -->
        <td class="properties-label">
          <label :for="field.name">{{ camelCaseToTitleCase(field.name) }}</label>
        </td>
        <td class="properties-value">
          <span v-if="isViewMode" class="properties-text">{{ displayValue(field) }}</span>
          <DataInputGroup
            v-else-if="field.type === 'array'"
            v-model="properties[field.name]"
            :config="field"
            :mode="props.mode"
          />
          <DataInputComponent v-else v-model="properties[field.name]" :config="field" :mode="props.mode" />
        </td>
      </tr>
    </table>
  </form>
</template>

<style scoped></style>
