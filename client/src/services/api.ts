import { DeepReadonly } from "vue";
import {
  Annotation,
  NodeDto,
  CollectionNode,
  NodeSearchParams,
  EntityNode,
  NetworkPostData,
  NodeAncestry,
  PaginationResult,
  TextNode,
  TextAccessObject,
  BaseNodeLabel,
  TextUpdateDto,
  AnnotationNode,
  NodeStatusObject,
  HierarchyNode,
  HierarchyFilters,
  HierarchyScope,
  HierarchySort,
} from "../models/types";
import DatabaseConnectionError from "../utils/errors/databaseConnection.error";
import ApiError from "../utils/errors/api.error";
import NotFoundError from "../utils/errors/notFound.error";
import ExternalServiceError from "../utils/errors/externalService.error";

/**
 * The ApiService class provides methods for making API requests to the backend server.
 */
export default class ApiService {
  /** The base URL of the API */
  private baseUrl: string;

  /** The base URL of the hierarchy API. Used for hierarchy-related requests (ancestry, children, path validation etc.) */
  private hierarchyUrl: string;

  constructor() {
    this.baseUrl = "/api";
    this.hierarchyUrl = `${this.baseUrl}/hierarchy`;
  }

  /**
   * Checks API response status  by throwing the appropriate error type if necessary.
   * Currently handles 404 (NotFound), 500 (Internal Server Error), and 503 (Database Connection Error) status codes.
   *
   * @param {Response} response - The response object from the API request.
   * @returns {Promise<void>} - A promise that resolves when the operation is complete.
   * @throws {NotFoundError} - If the API returns a 404 status code.
   * @throws {ApiError} - If the API returns a 500 status code.
   * @throws {ExternalServiceError} - If the API returns a 502 status code.
   * @throws {DatabaseConnectionError} - If the API returns a 503 status code.
   */
  private async assertResponseOk(response: Response): Promise<void> {
    if (!response.ok) {
      const body = await response.json().catch(() => null);

      /* eslint-disable @typescript-eslint/prefer-nullish-coalescing -- empty message string should be handled */
      switch (response.status) {
        case 404:
          throw new NotFoundError(response.status, body?.message || "Not found");
        case 500:
          throw new ApiError(response.status, body?.message || "Internal server error");
        case 502:
          throw new ExternalServiceError(response.status, body?.message || "External service error");
        case 503:
          throw new DatabaseConnectionError(response.status, body?.message || "Database connection error");
        default:
          throw new ApiError(response.status, body?.message || "API response was not ok");
      }
      /* eslint-enable*/
    }
  }

  /**
   * Builds the `fetch` options for a request sending a JSON body. Defaults to POST.
   * Every entry can be overridden, `headers` are merged with the default headers.
   *
   * @param {unknown} body - The payload, serialized with `JSON.stringify`.
   * @param {Omit<RequestInit, "body" | "headers"> & { headers?: Record<string, string> }} [overrides] - Entries replacing the defaults.
   * @returns {RequestInit} The merged request options.
   */
  private jsonBodyRequest(
    body: unknown,
    overrides: Omit<RequestInit, "body" | "headers"> & { headers?: Record<string, string> } = {},
  ): RequestInit {
    return {
      method: "POST",
      cache: "no-cache",
      credentials: "same-origin",
      referrerPolicy: "no-referrer",
      ...overrides,
      headers: {
        "Content-Type": "application/json",
        ...overrides.headers,
      },
      body: JSON.stringify(body),
    };
  }

  /**
   * Checks the health of the database connection.
   * Throws a DatabaseConnectionError if the API returns an error.
   *
   * @returns {Promise<void>} A promise that resolves when the operation is complete.
   * @throws {DatabaseConnectionError} If the database connection is unhealthy.
   */
  public async checkDatabaseConnection(): Promise<void> {
    try {
      const url: string = `${this.baseUrl}/health`;

      const response: Response = await fetch(url);

      await this.assertResponseOk(response);

      return await response.json();
    } catch (error: unknown) {
      this.handleApiError(error);
    }
  }

  /**
   * Deletes one or several hierarchy nodes in one transaction (all or nothing).
   *
   * @param {string[]} uuids - The UUIDs of the nodes to delete.
   * @returns {Promise<string[]>} The UUIDs actually deleted, including Contents removed together with their Collection.
   */
  public async deleteHierarchyNodes(uuids: string[]): Promise<string[]> {
    try {
      const url: string = `${this.hierarchyUrl}/nodes/delete`;

      const response: Response = await fetch(url, this.jsonBodyRequest({ uuids }));

      await this.assertResponseOk(response);

      const result: { deleted: string[] } = await response.json();

      return result.deleted;
    } catch (error: unknown) {
      this.handleApiError(error);
    }
  }

