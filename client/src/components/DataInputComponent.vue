<script setup lang="ts">
import { computed, ComputedRef } from "vue";
import { useConfigStore } from "../store/config";
import { getOptions, getValueType, isEditable, isRequired, validateValue } from "../utils/helper/modelHelper";
import type { ModelAttribute, ModelContext } from "../models/types";
import type { AttributeValueType } from "../config/ramen";
import {
  getTemporalInputType,
  isBoolean,
  isFloat,
  isInteger,
  isNumeric,
  isObject,
  isString,
  isTemporal,
  toStoredTemporal,
  toTemporalInputValue,
} from "../utils/helper/propertyTypeHelper";
import InputNumber from "primevue/inputnumber";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import { Checkbox } from "primevue";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Data can be of very different shape. Maybe fix in the future
const modelValue = defineModel<any>();
const props = defineProps<{
  /** The model attribute the value belongs to */
  attribute: ModelAttribute;
  /** The value is one item of a list attribute (edited in a `DataInputGroup`), not the whole value */
  item?: boolean;
  mode?: "edit" | "view";
}>();

const context: ModelContext = useConfigStore().getModelContext();

const name: string = props.attribute.attribute.name;
const valueType: AttributeValueType = getValueType(context, props.attribute);
const options: string[] | number[] | undefined = getOptions(context, props.attribute);
const isDisabled = computed<boolean>(() => !isEditable(context, props.attribute) || props.mode === "view");
// A single item is checked as part of the whole list by the group
const required: boolean = !props.item && isRequired(props.attribute);

const isPrimitive: boolean = isString(valueType) || isNumeric(valueType);

/** An entry of the dropdown. `null` is the empty entry. */
interface SelectOption {
  label: string;
  value: string | number | null;
}

/** An optional single value can be removed again: its dropdown starts with an empty entry, like a native select */
const isClearable: boolean = !required && !props.item;

/**
 * The dropdown entries. The empty entry is a non-breaking space, so it keeps the line height. List items have none,
 * they are removed with their delete button.
 */
const selectOptions: SelectOption[] = [
  ...(isClearable ? [{ label: "\xa0", value: null }] : []),
  ...(options ?? []).map((option: string | number) => ({ label: String(option), value: option })),
];

/**
 * The tooltip of a dropdown entry.
 *
 * @param {SelectOption} option - The entry.
 * @returns {string} Its label, or a description for the empty entry.
 */
function optionTitle(option: SelectOption): string {
  if (option.value === null) {
    return "Select no value";
  } else {
    return option.label;
  }
}

const isInvalid: ComputedRef<boolean> = computed(
  () => !props.item && validateValue(context, props.attribute, modelValue.value).length > 0,
);

/** The `type` attribute the native html `input` element expects */
const temporalInputType: "date" | "datetime-local" = getTemporalInputType(valueType);

/**
 * The value of the native input of a temporal property. Mediates between the stored string and what
 * the browser reads and writes.
 */
const temporalValue = computed<string>({
  get: () => toTemporalInputValue(modelValue.value, valueType),
  set: (value: string) => {
    modelValue.value = toStoredTemporal(value, valueType);
  },
});

/** Read-only display of an `Object` property. Functionality will be implemented later */
const objectValue = computed<string>(() => {
  if (modelValue.value === null || modelValue.value === undefined) {
    return "—";
  } else {
    return JSON.stringify(modelValue.value, null, 2);
  }
});
</script>

<template>
  <!-- eslint-disable vuejs-accessibility/form-control-has-label -- The label is inside the parent component -->
  <!-- Optional dropdowns have no placeholder, so an empty value shows as empty, like the empty entry -->
  <Select
    v-if="options && isPrimitive"
    v-model="modelValue"
    :disabled="isDisabled"
    :required="required"
    :invalid="isInvalid"
    :options="selectOptions"
    option-label="label"
    option-value="value"
    :placeholder="isClearable ? undefined : `Select ${name}`"
    :pt="{ option: ({ context }) => ({ title: optionTitle(context.option) }) }"
    size="small"
    class="w-full"
  />
  <InputText
    v-else-if="isString(valueType)"
    v-model="modelValue"
    :disabled="isDisabled"
    :required="required"
    :invalid="isInvalid"
    size="small"
    class="w-full"
    spellcheck="false"
  />
  <InputNumber
    v-else-if="isInteger(valueType)"
    v-model="modelValue"
    :disabled="isDisabled"
    :required="required"
    :invalid="isInvalid"
    size="small"
    show-buttons
  />
  <InputNumber
    v-else-if="isFloat(valueType)"
    v-model="modelValue"
    :disabled="isDisabled"
    :required="required"
    :invalid="isInvalid"
    :min-fraction-digits="0"
    :max-fraction-digits="20"
    size="small"
    show-buttons
  />
  <InputText
    v-else-if="isTemporal(valueType)"
    v-model="temporalValue"
    :type="temporalInputType"
    :disabled="isDisabled"
    :required="required"
    :invalid="isInvalid"
    step="1"
    size="small"
    class="w-full"
  />
  <div v-else-if="isBoolean(valueType)" class="checkbox-field">
    <Checkbox v-model="modelValue" :name="name" :disabled="isDisabled" binary />
  </div>
  <pre v-else-if="isObject(valueType)" class="object-field">{{ objectValue }}</pre>
  <div v-else class="default-field" :style="{ backgroundColor: '#ffb1c0', borderRadius: '5px' }">
    {{ modelValue }}
  </div>
</template>

<style scoped>
.checkbox-field {
  padding-block: var(--p-inputtext-sm-padding-y);
  border-block: 1px solid transparent;
  line-height: normal;
}

.object-field {
  margin: 0;
  padding: var(--p-inputtext-sm-padding-y) var(--p-inputtext-sm-padding-x);
  border: 1px solid var(--p-inputtext-disabled-background);
  border-radius: var(--p-inputtext-border-radius);
  background: var(--p-inputtext-disabled-background);
  color: var(--p-inputtext-disabled-color);
  font-size: var(--p-inputtext-sm-font-size);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 12rem;
  overflow: auto;
}
</style>
