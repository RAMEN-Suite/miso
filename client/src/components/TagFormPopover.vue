<script setup lang="ts">
import { ComponentPublicInstance, computed, DeepReadonly, ref, useTemplateRef } from "vue";
import Button from "primevue/button";
import ColorPicker from "primevue/colorpicker";
import InputText from "primevue/inputtext";
import Popover from "primevue/popover";
import { useTags } from "../composables/useTags";
import { Tag } from "../models/types";
import { DEFAULT_TAG_COLOR, normalizeTagColor, TAG_COLORS } from "../config/tags";

defineExpose({
  open,
});

const { tags, createTag, updateTag } = useTags();

const popover = useTemplateRef<InstanceType<typeof Popover>>("popover");
const labelInput = useTemplateRef<ComponentPublicInstance>("label-input");

const editedTagUuid = ref<string | null>(null);
const label = ref<string>("");
const color = ref<string>(DEFAULT_TAG_COLOR);
// The form no longer offers an icon, but `appearance.icon` is still part of the model: carry an
// existing one through an edit rather than silently dropping it
const icon = ref<string | undefined>(undefined);

const isEditing = computed<boolean>(() => editedTagUuid.value !== null);
const hasDuplicateLabel = computed<boolean>(() => {
  const trimmed: string = label.value.trim().toLowerCase();

  if (trimmed === "") {
    return false;
  }

  return tags.value.some((tag) => tag.uuid !== editedTagUuid.value && tag.label.toLowerCase() === trimmed);
});

const isValid = computed<boolean>(() => label.value.trim().length > 0 && !hasDuplicateLabel.value);

/**
 * Opens the form, either blank (create) or prefilled from an existing tag (edit).
 *
 * Exposed to and called by the sidebar, which owns a single instance of this component for both
 * the "new tag" button and the per-tag edit buttons.
 *
 * @param {Event} event - The event that triggered the open, used to anchor the popover.
 * @param {DeepReadonly<Tag>} [tag] - The tag to edit. Omitted when creating a new one.
 * @returns {void} This function does not return any value.
 */
function open(event: Event, tag?: DeepReadonly<Tag>): void {
  editedTagUuid.value = tag?.uuid ?? null;
  label.value = tag?.label ?? "";
  color.value = normalizeTagColor(tag?.appearance?.color);
  icon.value = tag?.appearance?.icon;

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
function handleShow(): void {
  labelInput.value?.$el?.focus();
}

function handleSelectColor(value: string): void {
  color.value = value;
}

/**
 * Persists the form. The colour is normalized first: the `ColorPicker` hands back a bare hex
 * string without the leading `#`, which is not a valid CSS colour.
 *
 * @returns {void} This function does not return any value.
 */
function handleSubmit(): void {
  if (!isValid.value) {
    return;
  }

  const appearance: Tag["appearance"] = {
    ...(icon.value && { icon: icon.value }),
    color: normalizeTagColor(color.value),
  };

  if (editedTagUuid.value) {
    updateTag({ tagUuid: editedTagUuid.value, label: label.value.trim(), appearance });
  } else {
    createTag({ label: label.value.trim(), appearance });
  }

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
            :class="{ selected: color.toLowerCase() === presetColor.toLowerCase() }"
            :style="{ backgroundColor: presetColor }"
            :title="presetColor"
            :aria-label="`Use colour ${presetColor}`"
            :aria-pressed="color.toLowerCase() === presetColor.toLowerCase()"
            @click="handleSelectColor(presetColor)"
          />

          <ColorPicker v-model="color" append-to="self" format="hex" title="Choose a custom colour" />
        </div>
      </div>

      <div class="flex justify-content-end gap-2">
        <Button type="submit" :label="isEditing ? 'Update' : 'Create'" :disabled="!isValid" size="small" />
        <Button type="button" label="Cancel" severity="secondary" size="small" @click="close" />
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
