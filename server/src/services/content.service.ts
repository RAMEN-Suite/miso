import { int, QueryResult } from "neo4j-driver";
import Neo4jDriver from "../database/neo4j.js";
import NotFoundError from "../errors/notFound.error.js";
import {
  ElementGraph,
  ElementResponse,
  ModelContext,
  NodeSearchParams,
  NodeUpdateObject,
  PaginationResult,
} from "../models/types.js";
import { StoredNodeRecord, toElementResponse } from "../utils/storedGraph.js";
import { toNodeChanges } from "../utils/nodeUpdate.js";
import ConfigService from "./config.service.js";
import WriteValidationService from "./writeValidation.service.js";

/* eslint-disable @typescript-eslint/no-unsafe-assignment -- db results can not be typed (only with assertion) which is too cumbersome for now */

export default class ContentService {
  /**
   * Retrieves a paginated list of Text nodes whose `text` property contains the search string.
   *
   * @param {Required<NodeSearchParams>} options - Pagination and filter options (search, nodeLabels, order, limit, offset).
   * @return {Promise<PaginationResult<ElementResponse>>} The page, nodes in listing order.
   */
  public async search(options: Required<NodeSearchParams>): Promise<PaginationResult<ElementResponse>> {
    const { nodeLabels, limit, order, offset, search } = options;

    const baseQuery: string = `
    MATCH (n:Content)
    WHERE toLower(n.text) CONTAINS toLower($search)
    AND (size($nodeLabels) = 0 OR size(apoc.coll.intersection($nodeLabels, labels(n))) > 0)

    WITH n
    ORDER BY n.text ASC
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
      }) as texts
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

    const rawData: StoredNodeRecord[] = dataResult.records[0]?.get("texts") ?? [];

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

  /**
   * Retrieves data of a specified Content node.
   *
   * @param {string} uuid - The UUID of the Content node to retrieve.
   * @throws {NotFoundError} If the Content with the specified UUID is not found.
   * @return {Promise<ElementResponse>} The Content as the only node.
   */
  public async getContent(uuid: string): Promise<ElementResponse> {
    const query: string = `
    MATCH (t:Content {uuid: $uuid})

    RETURN {
        nodeLabels: labels(t),
        data: t {.*}
    } AS text
    `;

    const [result, context]: [QueryResult, ModelContext] = await Promise.all([
      Neo4jDriver.runQuery(query, { uuid }),
      ConfigService.getModelContext(),
    ]);
    const rawText: StoredNodeRecord | undefined = result.records[0]?.get("text");

    if (!rawText) {
      throw new NotFoundError(`Text with UUID ${uuid} not found`);
    }

    return toElementResponse(context, [rawText]);
  }

  /**
   * Updates a Content and its annotations, validated with the model in the same transaction.
   *
   * @param {string} uuid - The UUID of the Content.
   * @param {ElementGraph} payload - The changed Content and annotations, and their relations.
   * @throws {NotFoundError} If the Content doesn't exist after the update.
   * @throws {ValidationError} If the payload is malformed, or the write doesn't match the model in `enforce` mode.
   * @return {Promise<ElementResponse>} The updated Content as the only node, with the findings of the validation as
   * diagnostics.
   */
  public async updateText(uuid: string, payload: ElementGraph): Promise<ElementResponse> {
    const context: ModelContext = await ConfigService.getModelContext();
    const changes: NodeUpdateObject = toNodeChanges(context, payload);
    const { node, diagnostics } = await new WriteValidationService().write(context, changes, uuid);

    return { ...toElementResponse(context, [node]), diagnostics };
  }
}
