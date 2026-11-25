import { DeepReadonly } from "vue";
import {
  EditGraph,
  CollectionNode,
  NodeSearchParams,
  EntityNode,
  NodeAncestry,
  PaginationResult,
  TextNode,
  BaseNodeLabel,
  Annotation,
  HierarchyNode,
  HierarchyFilters,
  HierarchyScope,
  HierarchySort,
  ElementDiagnostic,
  ElementGraph,
  ElementResponse,
  WriteResponse,
} from "../models/types";
import DatabaseConnectionError from "../utils/errors/databaseConnection.error";
import ApiError from "../utils/errors/api.error";
import NotFoundError from "../utils/errors/notFound.error";
import ExternalServiceError from "../utils/errors/externalService.error";
import { useConfigStore } from "../store/config";
import { useAppStore } from "../store/app";
import { toWritePayload } from "../utils/helper/writePayload";
import { toAncestryPaths, toAnnotations, toEditGraph, toNode, toNodes } from "../utils/helper/readPayload";

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

  /**
   * Fetches the annotations of a Content or Collection node as editing graph: the annotations, their nested annotations,
   * the nodes they refer to and the relations between them, starting with the `HAS_ANNOTATION` relations from the node.
   * The annotated node itself is only included if an annotation refers to it.
   *
   * @param {string} nodeUuid - The UUID of the annotated node.
   * @param {object} [options] - Optional filters.
   * @param {string[]} [options.types] - Only top-level annotations of these types. All types if omitted.
   * @returns {Promise<EditGraph>} The graph, everything `unchanged`.
   */
  public async getAnnotationGraph(nodeUuid: string, options: { types?: string[] } = {}): Promise<EditGraph> {
    try {
      const params: URLSearchParams = new URLSearchParams({ parent: nodeUuid });

      if (options.types) {
        params.set("types", options.types.join(","));
      }

      const response: Response = await fetch(`${this.baseUrl}/annotations?${params.toString()}`);

      await this.assertResponseOk(response);

      const elements: ElementResponse = await response.json();

      this.reportReadDiagnostics(`Annotations of ${nodeUuid}`, elements.diagnostics);

      return toEditGraph(elements);
    } catch (error: unknown) {
      this.handleApiError(error);
    }
  }

  /**
   * Fetches the annotations of a Content, each with the nodes and relations below it (the format of the text editor).
   *
   * @param {string} contentUuid - The UUID of the Content.
   * @param {object} [options] - Optional filters.
   * @param {string[]} [options.types] - Only annotations of these types. All types if omitted.
   * @returns {Promise<Annotation[]>} The annotations, everything `unchanged`.
   */
  public async getAnnotations(contentUuid: string, options: { types?: string[] } = {}): Promise<Annotation[]> {
    const graph: EditGraph = await this.getAnnotationGraph(contentUuid, options);

    return toAnnotations(useConfigStore().getModelContext(), graph, contentUuid);
  }

  /**
   * Fetches a Collection node.
   *
   * @param {string} collectionUuid - The UUID of the Collection.
   * @returns {Promise<CollectionNode>} The Collection node.
   */
  public async getCollection(collectionUuid: string): Promise<CollectionNode> {
    try {
      const url: string = `${this.baseUrl}/collections/${collectionUuid}`;

      const response: Response = await fetch(url);

      await this.assertResponseOk(response);

      const elements: ElementResponse = await response.json();

      this.reportReadDiagnostics(`Collection ${collectionUuid}`, elements.diagnostics);

      return toNode(elements, collectionUuid) as CollectionNode;
    } catch (error: unknown) {
      this.handleApiError(error);
    }
  }

  /**
   * Fetches the ancestries of a hierarchy node: the paths of Collections above it, read in the element format.
   *
   * @param {string} nodeUuid - The UUID of the Collection or Content.
   * @returns {Promise<NodeAncestry[]>} One path per ancestry, top-level Collection first, without the node itself.
   */
  public async getHierarchyNodeAncestry(nodeUuid: string): Promise<NodeAncestry[]> {
    try {
      const url: string = `${this.hierarchyUrl}/ancestry/${nodeUuid}`;

      const response: Response = await fetch(url);

      await this.assertResponseOk(response);

      const elements: ElementResponse = await response.json();

      this.reportReadDiagnostics(`Ancestry of ${nodeUuid}`, elements.diagnostics);

      return toAncestryPaths(elements, nodeUuid);
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

      const result: PaginationResult<ElementResponse> = await response.json();

      this.reportReadDiagnostics(`Search results (${baseNodeLabel})`, result.data.diagnostics);

      return { data: toNodes<CollectionNode | EntityNode | TextNode>(result.data), pagination: result.pagination };
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
   * @returns {Promise<PaginationResult<HierarchyNode[]>>} A page of nodes plus pagination.
   */
  public async listHierarchyNodes(
    scope: HierarchyScope,
    params: {
      filters: DeepReadonly<HierarchyFilters> | HierarchyFilters;
      sort: DeepReadonly<HierarchySort> | HierarchySort;
      cursor: string | null;
    },
  ): Promise<PaginationResult<HierarchyNode[]>> {
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

      const result: PaginationResult<ElementResponse> = await response.json();

      this.reportReadDiagnostics("Hierarchy listing", result.data.diagnostics);

      return {
        data: toNodes<HierarchyNode>(result.data),
        pagination: result.pagination,
      };
    } catch (error: unknown) {
      this.handleApiError(error);
    }
  }

  /**
   * Fetches the Miso config. It is returned as received and validated by the caller.
   *
   * @returns {Promise<unknown>} The parsed JSON response.
   */
  public async getConfig(): Promise<unknown> {
    try {
      const url: string = `${this.baseUrl}/config`;

      const response: Response = await fetch(url);

      await this.assertResponseOk(response);

      return await response.json();
    } catch (error: unknown) {
      this.handleApiError(error);
    }
  }

  /**
   * Fetches a Content node.
   *
   * @param {string} contentUuid - The UUID of the Content.
   * @returns {Promise<TextNode>} The Content node.
   */
  public async getContent(contentUuid: string): Promise<TextNode> {
    try {
      const url: string = `${this.baseUrl}/contents/${contentUuid}`;

      const response: Response = await fetch(url);

      await this.assertResponseOk(response);

      const elements: ElementResponse = await response.json();

      this.reportReadDiagnostics(`Content ${contentUuid}`, elements.diagnostics);

      return toNode(elements, contentUuid) as TextNode;
    } catch (error: unknown) {
      this.handleApiError(error);
    }
  }

  /**
   * Logs the problems of stored data that a read reports (e.g. labels that match no type of the model). Reads never fail
   * because of them.
   *
   * @param {string} what - What was read, for the log message.
   * @param {ElementDiagnostic[]} diagnostics - The diagnostics of the response.
   * @returns {void} This function does not return any value.
   */
  private reportReadDiagnostics(what: string, diagnostics: ElementDiagnostic[]): void {
    if (diagnostics.length > 0) {
      console.warn(`${what}: stored data that doesn't match the model`, diagnostics);
    }
  }

  /**
   * Shows the findings of the server's validation of a write. Not blocking: while the server is in report mode, the
   * write is saved anyway. All findings are logged to the console, the first few are shown in a toast.
   *
   * @param {ElementDiagnostic[] | undefined} diagnostics - The findings from the response.
   * @returns {void} This function does not return any value.
   */
  private reportWriteDiagnostics(diagnostics: ElementDiagnostic[] | undefined): void {
    if (!diagnostics || diagnostics.length === 0) {
      return;
    }

    const shownCount: number = 3;
    const lines: string[] = diagnostics.slice(0, shownCount).map((diagnostic) => diagnostic.message);

    if (diagnostics.length > shownCount) {
      lines.push(`... and ${diagnostics.length - shownCount} more`);
    }

    console.warn("The saved data has problems:", diagnostics);

    useAppStore().addToastMessage({
      severity: "warn",
      summary: "Saved, but some data has problems",
      detail: lines.join(" · "),
      life: 8000,
    });
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

  /**
   * Updates only the given properties of a Collection. `null` removes a property, all others stay untouched.
   *
   * @param {CollectionNode} collection - The Collection. The server checks the properties against its stored type.
   * @param {Record<string, unknown>} properties - The changed properties.
   * @param {AbortSignal} [signal] - Aborts the request, e.g. after a timeout.
   * @returns {Promise<CollectionNode>} The updated Collection node.
   */
  public async patchCollection(
    collection: CollectionNode,
    properties: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<CollectionNode> {
    const uuid: string = collection.properties.uuid;
    const url: string = `${this.baseUrl}/collections/${uuid}`;

    try {
      const response: Response = await fetch(url, this.jsonBodyRequest({ properties }, { signal, method: "PATCH" }));

      await this.assertResponseOk(response);

      const updated: ElementResponse = await response.json();

      return toNode(updated, uuid) as CollectionNode;
    } catch (error: unknown) {
      this.handleApiError(error);
    }
  }

  /**
   * Saves the changes of a graph in one write.
   *
   * @param {EditGraph} graph - The graph; its elements that aren't `unchanged` are sent.
   * @param {AbortSignal} [signal] - Aborts the request, e.g. after a timeout.
   * @returns {Promise<WriteResponse>} The findings of the server's validation and the deleted orphans.
   */
  public async saveGraph(graph: EditGraph, signal?: AbortSignal): Promise<WriteResponse> {
    try {
      const url: string = `${this.baseUrl}/elements`;
      const payload: ElementGraph = toWritePayload(useConfigStore().getModelContext(), graph);

      const response: Response = await fetch(url, this.jsonBodyRequest(payload, { signal }));

      await this.assertResponseOk(response);

      const result: WriteResponse = await response.json();

      this.reportWriteDiagnostics(result.diagnostics);

      return result;
    } catch (error: unknown) {
      this.handleApiError(error);
    }
  }
}
