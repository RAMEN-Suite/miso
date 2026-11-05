<script setup lang="ts">
import { computed, ComputedRef } from "vue";
import { useGuidelinesStore } from "../store/guidelines";
import {
  getOptions,
  getValueType,
  isEditable,
  isRequired,
  validateValue,
  type AttributeValueType,
  type ModelAttribute,
  type ModelContext,
} from "../utils/helper/modelHelper";
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

const context: ModelContext = useGuidelinesStore().getModelContext();

const name: string = props.attribute.attribute.name;
const valueType: AttributeValueType = getValueType(context, props.attribute);
const options: string[] | number[] | undefined = getOptions(context, props.attribute);
const isDisabled = computed<boolean>(() => !isEditable(context, props.attribute) || props.mode === "view");
// A single item is checked as part of the whole list by the group
const required: boolean = !props.item && isRequired(props.attribute);

const isPrimitive: boolean = isString(valueType) || isNumeric(valueType);

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
  <Select
    v-if="options && isPrimitive"
    v-model="modelValue"
    :disabled="isDisabled"
    :required="required"
    :invalid="isInvalid"
    :options="options"
    :placeholder="`Select ${name}`"
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
