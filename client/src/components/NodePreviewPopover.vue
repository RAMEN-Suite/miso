<script setup lang="ts">
import { useTemplateRef } from "vue";
import Popover from "primevue/popover";

const props = withDefaults(
  defineProps<{
    /** Maximum width of the popover. */
    maxWidth?: string;
    /** Maximum height of the content before it starts scrolling. */
    maxHeight?: string;
  }>(),
  {
    maxWidth: "min(25rem, 90vw)",
    maxHeight: "min(36rem, 70vh)",
  },
);

defineExpose({
  toggle,
});

const popover = useTemplateRef<InstanceType<typeof Popover>>("popover");

/**
 * Shows or hides the node popover.
 *
 * @param {Event} event - The event that triggered it, used to anchor the popover.
 * @returns {void} This function does not return any value.
 */
function toggle(event: Event): void {
  popover.value?.toggle(event);
}
</script>

<template>
  <Popover
    ref="popover"
    :pt="{
      root: {
        style: {
          width: 'max-content',
          maxWidth: props.maxWidth,
          zIndex: 'var(--z-index-max)',
        },
      },
      content: {
        class: 'overflow-y-auto overflow-x-hidden',
        style: {
          maxHeight: props.maxHeight,
          scrollbarWidth: 'thin',
          overflowWrap: 'anywhere',
        },
      },
    }"
  >
    <slot />
  </Popover>
</template>
