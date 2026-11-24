import { onScopeDispose, shallowRef, watch, type Ref } from "vue";

/** How long something that was jumped to stays highlighted */
const HIGHLIGHT_MS = 1500;

/**
 * Highlights what a form was opened for (e.g. a finding or a mapping) for a moment. Only the state: the component
 * that shows the highlighted item draws it and scrolls to it. The timer is cleared with the calling component.
 *
 * @param {() => T | undefined} source - What to highlight, e.g. the selection's `focus`; a new value starts again.
 * @returns {Readonly<Ref<T | undefined>>} The highlighted value, `undefined` once the time is up.
 */
export function useTimedHighlight<T>(source: () => T | undefined): Readonly<Ref<T | undefined>> {
  const highlighted = shallowRef<T>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  watch(
    source,
    (value) => {
      if (value === undefined) {
        return;
      }

      clearTimeout(timer);
      highlighted.value = value;
      timer = setTimeout(() => {
        highlighted.value = undefined;
      }, HIGHLIGHT_MS);
    },
    { immediate: true },
  );

  onScopeDispose(() => clearTimeout(timer));

  return highlighted;
}
