<script setup lang="ts">
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import type { HighlightTextStyle, PropertiesTextStyle } from "../external";
import { withKey } from "../utils/configUpdate";

/** The CSS properties of a highlight (all keys but `kind`) */
type StyleKey = Exclude<keyof PropertiesTextStyle, "kind">;

interface StyleField {
  key: StyleKey;
  label: string;
  /** Suggested values; any CSS value can be typed */
  options?: string[];
  isColor?: boolean;
}

const props = defineProps<{ modelValue: HighlightTextStyle | undefined }>();

const emit = defineEmits<{ "update:modelValue": [value: HighlightTextStyle | undefined] }>();

/** One field per key of `PropertiesTextStyle`, in the order of the schema */
const FIELDS: StyleField[] = [
  { key: "color", label: "Color", isColor: true },
  { key: "backgroundColor", label: "Background", isColor: true },
  { key: "fontWeight", label: "Font weight", options: ["normal", "bold", "lighter", "bolder", "300", "500", "600"] },
  { key: "fontStyle", label: "Font style", options: ["normal", "italic", "oblique"] },
  { key: "fontVariant", label: "Font variant", options: ["normal", "small-caps", "all-small-caps"] },
  { key: "fontSize", label: "Font size", options: ["smaller", "larger", "0.8em", "1.2em"] },
  { key: "letterSpacing", label: "Letter spacing", options: ["normal", "0.1em", "0.2em", "0.3em"] },
  { key: "verticalAlign", label: "Vertical align", options: ["baseline", "super", "sub", "top", "middle"] },
  {
    key: "textDecorationLine",
    label: "Decoration",
    options: ["none", "underline", "overline", "line-through", "underline line-through"],
  },
  { key: "textDecorationStyle", label: "Decoration style", options: ["solid", "double", "dotted", "dashed", "wavy"] },
  { key: "textDecorationColor", label: "Decoration color", isColor: true },
  { key: "textDecorationThickness", label: "Decoration thickness", options: ["auto", "from-font", "1px", "2px", "0.1em"] },
];

/**
 * Sets one CSS property. A highlight without properties is left out.
 *
 * @param {StyleKey} key - The property.
 * @param {string | undefined} value - The CSS value, empty to remove it.
 */
function setValue(key: StyleKey, value: string | undefined): void {
  const next: HighlightTextStyle | undefined = withKey(props.modelValue ?? { kind: "properties" }, key, value?.trim() || undefined);

  emit("update:modelValue", next && Object.keys(next).some((k) => k !== "kind") ? next : undefined);
}

/** A color for the native color input, which only takes `#rrggbb` */
function toHexColor(value: string | undefined): string {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
}
</script>

<template>
  <div class="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1.5 items-center">
    <template v-for="field in FIELDS" :key="field.key">
      <label class="text-sm text-slate-600">{{ field.label }}</label>
      <div class="flex items-center gap-2">
        <template v-if="field.isColor">
          <input
            type="color"
            class="w-8 h-8 shrink-0 cursor-pointer"
            :value="toHexColor(modelValue?.[field.key])"
            :title="`Pick ${field.label.toLowerCase()}`"
            @input="setValue(field.key, ($event.target as HTMLInputElement).value)"
          />
          <InputText
            :model-value="modelValue?.[field.key] ?? ''"
            size="small"
            class="flex-1"
            placeholder="CSS color, e.g. #2563eb or rgba(0,0,0,.1)"
            @update:model-value="setValue(field.key, $event)"
          />
        </template>
        <Select
          v-else
          :model-value="modelValue?.[field.key]"
          :options="field.options"
          editable
          show-clear
          size="small"
          class="flex-1"
          placeholder="CSS value"
          @update:model-value="setValue(field.key, $event)"
        />
      </div>
    </template>
  </div>
</template>
