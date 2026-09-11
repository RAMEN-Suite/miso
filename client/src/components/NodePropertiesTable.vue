<script setup lang="ts">
import { computed, ComputedRef } from "vue";
import { camelCaseToTitleCase } from "../utils/helper/helper";
import { PropertyConfig, PropertyConfigDataType } from "../models/types";
import Fieldset from "primevue/fieldset";

const props = defineProps<{
  data: any;
  fields?: PropertyConfig[];
}>();

interface PropertyRow {
  name: string;
  value: string;
}

/**
 * Formats a raw property value for read-only display. When a field's configured type is known it is used,
 * otherwise the type is derived from the raw value itself (e.g. for untyped/unconfigured node properties).
 *
 * @param {unknown} value - The raw property value.
 * @param {PropertyConfigDataType} [type] - The configured type of the property, if known.
 * @returns {string} The formatted, human-readable value.
 */
function formatValue(value: unknown, type?: PropertyConfigDataType): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (type === "array" || Array.isArray(value)) {
    return Array.isArray(value) && value.length > 0 ? value.join(", ") : "—";
  }

  return String(value);
}

const rows: ComputedRef<PropertyRow[]> = computed(() => {
  if (props.fields && props.fields.length > 0) {
    return props.fields
      .filter((field: PropertyConfig) => field.visible)
      .map((field: PropertyConfig) => ({
        name: camelCaseToTitleCase(field.name),
        value: formatValue(props.data?.[field.name], field.type),
      }));
  }

  return Object.entries(props.data ?? {}).map(([name, value]) => ({
    name: camelCaseToTitleCase(name),
    value: formatValue(value),
  }));
});
</script>

<template>
  <Fieldset legend="Properties">
    <table v-if="rows.length > 0" class="properties-table">
      <tr v-for="row in rows" :key="row.name" class="properties-row">
        <td class="properties-label">{{ row.name }}</td>
        <td class="properties-value">{{ row.value }}</td>
      </tr>
    </table>
  </Fieldset>
</template>

<style scoped>
.properties-table {
  border-collapse: collapse;
}

.properties-row {
  border-bottom: 1px solid var(--p-content-border-color);
}

.properties-row:last-child {
  border-bottom: none;
}

.properties-label,
.properties-value {
  padding: 5px 0;
  width: 100%;
}

.properties-label {
  width: 1px;
  font-weight: 600;
  white-space: nowrap;
  padding-right: 1rem;
}

.properties-value {
  word-break: break-word;
}
</style>
