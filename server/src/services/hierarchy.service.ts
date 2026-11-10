import { int, QueryResult } from "neo4j-driver";
import Neo4jDriver from "../database/neo4j.js";
import ValidationError from "../errors/validation.error.js";
import { orderDirection } from "../utils/cypher.js";
import { valueToNativeType } from "../utils/helper.js";
import { StoredGraphRelation, StoredNodeRecord, toElementResponse } from "../utils/storedGraph.js";
import { CURSOR_VERSION, encodeCursor, HierarchyCursor } from "../utils/cursor.js";
import { toNodeChanges } from "../utils/nodeUpdate.js";
import ConfigService from "./config.service.js";
import WriteValidationService from "./writeValidation.service.js";
import { buildFilterCypher, SORT_KEY_MAX_LENGTH, targetExpression } from "../utils/filter.js";
import {
  ElementGraph,
  ElementResponse,
  FilterSpec,
  FilterTarget,
  HierarchyScope,
  NodeUpdateObject,
  PaginationResult,
  ModelAttribute,
  ModelContext,
} from "../models/types.js";
import { BASE_NODE_LABELS } from "../utils/ramen.js";

/* eslint-disable @typescript-eslint/no-unsafe-assignment -- db results can not be typed (only with assertion) which is too cumbersome for now */

export interface HierarchyListOptions {
  filters: FilterSpec;
  sort: FilterTarget;
  order: "asc" | "desc";
  limit: number;
  cursor: HierarchyCursor | null;
  /** Signature of the active scope + sort + filter spec, stamped into the produced nextCursor. */
  signature: string;
  /** Property allowlist from the model's attributes, already used to validate `filters` and `sort`. */
  properties: Map<string, ModelAttribute>;
  /** The model context, for the value types of the allowlisted properties */
  context: ModelContext;
}

/**
 * Service for reading and validating the Collection/Content hierarchy. Serves the column view today
 * and the planned directory / tree views with the same endpoints.
 */
export default class HierarchyService {
  /**
   * Retrieves the ancestry of a `Content` or `Collection` node with the given UUID: the node itself, the Collections
   * above it via outgoing `PART_OF` relationships, and these relationships. Every path from the node along the
   * relations up to a node without a parent in the response is one ancestry (used for breadcrumbs and navigation).
   * Only paths that end at a top-level Collection (no parent, not referred to) are included.
   *
   * @param {string} uuid - The UUID of the node to retrieve the ancestry for.
   * @return {Promise<ElementResponse>} The nodes and `PART_OF` relations of all ancestries. Empty if the node doesn't
   * exist; only the node itself if it is at the top level.
   */
  public async getAncestry(uuid: string): Promise<ElementResponse> {
    // TODO: maxLevel 50 should be enough, but change maybe?
    const query: string = `
      MATCH (c:Collection|Content {uuid: $uuid})

      CALL apoc.path.expandConfig(c, {
            relationshipFilter: 'PART_OF>',
            labelFilter: 'Collection',
            maxLevel: 50,
            uniqueness: 'NODE_PATH'
        }) YIELD path

      WITH path, last(nodes(path)) AS topNode

      // Keep only "longest paths" (which have Collections)
      WHERE
          NOT (topNode)-[:PART_OF]->() AND
          NOT ()-[:REFERS_TO]->(topNode)

      WITH
          apoc.coll.toSet(apoc.coll.flatten(collect(nodes(path)))) AS pathNodes,
          apoc.coll.toSet(apoc.coll.flatten(collect(relationships(path)))) AS pathRelations

      RETURN
          [n IN pathNodes | {nodeLabels: labels(n), data: n {.*}}] AS nodes,
          [r IN pathRelations | {type: type(r), from: startNode(r).uuid, to: endNode(r).uuid}] AS relations
      `;

    const [result, context]: [QueryResult, ModelContext] = await Promise.all([
      Neo4jDriver.runQuery(query, { uuid }),
      ConfigService.getModelContext(),
    ]);
    const record = result.records[0];

    return toElementResponse(
      context,
      (record?.get("nodes") ?? []) as StoredNodeRecord[],
      (record?.get("relations") ?? []) as StoredGraphRelation[],
    );
  }

  /**
   * Builds the Cypher that establishes `n` — the set of nodes the listing is drawn from.
   *
   * Used in the cypher query to fetch hierarchy nodes (Collection or Content), based on different scopes
   *
   * @param {HierarchyScope} scope - The scope to build the match for.
   * @returns {string} A Cypher fragment binding `n`.
   */
  private scopeMatchClause(scope: HierarchyScope): string {
    switch (scope.kind) {
      case "children": {
        return `MATCH (parent:Collection {uuid: $parentUuid})<-[:PART_OF]-(n:Collection|Content)`;
      }
      case "descendants": {
        return `MATCH (ancestor:Collection {uuid: $ancestorUuid})<-[:PART_OF*1..]-(n:Collection|Content)
                WHERE n <> ancestor
                WITH DISTINCT n`;
      }
      case "top": {
        return `MATCH (n:Collection|Content) WHERE NOT EXISTS { ()<-[:PART_OF]-(n) }`;
      }
      case "all": {
        return `MATCH (n:Collection|Content)`;
      }
      case "uuids": {
        return `UNWIND $uuids AS scopeUuid
                MATCH (n:Collection|Content {uuid: scopeUuid})
                WITH DISTINCT n`;
      }
    }
  }