  public async getAnnotations(nodeType: "collection" | "content", nodeUuid: string): Promise<NodeDto<AnnotationNode>[]> {
    try {
      const url: string = `${this.baseUrl}/${nodeType}s/${nodeUuid}/annotations`;

      const response: Response = await fetch(url);

      await this.assertResponseOk(response);

      return await response.json();
    } catch (error: unknown) {
      this.handleApiError(error);
    }
  }

  public async getCollection(collectionUuid: string): Promise<NodeDto<CollectionNode>> {
    try {
      const url: string = `${this.baseUrl}/collections/${collectionUuid}`;

      const response: Response = await fetch(url);

      await this.assertResponseOk(response);

      return await response.json();
    } catch (error: unknown) {
      this.handleApiError(error);
    }
  }

  public async getHierarchyNodeAncestry(nodeUuid: string): Promise<NodeAncestry[]> {
    try {
      const url: string = `${this.hierarchyUrl}/ancestry/${nodeUuid}`;

      const response: Response = await fetch(url);

      await this.assertResponseOk(response);

      return await response.json();
    } catch (error: unknown) {
      this.handleApiError(error);
    }
  }

  public async searchNodes(
    baseNodeLabel: BaseNodeLabel,
    params: {
      filters: DeepReadonly<NodeSearchParams> | NodeSearchParams;
    },
  ): Promise<PaginationResult<(CollectionNode | EntityNode | TextNode)[]>> {
    const DEFAULT_ROW_COUNT: number | null = 10;

    const path: string = `${this.baseUrl}/search`;

    const { sortDirection, searchInput, nodeLabels, rowCount, offset } = params.filters;

    const urlParams: URLSearchParams = new URLSearchParams();

    urlParams.set("scope", baseNodeLabel);
    urlParams.set("order", sortDirection ?? "asc");
    urlParams.set("search", searchInput ?? "");
    urlParams.set("nodeLabels", (nodeLabels ?? []).join(","));
    urlParams.set("limit", rowCount?.toString() ?? DEFAULT_ROW_COUNT.toString());

    if (offset) {
      urlParams.set("offset", offset.toString() ?? "");
    }

    const fetchUrl: string = `${path}?${urlParams.toString()}`;

    try {
      const response: Response = await fetch(fetchUrl);

      await this.assertResponseOk(response);

      return await response.json();
    } catch (error: unknown) {
      this.handleApiError(error);
    }
  }

  /**
   * Fetches one page of a hierarchy listing. What is listed is decided by the scope: a Collection's
   * children or all of its descendants, the top of the hierarchy, every node of the hierarchy, or an
   * explicit set of uuids (everything carrying one tag).
   * Filtering, sorting and cursor pagination are identical for all of them.
   *
   * This is a read despite being a POST — the parameters do not reliably fit in a URI, and a body allows
   * more complex filters.
   *
   * @param {HierarchyScope} scope - Which set of nodes to list.
   * @param {Object} params - Filters, sort and the opaque cursor string.
   * @returns {Promise<PaginationResult<NodeDto<HierarchyNode>[]>>} A page of nodes plus pagination.
   */
  public async listHierarchyNodes(
    scope: HierarchyScope,
    params: {
      filters: DeepReadonly<HierarchyFilters> | HierarchyFilters;
      sort: DeepReadonly<HierarchySort> | HierarchySort;
      cursor: string | null;
    },
  ): Promise<PaginationResult<NodeDto<HierarchyNode>[]>> {
    const { filters, sort, cursor } = params;

    const url: string = `${this.hierarchyUrl}/query`;

    const payload: Record<string, unknown> = {
      scope,
      filters,
      sort: sort.target,
      order: sort.order,
      ...(cursor && { cursor }),
    };

    try {
      const response: Response = await fetch(url, this.jsonBodyRequest(payload));

      await this.assertResponseOk(response);

      return await response.json();
    } catch (error: unknown) {
      this.handleApiError(error);
    }
  }

  /**
   * Validates an ordered hierarchy path (root first, focused node last).
   *
   * @param {string} uuidString - Comma-separated UUIDs of the path.
   * @returns {Promise<NodeDto<HierarchyNode>[]>} The validated path with full node labels.
   */
  public async validateHierarchyPath(uuidString: string): Promise<NodeDto<HierarchyNode>[]> {
    try {
      const url: string = `${this.hierarchyUrl}/path?path=${uuidString}`;

      const response: Response = await fetch(url);

      await this.assertResponseOk(response);

      return await response.json();
    } catch (error: unknown) {
      this.handleApiError(error);
    }
  }

  /**
   * Creates a new hierarchy node (Collection or Content) or attaches an existing one.
   *
   * @param {string} uuid - UUID of the created/added node (the operative node in the tree).
   * @param {NodeStatusObject} data - The ownership tree to persist.
   * @returns {Promise<NodeDto<HierarchyNode>>} The created/added node.
   */
  public async createHierarchyNode(uuid: string, data: NodeStatusObject): Promise<NodeDto<HierarchyNode>> {
    try {
      const url: string = `${this.hierarchyUrl}/nodes`;

      const response: Response = await fetch(url, this.jsonBodyRequest({ uuid, data }));

      await this.assertResponseOk(response);

      return await response.json();
    } catch (error: unknown) {
      this.handleApiError(error);
    }
  }

