<script setup lang="ts">
import { computed } from "vue";
import Select from "primevue/select";
import MultiSelect from "primevue/multiselect";
import InputText from "primevue/inputtext";
import InputNumber from "primevue/inputnumber";
import DatePicker from "primevue/datepicker";
import Button from "primevue/button";
import { FilterComparator, FilterRow, FilterTarget, PropertyConfig, PropertyConfigDataType } from "../models/types";
import {
  availableComparators,
  COMPARATOR_LABELS,
  NUMERIC_DATATYPES,
  RANGE_COMPARATORS,
  targetKey,
  TEMPORAL_DATATYPES,
  VALUELESS_COMPARATORS,
} from "../config/filters";

const props = defineProps<{
  properties: PropertyConfig[];
}>();

/**
 * The row being edited. Replaced rather than mutated on every change, so the parent's array sees a
 * new object and its watcher fires.
 */
const row = defineModel<FilterRow>({ required: true });

const emit = defineEmits<{ remove: [] }>();

const targetOptions = computed<{ label: string; value: string }[]>(() =>
  props.properties.map((property: PropertyConfig) => ({ label: property.name, value: property.name })),
);

const selectedTarget = computed<string>(() => targetKey(row.value.target));

/** The guideline config behind the chosen target. Absent for `distinct`, which is always text. */
const config = computed<PropertyConfig | undefined>(() =>
  row.value.target.kind === "property"
    ? props.properties.find((property: PropertyConfig) => property.name === row.value.target.field)
    : undefined,
);

const datatype = computed<PropertyConfigDataType>(() => config.value?.type ?? "string");

const enumOptions = computed<(string | number)[]>(() => config.value?.options ?? []);

const comparatorOptions = computed<{ label: string; value: FilterComparator }[]>(() =>
  availableComparators(datatype.value, config.value?.options).map((comparator: FilterComparator) => ({
    label: COMPARATOR_LABELS[comparator],
    value: comparator,
  })),
);

const needsValue = computed<boolean>(() => !VALUELESS_COMPARATORS.includes(row.value.comparator));
const isRange = computed<boolean>(() => RANGE_COMPARATORS.includes(row.value.comparator));
const isTemporal = computed<boolean>(() => TEMPORAL_DATATYPES.includes(datatype.value));
const isNumeric = computed<boolean>(() => NUMERIC_DATATYPES.includes(datatype.value));

/**
 * Switches the row to another property. Both the comparator and the value are reset, since neither
 * necessarily makes sense for the new datatype (`gte` on a string, a date in a number field etc.).
 *
 * @param {string} key - The name of the chosen property.
 * @returns {void} This function does not return a value.
 */
function handleTargetChange(key: string): void {
  const target: FilterTarget = { kind: "property", field: key };
  const nextConfig: PropertyConfig | undefined = props.properties.find((property: PropertyConfig) => property.name === key);
  const comparators: FilterComparator[] = availableComparators(nextConfig?.type ?? "string", nextConfig?.options);

  row.value = { ...row.value, target, comparator: comparators[0] ?? "equals", value: null };
}

/**
 * Switches the comparator, dropping the value when the new one needs a different shape (a range
 * instead of a single value, or nothing at all).
 *
 * @param {FilterComparator} comparator - The chosen comparator.
 * @returns {void} This function does not return a value.
 */
function handleComparatorChange(comparator: FilterComparator): void {
  const shapeChanged: boolean =
    RANGE_COMPARATORS.includes(comparator) !== isRange.value || VALUELESS_COMPARATORS.includes(comparator);

  row.value = { ...row.value, comparator, value: shapeChanged ? null : row.value.value };
}

/**
 * Sets the value of the row.
 *
 * Used by all input components instead of a direct v-model.
 *
 * @param {unknown} value - The new value.
 * @returns {void} This function does not return a value.
 */
function setValue(value: unknown): void {
  row.value = { ...row.value, value };
}

/**
 * Writes one bound of a `between` range, leaving the other alone.
 *
 * @param {0 | 1} index - 0 for the lower bound, 1 for the upper.
 * @param {unknown} value - The new bound.
 * @returns {void} This function does not return a value.
 */
