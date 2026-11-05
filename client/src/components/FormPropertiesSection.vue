<script setup lang="ts">
import { computed, ComputedRef } from "vue";
import { camelCaseToTitleCase, formatPropertyValue } from "../utils/helper/helper";
import { useGuidelinesStore } from "../store/guidelines";
import { isList, isVisible, type ModelAttribute, type ModelContext } from "../utils/helper/modelHelper";
import DataInputComponent from "../components/DataInputComponent.vue";
import DataInputGroup from "../components/DataInputGroup.vue";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Data can be of very different shape. Maybe fix in the future
const properties = defineModel<any>();

const props = defineProps<{
  /** The model attributes to show, in order */
  fields: ModelAttribute[];
  mode?: "edit" | "view";
}>();

const context: ModelContext = useGuidelinesStore().getModelContext();

const isViewMode: ComputedRef<boolean> = computed(() => props.mode === "view");

const visibleFields: ComputedRef<ModelAttribute[]> = computed(() => props.fields.filter((field) => isVisible(context, field)));

/**
 * Formats a property for read-only display in the properties table.
 *
 * @param {ModelAttribute} field - The attribute of the field to display.
 * @returns {string} The formatted, human-readable value.
 */
function displayValue(field: ModelAttribute): string {
  return formatPropertyValue(properties.value?.[field.attribute.name], field);
}
</script>

<template>
  <form>
    <table v-if="visibleFields.length > 0" class="properties-table">
      <tr
        v-for="field in visibleFields"
        :key="field.attribute.name"
        class="properties-row"
        :class="{ 'is-multiline': !isViewMode && isList(field) }"
      >
        <!-- eslint-disable-next-line vuejs-accessibility/label-has-for -- No id as component prop currently -->
        <td class="properties-label">
          <!-- eslint-disable-next-line vuejs-accessibility/label-has-for -- No id as component prop currently -->
          <label :for="field.attribute.name">{{ camelCaseToTitleCase(field.attribute.name) }}</label>
        </td>
        <td class="properties-value">
          <span v-if="isViewMode" class="properties-text">{{ displayValue(field) }}</span>
          <DataInputGroup
            v-else-if="isList(field)"
            v-model="properties[field.attribute.name]"
            :attribute="field"
            :mode="props.mode"
          />
          <DataInputComponent v-else v-model="properties[field.attribute.name]" :attribute="field" :mode="props.mode" />
        </td>
      </tr>
    </table>
  </form>
</template>

<style scoped></style>
