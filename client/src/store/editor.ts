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

  return {
    initializeEditor,
  };
}
