import { ElementResponse, NodeSearchParams, PaginationResult } from "../models/types.js";
import CollectionService from "./collection.service.js";
import EntityService from "./entity.service.js";
import ContentService from "./content.service.js";

export default class SearchService {
  /**
   * Searches for nodes of a given scope that match the provided search parameters, by delegating to the service of the
   * scope.
   *
   * @param {'Collection' | 'Entity' | 'Content'} scope - The type of nodes to search.
   * @param {Required<NodeSearchParams>} options - Pagination and filter options, including
   *   the search string, node labels, sort order, limit, and offset.
   * @return {Promise<PaginationResult<ElementResponse>>} A page of the matching nodes in the element format, in listing
   *   order.
   */
  public async searchNodes(
    scope: "Collection" | "Entity" | "Content",
    options: Required<NodeSearchParams>,
  ): Promise<PaginationResult<ElementResponse>> {
    if (scope === "Collection") {
      const collectionService = new CollectionService();

      return await collectionService.search(options);
    } else if (scope === "Entity") {
      const entityService = new EntityService();

      return await entityService.search(options);
    } else if (scope === "Content") {
      const contentService = new ContentService();

      return await contentService.search(options);
    } else {
      return {} as PaginationResult<ElementResponse>;
    }
  }
}
