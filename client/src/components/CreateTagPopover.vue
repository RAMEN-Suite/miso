<script setup lang="ts">
import { ComponentPublicInstance, computed, ref, useTemplateRef } from "vue";
import Button from "primevue/button";
import ColorPicker from "primevue/colorpicker";
import InputText from "primevue/inputtext";
import Popover from "primevue/popover";
import { useTagsStore } from "../store/tags";
import { DEFAULT_TAG_COLOR, normalizeTagColor, TAG_COLORS } from "../config/tags";

defineExpose({
  open,
});

const { tags, createTag } = useTagsStore();

const popover = useTemplateRef<InstanceType<typeof Popover>>("popover");
const labelInput = useTemplateRef<ComponentPublicInstance>("label-input");

const label = ref<string>("");
const color = ref<string>(DEFAULT_TAG_COLOR);

const hasDuplicateLabel = computed<boolean>(() => {
  const trimmed: string = label.value.trim().toLowerCase();

  if (trimmed === "") {
    return false;
  }

  return tags.value.some((tag) => tag.label.toLowerCase() === trimmed);
});

const isValid = computed<boolean>(() => label.value.trim().length > 0 && !hasDuplicateLabel.value);

/**
 * Opens a blank form. Editing an existing tag happens in place in the sidebar, so this only ever
 * creates.
 *
 * @param {Event} event - The event that triggered the open, used to anchor the popover.
 * @returns {void} This function does not return any value.
 */
function open(event: Event): void {
  label.value = "";
  color.value = DEFAULT_TAG_COLOR;

  popover.value?.show(event);
}

function close(): void {
  popover.value?.hide();
}

/**
 * Focuses the label input once the popover is on screen, so the form can be filled without
 * reaching for the mouse.
 *
 * @returns {void} This function does not return any value.
 */
/**
 * Checks whether a preset is the current colour, tolerating case and a missing `#`.
 *
 * @param {string} presetColor - The preset to compare against.
 * @returns {boolean} Whether the preset is currently selected.
 */
function isSelectedColor(presetColor: string): boolean {
  return normalizeTagColor(color.value).toLowerCase() === presetColor.toLowerCase();
}

/**
 * Applies a colour. The `ColorPicker` hands back a bare hex string without the leading `#`, which
 * is not a valid CSS colour, so everything is normalized on the way in.
 *
 * @param {string} value - The chosen colour, with or without a leading `#`.
 * @returns {void} This function does not return any value.
 */
function handleSelectColor(value: string): void {
  color.value = normalizeTagColor(value);
}

function handleShow(): void {
  labelInput.value?.$el?.focus();
}

/**
 * Creates the tag. The colour is normalized first: the `ColorPicker` hands back a bare hex string
 * without the leading `#`, which is not a valid CSS colour.
 *
 * @returns {void} This function does not return any value.
 */
function handleSubmit(): void {
  if (!isValid.value) {
    return;
  }

  createTag({
    label: label.value.trim(),
    appearance: { color: normalizeTagColor(color.value) },
  });

  close();
}
</script>

<template>
  <Popover
    ref="popover"
    :auto-z-index="false"
    :pt="{
      root: {
        class: 'w-20rem',
        style: {
          zIndex: 'var(--z-index-max)',
        },
      },
    }"
    @show="handleShow"
  >
    <form class="tag-form flex flex-column gap-3" @submit.prevent="handleSubmit">
      <div class="flex flex-column gap-1">
        <label for="tag-label" class="text-sm font-semibold">Label</label>
        <InputText
          id="tag-label"
          ref="label-input"
          v-model="label"
          size="small"
          spellcheck="false"
          placeholder="e.g. In Review"
          autocomplete="off"
        />
        <small v-if="hasDuplicateLabel" class="duplicate-hint flex align-items-center gap-1">
          <i class="pi pi-exclamation-circle" />
          <span>A tag with this label already exists.</span>
        </small>
      </div>

      <div class="flex flex-column gap-2">
        <span class="text-sm font-semibold">Colour</span>
        <div class="flex align-items-center gap-2 flex-wrap">
          <button
            v-for="presetColor in TAG_COLORS"
            :key="presetColor"
            type="button"
            class="swatch"
            :class="{ selected: isSelectedColor(presetColor) }"
            :style="{ backgroundColor: presetColor }"
            :title="presetColor"
            :aria-label="`Use colour ${presetColor}`"
            :aria-pressed="isSelectedColor(presetColor)"
            @click="handleSelectColor(presetColor)"
          ></button>

          <!-- appendTo="self" keeps the picker's panel inside this popover; teleported to the body
               it would count as an outside click and close the whole form -->
          <ColorPicker
            :model-value="color"
            append-to="self"
            format="hex"
            title="Choose a custom colour"
            @update:model-value="handleSelectColor($event as string)"
          />
        </div>
      </div>

      <div class="flex justify-content-end gap-2">
        <Button type="button" label="Cancel" severity="secondary" size="small" @click="close" />
        <Button type="submit" label="Create" :disabled="!isValid" size="small" />
      </div>
    </form>
  </Popover>
</template>

<style scoped>
.duplicate-hint {
  color: var(--p-orange-600, darkorange);
}

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
