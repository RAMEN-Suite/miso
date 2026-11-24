<script setup lang="ts">
import { useTemplateRef, watchEffect } from "vue";
import { useElementSize } from "@vueuse/core";
import { FORM_HEADER_HEIGHT_VAR } from "../utils/formLayout";

const header = useTemplateRef<HTMLElement>("header");
const { height } = useElementSize(header, undefined, { box: "border-box" });

// The form's section headings stick right below this heading
watchEffect(() => {
  header.value?.parentElement?.style.setProperty(FORM_HEADER_HEIGHT_VAR, `${height.value}px`);
});
</script>

<template>
  <!--
    The heading of a form, sticky at the top of the form column. It reaches over the column's padding (p-6), so the
    content scrolling below it doesn't show through above it.
  -->
  <header ref="header" class="sticky -top-6 z-20 -mx-6 -mt-6 px-6 pt-6 pb-3 bg-white border-b border-slate-200">
    <slot />
  </header>
</template>