  /**
   * Retrieves a paginated page of a hierarchy listing. What is listed is decided by the
   * {@link HierarchyScope}: a Collection's direct children or all of its descendants, the top of the
   * hierarchy, every node of the hierarchy, or an explicit set of uuids (a client-side tag, whose
   * nodes may sit anywhere in the graph).
   *
   * Everything but the scope is identical across all of them: Collections always sort before
   * Contents (Finder-style); within each group the nodes sort by the requested target (the distinct
   * property by default), tie-broken by uuid; pagination is keyset (cursor) based.
   *
   * @param {HierarchyScope} scope - Which set of nodes to list.
   * @param {HierarchyListOptions} options - Filter, sort, limit and cursor parameters.
   * @return {Promise<PaginationResult<ElementResponse>>} A page of nodes (in listing order, no relations) plus
   * pagination info.
   */
  public async listNodes(scope: HierarchyScope, options: HierarchyListOptions): Promise<PaginationResult<ElementResponse>> {
    const { filters, sort, order, limit, cursor, signature, properties, context } = options;

    // `search` in the pagination payload is a legacy field the client does not read for hierarchy
    // listings; the free-text rule (if any) is the `distinct` one
    // TODO: Remove search legacy from here and all pagination data occurences
    const search: string = JSON.stringify(filters.find((rule) => rule.target.kind === "distinct")?.conditions[0]?.value ?? "");

    // An empty uuid scope can only ever yield an empty page -> skip db query
    if (scope.kind === "uuids" && scope.uuids.length === 0) {
      return {
        data: { nodes: [], relations: [], diagnostics: [] },
        pagination: { limit, order, search, totalRecords: 0, nextCursor: null },
      };
    }

    const op: "<" | ">" = orderDirection(order);
    const sortValue: string = targetExpression(sort);
    const scopeMatch: string = this.scopeMatchClause(scope);

    const { clause: filterClause, params: filterParams } = buildFilterCypher(context, filters, properties);

    // Group rank + sort value, then the rules
    const baseQuery: string = `
    ${scopeMatch}

    WITH n,
         CASE WHEN n:Collection THEN 0 ELSE 1 END AS groupRank,
         ${sortValue} AS sortValue

    WHERE
      ${filterClause}
    `;

    const countQuery: string = baseQuery + `\nRETURN count(n) AS totalRecords`;

    // Keyset: strictly-later group, or same group and later in (value, uuid)
    const keysetCondition: string = cursor
      ? `AND (groupRank > $cursorGroup
             OR (groupRank = $cursorGroup
                 AND (sortValue ${op} $cursorValue
                      OR (sortValue = $cursorValue AND n.uuid ${op} $cursorUuid))))`
      : "";

    const dataQuery: string =
      baseQuery +
      keysetCondition +
      `
      ORDER BY groupRank ASC, sortValue ${order}, n.uuid ${order}
      LIMIT $limit

      RETURN collect({
          node: { nodeLabels: labels(n), data: n {.*} },
          groupRank: groupRank,
          sortValue: sortValue
      }) AS children
    `;

    const queryParams = {
      ...(scope.kind === "children" && { parentUuid: scope.parentUuid }),
      ...(scope.kind === "descendants" && { ancestorUuid: scope.ancestorUuid }),
      ...(scope.kind === "uuids" && { uuids: scope.uuids }),
      ...filterParams,
      baseLabels: BASE_NODE_LABELS,
      previewLength: int(SORT_KEY_MAX_LENGTH),
      limit: int(limit + 1),
      ...(cursor && {
        cursorGroup: int(cursor.g),
        cursorValue: cursor.k[0],
        cursorUuid: cursor.u,
      }),
    };

    const [countResult, dataResult] = await Promise.all([
      Neo4jDriver.runQuery(countQuery, queryParams),
      Neo4jDriver.runQuery(dataQuery, queryParams),
    ]);

    const totalRecords: number = countResult.records[0]?.get("totalRecords") ?? 0;
    const rawChildren: {
      node: { nodeLabels: string[]; data: { uuid: string; [key: string]: unknown } };
      groupRank: number;
      sortValue: unknown;
    }[] = dataResult.records[0]?.get("children") ?? [];

    const hasMore: boolean = rawChildren.length > limit;
    const pageRows = hasMore ? rawChildren.slice(0, limit) : rawChildren;

    const data: ElementResponse = toElementResponse(
      context,
      pageRows.map((row) => row.node),
    );

    let nextCursor: string | null = null;

    if (hasMore && pageRows.length > 0) {
      const last = pageRows[pageRows.length - 1];

      const cursorObject: HierarchyCursor = {
        v: CURSOR_VERSION,
        g: last.groupRank,
        k: [valueToNativeType(last.sortValue) as string | number],
        u: last.node.data.uuid,
        s: signature,
      };

      nextCursor = encodeCursor(cursorObject);
    }

    return {
      data,
      pagination: {
        limit,
        order,
        search,
        totalRecords,
        nextCursor,
      },
    };
  }

