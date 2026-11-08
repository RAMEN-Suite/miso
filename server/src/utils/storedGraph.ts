import type {
  BaseNodeData,
  ElementDiagnostic,
  ElementGraph,
  ElementNode,
  ElementRelation,
  ElementResponse,
  ModelAnnotationShape,
  ModelContext,
  NodeUpdateObject,
  RefResolution,
} from "../models/types.js";
import { fromStoredSelector, toNativeTypes } from "./helper.js";
import { ELEMENT_DIAGNOSTIC_CODE } from "./instanceMapper.js";
import {
  familyRefOf,
  findShape,
  getBaseNodeRef,
  resolveClassifierRef,
  resolveRelationRef,
  resolveShapeRef,
} from "./modelHelper.js";
import { BASE_NODE_REF } from "./ramen.js";

/**
 * A graph by its stored names (labels, relationship types, annotation `type`), as loaded from the database and changed
 * by a write, and its conversion to the element format with the names resolved to model refs.
 *
 * @packageDocumentation
 */

/** A node by its stored names, with native values */
export interface StoredGraphNode {
  nodeLabels: string[];
  data: BaseNodeData & Record<string, unknown>;
}

/** A relationship by its stored type */
export interface StoredGraphRelation {
  type: string;
  /** uuid of the start node */
  from: string;
  /** uuid of the end node */
  to: string;
}

/** Nodes by uuid, relationships by {@linkcode relationKey} */
export interface StoredGraph {
  nodes: Map<string, StoredGraphNode>;
  relations: Map<string, StoredGraphRelation>;
}

/** A finding of the resolution, with the nodes it concerns (a relation's finding concerns both ends) */
export interface ResolutionFinding {
  diagnostic: ElementDiagnostic;
  uuids: string[];
}

/** The relationship type that connects an annotation to the node it annotates (a RAMEN base relation) */
const HAS_ANNOTATION = "HAS_ANNOTATION";

/**
 * The key of a relationship. Relationships have no id: the ends and the type identify them.
 *
 * @param {StoredGraphRelation} relation - The relationship.
 * @returns {string} `<from>|<type>|<to>`.
 */
export function relationKey(relation: StoredGraphRelation): string {
  return `${relation.from}|${relation.type}|${relation.to}`;
}

/**
 * Applies the changes of a write to a graph, in the order the write query runs them: delete (with the relationships
 * of the deleted nodes), create, update, remove, attach.
 *
 * @param {StoredGraph} graph - The graph, changed in place.
 * @param {NodeUpdateObject} changes - The changes, with plain values (before the conversion to Neo4j types).
 */
export function applyChanges(graph: StoredGraph, changes: NodeUpdateObject): void {
  const deletedUuids = new Set<string>(changes.delete.map((node) => uuidOf(node.data)));

  for (const uuid of deletedUuids) {
    graph.nodes.delete(uuid);
  }

  for (const [key, relation] of graph.relations) {
    if (deletedUuids.has(relation.from) || deletedUuids.has(relation.to)) {
      graph.relations.delete(key);
    }
  }

  for (const node of [...changes.create, ...changes.update]) {
    const data = node.data as BaseNodeData & Record<string, unknown>;

    graph.nodes.set(data.uuid, { nodeLabels: node.nodeLabels, data });
  }

  for (const edge of changes.remove) {
    graph.relations.delete(relationKey({ type: edge.type, from: edge.startUuid, to: edge.endUuid }));
  }

  for (const edge of changes.attach) {
    const relation: StoredGraphRelation = { type: edge.type, from: edge.startUuid, to: edge.endUuid };

    graph.relations.set(relationKey(relation), relation);
  }
}

/**
 * The nodes a write touches: created and updated nodes, and both ends of removed and attached relationships, except
 * deleted nodes.
 *
 * @param {NodeUpdateObject} changes - The changes of the write.
 * @returns {Set<string>} The uuids.
 */
export function touchedUuids(changes: NodeUpdateObject): Set<string> {
  const deletedUuids = new Set<string>(changes.delete.map((node) => uuidOf(node.data)));
  const uuids = new Set<string>([
    ...[...changes.create, ...changes.update].map((node) => uuidOf(node.data)),
    ...[...changes.remove, ...changes.attach].flatMap((edge) => [edge.startUuid, edge.endUuid]),
  ]);

  return new Set<string>([...uuids].filter((uuid) => !deletedUuids.has(uuid)));
}

/** A node as the queries return it: its properties as stored (with Neo4j types) and its labels */
export interface StoredNodeRecord {
  data: object;
  nodeLabels: string[];
}

/**
 * Adds a node from a query result with native values (a selector stored as JSON string parsed, see
 * `fromStoredSelector`), unless it is already in the graph.
 *
 * @param {StoredGraph} graph - The graph, changed in place.
 * @param {StoredNodeRecord} record - The node as the query returned it.
 */
export function addStoredNode(graph: StoredGraph, record: StoredNodeRecord): void {
  const uuid: string = uuidOf(record.data);

  if (!graph.nodes.has(uuid)) {
    const data = fromStoredSelector(toNativeTypes(record.data) as Record<string, unknown>) as StoredGraphNode["data"];

    graph.nodes.set(uuid, { nodeLabels: record.nodeLabels, data });
  }
}

/**
 * Adds a relationship.
 *
 * @param {StoredGraph} graph - The graph, changed in place.
 * @param {StoredGraphRelation} relation - The relationship.
 */
export function addStoredRelation(graph: StoredGraph, relation: StoredGraphRelation): void {
  graph.relations.set(relationKey(relation), relation);
}

