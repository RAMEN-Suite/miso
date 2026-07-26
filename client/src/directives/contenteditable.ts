import type { DirectiveBinding, ObjectDirective } from "vue";
import FocusPane from "../components/FocusPane.vue";

/**
 * Directive for handling contenteditable elements.
 *
 * Currently only used for the collection label in the {@link FocusPane}.
 */
export const contenteditable: ObjectDirective<HTMLElement> = {
  mounted(el: HTMLElement, binding: DirectiveBinding): void {
    el.spellcheck = false;
    el.textContent = binding.value ?? "";
  },
  updated(el: HTMLElement, binding: DirectiveBinding): void {
    // Rewriting the text while the element has focus would collapse the caret back to the start, so
    // an incoming value is only applied when the change came from somewhere else
    if (document.activeElement === el) {
      return;
    }

    if (el.textContent !== binding.value) {
      el.textContent = binding.value ?? "";
    }
  },
};
