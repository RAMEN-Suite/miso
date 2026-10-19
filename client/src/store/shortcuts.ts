import { ref } from "vue";

const shortcutMap = ref<Map<string, () => void>>(new Map());
/**
 * Store for shortcuts for annotation buttons. In contrast to other stores, this store is not initialized during mount of the Editor
 * component. Instead, each component that has a shortcut (currently only Annotation buttons) use the `registerShortcut` function
 * to map a shortcut with the corresponding action. Also, the store is not reset on unmount since the shortcuts map will be updated
 * on the next mount anyway.
 */
export function useShortcutsStore() {
  /**
   * Registers a shortcut with a corresponding action (e.g. annotating text). Done within the component that has the shortcut.
   *
   * @param {string} shortcut The shortcut in keymap notation, e.g. `Mod-Shift-a`. See {@linkcode parseShortcut}.
   * @param {function} action The action to execute when the shortcut is pressed.
   * @return {void} This function does not return any value.
   */
  function registerShortcut(shortcut: string, action: () => void): void {
    shortcutMap.value.set(parseShortcut(shortcut), action);
  }

  /**
   * Sorts and joins the given array of strings into a single string, with '+' in between each element.
   * This is used to normalize the shortcut keys and compare them to pressed key combination later.
   *
   * @param {string[]} keys The array of strings to sort.
   * @returns {string} The normalized string.
   */
  function normalizeKeys(keys: string[]): string {
    return keys
      .map((k) => k.toLowerCase())
      .sort()
      .join("+");
  }

  /**
   * Parses a shortcut in keymap notation (e.g. `Mod-Shift-e`) into the normalized key combination that is compared
   * against pressed keys.
   *
   * @param {string} shortcut The shortcut in keymap notation.
   * @returns {string} The normalized key combination, e.g. `ctrl+e+shift`.
   */
  function parseShortcut(shortcut: string): string {
    const isMac: boolean = /Mac|iPhone|iPad/.test(navigator.userAgent);

    // Split on "-" except for a trailing one, so that "Mod--" resolves to the "-" key
    const parts: string[] = shortcut.split(/-(?!$)/);

    const keys: string[] = parts.map((part: string) => {
      const lower: string = part.toLowerCase();

      if (lower === "mod") {
        return isMac ? "meta" : "ctrl";
      }

      if (lower === "control") {
        return "ctrl";
      }

      if (lower === "cmd" || lower === "command") {
        return "meta";
      }

      if (lower === "option") {
        return "alt";
      }

      return lower;
    });

    return normalizeKeys(keys);
  }

  return { shortcutMap, normalizeKeys, parseShortcut, registerShortcut };
}
