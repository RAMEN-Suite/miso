<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Select from "primevue/select";
import { MARKER_KINDS, type IconSpecInput, type MarkerStyle } from "../external";
import { EMPTY_ENTRY_PT, withEmptyEntry, withEmptySuggestion, type SelectEntry } from "../utils/selectEntries";
import IconSpecInputField from "./IconSpecInput.vue";

type MarkerKind = MarkerStyle["kind"];

const props = defineProps<{
  modelValue: MarkerStyle | undefined;
  /** The properties of the shape, for the math marker's notation */
  properties: { attributeRef: string; name: string }[];
}>();

const emit = defineEmits<{ "update:modelValue": [value: MarkerStyle | undefined] }>();

const KIND_LABELS: Record<MarkerKind, string> = { icon: "Icon", math: "Formula (KaTeX)" };

const KIND_OPTIONS: SelectEntry<MarkerKind>[] = withEmptyEntry(
  MARKER_KINDS.map((value) => ({ label: KIND_LABELS[value], value })),
);

const DISPLAY_OPTIONS: string[] = withEmptySuggestion(["inline-block", "inline", "block"]);

/** The properties as dropdown entries, after the empty one */
const propertyOptions = computed<SelectEntry<string>[]>(() =>
  withEmptyEntry(props.properties.map((property) => ({ label: property.name, value: property.attributeRef }))),
);

/** The chosen kind; kept while the marker is incomplete (the value is `undefined` then) */
const kind = ref<MarkerKind | undefined>(props.modelValue?.kind);

watch(
  () => props.modelValue,
  (value) => {
    kind.value = value?.kind ?? kind.value;
  },
);

function onKind(value: MarkerKind | null | undefined): void {
  kind.value = value ?? undefined;
  emit("update:modelValue", undefined);
}

function onIcon(icon: IconSpecInput | undefined): void {
  emit("update:modelValue", icon ? { kind: "icon", icon } : undefined);
}

function onMathProperty(property: string | null | undefined): void {
  const display: string | undefined = props.modelValue?.kind === "math" ? props.modelValue.display : undefined;

  emit("update:modelValue", property ? { kind: "math", property, ...(display ? { display } : {}) } : undefined);
}

function onMathDisplay(value: string | undefined): void {
  if (props.modelValue?.kind !== "math") {
    return;
  }

  // The empty entry is a non-breaking space
  const display: string | undefined = value?.trim();
  const { display: _previous, ...rest } = props.modelValue;

  emit("update:modelValue", display ? { ...rest, display } : rest);
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <Select
      aria-label="Marker kind"
      :model-value="kind"
      :options="KIND_OPTIONS"
      option-label="label"
      option-value="value"
      placeholder="No marker (crossed box)"
      :pt="EMPTY_ENTRY_PT"
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
        aria-label="Property with the LaTeX notation"
        :model-value="modelValue?.kind === 'math' ? modelValue.property : undefined"
        :options="propertyOptions"
        option-label="label"
        option-value="value"
        :pt="EMPTY_ENTRY_PT"
        placeholder="Property with the LaTeX notation"
        size="small"
        class="flex-1"
        @update:model-value="onMathProperty"
      />
      <Select
        aria-label="Display"
        :model-value="modelValue?.kind === 'math' ? modelValue.display : undefined"
        :options="DISPLAY_OPTIONS"
        :disabled="modelValue?.kind !== 'math'"
        placeholder="display"
        :pt="EMPTY_ENTRY_PT"
        editable
        size="small"
        class="w-40"
        @update:model-value="onMathDisplay"
      />
    </div>
  </div>
</template>
