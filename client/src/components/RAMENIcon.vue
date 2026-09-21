<script setup lang="ts">
import { computed } from "vue";
import { IconSpec, IconSpecInput } from "../models/types";
import { normalizeIconSpec } from "../config/icons";
import { LUCIDE_ICON_PREFIX } from "../config/constants";

type IconSpecProps = {
  spec?: IconSpecInput;
  size?: number;
};

const props = withDefaults(defineProps<IconSpecProps>(), {
  spec: undefined,
  size: 16,
});

const normalized = computed<IconSpec | null>(() => normalizeIconSpec(props.spec));

const lucideClass = computed<string>(() => resolveLucideIconClass(normalized.value));

function resolveLucideIconClass(spec: IconSpec | null): string {
  if (!spec || spec.kind !== "lucide") {
    return "";
  }

  return LUCIDE_ICON_PREFIX + spec.name;
}
</script>

<template>
  <img v-if="normalized?.kind === 'url'" class="app-icon" :src="normalized.url" alt="" :width="props.size" :height="props.size" />
  <!-- eslint-disable-next-line vue/no-v-html -- Icon specs come from project configuration, which is supplied by whoever deploys the app. Rendering it unsanitized is a deliberate decision, not an oversight. -->
  <span
    v-else-if="normalized?.kind === 'svg'"
    class="app-icon app-icon--raw"
    :style="{ width: `${props.size}px`, height: `${props.size}px` }"
    v-html="normalized.svg"
  />
  <!--
    The `v-else` is load-bearing: without it this template is a fragment whenever no branch matches,
    and Vue then silently stops applying `class`/`style` passed in by the parent.
  -->
  <i v-else class="app-icon" :class="[lucideClass]" :style="{ fontSize: `${props.size}px` }" />
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
