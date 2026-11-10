import { int } from "neo4j-driver";
import Neo4jDriver from "../database/neo4j.js";
import { ElementResponse, NodeSearchParams, PaginationResult } from "../models/types.js";
import { StoredNodeRecord, toElementResponse } from "../utils/storedGraph.js";
import ConfigService from "./config.service.js";

/* eslint-disable @typescript-eslint/no-unsafe-assignment -- db results can not be typed (only with assertion) which is too cumbersome for now */

export default class EntityService {
  /**
   * Retrieves a paginated list of Entity nodes whose `label` property contains the search string.
   *
   * @param {Required<NodeSearchParams>} options - Pagination and filter options (search, nodeLabels, order, limit, offset).
   * @return {Promise<PaginationResult<ElementResponse>>} The page, nodes in listing order.
   */
  public async search(options: Required<NodeSearchParams>): Promise<PaginationResult<ElementResponse>> {
    const { nodeLabels, limit, order, offset, search } = options;

    const baseQuery: string = `
    MATCH (n:Entity)
    WHERE toLower(n.label) CONTAINS toLower($search)
    AND (size($nodeLabels) = 0 OR size(apoc.coll.intersection($nodeLabels, labels(n))) > 0)

    WITH n
    ORDER BY n.label ASC
    `;

    const countQuery: string = baseQuery + `RETURN count(n) AS totalRecords`;

    const dataQuery: string =
      baseQuery +
      `
      SKIP $offset
      LIMIT $limit

      RETURN collect({
        nodeLabels: labels(n),
        data: n {.*}
      }) as entities
    `;

    const queryParams = {
      order,
      search,
      nodeLabels,
      offset: int(offset),
      limit: int(limit),
    };

    const [countResult, dataResult, context] = await Promise.all([
      Neo4jDriver.runQuery(countQuery, queryParams),
      Neo4jDriver.runQuery(dataQuery, queryParams),
      ConfigService.getModelContext(),
    ]);

    const totalRecords: number = countResult.records[0]?.get("totalRecords") ?? 0;

    const rawData: StoredNodeRecord[] = dataResult.records[0]?.get("entities") ?? [];

    return {
      data: toElementResponse(context, rawData),
      pagination: {
        limit,
        order,
        search,
        totalRecords,
        offset,
      },
    };
  }
}
