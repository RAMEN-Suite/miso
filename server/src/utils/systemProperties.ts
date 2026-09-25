/**
 * App-specific node properties that are not part of the RAMEN data model and not
 * declared in the configuration. They are server-owned: the client never authors them and can
 * never overwrite them.
 */

export const CREATED_AT = "_createdAt" as const;
export const UPDATED_AT = "_updatedAt" as const;

/** Names of system properties, acting as source of truth for {@link SystemProperties} type. */
export const SYSTEM_PROPERTIES = [CREATED_AT, UPDATED_AT] as const;

/**
 * The system properties after the conversion from the DB Query Result.
 */
export type SystemProperties = Record<(typeof SYSTEM_PROPERTIES)[number], Date>;

/** Timestamp cypher part. */
const NOW = "datetime({timezone: 'UTC'})" as const;

/**
 * Returns a Cypher `SET` clause body stamping a newly created node. Both timestamps are set.
 *
 * @param {string} nodeAlias - The Cypher alias the node is bound to.
 * @return {string} The clause body, without the leading `SET`.
 */
export function stampCreated(nodeAlias: string): string {
  return `${nodeAlias}.${CREATED_AT} = ${NOW}, ${nodeAlias}.${UPDATED_AT} = ${NOW}`;
}

/**
 * Returns a Cypher expression for a node's creation timestamp, falling back to now when it has none.
 *
 * @param {string} nodeAlias - The Cypher alias the node is bound to.
 * @return {string} The expression, to be aliased in a `WITH` clause.
 */
export function createdAtOrNow(nodeAlias: string): string {
  return `coalesce(${nodeAlias}.${CREATED_AT}, ${NOW})`;
}

/**
 * Returns a Cypher `SET` clause body stamping an updated node.
 *
 * @param {string} nodeAlias - The Cypher alias the node is bound to.
 * @param {string} createdAtVar - Variable holding the creation timestamp captured by {@link createdAtOrNow}.
 * @return {string} The clause body, without the leading `SET`.
 */
export function stampUpdated(nodeAlias: string, createdAtVar: string): string {
  return `${nodeAlias}.${CREATED_AT} = ${createdAtVar}, ${nodeAlias}.${UPDATED_AT} = ${NOW}`;
}

/**
 * Removes all system properties from a JSON object that contains node data.
 *
 * @param {Record<string, any>} data - The property map as it arrived from the client.
 * @return {Record<string, any>} A new map without any system properties.
 */
export function stripSystemProperties(data: Record<string, any>): Record<string, any> {
  const names: readonly string[] = SYSTEM_PROPERTIES;

  return Object.fromEntries(Object.entries(data).filter(([key]) => !names.includes(key)));
}
