<script setup lang="ts">
import { computed } from "vue";
import { IconSpec, IconSpecInput } from "../models/types";
import { normalizeIconSpec } from "../config/icons";

type IconSpecProps = {
  /** A canonical spec, or a bare Lucide name as shorthand. */
  spec?: IconSpecInput;
  /** Edge length in px. Matches the 1rem box the PrimeIcons glyphs occupied. */
  size?: number;
  /** Accessible name. When omitted the icon is treated as decorative and hidden from screen readers. */
  label?: string;
};

const props = withDefaults(defineProps<IconSpecProps>(), {
  spec: undefined,
  size: 16,
  label: undefined,
});

const normalized = computed<IconSpec | null>(() => normalizeIconSpec(props.spec));

const lucideClass = computed<string>(() => resolveLucideIconClass(normalized.value));

const a11yAttrs = computed<Record<string, string>>(() => {
  if (props.label) {
    return { role: "img", "aria-label": props.label };
  }

  return { "aria-hidden": "true" };
});

function resolveLucideIconClass(spec: IconSpec | null): string {
  if (!spec || spec.kind !== "lucide") {
    return "";
  }

  return "icon-" + spec.name;
}
</script>

<template>
  <img
    v-if="normalized?.kind === 'url'"
    class="app-icon"
    :src="normalized.url"
    :alt="props.label ?? ''"
    :width="props.size"
    :height="props.size"
  />
  <!-- eslint-disable-next-line vue/no-v-html -- Icon specs come from project configuration, which is supplied by whoever deploys the app. Rendering it unsanitized is a deliberate decision, not an oversight. -->
  <span
    v-else-if="normalized?.kind === 'svg'"
    class="app-icon app-icon--raw"
    :style="{ width: `${props.size}px`, height: `${props.size}px` }"
    v-bind="a11yAttrs"
    v-html="normalized.svg"
  />
  <!--
    The `v-else` is load-bearing: without it this template is a fragment whenever no branch matches,
    and Vue then silently stops applying `class`/`style` passed in by the parent.
  -->
  <i v-else class="app-icon" :class="[lucideClass]" :style="{ fontSize: `${props.size}px` }" v-bind="a11yAttrs" />
</template>

<style scoped>
.app-icon {
  display: inline-block;
  vertical-align: middle;
  line-height: var(--icon-size);
  flex: none;
}

.app-icon--raw :deep(svg) {
  width: 100%;
  height: 100%;
}
</style>
