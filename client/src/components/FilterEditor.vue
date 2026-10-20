<script setup lang="ts">
import { onMounted, ref, useId, watch } from "vue";
import Checkbox from "primevue/checkbox";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import InputGroup from "primevue/inputgroup";
import InputGroupAddon from "primevue/inputgroupaddon";
import { useGuidelinesStore } from "../store/guidelines";
import { FilterComparator, FilterOperator, FilterRow, FilterRule, FilterSpec, PropertyConfig } from "../models/types";
import { availableComparators, RANGE_COMPARATORS, targetKey, VALUELESS_COMPARATORS } from "../config/filters";
import FilterRuleRow from "./FilterRuleRow.vue";
import RAMENNodeIcon from "./RAMENNodeIcon.vue";
import { resolveNodeIcon } from "../config/icons";

const { getAvailableCollectionLabels, getAvailableContentLabels, getAllCollectionConfigFields } = useGuidelinesStore();

const props = defineProps<{
  /** The rules to seed the editor from. Read on mount and on {@linkcode sync}, never watched. */
  filters: FilterSpec;
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

const labelGroups: { base: string; additional: string[] }[] = [
  { base: "Collection", additional: getAvailableCollectionLabels().toSorted() },
  { base: "Content", additional: getAvailableContentLabels().toSorted() },
];

const availableProperties: PropertyConfig[] = getAllCollectionConfigFields()
  .filter((config: PropertyConfig, index: number, all: PropertyConfig[]) => {
    return config?.name && all.findIndex((other: PropertyConfig) => other.name === config.name) === index;
  })
  .toSorted((a: PropertyConfig, b: PropertyConfig) => a.name.localeCompare(b.name));

const rows = ref<FilterRow[]>([]);
const selectedLabels = ref<string[]>([]);
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
  selectedLabels.value = [
    ...((props.filters.find((rule: FilterRule) => rule.target.kind === "labels")?.conditions[0]?.value as string[]) ?? []),
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
  const property: PropertyConfig | undefined = availableProperties[0];
  const comparators: FilterComparator[] = availableComparators(property);

  rows.value.push({
    id: crypto.randomUUID(),
    target: { kind: "property", field: property?.name ?? "" },
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
 * `labels` and `distinct` are left out: They each have a dedicated control (the checkboxes and
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
 * The search box and the label checkboxes each own exactly one rule, so both are written straight
 * from their state. The rows carry everything else and are merged into one rule per target with
 * multiple conditions.
 *
 * @returns {FilterSpec} The rules to send.
 */
function rowsToFilters(): FilterSpec {
  const next: FilterSpec = [
    { target: { kind: "distinct" }, operator: "and", conditions: [{ comparator: "contains", value: search.value }] },
    { target: { kind: "labels" }, operator: "and", conditions: [{ comparator: "in", value: [...selectedLabels.value] }] },
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

watch([rows, selectedLabels, search], emitChange, { deep: true });

defineExpose({ sync });
</script>

<template>
  <div class="editor flex flex-col gap-2">
    <div v-for="group in labelGroups" :key="group.base" class="group flex gap-1 flex-wrap">
      <div
        v-for="label in group.additional"
        :key="label"
        class="node-label-checkbox-container flex items-center gap-2"
        :title="`${selectedLabels.includes(label) ? 'Deselect' : 'Select'} ${label}`"
      >
        <Checkbox v-model="selectedLabels" :input-id="`${instanceId}-${label}`" :value="label" :style="{ display: 'none' }" />
        <!-- eslint-disable-next-line vuejs-accessibility/label-has-for -- Eslint config does not recognize PrimeVue's component -->
        <label :for="`${instanceId}-${label}`" class="flex gap-1 items-center"
          ><RAMENNodeIcon :spec="resolveNodeIcon([group.base, label])" /><span>{{ label }}</span></label
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
        placeholder="Label or text…"
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
