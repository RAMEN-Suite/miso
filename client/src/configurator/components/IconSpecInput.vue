<script setup lang="ts">
import { computed, ref, watch } from "vue";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import Textarea from "primevue/textarea";
import { IconView, type IconSpecInput } from "../external";

type IconKind = "lucide" | "url" | "svg";

const props = defineProps<{
  modelValue: IconSpecInput | undefined;
  /** The icon that applies without a value of its own, e.g. from the lineage */
  inherited?: { icon: IconSpecInput; from: string };
}>();

const emit = defineEmits<{ "update:modelValue": [value: IconSpecInput | undefined] }>();

const KIND_OPTIONS: { label: string; value: IconKind }[] = [
  { label: "Lucide", value: "lucide" },
  { label: "URL", value: "url" },
  { label: "SVG", value: "svg" },
];

/** The kind of a value; a string is the shorthand of a Lucide icon */
function kindOf(value: IconSpecInput | undefined): IconKind | undefined {
  return typeof value === "string" ? "lucide" : value?.kind;
}

/** The chosen kind; kept while there is no text yet (the value is `undefined` then) */
const kind = ref<IconKind>(kindOf(props.modelValue) ?? "lucide");

watch(
  () => props.modelValue,
  (value) => {
    kind.value = kindOf(value) ?? kind.value;
  },
);

/** The name, URL or markup of the value */
const text = computed<string>(() => {
  const value: IconSpecInput | undefined = props.modelValue;

  if (typeof value === "string") {
    return value;
  } else if (value?.kind === "lucide") {
    return value.name;
  } else if (value?.kind === "url") {
    return value.url;
  } else if (value?.kind === "svg") {
    return value.svg;
  }

  return "";
});

/**
 * Builds the value of a kind. A Lucide icon is written as shorthand (its name).
 *
 * @param {IconKind} newKind - The kind.
 * @param {string} newText - The name, URL or markup.
 * @returns {IconSpecInput | undefined} The value, `undefined` without text.
 */
function toValue(newKind: IconKind, newText: string): IconSpecInput | undefined {
  if (newText.trim() === "") {
    return undefined;
  } else if (newKind === "lucide") {
    return newText.trim();
  } else if (newKind === "url") {
    return { kind: "url", url: newText.trim() };
  } else {
    return { kind: "svg", svg: newText };
  }
}

function onKind(value: IconKind): void {
  kind.value = value;
  emit("update:modelValue", toValue(value, text.value));
}

function onText(value: string | undefined): void {
  emit("update:modelValue", toValue(kind.value, value ?? ""));
}
</script>

<template>
  <div class="flex items-start gap-2">
    <Select
      :model-value="kind"
      :options="KIND_OPTIONS"
      option-label="label"
      option-value="value"
      size="small"
      class="w-28 shrink-0"
      @update:model-value="onKind"
    />
    <Textarea
      v-if="kind === 'svg'"
      :model-value="text"
      rows="3"
      class="flex-1 font-mono text-xs"
      placeholder="<svg ...>"
      @update:model-value="onText"
    />
    <InputText
      v-else
      :model-value="text"
      size="small"
      class="flex-1"
      :placeholder="kind === 'url' ? 'https://...' : inherited ? `Inherited from ${inherited.from}` : 'Lucide name, e.g. folder-open'"
      @update:model-value="onText"
    />
    <div
      class="w-8 h-8 flex items-center justify-center shrink-0 rounded border border-slate-200"
      :title="modelValue ? '' : inherited ? `Inherited from ${inherited.from}` : 'No icon'"
    >
      <IconView v-if="modelValue" :spec="modelValue" :size="18" />
      <IconView v-else-if="inherited" :spec="inherited.icon" :size="18" class="opacity-40" />
    </div>
  </div>
</template>
