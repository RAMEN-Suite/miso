import { int, QueryResult } from "neo4j-driver";
import Neo4jDriver from "../database/neo4j.js";
import NotFoundError from "../errors/notFound.error.js";
import ValidationError from "../errors/validation.error.js";
import { orderDirection } from "../utils/cypher.js";
import { toNativeTypes, valueToNativeType } from "../utils/helper.js";
import { CURSOR_VERSION, encodeCursor, HierarchyCursor } from "../utils/cursor.js";
import { flattenNodeTree, buildSubgraphUpdateQuery } from "../utils/nodeUpdate.js";
import GuidelinesService from "./guidelines.service.js";
import { buildFilterCypher, datatypeOf, SORT_KEY_MAX_LENGTH, targetExpression } from "../utils/filter.js";
import {
  FilterSpec,
  FilterTarget,
  HierarchyNode,
  HierarchyScope,
  NodeAncestry,
  NodeDto,
  NodeStatusObject,
  NodeUpdateObject,
  PaginationResult,
  PropertyConfig,
  PropertyConfigDataType,
} from "../models/types.js";

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call 
-- db results can not be typed (only with assertion) which is too cumbersome for now
 */

/** Base RAMEN labels — everything else on a node counts as an "additional" (domain) label. */
const BASE_LABELS: string[] = ["Annotation", "Character", "Collection", "Entity", "Content"];

export interface HierarchyListOptions {
  filters: FilterSpec;
  sort: FilterTarget;
  order: "asc" | "desc";
  limit: number;
  cursor: HierarchyCursor | null;
  /** Signature of the active scope + sort + filter spec, stamped into the produced nextCursor. */
  signature: string;
  /** Guidelines-derived property allowlist, already used to validate `filters` and `sort`. */
  properties: Map<string, PropertyConfig>;
}

/**
 * Service for reading and validating the Collection/Content hierarchy. Serves the column view today
 * and the planned directory / tree views with the same endpoints.
 */
export default class HierarchyService {
  /**
   * Creates the Cypher statement used for the sort key in the final query
   *
   * Dates are wrapped in `toString()`. This is because the cursor stores the sort value of the
   * last row in JSON format — which has no date type. Therefore, the comparison value also must be
   * a string to compare lexicographically. Otherwise, paging would break.
   *
   * @param {FilterTarget} sort - The validated sort target.
   * @param {PropertyConfigDataType} datatype - The datatype the target compares as.
   * @returns {string} A Cypher expression evaluating to the node's sort value.
   * @example
   * // Sorting by a node's "status" property:
   * {
   *   kind: "property",
   *   field: "status"
   * }
   *
   * // returns:
   *
   * `n.status`
   *
   * // and will be used in the final query as:
   *
   * `WITH n.status AS sortValue
   *  ...
   *  ORDER BY sortValue`
   */
  private sortValueExpression(sort: FilterTarget, datatype: PropertyConfigDataType): string {
    const expression: string = targetExpression(sort);
    const isTemporal: boolean = datatype === "date" || datatype === "date-time" || datatype === "time";

    return isTemporal ? `toString(${expression})` : expression;
  }

