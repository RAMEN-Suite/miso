<script setup lang="ts">
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import { HIGHLIGHT_STYLE_KEYS, type HighlightTextStyle } from "../external";
import { withKey } from "../utils/configUpdate";
import { EMPTY_ENTRY_PT, withEmptySuggestion } from "../utils/selectEntries";

/** The CSS properties of a highlight (all keys but `kind`) */
type StyleKey = (typeof HIGHLIGHT_STYLE_KEYS)[number];

/** How a CSS property is edited */
interface StyleField {
  label: string;
  /** Suggested values; any CSS value can be typed */
  options?: string[];
  isColor?: boolean;
}

const props = defineProps<{ modelValue: HighlightTextStyle | undefined }>();

const emit = defineEmits<{ "update:modelValue": [value: HighlightTextStyle | undefined] }>();

/** The editing of each CSS property; a property added to the schema is a type error here until it gets a field */
const FIELD_BY_KEY: Record<StyleKey, StyleField> = {
  color: { label: "Color", isColor: true },
  backgroundColor: { label: "Background", isColor: true },
  fontWeight: { label: "Font weight", options: ["normal", "bold", "lighter", "bolder", "300", "500", "600"] },
  fontStyle: { label: "Font style", options: ["normal", "italic", "oblique"] },
  fontVariant: { label: "Font variant", options: ["normal", "small-caps", "all-small-caps"] },
  fontSize: { label: "Font size", options: ["smaller", "larger", "0.8em", "1.2em"] },
  letterSpacing: { label: "Letter spacing", options: ["normal", "0.1em", "0.2em", "0.3em"] },
  verticalAlign: { label: "Vertical align", options: ["baseline", "super", "sub", "top", "middle"] },
  textDecorationLine: {
    label: "Decoration",
    options: ["none", "underline", "overline", "line-through", "underline line-through"],
  },
  textDecorationStyle: { label: "Decoration style", options: ["solid", "double", "dotted", "dashed", "wavy"] },
  textDecorationColor: { label: "Decoration color", isColor: true },
  textDecorationThickness: { label: "Decoration thickness", options: ["auto", "from-font", "1px", "2px", "0.1em"] },
};

/** One field per CSS property, in the order of the schema */
const FIELDS: (StyleField & { key: StyleKey })[] = HIGHLIGHT_STYLE_KEYS.map((key) => ({ key, ...FIELD_BY_KEY[key] }));

/**
 * Sets one CSS property. A highlight without properties is left out.
 *
 * @param {StyleKey} key - The property.
 * @param {string | undefined} value - The CSS value, empty to remove it.
 */
function setValue(key: StyleKey, value: string | undefined): void {
  const next: HighlightTextStyle | undefined = withKey(props.modelValue ?? { kind: "properties" }, key, value?.trim());

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
      <!-- eslint-disable-next-line vuejs-accessibility/label-has-for -- Eslint config does not recognize PrimeVue's components; the controls have an aria-label -->
      <label class="text-sm text-slate-600">{{ field.label }}</label>
      <div class="flex items-center gap-2">
        <template v-if="field.isColor">
          <input
            type="color"
            :aria-label="`Pick ${field.label.toLowerCase()}`"
            class="w-8 h-8 shrink-0 cursor-pointer"
            :value="toHexColor(modelValue?.[field.key])"
            :title="`Pick ${field.label.toLowerCase()}`"
            @input="setValue(field.key, ($event.target as HTMLInputElement).value)"
          />
          <InputText
            :aria-label="field.label"
            :model-value="modelValue?.[field.key] ?? ''"
            size="small"
            class="flex-1"
            placeholder="CSS color, e.g. #2563eb or rgba(0,0,0,.1)"
            @update:model-value="setValue(field.key, $event)"
          />
        </template>
        <Select
          v-else
          :aria-label="field.label"
          :model-value="modelValue?.[field.key]"
          :options="withEmptySuggestion(field.options ?? [])"
          :pt="EMPTY_ENTRY_PT"
          editable
          size="small"
          class="flex-1"
          placeholder="CSS value"
          @update:model-value="setValue(field.key, $event)"
        />
      </div>
    </template>
  </div>
</template>
