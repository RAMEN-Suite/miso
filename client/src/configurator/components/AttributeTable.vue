<script setup lang="ts">
import Checkbox from "primevue/checkbox";
import type { AttributeRow } from "../utils/attributes";

defineProps<{
  rows: AttributeRow[];
  /** Attribute refs with findings, highlighted */
  flaggedRefs?: Set<string>;
}>();

const emit = defineEmits<{
  /** `value` is `undefined` for the default (`true`) */
  set: [row: AttributeRow, key: "visible" | "editable", value: boolean | undefined];
}>();

function onToggle(row: AttributeRow, key: "visible" | "editable", checked: boolean): void {
  // Only `false` is written, `true` is the default
  emit("set", row, key, checked ? undefined : false);
}
</script>

<template>
  <p v-if="rows.length === 0" class="text-sm text-slate-500">The element declares no attributes of its own.</p>
  <table v-else class="w-full text-sm">
    <thead>
      <tr class="text-left text-slate-500">
        <th class="font-normal py-1">Attribute</th>
        <th class="font-normal py-1">Type</th>
        <th class="font-normal py-1 text-center w-20">Visible</th>
        <th class="font-normal py-1 text-center w-20">Editable</th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="row in rows"
        :key="row.attributeRef"
        class="border-t border-slate-100"
        :class="{ 'bg-amber-50': flaggedRefs?.has(row.attributeRef) }"
      >
        <td class="py-1" :title="row.attributeRef">{{ row.name }}</td>
        <td class="py-1 text-slate-500">{{ row.type }}</td>
        <td class="py-1 text-center">
          <Checkbox
            :model-value="row.entry?.visible !== false"
            binary
            @update:model-value="onToggle(row, 'visible', $event)"
          />
        </td>
        <td class="py-1 text-center">
          <Checkbox
            :model-value="row.entry?.editable !== false"
            binary
            @update:model-value="onToggle(row, 'editable', $event)"
          />
        </td>
      </tr>
    </tbody>
  </table>
</template>
