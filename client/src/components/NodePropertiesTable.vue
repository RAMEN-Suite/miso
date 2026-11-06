<script setup lang="ts">
import { computed, ComputedRef } from "vue";
import { camelCaseToTitleCase, formatPropertyValue } from "../utils/helper/helper";
import { useConfigStore } from "../store/config";
import { isVisible, type ModelAttribute } from "../utils/helper/modelHelper";

const props = defineProps<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Data can be of very different shape. Maybe fix in the future
  data: any;
  /** The model attributes to show. Without them, all properties of the data are shown as they are. */
  fields?: ModelAttribute[];
}>();

const { getModelContext } = useConfigStore();

interface PropertyRow {
  name: string;
  value: string;
}

const rows: ComputedRef<PropertyRow[]> = computed(() => {
  if (props.fields && props.fields.length > 0) {
    return props.fields
      .filter((field: ModelAttribute) => isVisible(getModelContext(), field))
      .map((field: ModelAttribute) => ({
        name: camelCaseToTitleCase(field.attribute.name),
        value: formatPropertyValue(props.data?.[field.attribute.name], field),
      }));
  }

  return Object.entries(props.data ?? {}).map(([name, value]) => ({
    name: camelCaseToTitleCase(name),
    value: formatPropertyValue(value),
  }));
});
</script>

<template>
  <table v-if="rows.length > 0" class="properties-table">
    <tr v-for="row in rows" :key="row.name" class="properties-row">
      <td class="properties-label">{{ row.name }}</td>
      <td class="properties-value">{{ row.value }}</td>
    </tr>
  </table>
</template>

<style scoped></style>
