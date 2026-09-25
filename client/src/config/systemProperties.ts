/**
 * App-specific node properties that are not part of the RAMEN data model and not
 * declared in the configuration. They are server-owned: the client only ever displays them,
 * never edits them and never sends them back.
 */

export const CREATED_AT = "_createdAt" as const;
export const UPDATED_AT = "_updatedAt" as const;

/** Names of system properties, acting as source of truth for {@link SystemProperties} type. */
export const SYSTEM_PROPERTIES = [CREATED_AT, UPDATED_AT] as const;

/**
 * The system properties as the client receives them: ISO 8601 strings, since JSON serialises the server's
 * temporal values on the way over.
 */
export type SystemProperties = Record<(typeof SYSTEM_PROPERTIES)[number], string>;

/**
 * Whether a property name is defined as a system property, i.e. not part of the RAMEN model.
 *
 * @param {string} name - The property name to check.
 * @returns {boolean} True if the name belongs to the system properties.
 */
export function isSystemProperty(name: string): boolean {
  const names: readonly string[] = SYSTEM_PROPERTIES;

  return names.includes(name);
}
