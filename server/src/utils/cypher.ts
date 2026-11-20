/**
 * Returns the Cypher operator for sorting in ascending or descending order.
 *
 * @param {String} direction - The direction of the sort. Likely to be 'asc', 'desc', 'ASC', 'DESC', but accepts any string.
 * @returns {'<'|'>'} The Cypher operator for sorting in ascending or descending order.
 */
export function orderDirection(direction: string): "<" | ">" {
  if (direction === "desc" || direction === "DESC") {
    return "<";
  } else {
    // This will catch all other cases without making problems since ascending is the default
    return ">";
  }
}
