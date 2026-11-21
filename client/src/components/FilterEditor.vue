<script setup lang="ts">
import { computed, onMounted, ref, useId, watch } from "vue";
import Checkbox from "primevue/checkbox";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import InputGroup from "primevue/inputgroup";
import InputGroupAddon from "primevue/inputgroupaddon";
import { useConfigStore } from "../store/config";
import {
  FilterComparator,
  FilterOperator,
  FilterRow,
  FilterRule,
  FilterSpec,
  ModelAttribute,
  NodeTypeOption,
} from "../models/types";
import { availableComparators, RANGE_COMPARATORS, targetKey, VALUELESS_COMPARATORS } from "../config/filters";
import { BASE_NODE_REF } from "../config/ramen";
import FilterRuleRow from "./FilterRuleRow.vue";
import RAMENNodeIcon from "./RAMENNodeIcon.vue";
import { resolveNodeIcon } from "../config/icons";

const { getNodeTypeOptions, getHierarchyClassifierRefs, getAllCollectionAttributes, getModelContext } = useConfigStore();

const props = defineProps<{
  /** The rules to seed the editor from. Read on mount and on {@linkcode sync}, never watched. */
  filters: FilterSpec;
  /**
   * Classifier ref of the Collection whose children are filtered. Only the types the model allows `PART_OF` it, and
   * their properties, are offered. All types if omitted or `null` (top level, smart views, unresolvable parent).
   */
  partOfRef?: string | null;
}>();

const emit = defineEmits<{ change: [FilterSpec] }>();

/**
 * Emits the rules the current state adds up to. Rows sharing a target are merged into one rule and
 * incomplete ones dropped — see {@linkcode rowsToFilters}.
 *
 * @returns {void} This function does not return a value.
 */
function emitChange(): void {
  emit("change", rowsToFilters());
}

// Several of these can be alive at once (one per column, plus the smart view modal), so the checkbox
// ids have to be unique per instance
const instanceId: string = useId();

/** The node types to filter by, one group per base node, each sorted by name. Empty groups are left out. */
const typeGroups = computed<{ base: string; types: NodeTypeOption[] }[]>(() =>
  [
    { base: "Collection", types: getNodeTypeOptions(BASE_NODE_REF.Collection, props.partOfRef ?? null) },
    { base: "Content", types: getNodeTypeOptions(BASE_NODE_REF.Content, props.partOfRef ?? null) },
  ].filter((group) => group.types.length > 0),
);

/**
 * The classifier refs the type rule is sent with. With every offered type checked, the listing is not narrowed by
 * type: all types are sent, so children of types the model doesn't allow there (legacy data) stay visible. Otherwise
 * exactly the checked offered types.
 *
 * @returns {string[]} The classifier refs.
 */
function selectedClassifierRefs(): string[] {
  const offeredRefs: string[] = typeGroups.value.flatMap((group) => group.types.map((type) => type.classifierRef));

  if (offeredRefs.every((ref) => selectedTypes.value.includes(ref))) {
    return getHierarchyClassifierRefs();
  }

  return offeredRefs.filter((ref) => selectedTypes.value.includes(ref));
}

// Each name once, only of the types allowed under the parent, see getAllCollectionAttributes
const availableProperties = computed<ModelAttribute[]>(() =>
  getAllCollectionAttributes(props.partOfRef ?? null).toSorted((a: ModelAttribute, b: ModelAttribute) =>
    a.attribute.name.localeCompare(b.attribute.name),
  ),
);

const rows = ref<FilterRow[]>([]);
/** Classifier refs of the selected node types */
const selectedTypes = ref<string[]>([]);
const search = ref<string>("");

/**
 * Rebuilds the editor's state from the `filters` prop, discarding whatever was being edited.
 *
 * Runs on mount, and can be called again by the parent (e.g. when a popover is opened)
 *
 * @returns {void} This function does not return a value.
 */
function sync(): void {
  rows.value = filtersToRows();
  selectedTypes.value = [
    ...((props.filters.find((rule: FilterRule) => rule.target.kind === "classifier")?.conditions[0]?.value as string[]) ?? []),
  ];
  search.value =
    (props.filters.find((rule: FilterRule) => rule.target.kind === "distinct")?.conditions[0]?.value as string) ?? "";

  // Necessary since watcher only triggers on change of the same object
  emitChange();
}

/**
 * Appends a new filter row.
 *
 * Uses a default property and comparator, but has no value yet and will therefore
 * not be applied as a valid condition.
 *
 * @returns {void} This function does not return a value.
 */
function addRow(): void {
  const property: ModelAttribute | undefined = availableProperties.value[0];
  const comparators: FilterComparator[] = availableComparators(getModelContext(), property);

  rows.value.push({
    id: crypto.randomUUID(),
    target: { kind: "property", field: property?.attribute.name ?? "" },
    comparator: comparators[0] ?? "contains",
    value: null,
  });
}

/**
 * Removes a filter row.
 *
 * @param {string} id - The row to drop.
 * @returns {void} This function does not return a value.
 */
function removeRow(id: string): void {
  rows.value = rows.value.filter((row: FilterRow) => row.id !== id);
}

/**
 * Flattens the property rules of the `filters` prop into one row per condition.
 *
 * A rule can hold several conditions on the same target, but the editor shows one condition per row —
 * so `status` with two conditions becomes two rows, and {@linkcode rowsToFilters} merges them back.
 *
 * `classifier` and `distinct` are left out: They each have a dedicated control (the checkboxes and
 * the search box), so neither is editable as a row.
 *
 * @returns {FilterRow[]} One row per editable condition.
 */
