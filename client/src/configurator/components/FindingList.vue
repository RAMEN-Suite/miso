<script setup lang="ts">
import type { ConfigFinding } from "../external";

defineProps<{
  findings: ConfigFinding[];
  /** Shows the path of each finding; inside an element's form, the message alone is enough */
  withPath?: boolean;
  /** Makes the findings clickable */
  selectable?: boolean;
}>();

const emit = defineEmits<{ select: [finding: ConfigFinding] }>();
</script>

<template>
  <ul v-if="findings.length > 0" class="flex flex-col gap-1">
    <!-- eslint-disable-next-line vuejs-accessibility/click-events-have-key-events, vuejs-accessibility/no-static-element-interactions -- A mouse shortcut; the elements are reachable by keyboard in the element tree -->
    <li
      v-for="(finding, index) in findings"
      :key="index"
      class="text-sm rounded px-2 py-1 border-l-4"
      :class="[
        finding.severity === 'problem' ? 'bg-red-50 border-red-500 text-red-900' : 'bg-amber-50 border-amber-500 text-amber-900',
        { 'cursor-pointer hover:brightness-95': selectable },
      ]"
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