  /**
   * Fetches the guidelines. They are returned as received and validated by the caller.
   *
   * @returns {Promise<unknown>} The parsed JSON response.
   */
  public async getGuidelines(): Promise<unknown> {
    try {
      const url: string = `${this.baseUrl}/guidelines`;

      const response: Response = await fetch(url);

      await this.assertResponseOk(response);

      return await response.json();
    } catch (error: unknown) {
      this.handleApiError(error);
    }
  }

  public async getTextAccessObject(textUuid: string): Promise<TextAccessObject> {
    try {
      const url: string = `${this.baseUrl}/contents/${textUuid}`;

      const response: Response = await fetch(url);

      await this.assertResponseOk(response);

      return await response.json();
    } catch (error: unknown) {
      this.handleApiError(error);
    }
  }

  /**
   * Handles an API error by logging it to the console and rethrowing it.
   *
   * Called in every `catch` block of the `ApiService` methods. The rethrowing allows the error
   * to propagate up the call stack and be caught by a higher-level error handler.
   *
   * @param {unknown} error - The error object to handle.
   * @returns {void} This function does not return any value.
   *
   * @throws {ApiError} - The API error (either the original or a subclass of it).
   */
  private handleApiError(error: unknown): never {
    console.error(error);

    throw error;
  }

  public async updateCollection(uuid: string, data: NodeStatusObject, signal?: AbortSignal): Promise<NodeDto<CollectionNode>> {
    const url: string = `${this.baseUrl}/collections/${uuid}`;

    try {
      const response: Response = await fetch(url, this.jsonBodyRequest(data, { signal }));

      await this.assertResponseOk(response);

      return await response.json();
    } catch (error: unknown) {
      this.handleApiError(error);
    }
  }

  /**
   * Updates only the given properties of a Collection. `null` removes a property, all others stay untouched.
   *
   * @param {CollectionNode} collection - The Collection. Its node labels decide which properties are valid.
   * @param {Record<string, unknown>} properties - The changed properties.
   * @param {AbortSignal} [signal] - Aborts the request, e.g. after a timeout.
   * @returns {Promise<NodeDto<CollectionNode>>} The updated Collection node.
   */
  public async patchCollection(
    collection: CollectionNode,
    properties: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<NodeDto<CollectionNode>> {
    const uuid: string = collection.data.uuid;
    const url: string = `${this.baseUrl}/collections/${uuid}`;

    try {
      const response: Response = await fetch(
        url,
        this.jsonBodyRequest({ nodeLabels: collection.nodeLabels, properties }, { signal, method: "PATCH" }),
      );

      await this.assertResponseOk(response);

      return await response.json();
    } catch (error: unknown) {
      this.handleApiError(error);
    }
  }

  /**
   * Saves a single annotation of a Collection. Its status (`created`, `modified`, `deleted`) decides the operation,
   * the Collection node itself is left unchanged.
   *
   * @param {CollectionNode} collection - The Collection the annotation belongs to.
   * @param {Annotation} annotation - The annotation to save.
   * @returns {Promise<NodeDto<CollectionNode>>} The Collection node.
   */
  public async updateCollectionAnnotation(collection: CollectionNode, annotation: Annotation): Promise<NodeDto<CollectionNode>> {
    return this.updateCollection(collection.data.uuid, {
      node: collection,
      meta: { status: "unchanged" },
      connectedNodes: [annotation],
    });
  }

  public async updateNetwork(data: NetworkPostData): Promise<(CollectionNode | TextNode)[]> {
    const url: string = `${this.baseUrl}/network`;

    try {
      const response: Response = await fetch(url, this.jsonBodyRequest(data));

      await this.assertResponseOk(response);

      return await response.json();
    } catch (error: unknown) {
      this.handleApiError(error);
    }
  }

  public async updateText(uuid: string, text: TextUpdateDto): Promise<void> {
    try {
      const url: string = `${this.baseUrl}/contents/${uuid}`;

      const response: Response = await fetch(url, this.jsonBodyRequest(text));

      await this.assertResponseOk(response);
    } catch (error: unknown) {
      this.handleApiError(error);
    }
  }

  public async validateCollectionPath(uuidString: string): Promise<NodeDto<CollectionNode>[]> {
    try {
      const url: string = `${this.baseUrl}/network?path=${uuidString}`;

      const response: Response = await fetch(url);

      await this.assertResponseOk(response);

      return await response.json();
    } catch (error: unknown) {
      this.handleApiError(error);
    }
  }
}
