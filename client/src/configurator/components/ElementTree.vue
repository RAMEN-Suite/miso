<script setup lang="ts">
import { computed, ref } from "vue";
import InputText from "primevue/inputtext";
import type { ModelContext } from "../external";
import { useConfigDraft, type Selection } from "../state/useConfigDraft";
import { buildClassifierTree, buildShapeGroups, type ClassifierItem } from "../utils/elementTree";
import type { ChangeKind } from "../utils/modelDiff";

/** A line of the tree */
interface Row {
  key: string;
  label: string;
  depth: number;
  selection: Selection;
  ref?: string;
  /** Whether the line has child lines (refinements) it can be collapsed to */
  hasChildren: boolean;
}

/** What a line shows next to its label */
interface RowStatus {
  problems: number;
  warnings: number;
  change?: ChangeKind;
  configured: boolean;
}

const { draft, context, findings, lastUpdate, selection } = useConfigDraft();

const filter = ref<string>("");

/** Keys of the collapsed sections and lines; everything is expanded at first */
const collapsed = ref<Set<string>>(new Set());

const ctx = computed<ModelContext>(() => context.value as ModelContext);

const isFiltering = computed<boolean>(() => filter.value.trim() !== "");

function toggle(key: string): void {
  const next = new Set<string>(collapsed.value);

  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }

  collapsed.value = next;
}

/** Whether a section or line is shown collapsed; filtering shows everything that matches */
function isCollapsed(key: string): boolean {
  return !isFiltering.value && collapsed.value.has(key);
}

/** The lines of a classifier tree, without the children of collapsed lines (unless filtered) */
function flatten(items: ClassifierItem[], depth: number): Row[] {
  return items.flatMap((item) => {
    const row: Row = {
      key: `c:${item.ref}`,
      label: item.name,
      depth,
      selection: { kind: "classifier", ref: item.ref },
      ref: item.ref,
      hasChildren: item.children.length > 0,
    };

    return [row, ...(isCollapsed(row.key) ? [] : flatten(item.children, depth + 1))];
  });
}

const sections = computed<{ key: string; label: string; rows: Row[] }[]>(() => {
  const query: string = filter.value.trim().toLowerCase();
  const matches = (row: Row): boolean => query === "" || row.label.toLowerCase().includes(query);
  const classifierRows: Row[] = flatten(buildClassifierTree(ctx.value), 0);
  const shapeSections = buildShapeGroups(ctx.value).map((group) => ({
    key: `s:${group.label}`,
    label: `Annotations ${group.label.toLowerCase()}`,
    rows: group.shapes.map(
      (shape): Row => ({
        key: `a:${group.label}:${shape.ref}`,
        label: shape.name,
        depth: 0,
        selection: { kind: "annotation", ref: shape.ref },
        ref: shape.ref,
        hasChildren: false,
      }),
    ),
  }));

  return [
    {
      key: "s:config",
      label: "Config",
      rows: [
        { key: "general", label: "General", depth: 0, selection: { kind: "general" }, hasChildren: false } as Row,
        { key: "mappings", label: "Native mappings", depth: 0, selection: { kind: "mappings" }, hasChildren: false } as Row,
      ],
    },
    // Flat when filtered, since parents may not match
    {
      key: "s:classifiers",
      label: "Classifiers",
      rows: classifierRows.map((row) => (isFiltering.value ? { ...row, depth: 0, hasChildren: false } : row)),
    },
    ...shapeSections,
  ]
    .map((section) => ({ ...section, rows: section.rows.filter(matches) }))
    .filter((section) => section.rows.length > 0);
});

/** Problems and warnings by element ref */
const findingCounts = computed<Map<string, { problems: number; warnings: number }>>(() => {
  const counts = new Map<string, { problems: number; warnings: number }>();

  for (const finding of findings.value) {
    if (!finding.ref) {
      continue;
    }

    const count = counts.get(finding.ref) ?? { problems: 0, warnings: 0 };

    if (finding.severity === "problem") {
      count.problems += 1;
    } else {
      count.warnings += 1;
    }

    counts.set(finding.ref, count);
  }

  return counts;
});

/** The changes of the last model update by element ref */
const changes = computed<Map<string, ChangeKind>>(
  () => new Map((lastUpdate.value?.changes ?? []).map((change) => [change.ref, change.change])),
);