  /**
     * Retrieves the ancestry of a `Content` or `Collection` node with the given UUID.
     *
     * The ancestry is the path from the root node (the top-most `Collection` node)
     * to the given node via outgoing `PART_OF` relationships. This is used to determine a node's position in the Collection/Content
     * hierarchy and create breadcrumb-like visualization and navigation in the frontend.
  
     * Contrary to earlier versions, the ancestry can now only consist of `Collection`/`Content` via outgoing `PART_OF` relationships.
     * The earlier approach included `HAS_ANNOTATION` and `REFERS_TO` relationships together with all other nodes,
     * but this lead to circular matches and will likely not be used in the editor anyway.
     *
     * @param {string} uuid - The UUID of the node to retrieve the ancestry for.
     * @return {Promise<NodeAncestry[]>} A promise that resolves to an array of node ancestries. Each node ancestry
     * is an array of node objects..
     */
  public async getAncestry(uuid: string): Promise<NodeAncestry[]> {
    // TODO: maxLevel 50 should be enough, but change maybe?
    // TODO: What if circular matches happen? uniqueness should filter that
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
  
        // Reverse path so that the top node of the hierarchy comes first
        WITH reverse(tail(nodes(path))) as pathNodes
  
        RETURN collect([
            n IN pathNodes | {
                node: {
                    nodeLabels: labels(n), 
                    data: n {.*}
                },
                connectedNodes: []
            }
        ]) as paths
      `;

    const result: QueryResult = await Neo4jDriver.runQuery(query, { uuid });
    const paths: NodeAncestry[] = result.records[0]?.get("paths");

    // Data need to be tranformed to native types, too, even without the possibility of editing them
    const mapped: NodeAncestry[] = paths.map((path) =>
      path.map((pathElement: NodeDto) => {
        return {
          ...pathElement,
          node: {
            nodeLabels: pathElement.node.nodeLabels,
            data: toNativeTypes(pathElement.node.data),
          },
        };
      }),
    ) as NodeAncestry[];

    return mapped;
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
      case "top": {
        return `MATCH (n:Collection|Content) WHERE NOT EXISTS { (:Collection)<-[:PART_OF]-(n) }`;
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
   * {@link HierarchyScope}: a Collection's direct children, the top of the hierarchy, or an
   * explicit set of uuids (a client-side tag, whose nodes may sit anywhere in the graph).
   *
   * Everything but the scope is identical across the three: Collections always sort before
   * Contents (Finder-style); within each group the nodes sort by the requested target (the distinct
   * property by default), tie-broken by uuid; pagination is keyset (cursor) based.
   *
   * @param {HierarchyScope} scope - Which set of nodes to list.
   * @param {HierarchyListOptions} options - Filter, sort, limit and cursor parameters.
   * @return {Promise<PaginationResult<NodeDto<HierarchyNode>[]>>} A page of nodes plus pagination info.
   */
  public async listNodes(
    scope: HierarchyScope,
    options: HierarchyListOptions,
  ): Promise<PaginationResult<NodeDto<HierarchyNode>[]>> {
    const { filters, sort, order, limit, cursor, signature, properties } = options;

    // `search` in the pagination payload is a legacy field the client does not read for hierarchy
    // listings; the free-text rule (if any) is the `distinct` one
    // TODO: Remove search legacy from here and all pagination data occurences
    const search: string = JSON.stringify(filters.find((rule) => rule.target.kind === "distinct")?.conditions[0]?.value ?? "");

    // An empty uuid scope can only ever yield an empty page -> skip db query
    if (scope.kind === "uuids" && scope.uuids.length === 0) {
      return {
        data: [],
        pagination: { limit, order, search, totalRecords: 0, nextCursor: null },
      };
    }

    const op: "<" | ">" = orderDirection(order);
    const sortValue: string = this.sortValueExpression(sort, datatypeOf(sort, properties));
    const scopeMatch: string = this.scopeMatchClause(scope);

    const { clause: filterClause, params: filterParams } = buildFilterCypher(filters, properties);

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
          connectedNodes: [],
          groupRank: groupRank,
          sortValue: sortValue
      }) AS children
    `;

    const queryParams = {
      ...(scope.kind === "children" && { parentUuid: scope.parentUuid }),
      ...(scope.kind === "uuids" && { uuids: scope.uuids }),
      ...filterParams,
      baseLabels: BASE_LABELS,
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
      node: { nodeLabels: string[]; data: Record<string, any> };
      groupRank: number;
      sortValue: unknown;
    }[] = dataResult.records[0]?.get("children") ?? [];

    const hasMore: boolean = rawChildren.length > limit;
    const pageRows = hasMore ? rawChildren.slice(0, limit) : rawChildren;

    // The query already returns each child in NodeDto shape; only native-type conversion is left
    const data: NodeDto<HierarchyNode>[] = pageRows.map((c) => ({
      node: toNativeTypes(c.node) as HierarchyNode,
      connectedNodes: [],
    }));

    let nextCursor: string | null = null;

    if (hasMore && pageRows.length > 0) {
      const last = pageRows[pageRows.length - 1];

      const cursorObject: HierarchyCursor = {
        v: CURSOR_VERSION,
        g: last.groupRank,
        k: [valueToNativeType(last.sortValue)],
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
   * Validates a hierarchy path given as an ordered list of UUIDs (root first, focused node last).
   *
   * A valid path starts at a top-level node, follows `PART_OF` child edges, and matches the given
   * UUID sequence exactly. Only the **last** node may be a Content (Contents are leaves); every
   * earlier node must be a Collection.
   *
   * @param {string[]} uuids - The ordered UUIDs of the path (root first).
   * @return {Promise<NodeDto<HierarchyNode>[]>} The validated path as node DTOs with full labels.
   * @throws {NotFoundError} If the path does not exist or violates the leaf/ordering rules.
   */
  public async validatePath(uuids: string[]): Promise<NodeDto<HierarchyNode>[]> {
    if (!uuids || uuids.length === 0) {
      return [];
    }

    const query: string = `
    UNWIND $uuids as uuid
    MATCH (c:Collection|Content {uuid: uuid})
    WITH collect(c) as allowlistNodes

    MATCH (first:Collection|Content {uuid: $uuids[0]})
    WHERE NOT EXISTS { (first)-[:PART_OF]->(:Collection) }

    CALL apoc.path.expandConfig(first, {
        relationshipFilter: '<PART_OF',
        allowlistNodes: allowlistNodes
    }) YIELD path

    WITH collect(path)[-1] as longestPath
    WITH longestPath, nodes(longestPath) AS ns

    // UUID sequence must match exactly, and every node but the last must be a Collection
    WHERE [x in ns | x.uuid] = $uuids
      AND all(i IN range(0, size(ns) - 2) WHERE ns[i]:Collection)

    RETURN [n in ns | {
        data: n {.*},
        nodeLabels: labels(n)
    }] as path
    `;

    const result: QueryResult = await Neo4jDriver.runQuery(query, { uuids });
    const nodes: HierarchyNode[] = result.records[0]?.get("path");

    if (!nodes) {
      throw new NotFoundError(`The requested path [${uuids}] does not exist`);
    }

    return nodes.map((n) => ({
      node: {
        nodeLabels: n.nodeLabels,
        data: toNativeTypes(n.data),
      } as HierarchyNode,
      connectedNodes: [],
    }));
  }

  /**
   * Creates a new hierarchy node (Collection or Content) and returns it.
   * Generalises the old `createOrAddCollection`: the root node label is derived from the labels
   * of the node identified by `uuid` within the payload tree, so the same endpoint serves both
   * types. Everything downstream (`flattenNodeTree`, relationship inference) is already type-agnostic.
   *
   * @param {string} uuid - UUID of the created/added node (the tree's operative node, not the parent).
   * @param {NodeStatusObject} data - Ownership tree (the parent as root with the new node attached,
   *   or the new node itself when created at top level).
   * @return {Promise<NodeDto<HierarchyNode>>} The created/added node.
   * @throws {ValidationError} If `uuid` is not present in the payload tree.
   * @throws {NotFoundError} If the node could not be created/added.
   */
  public async createNode(uuid: string, data: NodeStatusObject): Promise<NodeDto<HierarchyNode>> {
    const guidelineService: GuidelinesService = new GuidelinesService();
    const guidelines = await guidelineService.getGuidelines();

    const targetLabels: string[] | null = this.findNodeLabels(data, uuid);

    if (!targetLabels) {
      throw new ValidationError(`Node with UUID ${uuid} not found in the payload.`);
    }

    const rootLabel: "Collection" | "Content" = targetLabels.includes("Content") ? "Content" : "Collection";

    const flatNodeTree: NodeUpdateObject = flattenNodeTree(data, guidelines);
    const query: string = buildSubgraphUpdateQuery(rootLabel);

    const result: QueryResult = await Neo4jDriver.runQuery(query, {
      uuid,
      delete: flatNodeTree.delete,
      create: flatNodeTree.create,
      update: flatNodeTree.update,
      remove: flatNodeTree.remove,
      attach: flatNodeTree.attach,
    });

    const createdOrAddedNode: HierarchyNode = result.records[0]?.get("node");

    if (!createdOrAddedNode) {
      throw new NotFoundError(`Could not add/create node with UUID ${uuid}`);
    }

    return {
      node: toNativeTypes(createdOrAddedNode) as HierarchyNode,
      connectedNodes: [],
    };
  }

  public async deleteNode(uuid: string): Promise<NodeDto<HierarchyNode>> {
    const query: string = `
      MATCH (n:Collection|Content {uuid: $uuid})
  
      WITH n, {
          nodeLabels: labels(n),
          data: n {.*}
      } AS nodeToDelete
  
      // Delete annotations
      CALL (n) {
          OPTIONAL MATCH (n)-[:HAS_ANNOTATION]->(a:Annotation)
          DETACH DELETE a
      }
  
      // Delete contents, characters, and annotations
      CALL (n) {
          OPTIONAL MATCH (n)<-[:PART_OF]-(content:Content)
          
          OPTIONAL MATCH (content)-[:HAS_ANNOTATION]->(a:Annotation)
          OPTIONAL MATCH (content)-[:NEXT_CHARACTER*]->(ch:Character)
  
          DETACH DELETE content, a, ch
      }
  
      // Delete node
      DETACH DELETE n
  
      RETURN nodeToDelete as node
      `;

    const result: QueryResult = await Neo4jDriver.runQuery(query, { uuid });
    const deletedNode: HierarchyNode = result.records[0]?.get("node");

    if (!deletedNode) {
      throw new NotFoundError(`Node with UUID ${uuid} not found`);
    }

    return {
      node: toNativeTypes(deletedNode) as HierarchyNode,
      connectedNodes: [],
    };
  }

  /**
   * Depth-first search for the node with the given UUID inside a {@link NodeStatusObject} tree,
   * returning its labels.
   *
   * @param {NodeStatusObject} node - The current tree node.
   * @param {string} uuid - The UUID to look for.
   * @return {string[] | null} The matching node's labels, or null if not found.
   */
  private findNodeLabels(node: NodeStatusObject, uuid: string): string[] | null {
    if (node.node.data.uuid === uuid) {
      return node.node.nodeLabels;
    }

    for (const child of node.connectedNodes) {
      const found: string[] | null = this.findNodeLabels(child, uuid);

      if (found) {
        return found;
      }
    }

    return null;
  }
}
