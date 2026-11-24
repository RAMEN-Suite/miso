<script setup lang="ts">
import type { AttributeRow } from "../utils/attributes";

/** A flag of an attribute, shown next to its name */
type FlagKind = "required" | "list" | "readOnly";

defineProps<{
  rows: AttributeRow[];
  /** Attribute refs with findings, highlighted */
  flaggedRefs?: Set<string>;
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
</script>

<template>
  <p v-if="rows.length === 0" class="text-sm text-slate-500">The element declares no attributes of its own.</p>
  <!-- Name and type keep their width (with space after them); the options take the rest and wrap -->
  <table v-else class="w-full text-sm">
    <thead>
      <tr class="text-left text-slate-500">
        <th class="font-normal py-1 pr-6 whitespace-nowrap">Attribute</th>
        <th class="font-normal py-1 pr-6 whitespace-nowrap">Type</th>
        <th class="font-normal py-1 w-full">Options</th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="row in rows"
        :key="row.attributeRef"
        class="border-t border-slate-100 align-top"
        :class="{ 'bg-amber-50': flaggedRefs?.has(row.attributeRef) }"
      >
        <td class="py-1 pr-6 whitespace-nowrap" :title="row.attributeRef">
          <span class="flex items-center gap-1.5 min-h-7">
            {{ row.name }}
            <i
              v-for="flag in flagsOf(row)"
              :key="flag.kind"
              :class="flag.icon"
              class="text-xs text-slate-400"
              :title="flag.title"
            />
          </span>
        </td>
        <td class="py-1 pr-6 whitespace-nowrap text-slate-500">
          <span class="flex items-center min-h-7" :title="row.dataTypeName ? `Data type ${row.dataTypeName}` : ''">
            {{ row.type }}
          </span>
        </td>
        <td class="py-1">
          <span v-if="row.options" class="flex flex-wrap items-center gap-1 min-h-7 py-0.5">
            <code v-for="option in row.options" :key="option" class="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-800">
              {{ option }}
            </code>
          </span>
        </td>
      </tr>
    </tbody>
  </table>
</template>
