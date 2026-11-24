<script setup lang="ts">
import { computed } from "vue";
import type { ElementChange } from "../utils/modelDiff";

const props = defineProps<{
  changes: ElementChange[];
  /** Makes the changed elements clickable (not removed ones) */
  selectable?: boolean;
}>();

const emit = defineEmits<{ select: [change: ElementChange] }>();

const KIND_LABELS: Record<ElementChange["kind"], string> = {
  classifier: "Classifiers",
  annotation: "Annotation shapes",
  relation: "Relations",
};

const CHANGE_CLASSES: Record<ElementChange["change"], string> = {
  added: "bg-green-100 text-green-800",
  removed: "bg-red-100 text-red-800",
  changed: "bg-blue-100 text-blue-800",
};

const groups = computed<{ label: string; changes: ElementChange[] }[]>(() =>
  (Object.keys(KIND_LABELS) as ElementChange["kind"][])
    .map((kind) => ({ label: KIND_LABELS[kind], changes: props.changes.filter((change) => change.kind === kind) }))
    .filter((group) => group.changes.length > 0),
);

function isSelectable(change: ElementChange): boolean {
  return !!props.selectable && change.change !== "removed" && change.kind !== "relation";
}
</script>

<template>
  <p v-if="changes.length === 0" class="text-sm text-slate-500">No changes that concern the config or the data.</p>
  <div v-for="group in groups" :key="group.label" class="mb-3">
    <h4 class="text-xs uppercase tracking-wide text-slate-500 mb-1">{{ group.label }} ({{ group.changes.length }})</h4>
    <ul class="flex flex-col gap-1">
      <li
        v-for="change in group.changes"
        :key="change.ref"
        class="text-sm rounded px-2 py-1 bg-slate-50"
        :class="{ 'cursor-pointer hover:bg-slate-100': isSelectable(change) }"
        @click="isSelectable(change) && emit('select', change)"
      >
        <div class="flex items-center gap-2">
          <span class="text-[10px] px-1 rounded" :class="CHANGE_CLASSES[change.change]">{{ change.change }}</span>
          <span class="font-medium truncate" :title="change.ref">{{ change.name }}</span>
          <span
            v-if="change.needsDataMigration"
            class="ml-auto text-[10px] px-1 rounded bg-amber-400 text-amber-950 shrink-0"
            title="Stored data uses names: labels, annotation types, relationship types and property names have to be migrated"
          >
            needs data migration
          </span>
        </div>
        <ul v-if="change.details.length > 0 || change.attributes.length > 0" class="pl-4 mt-0.5 text-xs text-slate-600 list-disc">
          <li v-for="detail in change.details" :key="detail">{{ detail }}</li>
          <li v-for="attribute in change.attributes" :key="attribute.attributeRef">
            <span class="font-medium">{{ attribute.name }}</span>: {{ attribute.change }}
            <template v-if="attribute.details.length > 0"> ({{ attribute.details.join("; ") }})</template>
            <span v-if="attribute.needsDataMigration" class="text-amber-700"> · data migration</span>
          </li>
        </ul>
      </li>
    </ul>
  </div>
</template>
