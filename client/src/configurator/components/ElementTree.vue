<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from "vue";
import IconField from "primevue/iconfield";
import InputIcon from "primevue/inputicon";
import InputText from "primevue/inputtext";
import type { IconSpecInput, ModelContext } from "../external";
import { useConfigDraft, type Selection } from "../state/useConfigDraft";
import { classifierIconOf, shapeIconOf } from "../utils/elementIcons";
import type { ChangeKind } from "../utils/modelDiff";
import {
  buildClassifierTree,
  buildShapeGroups,
  TREE_LINE_HEIGHT_REM,
  type ClassifierItem,
  type RowStatus,
  type TreeRow,
} from "../utils/elementTree";
import ElementTreeRows from "./ElementTreeRows.vue";

/** A section of the tree with its lines and the number of lines that match the filter (collapsed ones included) */
interface Section {
  key: string;
  label: string;
  rows: TreeRow[];
  count: number;
}

/** Height of the sticky filter; the section headers stick below it */
const FILTER_HEIGHT_REM = 3.5;

const { draft, context, findings, lastUpdate, selection } = useConfigDraft();

const tree = useTemplateRef<HTMLElement>("tree");

const filter = ref<string>("");

/** Keys of the collapsed sections and lines; everything is expanded at first */
const collapsed = ref<Set<string>>(new Set());

const ctx = computed<ModelContext>(() => context.value!);

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

/**
 * The lines of a classifier tree.
 *
 * @param {ClassifierItem[]} items - The classifiers of one level.
 * @param {number} depth - Their depth.
 * @returns {TreeRow[]} The lines with their refinements nested.
 */
function toRows(items: ClassifierItem[], depth: number): TreeRow[] {
  return items.map((item) => ({
    key: `c:${item.ref}`,
    label: item.name,
    depth,
    selection: { kind: "classifier", ref: item.ref },
    ref: item.ref,
    children: toRows(item.children, depth + 1),
  }));
}

/** All lines of a tree in tree order, flat */
function flatten(rows: TreeRow[]): TreeRow[] {
  return rows.flatMap((row) => [row, ...flatten(row.children)]);
}

