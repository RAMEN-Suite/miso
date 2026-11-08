/**
 * Checks if a given file name is a valid configuration file.
 *
 * Used to validate the config URL when it is not an HTTP URL, to prevent path traversal and only allow JSON files in
 * the config directory.
 *
 * @param {string} fileName The file name (maybe including a path) to check.
 * @return {boolean} True if the file name is a valid configuration file, false otherwise.
 */
export function isValidConfigFile(fileName: string): boolean {
  // No path traversal should be allowed, only the file name
  if (fileName.includes("/") || fileName.includes("..")) {
    return false;
  }

  // Files in the config directory are JSON, so only these are allowed
  if (!fileName.endsWith(".json")) {
    return false;
  }

  return true;
}

/**
 * Checks if a given string is a valid HTTP(S) URL.
 *
 * @param {string} string The string to check.
 * @return {boolean} True if the string is a valid HTTP URL, false otherwise.
 */
export function isValidHttpUrl(string: string): boolean {
  try {
    const newUrl: URL = new URL(string);

    return newUrl.protocol === "http:" || newUrl.protocol === "https:";
  } catch {
    return false;
  }
}
