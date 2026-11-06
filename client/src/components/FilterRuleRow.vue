<script setup lang="ts">
import { computed } from "vue";
import Select from "primevue/select";
import MultiSelect from "primevue/multiselect";
import InputText from "primevue/inputtext";
import InputNumber from "primevue/inputnumber";
import Button from "primevue/button";
import { FilterComparator, FilterRow, FilterTarget, ModelAttribute, ModelContext } from "../models/types";
import { availableComparators, COMPARATOR_LABELS, RANGE_COMPARATORS, targetKey, VALUELESS_COMPARATORS } from "../config/filters";
import type { AttributeValueType } from "../config/ramen";
import {
  getTemporalInputType,
  isBoolean,
  isNumeric,
  isTemporal,
  toStoredTemporal,
  toTemporalInputValue,
} from "../utils/helper/propertyTypeHelper";
import { useConfigStore } from "../store/config";
import { getOptions, getValueType } from "../utils/helper/modelHelper";

const props = defineProps<{
  /** The attributes that can be filtered on */
  properties: ModelAttribute[];
}>();

const context: ModelContext = useConfigStore().getModelContext();

/**
 * The row being edited. Replaced rather than mutated on every change, so the parent's array sees a
 * new object and its watcher fires.
 */
const row = defineModel<FilterRow>({ required: true });

const emit = defineEmits<{ remove: [] }>();

const targetOptions = computed<{ label: string; value: string }[]>(() =>
  props.properties.map((property: ModelAttribute) => ({ label: property.attribute.name, value: property.attribute.name })),
);

const selectedTarget = computed<string>(() => targetKey(row.value.target));

/** The attribute behind the chosen target. Absent for `distinct`, which is always text. */
const field = computed<ModelAttribute | undefined>(() =>
  row.value.target.kind === "property"
    ? props.properties.find(
        (property: ModelAttribute) =>
          property.attribute.name === (row.value.target as { kind: "property"; field: string }).field,
      )
    : undefined,
);

/** The value type of the chosen attribute, used by the inputs and the conversions of temporal values */
const valueType = computed<AttributeValueType | undefined>(() => (field.value ? getValueType(context, field.value) : undefined));

const enumOptions = computed<(string | number)[]>(() => (field.value ? (getOptions(context, field.value) ?? []) : []));

const comparatorOptions = computed<{ label: string; value: FilterComparator }[]>(() =>
  availableComparators(context, field.value).map((comparator: FilterComparator) => ({
    label: COMPARATOR_LABELS[comparator],
    value: comparator,
  })),
);

const needsValue = computed<boolean>(() => !VALUELESS_COMPARATORS.includes(row.value.comparator));
const isRange = computed<boolean>(() => RANGE_COMPARATORS.includes(row.value.comparator));
const hasTemporalValue = computed<boolean>(() => isTemporal(valueType.value));
const hasNumericValue = computed<boolean>(() => isNumeric(valueType.value));
const hasBooleanValue = computed<boolean>(() => isBoolean(valueType.value));

/** The `type` attribute the native html `input` element expects */
const temporalInputType = computed<"date" | "datetime-local">(() => getTemporalInputType(valueType.value));

/**
 * Switches the row to another property. Both the comparator and the value are reset, since neither
 * necessarily makes sense for the new datatype (`gte` on a string, a date in a number field etc.).
 *
 * @param {string} key - The name of the chosen property.
 * @returns {void} This function does not return a value.
 */
function handleTargetChange(key: string): void {
  const target: FilterTarget = { kind: "property", field: key };
  const nextField: ModelAttribute | undefined = props.properties.find(
    (property: ModelAttribute) => property.attribute.name === key,
  );
  const comparators: FilterComparator[] = availableComparators(context, nextField);

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

const defaultProps = {
  title: "Value to test against",
  size: "small",
  "append-to": "self",
  class: "w-full",
} as const;
</script>

<template>
  <!-- eslint-disable vuejs-accessibility/form-control-has-label -- Eslint config does not recognize PrimeVue's component -->
  <!-- eslint-disable vuejs-accessibility/label-has-for -- Eslint config does not recognize PrimeVue's component -->
  <div class="rule flex items-center gap-1">
    <Select
      :model-value="selectedTarget"
      :options="targetOptions"
      :label-id="`target-${row.id}`"
      option-label="label"
      option-value="value"
      placeholder="Field"
      size="small"
      class="target"
      append-to="self"
      @update:model-value="handleTargetChange"
    />
    <label :for="`target-${row.id}`" class="sr-only"></label>
    <Select
      :model-value="row.comparator"
      :options="comparatorOptions"
      :label-id="`comparator-${row.id}`"
      option-label="label"
      option-value="value"
      placeholder="Condition"
      size="small"
      class="comparator"
      append-to="self"
      @update:model-value="handleComparatorChange"
    />
    <label :for="`comparator-${row.id}`" class="sr-only"></label>
    <div class="value flex gap-1">
      <template v-if="needsValue">
        <template v-if="isRange">
          <InputText
            v-if="hasTemporalValue"
            v-bind="defaultProps"
            :type="temporalInputType"
            step="1"
            :model-value="toTemporalInputValue(boundAt(0) as string | null, valueType)"
            @update:model-value="setBound(0, toStoredTemporal($event, valueType))"
          />
          <InputText
            v-if="hasTemporalValue"
            v-bind="defaultProps"
            :type="temporalInputType"
            step="1"
            :model-value="toTemporalInputValue(boundAt(1) as string | null, valueType)"
            @update:model-value="setBound(1, toStoredTemporal($event, valueType))"
          />
          <template v-else>
            <InputNumber
              :model-value="boundAt(0) as number"
              v-bind="defaultProps"
              placeholder="From"
              @update:model-value="setBound(0, $event)"
            />
            <InputNumber
              :model-value="boundAt(1) as number"
              v-bind="defaultProps"
              placeholder="To"
              @update:model-value="setBound(1, $event)"
            />
          </template>
        </template>

        <MultiSelect
          v-else-if="enumOptions.length && row.comparator === 'in'"
          :model-value="(row.value as unknown[]) ?? []"
          :options="enumOptions"
          v-bind="defaultProps"
          placeholder="Any"
          @update:model-value="setValue($event)"
        />
        <Select
          v-else-if="enumOptions.length"
          :model-value="row.value"
          :options="enumOptions"
          v-bind="defaultProps"
          placeholder="Any"
          show-clear
          @update:model-value="setValue($event)"
        />
        <InputText
          v-else-if="hasTemporalValue"
          v-bind="defaultProps"
          :type="temporalInputType"
          step="1"
          :model-value="toTemporalInputValue(row.value as string | null, valueType)"
          @update:model-value="setValue(toStoredTemporal($event, valueType))"
        />
        <InputNumber
          v-else-if="hasNumericValue"
          :model-value="row.value as number"
          v-bind="defaultProps"
          placeholder="Value"
          @update:model-value="setValue($event)"
        />
        <Select
          v-else-if="hasBooleanValue"
          :model-value="row.value"
          :options="[
            { label: 'Yes', value: true },
            { label: 'No', value: false },
          ]"
          option-label="label"
          option-value="value"
          v-bind="defaultProps"
          placeholder="Any"
          show-clear
          @update:model-value="setValue($event)"
        />
        <InputText
          v-else
          v-bind="defaultProps"
          :model-value="(row.value as string) ?? ''"
          placeholder="Value"
          @update:model-value="setValue($event ?? '')"
        />
      </template>
    </div>

    <Button icon="icon-x" severity="danger" text size="small" title="Remove this rule" class="shrink-0" @click="emit('remove')" />
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
