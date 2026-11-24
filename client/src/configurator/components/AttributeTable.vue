<script setup lang="ts">
import { ref, useTemplateRef } from "vue";
import Checkbox from "primevue/checkbox";
import Menu from "primevue/menu";
import type { MenuItem } from "primevue/menuitem";
import type { AttributeRow } from "../utils/attributes";
import TermHint from "./TermHint.vue";

/** A flag of an attribute, shown next to its name */
type FlagKind = "required" | "list" | "readOnly";

defineProps<{
  rows: AttributeRow[];
  /** Attribute refs with findings, highlighted */
  flaggedRefs?: Set<string>;
}>();

const emit = defineEmits<{
  /** `value` is `undefined` for the default (`true`) */
  set: [row: AttributeRow, key: "visible" | "editable", value: boolean | undefined];
}>();

const FLAG_ICONS: Record<FlagKind, string> = { required: "icon-asterisk", list: "icon-list", readOnly: "icon-eye-off" };

/** The flags of an attribute with their icons and tooltips */
function flagsOf(row: AttributeRow): { kind: FlagKind; icon: string; title: string }[] {
  return [
    ...(row.isRequired ? [{ kind: "required" as const, title: `Required (${row.bounds})` }] : []),
    ...(row.isList ? [{ kind: "list" as const, title: `List (${row.bounds})` }] : []),
    ...(row.isReadOnly ? [{ kind: "readOnly" as const, title: "Read-only in the model" }] : []),
  ].map((flag) => ({ ...flag, icon: FLAG_ICONS[flag.kind] }));
}

const optionsMenu = useTemplateRef<InstanceType<typeof Menu>>("optionsMenu");

/** The options of the row the menu is open for, under a header with the data type */
const menuItems = ref<MenuItem[]>([]);

function showOptions(event: Event, row: AttributeRow): void {
  menuItems.value = [
    {
      label: `${row.dataTypeName ?? row.type} · ${row.options?.length ?? 0} options`,
      items: (row.options ?? []).map((option) => ({ label: option })),
    },
  ];
  optionsMenu.value?.toggle(event);
}

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
        <th class="font-normal py-1 w-24">
          <span class="flex items-center justify-center gap-1">Visible <TermHint term="visible" /></span>
        </th>
        <th class="font-normal py-1 w-24">
          <span class="flex items-center justify-center gap-1">Editable <TermHint term="editable" /></span>
        </th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="row in rows"
        :key="row.attributeRef"
        class="border-t border-slate-100"
        :class="{ 'bg-amber-50': flaggedRefs?.has(row.attributeRef) }"
      >
        <td class="py-1" :title="row.attributeRef">
          <span class="flex items-center gap-1.5 min-h-7">
            {{ row.name }}
            <i v-for="flag in flagsOf(row)" :key="flag.kind" :class="flag.icon" class="text-xs text-slate-400" :title="flag.title" />
          </span>
        </td>
        <td class="py-1 text-slate-500">
          <span class="flex items-center gap-1.5 min-h-7">
            <span :title="row.dataTypeName ? `Data type ${row.dataTypeName}` : ''">{{ row.type }}</span>
            <button
              v-if="row.options"
              type="button"
              class="inline-flex items-center gap-0.5 h-5 text-[10px] leading-none px-1.5 rounded border border-slate-300 text-slate-600 cursor-pointer hover:bg-slate-100"
              aria-haspopup="menu"
              @click="showOptions($event, row)"
            >
              {{ row.options.length }} options
              <i class="icon-chevron-down text-[10px]" />
            </button>
          </span>
        </td>
        <td class="py-1 text-center">
          <Checkbox :model-value="row.entry?.visible !== false" binary @update:model-value="onToggle(row, 'visible', $event)" />
        </td>
        <td class="py-1 text-center">
          <Checkbox
            :model-value="!row.isReadOnly && row.entry?.editable !== false"
            :disabled="row.isReadOnly"
            :title="row.isReadOnly ? 'Read-only in the model' : ''"
            binary
            @update:model-value="onToggle(row, 'editable', $event)"
          />
        </td>
      </tr>
    </tbody>
  </table>
  <!-- Only lists the options, its items do nothing -->
  <Menu ref="optionsMenu" :model="menuItems" popup class="max-h-72 overflow-auto">
    <template #submenulabel="{ item }">
      <span class="text-xs font-normal text-slate-500">{{ item.label }}</span>
    </template>
    <template #item="{ item }">
      <span class="flex items-center px-3 py-1 cursor-default">
        <code class="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-800">{{ item.label }}</code>
      </span>
    </template>
  </Menu>
</template>
