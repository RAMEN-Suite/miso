import { int } from "neo4j-driver";
import Neo4jDriver from "../database/neo4j.js";
import ValidationError from "../errors/validation.error.js";
import { BaseNodeLabel, ElementResponse, ModelContext, NodeSearchParams, PaginationResult } from "../models/types.js";
import { labelsOfClassifiers } from "../utils/filter.js";
import { getBaseNodeRef } from "../utils/modelHelper.js";
import { BASE_NODE_LABEL_BY_REF } from "../utils/ramen.js";
import { StoredNodeRecord, toElementResponse } from "../utils/storedGraph.js";
import ConfigService from "./config.service.js";

/* eslint-disable @typescript-eslint/no-unsafe-assignment -- db results can not be typed (only with assertion) which is too cumbersome for now */

/** The property the search matches and sorts by, per searchable base node */
const SEARCHED_PROPERTY: Readonly<Record<Exclude<BaseNodeLabel, "Annotation">, "label" | "text">> = {
  Collection: "label",
  Content: "text",
  Entity: "label",
};

export default class SearchService {
  /**
   * Searches the nodes of a type (refinements included) whose label (Contents: text) contains the search string,
   * case-insensitive, sorted by it.
   *
   * @param {NodeSearchParams} options - The node type, search string and offset pagination.
   * @return {Promise<PaginationResult<ElementResponse>>} A page of the matching nodes in the element format, in listing
   *   order.
   * @throws {ValidationError} If the model doesn't know the node type, or it is no Collection, Content or Entity.
   */
  public async searchNodes(options: NodeSearchParams): Promise<PaginationResult<ElementResponse>> {
    const { classifierRef, limit, order, offset, search } = options;
    const context: ModelContext = await ConfigService.getModelContext();
    const baseLabel: BaseNodeLabel | undefined = context.model.getNode(classifierRef)
      ? BASE_NODE_LABEL_BY_REF[getBaseNodeRef(context, classifierRef) ?? ""]
      : undefined;

    if (!baseLabel || baseLabel === "Annotation") {
      throw new ValidationError(`No Collection, Content or Entity type has the ref "${classifierRef}".`);
    }

    const property: "label" | "text" = SEARCHED_PROPERTY[baseLabel];
    const baseQuery: string = `
    MATCH (n:${baseLabel})
    WHERE toLower(n.${property}) CONTAINS toLower($search)
    AND any(label IN labels(n) WHERE label IN $nodeLabels)

    WITH n
    ORDER BY n.${property} ASC
    `;

    const countQuery: string = baseQuery + `RETURN count(n) AS totalRecords`;

    const dataQuery: string =
      baseQuery +
      `
      SKIP $offset
      LIMIT $limit

      RETURN collect({
        nodeLabels: labels(n),
        properties: n {.*}
      }) AS nodes
    `;

    const queryParams = {
      search,
      nodeLabels: labelsOfClassifiers(context, [classifierRef]),
      offset: int(offset),
      limit: int(limit),
    };

    const [countResult, dataResult] = await Promise.all([
      Neo4jDriver.runQuery(countQuery, queryParams),
      Neo4jDriver.runQuery(dataQuery, queryParams),
    ]);

    const totalRecords: number = countResult.records[0]?.get("totalRecords") ?? 0;
    const rawData: StoredNodeRecord[] = dataResult.records[0]?.get("nodes") ?? [];

    return {
      data: toElementResponse(context, rawData),
      pagination: {
        limit,
        order,
        totalRecords,
        offset,
      },
    };
  }
}
