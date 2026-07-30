import { DeepReadonly } from "vue";
import { IGuidelines } from "../models/IGuidelines";
import {
  NodeDto,
  Character,
  CharacterPostData,
  CollectionNode,
  NodeSearchParams,
  CursorData,
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

  public async createOrAddCollection(uuid: string, data: NodeStatusObject): Promise<NodeDto<CollectionNode>> {
    try {
      const url: string = `${this.baseUrl}/collections`;

      const response: Response = await fetch(url, {
        method: "POST",
        cache: "no-cache",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        referrerPolicy: "no-referrer",
        body: JSON.stringify({
          uuid: uuid,
          data: data,
        }),
      });

      await this.assertResponseOk(response);

      return await response.json();
    } catch (error: unknown) {
      this.handleApiError(error);
    }
  }

  public async deleteHierarchyNode(uuid: string): Promise<NodeDto<HierarchyNode>> {
    try {
      const url: string = `${this.hierarchyUrl}/nodes/${uuid}`;

      const response: Response = await fetch(url, {
        method: "DELETE",
        cache: "no-cache",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        referrerPolicy: "no-referrer",
      });

      await this.assertResponseOk(response);

      return await response.json();
    } catch (error: unknown) {
      this.handleApiError(error);
    }
  }

  public async getAnnotations(nodeType: "collection" | "text", nodeUuid: string): Promise<NodeDto<AnnotationNode>[]> {
    try {
      const url: string = `${this.baseUrl}/${nodeType}s/${nodeUuid}/annotations`;

      const response: Response = await fetch(url);

      await this.assertResponseOk(response);

      return await response.json();
    } catch (error: unknown) {
      this.handleApiError(error);
    }
  }

  public async getCharacters(textUuid: string): Promise<Character[]> {
    try {
      const url: string = `${this.baseUrl}/texts/${textUuid}/characters`;

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
    urlParams.set("order", sortDirection);
    urlParams.set("search", searchInput);
    urlParams.set("nodeLabels", nodeLabels.join(","));
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
   * Fetches one page of a parent's hierarchy children (Collections + Contents), or the top-level
   * nodes when `parentUuid` is null.
   *
   * @param {string | null} parentUuid - The parent Collection UUID, or `null` for top-level nodes.
   * @param {Object} params - Filters, sort and the opaque cursor string.
   * @returns {Promise<PaginationResult<NodeDto<HierarchyNode>[]>>} A page of children plus pagination.
   */
  public async getHierarchyChildren(
    parentUuid: string | null,
    params: {
      filters: DeepReadonly<HierarchyFilters> | HierarchyFilters;
      sort: DeepReadonly<HierarchySort> | HierarchySort;
      cursor: string | null;
    },
  ): Promise<PaginationResult<NodeDto<HierarchyNode>[]>> {
    const { filters, sort, cursor } = params;

    const urlParams: URLSearchParams = new URLSearchParams();

    if (parentUuid) {
      urlParams.set("parent", parentUuid);
    }

    urlParams.set("search", filters.search);
    urlParams.set("nodeLabels", filters.nodeLabels.join(","));
    urlParams.set("sort", sort.field);
    urlParams.set("dir", sort.direction);

    if (cursor) {
      urlParams.set("cursor", cursor);
    }

    const fetchUrl: string = `${this.hierarchyUrl}/children?${urlParams.toString()}`;

    try {
      const response: Response = await fetch(fetchUrl);

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

      const response: Response = await fetch(url, {
        method: "POST",
        cache: "no-cache",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        referrerPolicy: "no-referrer",
        body: JSON.stringify({ uuid, data }),
      });

      await this.assertResponseOk(response);

      return await response.json();
    } catch (error: unknown) {
      this.handleApiError(error);
    }
  }

  public async getEntities(nodeLabel: string, searchString: string): Promise<EntityNode[]> {
    try {
      const url: string = `${this.baseUrl}/entities?node=${nodeLabel}&searchStr=${searchString}`;

      const response: Response = await fetch(url);

      await this.assertResponseOk(response);

      return await response.json();
    } catch (error: unknown) {
      this.handleApiError(error);
    }
  }
  public async getGuidelines(): Promise<IGuidelines> {
    try {
      const url: string = `${this.baseUrl}/guidelines`;

      const response: Response = await fetch(url);

      await this.assertResponseOk(response);

      return await response.json();
    } catch (error: unknown) {
      this.handleApiError(error);
    }
  }

  public async getStyles(): Promise<string> {
    try {
      const url: string = `${this.baseUrl}/styles`;

      const response: Response = await fetch(url);

      await this.assertResponseOk(response);

      return await response.text();
    } catch (error) {
      this.handleApiError(error);
    }
  }

  public async getTextAccessObject(textUuid: string): Promise<TextAccessObject> {
    try {
      const url: string = `${this.baseUrl}/texts/${textUuid}`;

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
   * @param {ApiError | unknown} error - The error object to handle.
   * @returns {void} This function does not return any value.
   *
   * @throws {ApiError} - The API error (either the original or a subclass of it).
   */
  private handleApiError(error: ApiError | unknown): never {
    console.error(error);

    throw error;
  }

  public async updateCharacterChain(textUuid: string, characterPostData: CharacterPostData): Promise<void> {
    try {
      const url: string = `${this.baseUrl}/texts/${textUuid}/characters`;

      const response: Response = await fetch(url, {
        method: "POST",
        cache: "no-cache",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        referrerPolicy: "no-referrer",
        body: JSON.stringify(characterPostData),
      });

      await this.assertResponseOk(response);
    } catch (error: unknown) {
      this.handleApiError(error);
    }
  }

  public async updateCollection(uuid: string, data: NodeStatusObject): Promise<NodeDto<CollectionNode>> {
    const url: string = `${this.baseUrl}/collections/${uuid}`;

    try {
      const response: Response = await fetch(url, {
        method: "POST",
        cache: "no-cache",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        referrerPolicy: "no-referrer",
        body: JSON.stringify(data),
      });

      await this.assertResponseOk(response);

      return await response.json();
    } catch (error: unknown) {
      this.handleApiError(error);
    }
  }

  public async updateNetwork(data: NetworkPostData): Promise<(CollectionNode | TextNode)[]> {
    const url: string = `${this.baseUrl}/network`;

    try {
      const response: Response = await fetch(url, {
        method: "POST",
        cache: "no-cache",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        referrerPolicy: "no-referrer",
        body: JSON.stringify(data),
      });

      await this.assertResponseOk(response);

      return await response.json();
    } catch (error: unknown) {
      this.handleApiError(error);
    }
  }

  public async updateText(uuid: string, text: TextUpdateDto): Promise<void> {
    try {
      const url: string = `${this.baseUrl}/texts/${uuid}`;

      const response: Response = await fetch(url, {
        method: "POST",
        cache: "no-cache",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        referrerPolicy: "no-referrer",
        body: JSON.stringify(text),
      });

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
