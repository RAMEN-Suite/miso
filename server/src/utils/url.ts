/**
 * Whether a value is the name of a JSON file in the config directory (no path, so no traversal).
 *
 * @param {string} fileName - The file name.
 * @returns {boolean} `true` for valid config file names.
 */
export function isValidConfigFile(fileName: string): boolean {
  return !fileName.includes("/") && !fileName.includes("..") && fileName.endsWith(".json");
}

/**
 * Whether a value is an http(s) URL.
 *
 * @param {string} value - The value.
 * @returns {boolean} `true` for http(s) URLs.
 */
export function isValidHttpUrl(value: string): boolean {
  try {
    const url: URL = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
