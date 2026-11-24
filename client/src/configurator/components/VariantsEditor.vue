<script setup lang="ts">
import { ref } from "vue";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import type { AppearanceOverride, AppearanceVariant, HighlightTextStyle, MarkerStyle } from "../external";
import type { VariantProperty } from "../utils/attributes";
import { withKey } from "../utils/configUpdate";
import HighlightStyleInput from "./HighlightStyleInput.vue";
import MarkerInput from "./MarkerInput.vue";

const props = defineProps<{
  modelValue: AppearanceVariant[] | undefined;
  properties: VariantProperty[];
  /** Decides whether the overrides are highlights or markers */
  extent: "range" | "zeroPoint";
}>();

const emit = defineEmits<{ "update:modelValue": [value: AppearanceVariant[] | undefined] }>();

/** Typed values to add, per variant index, for properties without options */
const newValues = ref<Record<number, string>>({});

function propertyOf(variant: AppearanceVariant): VariantProperty | undefined {
  return props.properties.find((property) => property.attributeRef === variant.property);
}

/** The values listed for a variant: the options of its property, then configured values that aren't options */
function valuesOf(variant: AppearanceVariant): string[] {
  const options: string[] = propertyOf(variant)?.options ?? [];

  return [...options, ...Object.keys(variant.values).filter((value) => !options.includes(value))];
}

function isStale(variant: AppearanceVariant, value: string): boolean {
  const options: string[] | undefined = propertyOf(variant)?.options;

  return options !== undefined && !options.includes(value);
}

function update(index: number, variant: AppearanceVariant | undefined): void {
  const list: AppearanceVariant[] = [...(props.modelValue ?? [])];

  if (variant) {
    list[index] = variant;
  } else {
    list.splice(index, 1);
  }

  emit("update:modelValue", list.length > 0 ? list : undefined);
}

function addVariant(): void {
  emit("update:modelValue", [...(props.modelValue ?? []), { property: props.properties[0]?.attributeRef ?? "", values: {} }]);
}

function setProperty(index: number, variant: AppearanceVariant, property: string): void {
  update(index, { ...variant, property });
}

/**
 * Sets the override of one value. A value without override is left out.
 *
 * @param {number} index - The index of the variant.
 * @param {AppearanceVariant} variant - The variant.
 * @param {string} value - The property value.
 * @param {AppearanceOverride | undefined} override - The override, `undefined` to remove it.
 */
function setOverride(index: number, variant: AppearanceVariant, value: string, override: AppearanceOverride | undefined): void {
  const values: Record<string, AppearanceOverride> = { ...variant.values };

  if (override) {
    values[value] = override;
  } else {
    delete values[value];
  }

  update(index, { ...variant, values });
}

function setHighlight(index: number, variant: AppearanceVariant, value: string, highlight: HighlightTextStyle | undefined): void {
  setOverride(index, variant, value, withKey(variant.values[value], "highlight", highlight));
}

function setMarker(index: number, variant: AppearanceVariant, value: string, marker: MarkerStyle | undefined): void {
  setOverride(index, variant, value, withKey(variant.values[value], "marker", marker));
}

function addValue(index: number, variant: AppearanceVariant): void {
  const value: string = (newValues.value[index] ?? "").trim();

  if (value !== "" && !(value in variant.values)) {
    setOverride(index, variant, value, {});
  }

  newValues.value[index] = "";
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div v-for="(variant, index) in modelValue ?? []" :key="index" class="rounded border border-slate-200 p-2 flex flex-col gap-2">
      <div class="flex items-center gap-2">
        <span class="text-sm text-slate-600">When</span>
        <Select
          :model-value="variant.property"
          :options="properties"
          option-label="name"
          option-value="attributeRef"
          placeholder="Property"
          size="small"
          class="flex-1"
          :invalid="!propertyOf(variant)"
          @update:model-value="setProperty(index, variant, $event)"
        />
        <Button icon="icon-trash-2" severity="danger" text size="small" title="Remove the variant" @click="update(index, undefined)" />
      </div>
      <small v-if="!propertyOf(variant)" class="text-red-600">"{{ variant.property }}" is no property of this shape</small>

      <details v-for="value in valuesOf(variant)" :key="value" class="rounded bg-slate-50 px-2 py-1">
        <summary class="cursor-pointer text-sm flex items-center gap-2">
          <code>{{ value }}</code>
          <span v-if="variant.values[value]" class="text-xs text-emerald-600">configured</span>
          <span v-if="isStale(variant, value)" class="text-xs text-amber-600">not an option of the property</span>
          <Button
            v-if="variant.values[value] !== undefined"
            icon="icon-x"
            text
            size="small"
            class="ml-auto"
            title="Remove the override"
            @click.prevent="setOverride(index, variant, value, undefined)"
          />
        </summary>
        <div class="py-2">
          <HighlightStyleInput
            v-if="extent === 'range'"
            :model-value="variant.values[value]?.highlight"
            @update:model-value="setHighlight(index, variant, value, $event)"
          />
          <MarkerInput
            v-else
            :model-value="variant.values[value]?.marker"
            :properties="properties"
            @update:model-value="setMarker(index, variant, value, $event)"
          />
        </div>
      </details>

      <div v-if="!propertyOf(variant)?.options" class="flex items-center gap-2">
        <InputText v-model="newValues[index]" size="small" placeholder="Value" class="flex-1" @keydown.enter="addValue(index, variant)" />
        <Button label="Add value" size="small" severity="secondary" @click="addValue(index, variant)" />
      </div>
    </div>

    <Button
      label="Add variant"
      icon="icon-plus"
      size="small"
      severity="secondary"
      class="self-start"
      :disabled="properties.length === 0"
      :title="properties.length === 0 ? 'The shape has no properties' : ''"
      @click="addVariant"
    />
  </div>
</template>
