import { QueryResult } from "neo4j-driver";
import Neo4jDriver from "../database/neo4j.js";
import { ElementGraph, ElementResponse, ModelContext } from "../models/types.js";
import ConfigService from "./config.service.js";
import {
  addStoredNode,
  addStoredRelation,
  ResolutionFinding,
  StoredGraph,
  StoredGraphRelation,
  StoredNodeRecord,
  toElementGraph,
} from "../utils/storedGraph.js";

/* eslint-disable @typescript-eslint/no-unsafe-assignment -- db results can not be typed (only with assertion) which is too cumbersome for now */

export default class AnnotationService {
  /**
   * Retrieves the annotations of a Content or Collection node in the element format: the annotations, their nested
   * annotations and the nodes they refer to, and the relations between them, starting with the `HAS_ANNOTATION`
   * relations from the annotated node (which is only part of `nodes` if an annotation refers to it). Referenced nodes appear once, however many
   * annotations refer to them; their own annotations are not included.
   *
   * The refs are resolved like on writes (`utils/storedGraph.ts`): an annotation's shape from its carrier and `type`.
   * Unresolvable data never fails the read: it gets `null` refs and a diagnostic.
   *
   * @param {string} nodeUuid - The UUID of the annotated node.
   * @param {object} [options] - Optional filters.
   * @param {string[]} [options.types] - Only top-level annotations of these types. All types if omitted.
   * @return {Promise<ElementResponse>} The nodes, relations and diagnostics. Empty if the node has no annotations.
   */
  public async getAnnotations(nodeUuid: string, options: { types?: string[] } = {}): Promise<ElementResponse> {
    const query: string = `
    MATCH (n:Content|Collection {uuid: $nodeUuid})-[:HAS_ANNOTATION]->(a:Annotation)
    WHERE $types IS NULL OR a.type IN $types

    // Traverse the HAS_ANNOTATION tree if it exists (it has an unknown depth)
    CALL apoc.path.subgraphAll(a, {
        relationshipFilter: 'HAS_ANNOTATION>',
        nodeFilter: 'Annotation',
        maxLevel: -1
    }) YIELD nodes, relationships

    WITH
        n,
        collect(a) AS topLevel,
        apoc.coll.toSet(apoc.coll.flatten(collect(nodes))) AS annotations,
        apoc.coll.toSet(apoc.coll.flatten(collect(relationships))) AS nested

    // The nodes the annotations refer to (Entity, Collection or Content)
    UNWIND annotations AS annotation
    OPTIONAL MATCH (annotation)-[r:REFERS_TO]->(leaf:Entity|Collection|Content)

    WITH n, topLevel, annotations, nested, collect(DISTINCT leaf) AS leaves, collect(r) AS references

    RETURN
        {data: n {.*}, nodeLabels: labels(n)} AS carrier,
        [x IN annotations + leaves | {data: x {.*}, nodeLabels: labels(x)}] AS nodes,
        [t IN topLevel | {type: 'HAS_ANNOTATION', from: n.uuid, to: t.uuid}]
            + [rel IN references + nested | {type: type(rel), from: startNode(rel).uuid, to: endNode(rel).uuid}] AS relations
    `;

    const [result, context]: [QueryResult, ModelContext] = await Promise.all([
      Neo4jDriver.runQuery(query, { nodeUuid, types: options.types ?? null }),
      ConfigService.getModelContext(),
    ]);
    const record = result.records[0];

    if (!record) {
      return { nodes: [], relations: [], diagnostics: [] };
    }

    const carrier: StoredNodeRecord = record.get("carrier");
    const graph: StoredGraph = { nodes: new Map(), relations: new Map() };

    // The carrier decides the annotation shapes of the top-level annotations, so it is resolved too
    for (const node of [carrier, ...(record.get("nodes") as StoredNodeRecord[])]) {
      addStoredNode(graph, node);
    }

    for (const relation of record.get("relations") as StoredGraphRelation[]) {
      addStoredRelation(graph, relation);
    }

    const { elements, findings }: { elements: ElementGraph; findings: ResolutionFinding[] } = toElementGraph(context, graph);
    // The annotated node is only listed if an annotation refers back to it
    const targetUuids = new Set<string>(elements.relations.map((relation) => relation.to));

    return {
      nodes: elements.nodes.filter((node) => node.data.uuid !== nodeUuid || targetUuids.has(nodeUuid)),
      relations: elements.relations,
      diagnostics: findings.map((finding) => finding.diagnostic),
    };
  }
}
