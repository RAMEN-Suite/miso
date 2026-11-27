import { Extension } from "@tiptap/core";

interface AnnotationShortcutsOptions {
  /** Annotation shape ref per shortcut in keymap notation, e.g. `{ "Mod-Shift-e": "<modelId>:<shapeId>" }`. */
  shortcuts: Record<string, string>;
  /** Called with the shape ref of a pressed shortcut, so the host can annotate the selection. */
  onShortcut?: (shapeRef: string) => void;
}

/**
 * Binds the configured annotation shortcuts while the editor has focus. Runs before the other keymaps (higher
 * priority), so a configured shortcut wins over a built-in one like Shift+Enter.
 */
export const AnnotationShortcuts = Extension.create<AnnotationShortcutsOptions>({
  name: "annotationShortcuts",

  priority: 1000,

  addOptions() {
    return {
      shortcuts: {},
      onShortcut: undefined,
    };
  },

  addKeyboardShortcuts() {
    const onShortcut: ((shapeRef: string) => void) | undefined = this.options.onShortcut;

    if (!onShortcut) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(this.options.shortcuts).map(([shortcut, shapeRef]) => [
        shortcut,
        () => {
          onShortcut(shapeRef);

          return true;
        },
      ]),
    );
  },
});
