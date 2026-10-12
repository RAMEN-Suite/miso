<script setup lang="ts">
import { computed, ComputedRef } from "vue";
import { PropertyConfig } from "../models/types";
import { isRequiredValueMissing } from "../utils/helper/helper";
import {
  getTemporalInputType,
  isBoolean,
  isFloat,
  isInteger,
  isNumeric,
  isString,
  isTemporal,
  toStoredTemporal,
  toTemporalInputValue,
} from "../utils/helper/propertyTypeHelper";
import InputNumber from "primevue/inputnumber";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import Textarea from "primevue/textarea";
import { Checkbox } from "primevue";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Data can be of very different shape. Maybe fix in the future
const modelValue = defineModel<any>();
const props = defineProps<{
  config: Partial<PropertyConfig>;
  mode?: "edit" | "view";
}>();

const isPrimitive: boolean = isString(props.config) || isNumeric(props.config);

const minValue: number | null | undefined =
  props.config.exclusiveMinimum != null ? props.config.exclusiveMinimum + 1 : props.config.minimum;

const maxValue: number | null | undefined =
  props.config.exclusiveMaximum != null ? props.config.exclusiveMaximum - 1 : props.config.maximum;

const minLength: number | null | undefined = props.config.minLength;
const maxLength: number | null | undefined = props.config.maxLength;

const isInvalid: ComputedRef<boolean> = computed(() => isRequiredValueMissing(modelValue.value, props.config));

/** The `type` attribute the native html `input` element expects */
const temporalInputType: "date" | "time" | "datetime-local" = getTemporalInputType(props.config);

/**
 * The value of the native input of a temporal property. Mediates between the stored string and what
 * the browser reads and writes.
 */
const temporalValue = computed<string>({
  get: () => toTemporalInputValue(modelValue.value, props.config),
  set: (value: string) => {
    modelValue.value = toStoredTemporal(value, props.config);
  },
});
</script>

<template>
  <!-- eslint-disable vuejs-accessibility/form-control-has-label -- The label is inside the parent component -->
  <Select
    v-if="config.options && isPrimitive"
    v-model="modelValue"
    :disabled="!config.editable || mode === 'view'"
    :required="config.required"
    :invalid="isInvalid"
    :options="config.options"
    :placeholder="`Select ${config.name}`"
    size="small"
    class="w-full"
  />
  <InputText
    v-else-if="isString(config) && (config.template === 'input' || !config.template)"
    v-model="modelValue"
    :disabled="!config.editable || mode === 'view'"
    :required="config.required"
    :invalid="isInvalid"
    size="small"
    class="w-full"
    spellcheck="false"
    :pt="{ root: { minLength: minLength, maxLength: maxLength } }"
  />
  <Textarea
    v-else-if="isString(config) && config.template === 'textarea'"
    v-model="modelValue"
    :disabled="!config.editable || mode === 'view'"
    :required="config.required"
    :invalid="isInvalid"
    cols="30"
    rows="5"
    size="small"
    class="w-full"
  />
  <InputNumber
    v-else-if="isInteger(config)"
    v-model="modelValue"
    :disabled="!config.editable || mode === 'view'"
    :required="config.required"
    :invalid="isInvalid"
    :min="minValue"
    :max="maxValue"
    size="small"
    show-buttons
  />
  <InputNumber
    v-else-if="isFloat(config)"
    v-model="modelValue"
    :disabled="!config.editable || mode === 'view'"
    :required="config.required"
    :invalid="isInvalid"
    :min="minValue"
    :max="maxValue"
    :min-fraction-digits="0"
    :max-fraction-digits="20"
    size="small"
    show-buttons
  />
  <InputText
    v-else-if="isTemporal(config)"
    v-model="temporalValue"
    :type="temporalInputType"
    :disabled="!config.editable || mode === 'view'"
    :required="config.required"
    :invalid="isInvalid"
    step="1"
    size="small"
    class="w-full"
  />
  <div v-else-if="isBoolean(config)" class="checkbox-field">
    <Checkbox
      v-model="modelValue"
      :name="config.name ?? 'Booelan value without name :/'"
      :disabled="!config.editable || mode === 'view'"
      binary
    />
  </div>
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
</style>
