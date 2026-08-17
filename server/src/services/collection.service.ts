import { int, QueryResult } from "neo4j-driver";
import Neo4jDriver from "../database/neo4j.js";
import GuidelinesService from "./guidelines.service.js";
import { toNativeTypes } from "../utils/helper.js";
import NotFoundError from "../errors/notFound.error.js";
import { IGuidelines } from "../models/IGuidelines.js";
import { PaginationResult, CollectionNode, NodeSearchParams, NodeDto, NodeStatusObject } from "../models/types.js";
import { flattenNodeTree, buildSubgraphUpdateQuery } from "../utils/nodeUpdate.js";
import ValidationError from "../errors/validation.error.js";

export default class CollectionService {
  /**
   * Retrieves the available labels that can be assigned to a Collection node.
   *
   * Called during creating and updating a collection to check the data validity (specifically, when no additional
   * node label is provided).
   *
   * @param {IGuidelines} guidelines - The guidelines to check against.
   * @return {string[]} The available labels.
   */
  private getAvailableCollectionLabelsFromGuidelines(guidelines: IGuidelines): string[] {
    return guidelines?.collections.types.map((collection) => collection.additionalLabel) ?? [];
  }

  /**
   * Retrieves data of a specified collection node.
   *
   * @param {string} uuid - The UUID of the collection node to retrieve.
   * @throws {NotFoundError} If the collection with the specified UUID is not found.
   * @return {Promise<NodeDto<CollectionNode>>} A promise that resolves to the retrieved collection.
   */
  public async getCollection(uuid: string): Promise<NodeDto<CollectionNode>> {
    const query: string = `
    MATCH (c:Collection {uuid: $uuid})

    RETURN {
        nodeLabels: labels(c),
        data: c {.*}
    } AS collection
    `;

    const result: QueryResult = await Neo4jDriver.runQuery(query, { uuid });
    const rawCollection: CollectionNode = result.records[0]?.get("collection");

    if (!rawCollection) {
      throw new NotFoundError(`Collection with UUID ${uuid} not found`);
    }

    const collection: NodeDto<CollectionNode> = {
      node: toNativeTypes(rawCollection) as CollectionNode,
      connectedNodes: [],
    };

    return collection;
  }

  /**
   * Checks if the given collection node is valid according to the guidelines. Specifically, it checks if
   * the collection node has an additional node label if options exist and if the "label" property is not
   * empty and does not consist of only whitespace characters.
   *
   * Called during creating and updating a collection.
   *
   * @param {CollectionNode} collection - The collection node to check for validity.
   * @param {IGuidelines} guidelines - The guidelines to check against.
   * @returns {void} This function does not return any value.
   * @throws {ValidationError} If the data is not valid according to the guidelines.
   */
  private checkValidity(collection: CollectionNode, guidelines: IGuidelines): void {
    const availableNodeLabels = this.getAvailableCollectionLabelsFromGuidelines(guidelines);

    // Collections must have and additional node label (if options exist)
    if (availableNodeLabels.length > 0 && collection.nodeLabels.length === 0) {
      throw new ValidationError("A Collection MUST have an additional node label.");
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

  public async search(options: Required<NodeSearchParams>): Promise<PaginationResult<CollectionNode[]>> {
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

    const [countResult, dataResult] = await Promise.all([
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
    ]);

    const totalRecords: number = countResult.records[0]?.get("totalRecords") || 0;

    const rawData: CollectionNode[] = dataResult.records[0]?.get("collections") || [];
    const data: CollectionNode[] = rawData.map((c) => toNativeTypes(c)) as CollectionNode[];

    return {
      data,
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
   * Updates a Collection subgraph by flattening the provided {@link NodeStatusObject} tree
   * and executing a single CRUD query against the database. The top entry in the node tree
   * is the Collection node, the other nodes are the attached Text and Annotation nodes (and optionally,
   * their subnodes).
   *
   * @param uuid - UUID of the root Collection node to update.
   * @param root - Ownership tree rooted at the Collection node, with connected nodes (texts,
   *   annotations, sub-collections) already set as `connectedNodes`.
   * @throws {NotFoundError} If no Collection node with the given UUID exists after the update.
   * @returns The updated Collection node.
   */
  public async updateCollection(uuid: string, root: NodeStatusObject): Promise<NodeDto<CollectionNode>> {
    const guidelineService: GuidelinesService = new GuidelinesService();
    const guidelines = await guidelineService.getGuidelines();

    this.checkValidity(root.node as CollectionNode, guidelines);

    const flat = flattenNodeTree(root, guidelines);

    const query: string = buildSubgraphUpdateQuery("Collection");

    console.dir(flat, { depth: null });

    const result: QueryResult = await Neo4jDriver.runQuery(query, {
      uuid,
      delete: flat.delete,
      create: flat.create,
      update: flat.update,
      remove: flat.remove,
      attach: flat.attach,
    });

    const updatedNode: CollectionNode = result.records[0]?.get("node");

    if (!updatedNode) {
      throw new NotFoundError(`Collection with UUID ${uuid} not found`);
    }

    return {
      node: updatedNode,
      connectedNodes: [],
    };
  }
}