/** The sections that have lines matching the filter */
const sections = computed<Section[]>(() => {
  const query: string = filter.value.trim().toLowerCase();
  const matches = (row: TreeRow): boolean => query === "" || row.label.toLowerCase().includes(query);
  const leaf = (row: Omit<TreeRow, "depth" | "children">): TreeRow => ({ ...row, depth: 0, children: [] });
  const classifierRows: TreeRow[] = toRows(buildClassifierTree(ctx.value), 0);
  const matchingClassifiers: TreeRow[] = flatten(classifierRows).filter(matches);
  const flatSections: Omit<Section, "count">[] = [
    {
      key: "s:config",
      label: "Config",
      rows: [leaf({ key: "general", label: "General", selection: { kind: "general" } })],
    },
    {
      key: "s:editors",
      label: "Editors",
      rows: [leaf({ key: "editor:text", label: "Text", selection: { kind: "textEditor" } })],
    },
    ...buildShapeGroups(ctx.value).map((group) => ({
      key: `s:${group.label}`,
      label: `Annotations ${group.label.toLowerCase()}`,
      rows: group.shapes.map((shape) =>
        leaf({
          key: `a:${group.label}:${shape.ref}`,
          label: shape.name,
          selection: { kind: "annotation", ref: shape.ref },
          ref: shape.ref,
        }),
      ),
    })),
  ];
  const [configSection, editorsSection, ...shapeSections]: Section[] = flatSections.map((section) => {
    const rows: TreeRow[] = section.rows.filter(matches);

    return { ...section, rows, count: rows.length };
  });
  const classifierSection: Section = {
    key: "s:classifiers",
    label: "Classifiers",
    // Flat when filtered, since parents may not match
    rows: isFiltering.value ? matchingClassifiers.map(leaf) : classifierRows,
    count: matchingClassifiers.length,
  };

  return [configSection, editorsSection, classifierSection, ...shapeSections].filter((section) => section.count > 0);
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

/** Problems and warnings of the mappings, shown on the text editor (mappings have no line of their own in the tree) */
const mappingCounts = computed<{ problems: number; warnings: number }>(() => {
  const mappingFindings = findings.value.filter(
    (finding) => finding.path.startsWith("editors.text.mappings") || finding.path.startsWith("Annotation shape"),
  );

  return {
    problems: mappingFindings.filter((finding) => finding.severity === "problem").length,
    warnings: mappingFindings.filter((finding) => finding.severity === "warning").length,
  };
});

/** The native type of each mapped annotation shape */
const nativeByShapeRef = computed<Map<string, string>>(
  () => new Map((draft.value?.editors.text.mappings ?? []).map((mapping) => [mapping.annotation, mapping.native])),
);

function statusOf(row: TreeRow): RowStatus {
  if (row.selection.kind === "textEditor") {
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
    native: row.selection.kind === "annotation" ? nativeByShapeRef.value.get(row.ref) : undefined,
  };
}

function iconOf(row: TreeRow): IconSpecInput | undefined {
  if (!row.ref) {
    return undefined;
  } else if (row.selection.kind === "classifier") {
    return classifierIconOf(ctx.value, row.ref);
  } else {
    return shapeIconOf(ctx.value, row.ref);
  }
}

/**
 * The keys of the section and lines above the first selected line, `undefined` if no line is selected.
 *
 * @param {TreeRow[]} rows - The lines of one level.
 * @returns {string[] | undefined} The keys of the lines above it in these rows, top first.
 */
function pathToSelected(rows: TreeRow[]): string[] | undefined {
  for (const row of rows) {
    if (isSelected(row)) {
      return [];
    }

    const below: string[] | undefined = pathToSelected(row.children);

    if (below) {
      return [row.key, ...below];
    }
  }

  return undefined;
}

/** Expands the section and lines above the selected line and scrolls it into view, e.g. after a link in a form */
async function revealSelected(): Promise<void> {
  for (const section of sections.value) {
    const path: string[] | undefined = pathToSelected(section.rows);

    if (path) {
      const keys: string[] = [section.key, ...path];

      if (keys.some((key) => collapsed.value.has(key))) {
        collapsed.value = new Set([...collapsed.value].filter((key) => !keys.includes(key)));
      }

      break;
    }
  }

  await nextTick();
  tree.value?.querySelector("[data-selected]")?.scrollIntoView({ block: "nearest" });
}

watch(selection, () => void revealSelected());

function select(row: TreeRow): void {
  selection.value = row.selection;
}

function isSelected(row: TreeRow): boolean {
  const current: Selection = selection.value;

  if (current.kind === "general" || current.kind === "textEditor") {
    return current.kind === row.selection.kind;
  }

  return row.selection.kind === current.kind && row.ref === current.ref;
}
</script>

<template>
  <!-- The filter, the section headers and the lines with refinements stick, so the path to the visible lines stays in view -->
  <nav ref="tree" class="text-sm">
    <div class="sticky top-0 z-30 flex items-center px-3 bg-white" :style="{ height: `${FILTER_HEIGHT_REM}rem` }">
      <IconField class="w-full">
        <InputText v-model="filter" size="small" placeholder="Filter by name" class="w-full" />
        <InputIcon
          v-if="filter"
          class="icon-delete cursor-pointer"
          role="button"
          aria-label="Clear the filter"
          title="Clear the filter"
          @click="filter = ''"
        />
      </IconField>
    </div>
    <div class="flex flex-col gap-3 px-3 pb-3">
      <div v-for="section in sections" :key="section.key">
        <button
          type="button"
          class="sticky z-20 w-full flex items-center gap-1 px-1.5 rounded text-xs uppercase tracking-wide font-semibold text-slate-700 bg-slate-100 cursor-pointer hover:bg-slate-200"
          :style="{ top: `${FILTER_HEIGHT_REM}rem`, height: `${TREE_LINE_HEIGHT_REM}rem` }"
          :aria-expanded="!isCollapsed(section.key)"
          @click="toggle(section.key)"
        >
          <i :class="isCollapsed(section.key) ? 'icon-chevron-right' : 'icon-chevron-down'" class="text-[11px]" />
          {{ section.label }}
          <span class="ml-auto normal-case tracking-normal font-normal text-slate-500">{{ section.count }}</span>
        </button>
        <ElementTreeRows
          v-if="!isCollapsed(section.key)"
          :rows="section.rows"
          :sticky-top="FILTER_HEIGHT_REM + TREE_LINE_HEIGHT_REM"
          :is-collapsed="isCollapsed"
          :is-selected="isSelected"
          :status-of="statusOf"
          :icon-of="iconOf"
          @select="select"
          @toggle="toggle"
        />
      </div>
      <p class="text-xs text-slate-400">Grey: no entry yet (defaults apply).</p>
    </div>
  </nav>
</template>
