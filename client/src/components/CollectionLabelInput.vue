<script setup lang="ts">
import { nextTick } from "vue";

withDefaults(
  defineProps<{
    placeholder?: string;
    /** Shows the dashed border only on hover or focus. */
    subtle?: boolean;
    /** Makes the label read-only and unfocusable temporarily, e.g. while a request is pending */
    disabled?: boolean;
  }>(),
  {
    placeholder: "No label provided",
    subtle: false,
    disabled: false,
  },
);

const label = defineModel<string>("label", { required: true });

const emit = defineEmits<{
  /** Editing finished (blur or Enter). */
  commit: [];
  /** Saved value requested back (Escape). The parent resets `label`. */
  revert: [];
}>();

/**
 * Finishes editing on Enter, which commits via blur.
 *
 * @param {KeyboardEvent} event - The keydown event.
 * @returns {void} This function does not return any value.
 */
function handleEnter(event: KeyboardEvent): void {
  event.preventDefault();
  (event.target as HTMLSpanElement).blur();
}

/**
 * Restores the saved label on Escape. The DOM is synced manually, since the directive skips focused elements.
 *
 * @param {KeyboardEvent} event - The keydown event.
 * @returns {Promise<void>} Resolves when the label was reverted and the element blurred.
 */
async function handleEscape(event: KeyboardEvent): Promise<void> {
  const el: HTMLSpanElement = event.target as HTMLSpanElement;

  emit("revert");
  await nextTick();

  el.textContent = label.value;
  el.blur();
}

/**
 * Handles the input event on the contenteditable span.
 * Removes leftover `<br>` tag which would make the `:empty` selector fail.
 *
 * @param {Event} event - The input event from the contenteditable span.
 * @returns {void} This function does not return any value.
 */
function handleInput(event: Event): void {
  const el: HTMLSpanElement = event.target as HTMLSpanElement;
  const trimmed: string = el.innerText.trim();

  label.value = trimmed;

  if (trimmed === "") {
    el.innerHTML = "";
  }
}
</script>

<template>
  <!-- eslint-disable-next-line vuejs-accessibility/interactive-supports-focus -- Eslint only recognizes literal tabindex values, the dynamic one is 0 when enabled -->
  <span
    v-contenteditable="label"
    class="label-text"
    :class="{ 'is-subtle': subtle, 'is-disabled': disabled }"
    :contenteditable="disabled ? 'false' : 'true'"
    role="textbox"
    :tabindex="disabled ? -1 : 0"
    aria-multiline="false"
    :aria-disabled="disabled"
    :data-placeholder="placeholder"
    @input="handleInput"
    @blur="emit('commit')"
    @keydown.enter="handleEnter"
    @keydown.escape="handleEscape"
  ></span>
</template>

<style scoped>
.label-text {
  --dark-green: var(--p-button-primary-background);
  --middle-green: var(--p-button-primary-hover-background);
  --light-green: var(--p-button-text-success-active-background);
  --label-field-radius: var(--p-inputtext-border-radius);
  --label-placeholder-color: var(--p-inputtext-placeholder-color);

  display: inline-block;
  max-width: 100%;
  overflow-wrap: anywhere;
  font-weight: bold;
  padding: 0.25rem 0.5rem;
  border: 1px solid transparent;
  border-radius: var(--label-field-radius);
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}

.label-text[contenteditable="true"] {
  border-style: dashed;
  border-color: var(--dark-green);
  cursor: text;
}

.label-text[contenteditable="true"]:hover {
  border-color: var(--middle-green);
}

.label-text.is-disabled {
  border-style: dashed;
  border-color: var(--dark-green);
  opacity: var(--p-disabled-opacity, 0.6);
  cursor: default;
}

.label-text.is-subtle:not(:hover, :focus) {
  border-color: transparent;
}

.label-text:focus {
  border-style: solid;
  border-color: var(--middle-green);
  outline: none;
  box-shadow: 0 0 0 2px var(--light-green);
}

.label-text:empty::before {
  content: attr(data-placeholder);
  color: var(--label-placeholder-color);
  font-style: italic;
  font-weight: normal;
}
</style>