function filtersToRows(): FilterRow[] {
  return props.filters
    .filter((rule: FilterRule) => rule.target.kind === "property")
    .flatMap((rule: FilterRule) =>
      rule.conditions.map((condition) => ({
        id: crypto.randomUUID(),
        target: rule.target,
        comparator: condition.comparator,
        value: condition.value,
      })),
    );
}

/**
 * Assembles the editor's three controls into the rules expected by the API. Validates each row and
 * drops incomplete ones.
 *
 * The search box and the node type checkboxes each own exactly one rule, so both are written straight
 * from their state (the types via {@linkcode selectedClassifierRefs}). The rows carry everything else and are merged into one rule per target with
 * multiple conditions.
 *
 * @returns {FilterSpec} The rules to send.
 */
function rowsToFilters(): FilterSpec {
  const next: FilterSpec = [
    { target: { kind: "distinct" }, operator: "and", conditions: [{ comparator: "contains", value: search.value }] },
    { target: { kind: "classifier" }, operator: "and", conditions: [{ comparator: "in", value: selectedClassifierRefs() }] },
  ];

  const byTarget = new Map<string, FilterRule>();

  rows.value
    .filter((r: FilterRow) => isRowComplete(r))
    .forEach((row: FilterRow) => {
      const key: string = targetKey(row.target);
      let rule: FilterRule | undefined = byTarget.get(key);

      if (!rule) {
        // Keep the operator the target already had; the editor UI does not expose it. Must
        // be changed if this is possible
        const operator: FilterOperator = props.filters.find((r: FilterRule) => targetKey(r.target) === key)?.operator ?? "and";

        rule = { target: row.target, operator, conditions: [] };

        byTarget.set(key, rule);
        next.push(rule);
      }

      rule.conditions.push({ comparator: row.comparator, value: row.value });
    });

  return next;
}

/**
 * Whether a row has a complete condition to be applied/sent.
 *
 * A comparator that takes no value (check for empty) is always complete; a
 * range needs both bounds etc.
 *
 * @param {FilterRow} row - The row to check.
 * @returns {boolean} True if the row can be turned into a condition.
 */
function isRowComplete(row: FilterRow): boolean {
  if (VALUELESS_COMPARATORS.includes(row.comparator)) {
    return true;
  }

  if (RANGE_COMPARATORS.includes(row.comparator)) {
    return Array.isArray(row.value) && row.value.length === 2 && row.value.every((bound) => bound !== null && bound !== "");
  }

  if (Array.isArray(row.value)) {
    return row.value.length > 0;
  }

  return row.value !== null && row.value !== undefined && row.value !== "";
}

onMounted(sync);

watch([rows, selectedTypes, search], emitChange, { deep: true });

defineExpose({ sync });
</script>

<template>
  <div class="editor flex flex-col gap-2">
    <div v-for="group in typeGroups" :key="group.base" class="group flex gap-1 flex-wrap">
      <div
        v-for="type in group.types"
        :key="type.classifierRef"
        class="node-label-checkbox-container flex items-center gap-2"
        :title="`${selectedTypes.includes(type.classifierRef) ? 'Deselect' : 'Select'} ${type.name}`"
      >
        <Checkbox
          v-model="selectedTypes"
          :input-id="`${instanceId}-${type.classifierRef}`"
          :value="type.classifierRef"
          :style="{ display: 'none' }"
        />
        <!-- eslint-disable-next-line vuejs-accessibility/label-has-for -- Eslint config does not recognize PrimeVue's component -->
        <label :for="`${instanceId}-${type.classifierRef}`" class="flex gap-1 items-center"
          ><RAMENNodeIcon :spec="resolveNodeIcon(type)" /><span>{{ type.name }}</span></label
        >
      </div>
    </div>

    <InputGroup>
      <InputGroupAddon :id="`${instanceId}-search-target`" class="search-addon">
        <i class="icon-search" />
        <span>Label / text</span>
      </InputGroupAddon>
      <InputText
        v-model="search"
        size="small"
        placeholder="Label or text..."
        title="Matches labels and the full text"
        :aria-labelledby="`${instanceId}-search-target`"
        class="w-full"
      />
    </InputGroup>

    <div class="rules flex flex-col gap-2">
      <FilterRuleRow
        v-for="(row, index) in rows"
        :key="row.id"
        v-model="rows[index]"
        :properties="availableProperties"
        @remove="removeRow(row.id)"
      />

      <div class="flex justify-center">
        <Button
          label="Add rule"
          icon="icon-plus"
          title="Add new filter rule"
          severity="success"
          text
          size="small"
          class="w-full"
          @click="addRow"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.node-label-checkbox-container {
  --primary: var(--p-primary-color);
  --tint: color-mix(in srgb, var(--p-primary-300) 12%, transparent);
  --tint-strong: color-mix(in srgb, var(--p-primary-300) 20%, transparent);

  /* Neutral outline when off, light tint with a primary outline when on */
  border: 1px solid var(--p-content-border-color);
  border-radius: 5px;
  padding: 0.25rem 0.5rem;
  user-select: none;
  transition:
    background-color 0.15s,
    border-color 0.15s,
    color 0.15s;

  &,
  & :deep(*) {
    cursor: pointer;
  }

  &:hover {
    background: var(--p-content-hover-background);
  }

  &:has(input:checked) {
    border-color: var(--primary);
    background: var(--tint);
    color: var(--primary);

    &:hover {
      background: var(--tint-strong);
    }
  }
}

.search-addon {
  gap: 0.375rem;
  font-size: 0.8rem;
  white-space: nowrap;
}
</style>
