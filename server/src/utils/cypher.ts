/**
 * Maps a URL sort directive used for sorting collections to a Cypher statement. This is currently needed since
 * the sorting can apply to a Collection's property (label etc.) or to a count of related nodes (texts, annotations, collections etc.)
 *
 * @param {string} sortField - The sort field to be mapped.
 * @return {string} The corresponding Cypher statement.
 */
export function collectionSortField(sortField: string): string {
  if (sortField === "collections") {
    return "collectionCount";
  } else if (sortField === "texts") {
    return "textCount";
  } else if (sortField === "annotations") {
    return "annotationCount";
  } else {
    return "c." + sortField;
  }
}

/**
 * Generates a Cypher query to fetch the `PART_OF` ancestry of a `Content` or `Collection`node.
 *
 * TODO: Deprecated, remove
 *
 * @param {string} nodeAlias - The alias of the node to fetch the ancestry for, e.g. `c` or `t`.
 * @return {string} The Cypher query as a string.
 */
export function ancestryPaths(nodeAlias: string): string {
  // TODO: maxLevel 50 should be enough, but change maybe?
  // TODO: What if circular matches happen? uniqueness should filter that
  // TODO: Makes aktually no sense to do this as snippet, create own method for it (network service)?
  return `
  CALL apoc.path.expandConfig(${nodeAlias}, {
      relationshipFilter: 'PART_OF>',
      labelFilter: 'Collection',
      maxLevel: 50,
      uniqueness: 'NODE_PATH'
  }) YIELD path

  WITH path, last(nodes(path)) AS topNode

  // Keep only "longest paths" (which have Collections)
  WHERE
      NOT (topNode)-[:PART_OF]->() AND
      NOT ()-[:REFERS_TO]->(topNode)

  WITH reverse(tail(nodes(path))) as pathNodes

  RETURN collect([
      n IN pathNodes | {
          node: {
              nodeLabels: labels(n), 
              data: n {.*}
          },
          connectedNodes: []
      }
  ]) as paths
  `;
}

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
