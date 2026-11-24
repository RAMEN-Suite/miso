<script setup lang="ts">
import { ref, watch } from "vue";
import Select from "primevue/select";
import type { IconSpecInput, MarkerStyle } from "../external";
import IconSpecInputField from "./IconSpecInput.vue";

type MarkerKind = MarkerStyle["kind"];

const props = defineProps<{
  modelValue: MarkerStyle | undefined;
  /** The properties of the shape, for the math marker's notation */
  properties: { attributeRef: string; name: string }[];
}>();

const emit = defineEmits<{ "update:modelValue": [value: MarkerStyle | undefined] }>();

const KIND_OPTIONS: { label: string; value: MarkerKind }[] = [
  { label: "Icon", value: "icon" },
  { label: "Formula (KaTeX)", value: "math" },
];

const DISPLAY_OPTIONS: string[] = ["inline-block", "inline", "block"];

/** The chosen kind; kept while the marker is incomplete (the value is `undefined` then) */
const kind = ref<MarkerKind | undefined>(props.modelValue?.kind);

watch(
  () => props.modelValue,
  (value) => {
    kind.value = value?.kind ?? kind.value;
  },
);

function onKind(value: MarkerKind | undefined): void {
  kind.value = value;
  emit("update:modelValue", undefined);
}

function onIcon(icon: IconSpecInput | undefined): void {
  emit("update:modelValue", icon ? { kind: "icon", icon } : undefined);
}

function onMathProperty(property: string | undefined): void {
  const display: string | undefined = props.modelValue?.kind === "math" ? props.modelValue.display : undefined;

  emit("update:modelValue", property ? { kind: "math", property, ...(display ? { display } : {}) } : undefined);
}

function onMathDisplay(display: string | undefined): void {
  if (props.modelValue?.kind !== "math") {
    return;
  }

  const { display: _previous, ...rest } = props.modelValue;

  emit("update:modelValue", display ? { ...rest, display } : rest);
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <Select
      :model-value="kind"
      :options="KIND_OPTIONS"
      option-label="label"
      option-value="value"
      placeholder="No marker (crossed box)"
      show-clear
      size="small"
      class="w-56"
      @update:model-value="onKind"
    />
    <IconSpecInputField
      v-if="kind === 'icon'"
      :model-value="modelValue?.kind === 'icon' ? modelValue.icon : undefined"
      @update:model-value="onIcon"
    />
    <div v-else-if="kind === 'math'" class="flex items-center gap-2">
      <Select
        :model-value="modelValue?.kind === 'math' ? modelValue.property : undefined"
        :options="properties"
        option-label="name"
        option-value="attributeRef"
        placeholder="Property with the LaTeX notation"
        size="small"
        class="flex-1"
        @update:model-value="onMathProperty"
      />
      <Select
        :model-value="modelValue?.kind === 'math' ? modelValue.display : undefined"
        :options="DISPLAY_OPTIONS"
        :disabled="modelValue?.kind !== 'math'"
        placeholder="display"
        show-clear
        editable
        size="small"
        class="w-40"
        @update:model-value="onMathDisplay"
      />
    </div>
  </div>
</template>
