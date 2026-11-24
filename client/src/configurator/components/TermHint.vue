<script setup lang="ts">
import { computed, useTemplateRef } from "vue";
import Button from "primevue/button";
import Popover from "primevue/popover";
import { explain, type Term } from "../utils/glossary";

const props = defineProps<{ term: Term }>();

const popover = useTemplateRef<InstanceType<typeof Popover>>("popover");

const text = computed<string>(() => explain(props.term));
</script>

<template>
  <Button
    icon="icon-circle-help"
    severity="secondary"
    text
    rounded
    size="small"
    class="inline-flex! w-5! h-5! p-0! text-xs! shrink-0 -my-1 align-middle leading-none"
    aria-label="What does this mean?"
    title="What does this mean?"
    @click.stop="popover?.toggle($event)"
  />
  <Popover ref="popover">
    <p class="max-w-xs text-sm">{{ text }}</p>
  </Popover>
</template>
