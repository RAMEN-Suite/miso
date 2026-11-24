<script setup lang="ts">
import { computed, ref, watch } from "vue";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import Textarea from "primevue/textarea";
import { ICON_KINDS, type IconSpecInput } from "../external";
import lucideLogoUrl from "../assets/lucide.svg";
import LucideIconInput from "./LucideIconInput.vue";

type IconKind = (typeof ICON_KINDS)[number];

const props = defineProps<{
  modelValue: IconSpecInput | undefined;
  /** The name of the element whose icon applies without a value of its own, e.g. from the lineage */
  inheritedFrom?: string;
}>();

const emit = defineEmits<{ "update:modelValue": [value: IconSpecInput | undefined] }>();

/** How a kind is shown in the select: an icon class or an image URL in front of its label */
type KindLook = { label: string } & ({ icon: string } | { image: string });

const KIND_LOOKS: Record<IconKind, KindLook> = {
  lucide: { label: "Lucide", image: lucideLogoUrl },
  url: { label: "URL", icon: "icon-link" },
  svg: { label: "SVG", icon: "icon-code-xml" },
};

const KIND_OPTIONS: (KindLook & { value: IconKind })[] = ICON_KINDS.map((value) => ({ ...KIND_LOOKS[value], value }));

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
    >
      <template #value>
        <span class="flex items-center gap-2">
          <img v-if="'image' in KIND_LOOKS[kind]" :src="KIND_LOOKS[kind].image" alt="" class="w-4 h-4" />
          <i v-else :class="KIND_LOOKS[kind].icon" />
          {{ KIND_LOOKS[kind].label }}
        </span>
      </template>
      <template #option="{ option }">
        <span class="flex items-center gap-2">
          <img v-if="'image' in option" :src="option.image" alt="" class="w-4 h-4" />
          <i v-else :class="option.icon" />
          {{ option.label }}
        </span>
      </template>
    </Select>
    <Textarea
      v-if="kind === 'svg'"
      :model-value="text"
      rows="3"
      class="flex-1 font-mono text-xs"
      placeholder="<svg ...>"
      @update:model-value="onText"
    />
    <InputText v-else-if="kind === 'url'" :model-value="text" size="small" class="flex-1" placeholder="https://..." @update:model-value="onText" />
    <LucideIconInput
      v-else
      :model-value="text"
      :placeholder="inheritedFrom ? `Inherited from ${inheritedFrom}` : 'Lucide name, e.g. folder-open'"
      @update:model-value="onText"
    />
  </div>
</template>