/** Problems and warnings of the mappings (they have no element of their own in the tree) */
const mappingCounts = computed<{ problems: number; warnings: number }>(() => {
  const mappingFindings = findings.value.filter(
    (finding) => finding.path.startsWith("editors.text.mappings") || finding.path.startsWith("Annotation shape"),
  );

  return {
    problems: mappingFindings.filter((finding) => finding.severity === "problem").length,
    warnings: mappingFindings.filter((finding) => finding.severity === "warning").length,
  };
});

function statusOf(row: Row): RowStatus {
  if (row.selection.kind === "mappings") {
    return { ...mappingCounts.value, configured: true };
  }

  if (!row.ref) {
    return { problems: 0, warnings: 0, configured: true };
  }

  const entries = row.selection.kind === "classifier" ? draft.value?.elements.classifiers : draft.value?.elements.annotations;

  return {
    ...(findingCounts.value.get(row.ref) ?? { problems: 0, warnings: 0 }),
    change: changes.value.get(row.ref),
    configured: entries?.[row.ref] !== undefined,
  };
}

function select(row: Row): void {
  selection.value = row.selection;
}

function isSelected(row: Row): boolean {
  const current: Selection = selection.value;

  if (current.kind === "general" || current.kind === "mappings") {
    return current.kind === row.selection.kind;
  }

  return row.selection.kind === current.kind && row.ref === current.ref;
}
</script>

<template>
  <nav class="flex flex-col gap-3 text-sm">
    <InputText v-model="filter" size="small" placeholder="Filter by name" class="w-full" />
    <div v-for="section in sections" :key="section.key">
      <button
        type="button"
        class="w-full flex items-center gap-1 rounded px-1 py-0.5 mb-1 text-xs uppercase tracking-wide text-slate-500 cursor-pointer hover:bg-slate-100 hover:text-slate-700"
        :aria-expanded="!isCollapsed(section.key)"
        @click="toggle(section.key)"
      >
        <i :class="isCollapsed(section.key) ? 'icon-chevron-right' : 'icon-chevron-down'" class="text-[11px]" />
        {{ section.label }}
        <span class="ml-auto normal-case tracking-normal text-slate-400">{{ section.rows.length }}</span>
      </button>
      <ul v-if="!isCollapsed(section.key)">
        <li
          v-for="row in section.rows"
          :key="row.key"
          class="flex items-center rounded cursor-pointer hover:bg-slate-100"
          :class="{ 'bg-emerald-50 hover:bg-emerald-100 font-medium': isSelected(row) }"
          :style="{ paddingLeft: `${row.depth * 0.875}rem` }"
          :title="row.ref"
          @click="select(row)"
        >
          <button
            v-if="row.hasChildren"
            type="button"
            class="w-5 h-5 shrink-0 flex items-center justify-center rounded cursor-pointer text-slate-500 hover:bg-slate-200"
            :aria-label="isCollapsed(row.key) ? `Expand ${row.label}` : `Collapse ${row.label}`"
            :aria-expanded="!isCollapsed(row.key)"
            @click.stop="toggle(row.key)"
          >
            <i :class="isCollapsed(row.key) ? 'icon-chevron-right' : 'icon-chevron-down'" class="text-[11px]" />
          </button>
          <span v-else class="w-5 shrink-0" />
          <span class="truncate py-0.5" :class="{ 'text-slate-400': !statusOf(row).configured }">{{ row.label }}</span>
          <span class="ml-auto flex items-center gap-1 shrink-0 pr-1.5">
            <span v-if="statusOf(row).change === 'added'" class="text-[10px] px-1 rounded bg-green-100 text-green-800">new</span>
            <span v-else-if="statusOf(row).change === 'changed'" class="text-[10px] px-1 rounded bg-blue-100 text-blue-800">changed</span>
            <span v-if="statusOf(row).problems" class="text-[10px] px-1 rounded bg-red-500 text-white">{{ statusOf(row).problems }}</span>
            <span v-if="statusOf(row).warnings" class="text-[10px] px-1 rounded bg-amber-400 text-amber-950">{{ statusOf(row).warnings }}</span>
          </span>
        </li>
      </ul>
    </div>
    <p class="text-xs text-slate-400">Grey: no entry yet (defaults apply).</p>
  </nav>
</template>
