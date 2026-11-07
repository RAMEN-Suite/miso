import { int, QueryResult } from "neo4j-driver";
import Neo4jDriver from "../database/neo4j.js";
import ConfigService from "./config.service.js";
import { toNeo4jTypes } from "../utils/helper.js";
import { StoredNodeRecord, toElementResponse } from "../utils/storedGraph.js";
import NotFoundError from "../errors/notFound.error.js";
import {
  PaginationResult,
  CollectionNode,
  NodeSearchParams,
  NodeUpdateObject,
  ModelAttribute,
  ModelContext,
  ElementDiagnostic,
  ElementGraph,
  ElementResponse,
} from "../models/types.js";
import { toNodeChanges, buildSubgraphUpdateQuery, toNeo4jChanges } from "../utils/nodeUpdate.js";
import WriteValidationService from "./writeValidation.service.js";
import { getCollectionAttributes, isEditable, validateValue } from "../utils/modelHelper.js";
import ValidationError from "../errors/validation.error.js";
import logger from "../logger.js";

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
      new ConfigService().getModelContext(),
    ]);
    const rawCollection: StoredNodeRecord | undefined = result.records[0]?.get("collection");

    if (!rawCollection) {
      throw new NotFoundError(`Collection with UUID ${uuid} not found`);
    }

    return toElementResponse(context, [rawCollection]);
  }

  /**
   * Checks the "label" property of a written Collection: it must not be empty and not consist of only whitespace
   * characters. Rejected in every validation mode, unlike the findings of the model validation.
   *
   * @param {NodeUpdateObject} changes - The changes of the write.
   * @param {string} uuid - UUID of the Collection. Nothing is checked if the write doesn't change it.
   * @returns {void} This function does not return any value.
   * @throws {ValidationError} If the label is empty.
   */
  private checkValidity(changes: NodeUpdateObject, uuid: string): void {
    const collection = [...changes.create, ...changes.update].find(
      (node) => (node.data as { uuid?: unknown }).uuid === uuid,
    ) as CollectionNode | undefined;

    if (!collection) {
      return;
    }

    // Label property must always be a meaningful string
    const labelProp: string = collection.data.label;

    if (labelProp === "") {
      throw new ValidationError('The "label" property must not be empty.');
    }

    if (labelProp.trim() === "") {
      throw new ValidationError('The "label" property must not consist of only whitespace characters.');
    }
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
      new ConfigService().getModelContext(),
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
   * Updates a Collection subgraph from a write payload, after validating the write with the model, in a single CRUD
   * query against the database.
   *
   * @param uuid - UUID of the Collection node to update.
   * @param payload - The changed nodes (the Collection, its annotations etc.) and relations.
   * @throws {NotFoundError} If no Collection node with the given UUID exists after the update.
   * @throws {ValidationError} If the write doesn't match the model, in `enforce` mode.
   * @returns The updated Collection as the only node, with the findings of the validation as diagnostics.
   */
  public async updateCollection(uuid: string, payload: ElementGraph): Promise<ElementResponse> {
    const configService: ConfigService = new ConfigService();
    const context: ModelContext = await configService.getModelContext();

    const changes: NodeUpdateObject = toNodeChanges(context, payload);

    this.checkValidity(changes, uuid);

    const diagnostics: ElementDiagnostic[] = await new WriteValidationService().validate(context, changes);
    const flat: NodeUpdateObject = toNeo4jChanges(changes, context);

    const query: string = buildSubgraphUpdateQuery("Collection");

    const start: number = performance.now();

    const result: QueryResult = await Neo4jDriver.runQuery(query, {
      uuid,
      delete: flat.delete,
      create: flat.create,
      update: flat.update,
      remove: flat.remove,
      attach: flat.attach,
    });

    // Compared with the response time of the request, this shows how much of a save is spent in the database
    logger.debug("Collection subgraph updated", {
      uuid,
      dbDurationMs: Math.round(performance.now() - start),
      create: flat.create.length,
      update: flat.update.length,
      delete: flat.delete.length,
      attach: flat.attach.length,
      remove: flat.remove.length,
    });

    const updatedNode: StoredNodeRecord | undefined = result.records[0]?.get("node");

    if (!updatedNode) {
      throw new NotFoundError(`Collection with UUID ${uuid} not found`);
    }

    return { ...toElementResponse(context, [updatedNode]), diagnostics };
  }

  /**
   * Updates only the given properties of a Collection node (JSON Merge Patch semantics: `null` removes a property).
   * The properties are validated with RAMEN core against the attributes of the given node labels.
   *
   * @param {string} uuid - UUID of the Collection node.
   * @param {string[]} nodeLabels - The node labels of the Collection, to derive its attributes.
   * @param {Record<string, unknown>} properties - The changed properties.
   * @throws {NotFoundError} If no Collection with the given UUID exists.
   * @throws {ValidationError} If a property is no attribute of the node labels, not editable or its value is invalid.
   * @returns {Promise<ElementResponse>} The updated Collection as the only node.
   */
  public async patchCollectionProperties(
    uuid: string,
    nodeLabels: string[],
    properties: Record<string, unknown>,
  ): Promise<ElementResponse> {
    const configService: ConfigService = new ConfigService();
    const context: ModelContext = await configService.getModelContext();
    const fields: ModelAttribute[] = getCollectionAttributes(context, nodeLabels);

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

    const query: string = `
    MATCH (c:Collection {uuid: $uuid})
    SET c += $properties

    RETURN {
      nodeLabels: labels(c),
      data: c {.*}
    } AS node
    `;

    const result: QueryResult = await Neo4jDriver.runQuery(query, {
      uuid,
      properties: toNeo4jTypes(context, properties, fields),
    });

    const updatedNode: StoredNodeRecord | undefined = result.records[0]?.get("node");

    if (!updatedNode) {
      throw new NotFoundError(`Collection with UUID ${uuid} not found`);
    }

    return toElementResponse(context, [updatedNode]);
  }
}
