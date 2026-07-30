import type { DirectiveBinding, ObjectDirective } from "vue";
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Used in the function documentation
import CollectionEditPane from "../components/CollectionEditPane.vue";

/**
 * Directive for a contenteditable element whose text is bound to reactive state (e.g. via an
 * `@input` handler writing back into a ref). Since the element has no text content in the template, nothing else keeps its DOM in sync with the
 * bound value - `mounted`/`updated` do that manually here.
 *
 * Flow for a local edit:
 * 1. The browser updates the DOM natively as the user types.
 * 2. The `input` event handler writes the new text into reactive state.
 * 3. That state change re-renders the component, and `updated` below runs - but since the DOM
 *    was already updated natively in step 1, it must not blindly overwrite it (see below). This prevents
 *    the caret to jump to the start.
 *
 * Currently only used for the collection label in {@link CollectionEditPane}.
 */
export const contenteditable: ObjectDirective<HTMLElement> = {
  mounted(el: HTMLElement, binding: DirectiveBinding): void {
    el.spellcheck = false;
    el.textContent = binding.value ?? "";
  },
  updated(el: HTMLElement, binding: DirectiveBinding): void {
    // If element is active, the edit comes directly from the user typing -> Nothing more needed
    if (document.activeElement === el) {
      return;
    }

    // If any mismatch between state and DOM happened, update DOM (state is source of truth)
    if (el.textContent !== binding.value) {
      el.textContent = binding.value ?? "";
    }
  },
};
