import { int, QueryResult } from "neo4j-driver";
import Neo4jDriver from "../database/neo4j.js";
import ConfigService from "./config.service.js";
import { toNeo4jTypes } from "../utils/helper.js";
import { StoredNodeRecord, toElementResponse } from "../utils/storedGraph.js";
import NotFoundError from "../errors/notFound.error.js";
import {
  PaginationResult,
  NodeSearchParams,
  NodeUpdateObject,
  ModelAttribute,
  ModelContext,
  ElementGraph,
  ElementResponse,
} from "../models/types.js";
import { toNodeChanges } from "../utils/nodeUpdate.js";
import WriteValidationService from "./writeValidation.service.js";
import { getCollectionAttributes, isEditable, validateValue } from "../utils/modelHelper.js";
import ValidationError from "../errors/validation.error.js";

/* eslint-disable @typescript-eslint/no-unsafe-assignment -- db results can not be typed (only with assertion) which is too cumbersome for now */

export default class CollectionService {
  /**
   * Retrieves data of a specified collection node.
   *
   * @param {string} uuid - The UUID of the collection node to retrieve.
   * @throws {NotFoundError} If the collection with the specified UUID is not found.
   * @return {Promise<ElementResponse>} The collection as the only node.
   */
  public async getCollection(uuid: string): Promise<ElementResponse> {
    const query: string = `
    MATCH (c:Collection {uuid: $uuid})

    RETURN {
        nodeLabels: labels(c),
        data: c {.*}
    } AS collection
    `;

    const [result, context]: [QueryResult, ModelContext] = await Promise.all([
      Neo4jDriver.runQuery(query, { uuid }),
      ConfigService.getModelContext(),
    ]);
    const rawCollection: StoredNodeRecord | undefined = result.records[0]?.get("collection");

    if (!rawCollection) {
      throw new NotFoundError(`Collection with UUID ${uuid} not found`);
    }

    return toElementResponse(context, [rawCollection]);
  }

