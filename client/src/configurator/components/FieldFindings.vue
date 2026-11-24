<script setup lang="ts">
import { computed } from "vue";
import type { ConfigFinding } from "../external";
import { fieldsOf, type FindingField } from "../utils/findingFields";
import FindingList from "./FindingList.vue";

/** The findings of one control of a form, shown below it */
const props = defineProps<{
  /** The findings of the element */
  findings: ConfigFinding[];
  field: FindingField;
  /** The finding that was jumped to, highlighted for a moment */
  highlighted?: ConfigFinding;
}>();

const fieldFindings = computed<ConfigFinding[]>(() =>
  props.findings.filter((finding) => fieldsOf(finding).includes(props.field)),
);
</script>

<template>
  <FindingList :findings="fieldFindings" :highlighted="highlighted" />
</template>
