import { QueryResult } from "neo4j-driver";
import Neo4jDriver from "../database/neo4j.js";
import { toNativeTypes } from "../utils/helper.js";
import { AnnotationNode, NodeDto, PropertyConfig } from "../models/types.js";
import { IGuidelines } from "../models/IGuidelines.js";
import InternalServerError from "../errors/server.error.js";
import ValidationError from "../errors/validation.error.js";
import { validatePropertyValue } from "../utils/propertyValidation.js";
import GuidelinesService from "./guidelines.service.js";

/* eslint-disable @typescript-eslint/no-unsafe-assignment -- db results can not be typed (only with assertion) which is too cumbersome for now */

/** Annotation properties derived from the annotation type and range, checked separately from the configured values */
const DERIVED_ANNOTATION_PROPERTIES: string[] = ["type", "text"];

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
   * Checks an Annotation of a text: configured type, valid property values and a range (inclusive end index, so an
   * empty range ends one before its start) inside the text whose covered characters equal the annotation's `text`.
   *
   * @param {AnnotationNode} annotation - The Annotation node to check.
   * @param {string} text - The text of the annotated Content.
   * @param {IGuidelines} guidelines - The guidelines to check against.
   * @returns {void} This function does not return any value.
   * @throws {ValidationError} If the Annotation is not valid according to the guidelines.
   */
  public checkTextAnnotationValidity(annotation: AnnotationNode, text: string, guidelines: IGuidelines): void {
    const { type, startIndex, endIndex } = annotation.data;

    if (!guidelines.contents.annotations.types.some((config) => config.type === type)) {
      throw new ValidationError(`"${type}" is not an annotation type for texts.`);
    }

    this.checkProperties(annotation, new GuidelinesService().getAnnotationConfigFieldsFromGuidelines(guidelines, type));

    const isInsideText: boolean =
      Number.isInteger(startIndex) &&
      Number.isInteger(endIndex) &&
      startIndex >= 0 &&
      endIndex >= startIndex - 1 &&
      endIndex < text.length;

    if (!isInsideText) {
      throw new ValidationError(`The "${type}" annotation lies outside of the text.`);
    }

    if (annotation.data.text !== text.slice(startIndex, endIndex + 1)) {
      throw new ValidationError(`The "${type}" annotation does not match the text it covers.`);
    }
  }

  /**
   * Checks an Annotation of a Collection: the type must be available for the Collection's labels and the property
   * values must be valid.
   *
   * @param {AnnotationNode} annotation - The Annotation node to check.
   * @param {string[]} collectionLabels - The node labels of the annotated Collection.
   * @param {IGuidelines} guidelines - The guidelines to check against.
   * @returns {void} This function does not return any value.
   * @throws {ValidationError} If the Annotation is not valid according to the guidelines.
   */
  public checkCollectionAnnotationValidity(
    annotation: AnnotationNode,
    collectionLabels: string[],
    guidelines: IGuidelines,
  ): void {
    const guidelineService: GuidelinesService = new GuidelinesService();
    const type: string = annotation.data.type;

    const isAvailable: boolean = guidelineService
      .getCollectionAnnotationTypesFromGuidelines(guidelines, collectionLabels)
      .some((config) => config.type === type);

    if (!isAvailable) {
      throw new ValidationError(`"${type}" is not an annotation type for this Collection.`);
    }

    this.checkProperties(
      annotation,
      guidelineService.getCollectionAnnotationConfigFieldsFromGuidelines(guidelines, collectionLabels, type),
    );
  }

  /**
   * Checks the configured property values of an Annotation, except the derived ones.
   *
   * @param {AnnotationNode} annotation - The Annotation node to check.
   * @param {PropertyConfig[]} fields - The property configs of the annotation type.
   * @returns {void} This function does not return any value.
   * @throws {ValidationError} If a value doesn't match its config.
   */
  private checkProperties(annotation: AnnotationNode, fields: PropertyConfig[]): void {
    fields
      .filter((field: PropertyConfig) => !DERIVED_ANNOTATION_PROPERTIES.includes(field.name))
      .forEach((field: PropertyConfig) => validatePropertyValue(annotation.data[field.name], field));
  }

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
