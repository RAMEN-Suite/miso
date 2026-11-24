<script setup lang="ts">
import { nextTick, useTemplateRef, watch } from "vue";
import type { ConfigFinding } from "../external";
import { isSameFinding } from "../utils/findingFields";

const props = defineProps<{
  findings: ConfigFinding[];
  /** Shows the path of each finding; inside an element's form, the message alone is enough */
  withPath?: boolean;
  /** Makes the findings clickable */
  selectable?: boolean;
  /** The finding that was jumped to, highlighted for a moment */
  highlighted?: ConfigFinding;
}>();

const emit = defineEmits<{ select: [finding: ConfigFinding] }>();

const list = useTemplateRef<HTMLElement>("list");

// The highlighted finding is scrolled to, if this list has it
watch(
  () => props.highlighted,
  async (finding) => {
    if (finding) {
      await nextTick();
      list.value?.querySelector("[data-highlighted]")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  },
  { immediate: true },
);

/** Classes by severity: normal, and highlighted with a full border like a mapping that was jumped to */
const SEVERITY_CLASSES: Record<ConfigFinding["severity"], { normal: string; highlighted: string }> = {
  problem: {
    normal: "bg-red-50 border-transparent border-l-red-500 text-red-900",
    highlighted: "bg-red-100 border-red-500 text-red-900",
  },
  warning: {
    normal: "bg-amber-50 border-transparent border-l-amber-500 text-amber-900",
    highlighted: "bg-amber-100 border-amber-500 text-amber-900",
  },
};
</script>

<template>
  <ul v-if="findings.length > 0" ref="list" class="flex flex-col gap-1">
    <!-- eslint-disable-next-line vuejs-accessibility/click-events-have-key-events, vuejs-accessibility/no-static-element-interactions -- A mouse shortcut; the elements are reachable by keyboard in the element tree -->
    <li
      v-for="(finding, index) in findings"
      :key="index"
      class="text-sm rounded px-2 py-1 border border-l-4 transition-colors duration-500"
      :class="[
        isSameFinding(finding, highlighted)
          ? SEVERITY_CLASSES[finding.severity].highlighted
          : SEVERITY_CLASSES[finding.severity].normal,
        { 'cursor-pointer hover:brightness-95': selectable },
      ]"
      :data-highlighted="isSameFinding(finding, highlighted) || undefined"
      @click="selectable && emit('select', finding)"
    >
      <span class="font-medium">{{ finding.severity === "problem" ? "Problem" : "Warning" }}:</span>
      <template v-if="withPath && finding.path">
        <code class="text-xs break-all">{{ finding.path }}</code>
        <br />
      </template>
      <span class="whitespace-pre-wrap">{{ finding.message }}</span>
    </li>
  </ul>
</template>
