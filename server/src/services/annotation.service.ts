import { QueryResult } from "neo4j-driver";
import Neo4jDriver from "../database/neo4j.js";
import { ElementResponse, ModelContext } from "../models/types.js";
import ConfigService from "./config.service.js";
import { StoredGraphRelation, StoredNodeRecord, toElementResponse } from "../utils/storedGraph.js";
import { findShape } from "../utils/modelHelper.js";
import ValidationError from "../errors/validation.error.js";

/**
 * The `type` the annotations of an annotation shape are stored with.
 *
 * @param {ModelContext} context - The model context.
 * @param {string} shapeRef - The qualified ref of the shape.
 * @returns {string} The type.
 * @throws {ValidationError} If the model has no shape with this ref.
 */
function typeOfShape(context: ModelContext, shapeRef: string): string {
  const type: string | undefined = findShape(context, shapeRef)?.type;

  if (type === undefined) {
    throw new ValidationError(`Unknown annotation shape: ${shapeRef}`);
  }

  return type;
}

export default class AnnotationService {
  /**
   * Retrieves the annotations of a Content or Collection node in the element format: the annotations, their nested
   * annotations and the nodes they refer to, and the relations between them, starting with the `HAS_ANNOTATION`
   * relations from the annotated node (which is only part of `nodes` if an annotation refers to it). Referenced nodes appear once, however many
   * annotations refer to them; their own annotations are not included.
   *
   * The refs are resolved like on writes (`toElementGraph`): an annotation's shape from its carrier and `type`.
   * Unresolvable data never fails the read: it gets `null` refs and a diagnostic.
   *
   * @param {string} nodeUuid - The UUID of the annotated node.
   * @param {object} [options] - Optional filters.
   * @param {string[]} [options.shapes] - Only top-level annotations of these annotation shapes (refs), matched by their
   *   stored `type`. All if omitted.
   * @return {Promise<ElementResponse>} The nodes, relations and diagnostics. Empty if the node has no annotations.
   * @throws {ValidationError} If a shape ref is not in the model.
   */
  public async getAnnotations(nodeUuid: string, options: { shapes?: string[] } = {}): Promise<ElementResponse> {
    const context: ModelContext = await ConfigService.getModelContext();
    const types: string[] | null = options.shapes ? options.shapes.map((ref: string) => typeOfShape(context, ref)) : null;

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
        {properties: n {.*}, nodeLabels: labels(n)} AS carrier,
        [x IN annotations + leaves | {properties: x {.*}, nodeLabels: labels(x)}] AS nodes,
        [t IN topLevel | {type: 'HAS_ANNOTATION', from: n.uuid, to: t.uuid}]
            + [rel IN references + nested | {type: type(rel), from: startNode(rel).uuid, to: endNode(rel).uuid}] AS relations
    `;

    const result: QueryResult = await Neo4jDriver.runQuery(query, { nodeUuid, types });
    const record = result.records[0];

    if (!record) {
      return { nodes: [], relations: [], diagnostics: [] };
    }

    // The carrier decides the annotation shapes of the top-level annotations, so it is resolved too
    const response: ElementResponse = toElementResponse(
      context,
      [record.get("carrier") as StoredNodeRecord, ...(record.get("nodes") as StoredNodeRecord[])],
      record.get("relations") as StoredGraphRelation[],
    );
    // The annotated node is only listed if an annotation refers back to it
    const targetUuids = new Set<string>(response.relations.map((relation) => relation.to));

    return {
      ...response,
      nodes: response.nodes.filter((node) => node.properties.uuid !== nodeUuid || targetUuids.has(nodeUuid)),
    };
  }
}
