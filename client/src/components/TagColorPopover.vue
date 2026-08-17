<script setup lang="ts">
import { useTemplateRef } from "vue";
import ColorPicker from "primevue/colorpicker";
import Popover from "primevue/popover";
import { normalizeTagColor, TAG_COLORS } from "../config/tags";

defineExpose({
  toggle,
});

const color = defineModel<string>("color", { required: true });

const popover = useTemplateRef<InstanceType<typeof Popover>>("popover");

/**
 * Shows or hides the palette. Exposed rather than triggered by an own button: the element it hangs
 * off belongs to the caller's layout.
 *
 * @param {Event} event - The event that triggered it, used to anchor the popover.
 * @returns {void} This function does not return any value.
 */
function toggle(event: Event): void {
  popover.value?.toggle(event);
}

/**
 * Checks whether a preset is the current colour, tolerating case and a missing `#`.
 *
 * @param {string} presetColor - The preset to compare against.
 * @returns {boolean} Whether the preset is currently selected.
 */
function isSelected(presetColor: string): boolean {
  return normalizeTagColor(color.value).toLowerCase() === presetColor.toLowerCase();
}

/**
 * Applies a colour. The `ColorPicker` hands back a bare hex string without the leading `#`, which
 * is not a valid CSS colour, so everything is normalized on the way out.
 *
 * @param {string} value - The chosen colour, with or without a leading `#`.
 * @returns {void} This function does not return any value.
 */
function handleSelect(value: string): void {
  color.value = normalizeTagColor(value);
}
</script>

<template>
  <Popover ref="popover" :auto-z-index="false" :pt="{ root: { style: { zIndex: 'var(--z-index-max)' } } }">
    <div class="flex align-items-center gap-2 flex-wrap">
      <button
        v-for="presetColor in TAG_COLORS"
        :key="presetColor"
        type="button"
        class="swatch"
        :class="{ selected: isSelected(presetColor) }"
        :style="{ backgroundColor: presetColor }"
        :title="presetColor"
        :aria-label="`Use colour ${presetColor}`"
        :aria-pressed="isSelected(presetColor)"
        @click="handleSelect(presetColor)"
      ></button>

      <ColorPicker
        :model-value="color"
        append-to="self"
        format="hex"
        title="Choose a custom colour"
        @update:model-value="handleSelect($event as string)"
      />
    </div>
  </Popover>
</template>

<style scoped>
.swatch {
  width: 20px;
  height: 20px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.1s;

  &:hover {
    transform: scale(1.15);
  }

  &.selected {
    border-color: var(--p-text-color);
  }
}
</style>