  /**
   * Retrieves a page of Collections whose `label` contains the search string.
   *
   * @param {Required<NodeSearchParams>} options - Pagination and filter options (search, nodeLabels, order, limit, offset).
   * @return {Promise<PaginationResult<ElementResponse>>} The page, nodes in listing order.
   */
  public async search(options: Required<NodeSearchParams>): Promise<PaginationResult<ElementResponse>> {
    const { nodeLabels, limit, order, offset, search } = options;

    const baseQuery: string = `
    MATCH (n:Collection)
    WHERE toLower(n.label) CONTAINS toLower($search)
    AND (size($nodeLabels) = 0 OR size(apoc.coll.intersection($nodeLabels, labels(n))) > 0)

    WITH n 
    ORDER BY n.label ASC 
    `;

    // Count query: Get the total number of records matching the filters
    const countQuery: string = baseQuery + `RETURN count(n) AS totalRecords`;

    const dataQuery: string =
      baseQuery +
      `
      SKIP $offset
      LIMIT $limit

      RETURN collect({
        nodeLabels: labels(n),
        data: n {.*}
      }) as collections
      
    `;

    const [countResult, dataResult, context] = await Promise.all([
      Neo4jDriver.runQuery(countQuery, {
        order,
        search,
        nodeLabels,
        offset: int(offset),
        limit: int(limit),
      }),
      Neo4jDriver.runQuery(dataQuery, {
        order,
        search,
        nodeLabels,
        offset: int(offset),
        limit: int(limit),
      }),
      ConfigService.getModelContext(),
    ]);

    const totalRecords: number = countResult.records[0]?.get("totalRecords") ?? 0;

    const rawData: StoredNodeRecord[] = dataResult.records[0]?.get("collections") ?? [];

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
   * Updates a Collection subgraph from a write payload, validated with the model in the same transaction.
   *
   * @param uuid - UUID of the Collection node to update.
   * @param payload - The changed nodes (the Collection, its annotations etc.) and relations.
   * @throws {NotFoundError} If no Collection node with the given UUID exists after the update.
   * @throws {ValidationError} If the write doesn't match the model, in `enforce` mode.
   * @returns The updated Collection as the only node, with the findings of the validation as diagnostics.
   */
  public async updateCollection(uuid: string, payload: ElementGraph): Promise<ElementResponse> {
    const context: ModelContext = await ConfigService.getModelContext();
    const changes: NodeUpdateObject = toNodeChanges(context, payload);
    const { node, diagnostics } = await new WriteValidationService().write(context, changes, uuid);

    return { ...toElementResponse(context, [node]), diagnostics };
  }

  /**
   * Updates only the given properties of a Collection node (JSON Merge Patch semantics: `null` removes a property).
   * The properties are validated with RAMEN core against the attributes of the Collection's stored type, read in the
   * same transaction as the write.
   *
   * @param {string} uuid - UUID of the Collection node.
   * @param {Record<string, unknown>} properties - The changed properties.
   * @throws {NotFoundError} If no Collection with the given UUID exists.
   * @throws {ValidationError} If a property is no attribute of the Collection, not editable or its value is invalid.
   * @returns {Promise<ElementResponse>} The updated Collection as the only node.
   */
  public async patchCollectionProperties(uuid: string, properties: Record<string, unknown>): Promise<ElementResponse> {
    const context: ModelContext = await ConfigService.getModelContext();

    const labelsQuery: string = `
    MATCH (c:Collection {uuid: $uuid})
    RETURN labels(c) AS nodeLabels
    `;

    const updateQuery: string = `
    MATCH (c:Collection {uuid: $uuid})
    SET c += $properties

    RETURN {
      nodeLabels: labels(c),
      data: c {.*}
    } AS node
    `;

    // Returning from the callback commits the transaction, throwing rolls it back
    const updatedNode: StoredNodeRecord = await Neo4jDriver.commitOrRollback(async (tx) => {
      const labelsResult: QueryResult = await tx.run(labelsQuery, { uuid });
      const nodeLabels: string[] | undefined = labelsResult.records[0]?.get("nodeLabels");

      if (!nodeLabels) {
        throw new NotFoundError(`Collection with UUID ${uuid} not found`);
      }

      const fields: ModelAttribute[] = getCollectionAttributes(context, nodeLabels);

      this.validateProperties(context, properties, fields);

      const result: QueryResult = await tx.run(updateQuery, {
        uuid,
        properties: toNeo4jTypes(context, properties, fields),
      });

      const node: StoredNodeRecord = result.records[0]?.get("node");

      return node;
    });

    return toElementResponse(context, [updatedNode]);
  }

  /**
   * Checks changed properties against the attributes of a Collection.
   *
   * @param {ModelContext} context - The model context.
   * @param {Record<string, unknown>} properties - The changed properties.
   * @param {ModelAttribute[]} fields - The attributes of the Collection.
   * @throws {ValidationError} If a property is no attribute of the Collection, not editable or its value is invalid.
   */
  private validateProperties(context: ModelContext, properties: Record<string, unknown>, fields: ModelAttribute[]): void {
    Object.entries(properties).forEach(([name, value]: [string, unknown]) => {
      const entry: ModelAttribute | undefined = fields.find((field) => field.attribute.name === name);

      if (!entry) {
        throw new ValidationError(`"${name}" is not a property of this Collection.`);
      }

      if (!isEditable(context, entry)) {
        throw new ValidationError(`"${name}" can not be edited.`);
      }

      const errors: string[] = validateValue(context, entry, value);

      if (errors.length > 0) {
        throw new ValidationError(`"${name}": ${errors.join(" ")}`);
      }

      if (name === "label" && typeof value === "string" && value.trim() === "") {
        throw new ValidationError('The "label" property must not consist of only whitespace characters.');
      }
    });
  }
}
