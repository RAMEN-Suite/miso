import { computed, readonly, ref } from "vue";
import { RedrawModeOptions } from "../models/types";

const newRangeAnchorUuid = ref<string | null>(null);

// This is currently only used for restoring the range after a redraw action is canceled
const lastRangeSnapshot = ref<Range>(null);

const redrawMode = ref<RedrawModeOptions | null>(null);
const isRedrawMode = computed<boolean>(() => redrawMode.value?.direction === "on");

/**
 * Deprecated store for editor state and operations (caret placement, change detection etc.). Currently only kept for
 * keeping redraw options here before moving them to Tiptap.
 */
export function useEditorStore() {
  /**
   * Initializes the editor.
   *
   * Currently does nothing anymore since responsibilities have been given to Tiptap, but might be worth to keep it
   * since this is the app-wide initialization logic.
   *
   * @return {void} No return value.
   */
  // eslint-disable-next-line -- Default pattern, might be used later
  function initializeEditor(): void {}

  /**
   * Creates a snapshot of the current window selection range and clears the selection.
   * Used for creating a snapshot when redraw mode is toggled on to restore it later if the redraw action is canceled.
   *
   * @returns {void} This function does not return any value.
   */
  function createRangeSnapshotAndClear(): void {
    const currentSelection: Selection = window.getSelection();

    lastRangeSnapshot.value = currentSelection?.getRangeAt(0);
    currentSelection?.removeAllRanges();
  }

  function resetEditor(): void {
    toggleRedrawMode({ direction: "off", cause: "success" });
  }

  /**
   * Restores the selection range snapshot that was created when redraw mode was toggled on.
   *
   * Called when the redraw mode is toggled off and the selection range should be restored to its original state.
   * The function waits for the next animation frame to ensure that the selection range is restored after the `placeCaret` function
   * is called by the editor's `onUpdated` hook.
   *
   * @returns {void} This function does not return any value.
   */
  function restoreRangeSnapshot(): void {
    setTimeout(() => {
      const currentSelection: Selection | null = window.getSelection();

      currentSelection?.removeAllRanges();
      currentSelection?.addRange(lastRangeSnapshot.value);
    }, 0);
  }

  /**
   * Toggles the redraw mode on or off.
   *
   * If the direction is 'on', it takes a snapshot of the current selection range and clears it.
   * If the direction is 'off', it restores the last range snapshot if the mode was actively canceled or sets the snapshot
   * to `null` otherwise (i. e. when the editor component was unmounted after page leave).
   *
   * @param {RedrawModeOptions} options - An object containing the direction of the redraw mode and the cause of the mode change.
   */
  function toggleRedrawMode(options: RedrawModeOptions): void {
    if (options?.direction === "on") {
      createRangeSnapshotAndClear();

      redrawMode.value = options;
    } else {
      redrawMode.value = null;

      if (options?.cause === "cancel") {
        restoreRangeSnapshot();
      } else {
        lastRangeSnapshot.value = null;
      }
    }
  }

  return {
    isRedrawMode,
    redrawMode: readonly(redrawMode),
    initializeEditor,
    resetEditor,
    toggleRedrawMode,
  };
}
