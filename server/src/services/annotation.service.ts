import { QueryResult } from "neo4j-driver";
import Neo4jDriver from "../database/neo4j.js";
import { toNativeTypes } from "../utils/helper.js";
import { NodeDto } from "../models/types.js";
import InternalServerError from "../errors/server.error.js";

/* eslint-disable @typescript-eslint/no-unsafe-assignment -- db results can not be typed (only with assertion) which is too cumbersome for now */

interface FlatAnnotationTree {
  rootUuid: string;
  annotationNodes: AnnotationNodeRecord[];
  edges: AnnotationRecordEdge[];
}
type AnnotationNodeRecord = NodeDto;
interface AnnotationRecordEdge {
  startUuid: string;
  endUuid: string;
}

export default class AnnotationService {
  /**
   * Converts a flat annotation tree structure (as returned by the database) into a nested {@link NodeDto} tree.
   *
   * Each record contains all annotation nodes for one top-level annotation, the `HAS_ANNOTATION` edges between
   * them, and the `REFERS_TO` nodes already attached to each annotation. The method reconstructs the nesting
   * by building an adjacency map from the edges and recursing from the root UUID downward.
   *
   * The method is used to generate a nested annotation structure that can be easily consumed by the frontend.
   *
   * @param flatTrees - Flat annotation trees, one per top-level annotation.
   * @returns A nested {@link NodeDto} array representing the full annotation tree.
   */
  private buildAnnotationNodeTree(flatTrees: FlatAnnotationTree[]): NodeDto[] {
    return flatTrees.map((tree) => {
      const { rootUuid, annotationNodes, edges } = tree;

      const nodeMap = new Map<string, NodeDto>(annotationNodes.map((n) => [n.node.data.uuid, n]));
      const adjacency = new Map<string, string[]>();

      edges.forEach((edge: AnnotationRecordEdge) => {
        const children = adjacency.get(edge.startUuid) ?? [];
        children.push(edge.endUuid);
        adjacency.set(edge.startUuid, children);
      });

      const buildNestedDto = (uuid: string): NodeDto => {
        const root: NodeDto | undefined = nodeMap.get(uuid);

        if (!root) {
          throw new InternalServerError(`Annotation ${uuid} is referenced by an edge but missing from its tree`);
        }

        // Current root node
        const nodeData = {
          nodeLabels: root.node.nodeLabels,
          data: toNativeTypes(root.node.data),
        } as NodeDto["node"];

        // Create node data for children and traverse further into their children using the adjacency list
        const children = [
          ...root.connectedNodes.map((child: NodeDto) => ({
            node: toNativeTypes(child.node) as NodeDto["node"],
            connectedNodes: [],
          })),
          ...(adjacency.get(uuid) ?? []).map((n) => buildNestedDto(n)),
        ];

        return {
          node: nodeData,
          connectedNodes: children,
        };
      };

      return buildNestedDto(rootUuid);
    });
  }

  public async getAnnotations(nodeUuid: string): Promise<NodeDto[]> {
    const query: string = `
    MATCH (n:Content|Collection {uuid: $nodeUuid})-[:HAS_ANNOTATION]->(a:Annotation)

    // Traverse the HAS_ANNOTATION tree if it exists (it has an unknown depth)
    CALL apoc.path.subgraphAll(a, {
        relationshipFilter: 'HAS_ANNOTATION>',
        nodeFilter: 'Annotation',
        maxLevel: -1
    }) YIELD nodes, relationships

    // Store relationships for later
    WITH
        a,
        nodes,
        [rel IN relationships | {
            startUuid: startNode(rel).uuid,
            endUuid: endNode(rel).uuid
        }] AS edges

    // For each annotation node, get the directly via REFERS_TO connected nodes (Entity, Collection or Content)
    UNWIND nodes AS annotationNode
    OPTIONAL MATCH (annotationNode)-[:REFERS_TO]->(leaf:Entity|Collection|Content)

    WITH a, edges, annotationNode, collect(leaf) AS leaves

    WITH a, edges, collect({
        node: {nodeLabels: labels(annotationNode), data: annotationNode {.*}},
        connectedNodes: [l IN leaves | {
            node: { nodeLabels: labels(l), data: l {.*} },
            connectedNodes: []
        }]
    }) AS annotationNodes

    // Add flattened tree structure to result
    RETURN collect({
        rootUuid: a.uuid,
        annotationNodes: annotationNodes,
        edges: edges
    }) as annotations
    `;

    const result: QueryResult = await Neo4jDriver.runQuery(query, { nodeUuid });
    const annotations: FlatAnnotationTree[] = result.records[0].get("annotations");

    return this.buildAnnotationNodeTree(annotations);
  }
}
