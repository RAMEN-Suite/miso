import { QueryResult } from "neo4j-driver";
import Neo4jDriver from "../database/neo4j.js";
import NotFoundError from "../errors/notFound.error.js";
import { ElementResponse, ModelContext } from "../models/types.js";
import { StoredNodeRecord, toElementResponse } from "../utils/storedGraph.js";
import ConfigService from "./config.service.js";

/* eslint-disable @typescript-eslint/no-unsafe-assignment -- db results can not be typed (only with assertion) which is too cumbersome for now */

export default class ContentService {
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
        properties: t {.*}
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
}