  /**
   * Creates a new hierarchy node (Collection or Content) and returns it. Whether it is a Collection or a Content comes
   * from the classifier of the node identified by `uuid` in the payload, so the same endpoint serves both types. The
   * write is validated with the model in the same transaction.
   *
   * @param {string} uuid - UUID of the created node (not of its parent).
   * @param {ElementGraph} payload - The created node, and its relation to the parent unless it is created at top level.
   * @return {Promise<ElementResponse>} The created node as the only node, with the findings of the validation as
   * diagnostics.
   * @throws {ValidationError} If `uuid` is not a node of the payload.
   * @throws {NotFoundError} If the node could not be created.
   */
  public async createNode(uuid: string, payload: ElementGraph): Promise<ElementResponse> {
    const context = await ConfigService.getModelContext();

    if (!payload.nodes.some((node) => node.data?.uuid === uuid)) {
      throw new ValidationError(`Node with UUID ${uuid} not found in the payload.`);
    }

    const changes: NodeUpdateObject = toNodeChanges(context, payload);
    const { node, diagnostics } = await new WriteValidationService().write(context, changes, uuid);

    return { ...toElementResponse(context, [node]), diagnostics };
  }

  /**
   * Deletes nodes in one transaction, together with their whole PART_OF subtree (descendant Collections and Contents)
   * and every annotation owned via HAS_ANNOTATION by those nodes, including sub-annotations. An annotation that also has an owner
   * outside the deletion is kept, together with everything below it.
   * Unknown UUIDs are skipped instead of failing the batch, since a node may already be gone together with a deleted
   * parent (e.g. a Collection and its Content both selected in a tag listing).
   *
   * @param {string[]} uuids - The UUIDs of the nodes to delete.
   * @returns {Promise<string[]>} The UUIDs of the Collections and Contents that were actually deleted, including
   * cascaded descendants.
   */
  public async deleteNodes(uuids: string[]): Promise<string[]> {
    const query: string = `
      MATCH (root:Collection|Content)
      WHERE root.uuid IN $uuids

      // Strictly downwards along a PART_OF hierarchy
      CALL apoc.path.subgraphNodes(root, {
        relationshipFilter: '<PART_OF',
        labelFilter: '+Collection|+Content',
        maxLevel: -1
      }) YIELD node AS hierarchyNode

      WITH collect(DISTINCT hierarchyNode) AS hierarchyNodes

      // Candidates: all annotations owned by the hierarchy nodes, including sub-annotations
      CALL (hierarchyNodes) {
        UNWIND hierarchyNodes AS owner

        CALL apoc.path.subgraphNodes(owner, {
          relationshipFilter: 'HAS_ANNOTATION>',
          labelFilter: '+Annotation',
          minLevel: 1,
          maxLevel: -1
        }) YIELD node

        RETURN collect(DISTINCT node) AS candidates
      }

      // Shared roots: candidates that also have an owner which is not marked as deleted
      WITH hierarchyNodes, candidates, hierarchyNodes + candidates AS deletionSet
      WITH hierarchyNodes, candidates, [a IN candidates WHERE EXISTS {
        MATCH (owner)-[:HAS_ANNOTATION]->(a)
        WHERE NOT owner IN deletionSet
      }] AS sharedRoots

      // Shared roots and everything below them are kept
      CALL (sharedRoots) {
        UNWIND sharedRoots AS sharedRoot

        CALL apoc.path.subgraphNodes(sharedRoot, {
          relationshipFilter: 'HAS_ANNOTATION>',
          labelFilter: '+Annotation',
          maxLevel: -1
        }) YIELD node

        RETURN collect(DISTINCT node) AS kept
      }

      WITH hierarchyNodes, [a IN candidates WHERE NOT a IN kept] AS annotations, [n IN hierarchyNodes | n.uuid] AS deleted

      FOREACH (annotation IN annotations | DETACH DELETE annotation)
      FOREACH (node IN hierarchyNodes | DETACH DELETE node)

      RETURN deleted
      `;

    const result: QueryResult = await Neo4jDriver.runQuery(query, { uuids });

    const deleted: string[] = result.records[0]?.get("deleted") ?? [];

    return deleted;
  }
}
