<script setup lang="ts">
import { computed, ComputedRef } from "vue";
import { PropertyConfig } from "../models/types";
import { isRequiredValueMissing } from "../utils/helper/helper";
import InputNumber from "primevue/inputnumber";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import Textarea from "primevue/textarea";
import InputDate from "./InputDate.vue";
import { Checkbox } from "primevue";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Data can be of very different shape. Maybe fix in the future
const modelValue = defineModel<any>();
const props = defineProps<{
  config: Partial<PropertyConfig>;
  mode?: "edit" | "view";
}>();

const isPrimitive: boolean = props.config.type === "string" || props.config.type === "integer" || props.config.type === "number";

const minValue: number | null | undefined =
  props.config.exclusiveMinimum != null ? props.config.exclusiveMinimum + 1 : props.config.minimum;

const maxValue: number | null | undefined =
  props.config.exclusiveMaximum != null ? props.config.exclusiveMaximum - 1 : props.config.maximum;

const minLength: number | null | undefined = props.config.minLength;
const maxLength: number | null | undefined = props.config.maxLength;

const isInvalid: ComputedRef<boolean> = computed(() => isRequiredValueMissing(modelValue.value, props.config));
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
    v-else-if="config.type === 'string' && (config.template === 'input' || !config.template)"
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
    v-else-if="config.type === 'string' && config.template === 'textarea'"
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
    v-else-if="config.type === 'integer'"
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
    v-else-if="config.type === 'number'"
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
  <div v-else-if="config.type === 'date'">
    <InputDate v-model="modelValue" :config="config" :mode="mode" />
  </div>
  <div v-else-if="config.type === 'date-time'">
    <InputDate v-model="modelValue" :config="config" :mode="mode" />
  </div>
  <div v-else-if="config.type === 'time'">
    <InputDate v-model="modelValue" :config="config" :mode="mode" />
  </div>
  <div v-else-if="config.type === 'boolean'" class="checkbox-field">
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