/** The uuid of a node's data */
function uuidOf(data: object): string {
  return (data as BaseNodeData).uuid;
}

/**
 * Converts a graph to the element format: classifiers resolved from the labels, annotations resolved from their carrier
 * and `type` (along the chain of carriers for annotations on annotations), relations from the classifiers of their ends
 * and their type. Unresolvable names give `classifierRef: null` or `relationRef: null`, with a finding; nothing is left
 * out, so reads show the stored data as it is. The stored labels are kept in `nodeLabels`.
 *
 * @param {ModelContext} context - The model context.
 * @param {StoredGraph} graph - The graph.
 * @returns {{ elements: ElementGraph; findings: ResolutionFinding[] }} The elements and the findings of the resolution.
 */
export function toElementGraph(
  context: ModelContext,
  graph: StoredGraph,
): { elements: ElementGraph; findings: ResolutionFinding[] } {
  const findings: ResolutionFinding[] = [];
  const carrierOf = new Map<string, string>();
  const resolved = new Map<string, ElementNode>();

  for (const relation of graph.relations.values()) {
    if (relation.type === HAS_ANNOTATION && graph.nodes.has(relation.from)) {
      carrierOf.set(relation.to, relation.from);
    }
  }

  /** Resolves a node, and before an annotation its carrier. `visiting` guards against cycles of annotations. */
  function resolve(uuid: string, visiting: Set<string>): ElementNode {
    const known: ElementNode | undefined = resolved.get(uuid);

    if (known) {
      return known;
    }

    const node: StoredGraphNode = graph.nodes.get(uuid)!;
    const labelResolution: RefResolution = resolveClassifierRef(context, node.nodeLabels);
    let element: ElementNode;
    let problem: string | undefined = labelResolution.problem;

    if (labelResolution.ref && getBaseNodeRef(context, labelResolution.ref) === BASE_NODE_REF.Annotation) {
      const carrierUuid: string | undefined = carrierOf.get(uuid);
      const carrierRef: string | null =
        carrierUuid && !visiting.has(carrierUuid)
          ? resolve(carrierUuid, new Set([...visiting, uuid])).classifierRef
          : null;
      const type: unknown = node.data.type;
      let shapeResolution: RefResolution;

      if (typeof type !== "string") {
        shapeResolution = { ref: null, problem: "The annotation has no type" };
      } else if (!carrierRef) {
        shapeResolution = { ref: null, problem: `Annotation type "${type}" without a carrier that can be resolved` };
      } else {
        shapeResolution = resolveShapeRef(context, carrierRef, type);
      }

      const shape: ModelAnnotationShape | undefined = shapeResolution.ref ? findShape(context, shapeResolution.ref) : undefined;

      element = {
        classifierRef: shape ? familyRefOf(shape) : null,
        shapeRef: shapeResolution.ref,
        nodeLabels: node.nodeLabels,
        data: node.data,
      };
      problem = shapeResolution.problem;
    } else {
      element = { classifierRef: labelResolution.ref, nodeLabels: node.nodeLabels, data: node.data };
    }

    if (problem) {
      findings.push({
        diagnostic: { severity: "error", code: ELEMENT_DIAGNOSTIC_CODE.NODE_TYPE_UNRESOLVED, message: problem, uuid },
        uuids: [uuid],
      });
    }

    resolved.set(uuid, element);

    return element;
  }

  const nodes: ElementNode[] = [...graph.nodes.keys()].map((uuid) => resolve(uuid, new Set()));
  const relations: ElementRelation[] = [];

  for (const relation of graph.relations.values()) {
    const fromRef: string | null | undefined = resolved.get(relation.from)?.classifierRef;
    const toRef: string | null | undefined = resolved.get(relation.to)?.classifierRef;

    // An end that couldn't be resolved already has its finding
    if (!fromRef || !toRef) {
      relations.push({ relationRef: null, from: relation.from, to: relation.to });
      continue;
    }

    const resolution: RefResolution = resolveRelationRef(context, fromRef, relation.type, toRef);

    relations.push({ relationRef: resolution.ref, from: relation.from, to: relation.to });

    if (!resolution.ref) {
      findings.push({
        diagnostic: {
          severity: "error",
          code: ELEMENT_DIAGNOSTIC_CODE.RELATION_NOT_ALLOWED,
          message: `${resolution.problem} (from ${relation.from} to ${relation.to})`,
          uuid: relation.from,
        },
        uuids: [relation.from, relation.to],
      });
    }
  }

  return { elements: { nodes, relations }, findings };
}

/**
 * Builds a read response in the element format from query results: the nodes in the order given (duplicates once), the
 * relations, and the findings of resolving them as diagnostics. The format of every read that returns nodes.
 *
 * @param {ModelContext} context - The model context.
 * @param {StoredNodeRecord[]} records - The nodes as the query returned them; listings keep this order.
 * @param {StoredGraphRelation[]} [relations] - The relationships between them, e.g. `PART_OF` along an ancestry.
 * @returns {ElementResponse} The response.
 */
export function toElementResponse(
  context: ModelContext,
  records: StoredNodeRecord[],
  relations: StoredGraphRelation[] = [],
): ElementResponse {
  const graph: StoredGraph = { nodes: new Map(), relations: new Map() };

  for (const record of records) {
    addStoredNode(graph, record);
  }

  for (const relation of relations) {
    addStoredRelation(graph, relation);
  }

  const { elements, findings } = toElementGraph(context, graph);

  return { ...elements, diagnostics: findings.map((finding) => finding.diagnostic) };
}