function setBound(index: 0 | 1, value: unknown): void {
  const bounds: unknown[] = Array.isArray(row.value.value) ? [...row.value.value] : [null, null];

  bounds[index] = value;

  setValue(bounds);
}

/**
 * Reads one bound of a `between` range.
 *
 * @param {number} index - 0 for the lower bound, 1 for the upper.
 * @returns {unknown} The bound, or null.
 */
function boundAt(index: number): unknown {
  return Array.isArray(row.value.value) ? row.value.value[index] ?? null : null;
}

/**
 * The stored value as a `Date`, for the date picker. Temporal values are kept as ISO strings, which
 * is what the API expects.
 *
 * @param {unknown} value - The stored value.
 * @returns {Date | null} The date, or null when unset.
 */
function toDate(value: unknown): Date | null {
  return value ? new Date(value as string) : null;
}
</script>

<template>
  <div class="rule flex align-items-center gap-1">
    <Select
      :model-value="selectedTarget"
      :options="targetOptions"
      option-label="label"
      option-value="value"
      placeholder="Field"
      size="small"
      class="target"
      @update:model-value="handleTargetChange"
    />

    <Select
      :model-value="row.comparator"
      :options="comparatorOptions"
      option-label="label"
      option-value="value"
      placeholder="Condition"
      size="small"
      class="comparator"
      @update:model-value="handleComparatorChange"
    />

    <div class="value flex gap-1">
      <template v-if="needsValue">
        <template v-if="isRange">
          <DatePicker
            v-if="isTemporal"
            :model-value="toDate(boundAt(0))"
            size="small"
            placeholder="From"
            @update:model-value="setBound(0, ($event as Date)?.toISOString() ?? null)"
          />
          <DatePicker
            v-if="isTemporal"
            :model-value="toDate(boundAt(1))"
            size="small"
            placeholder="To"
            @update:model-value="setBound(1, ($event as Date)?.toISOString() ?? null)"
          />
          <template v-else>
            <InputNumber
              :model-value="boundAt(0) as number"
              size="small"
              placeholder="From"
              @update:model-value="setBound(0, $event)"
            />
            <InputNumber
              :model-value="boundAt(1) as number"
              size="small"
              placeholder="To"
              @update:model-value="setBound(1, $event)"
            />
          </template>
        </template>

        <MultiSelect
          v-else-if="enumOptions.length && row.comparator === 'in'"
          :model-value="(row.value as unknown[]) ?? []"
          :options="enumOptions"
          size="small"
          placeholder="Any"
          class="w-full"
          @update:model-value="setValue($event)"
        />
        <Select
          v-else-if="enumOptions.length"
          :model-value="row.value"
          :options="enumOptions"
          size="small"
          placeholder="Any"
          class="w-full"
          show-clear
          @update:model-value="setValue($event)"
        />
        <DatePicker
          v-else-if="isTemporal"
          :model-value="toDate(row.value)"
          size="small"
          placeholder="Date"
          class="w-full"
          @update:model-value="setValue(($event as Date)?.toISOString() ?? null)"
        />
        <InputNumber
          v-else-if="isNumeric"
          :model-value="row.value as number"
          size="small"
          placeholder="Value"
          class="w-full"
          @update:model-value="setValue($event)"
        />
        <Select
          v-else-if="datatype === 'boolean'"
          :model-value="row.value"
          :options="[
            { label: 'Yes', value: true },
            { label: 'No', value: false },
          ]"
          option-label="label"
          option-value="value"
          size="small"
          placeholder="Any"
          class="w-full"
          show-clear
          @update:model-value="setValue($event)"
        />
        <InputText
          v-else
          :model-value="(row.value as string) ?? ''"
          size="small"
          placeholder="Value"
          class="w-full"
          @update:model-value="setValue($event ?? '')"
        />
      </template>
    </div>

    <Button
      icon="pi pi-times"
      severity="danger"
      text
      size="small"
      title="Remove this rule"
      class="flex-shrink-0"
      @click="emit('remove')"
    />
  </div>
</template>

<style scoped>
.rule > .target,
.rule > .comparator {
  width: 9rem;
  flex-shrink: 0;
}

.value {
  flex-grow: 1;
  min-width: 0;
}
</style>
