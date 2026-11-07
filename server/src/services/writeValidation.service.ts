import Neo4jDriver from "../database/neo4j.js";
import ValidationError from "../errors/validation.error.js";
import logger from "../logger.js";
import type { BaseNodeData, ElementDiagnostic, ModelContext, NodeUpdateObject } from "../models/types.js";
import { ELEMENT_DIAGNOSTIC_CODE, validateElements } from "../utils/instanceMapper.js";
import {
  addStoredNode,
  addStoredRelation,
  applyChanges,
  ResolutionFinding,
  StoredGraph,
  StoredGraphRelation,
  StoredNodeRecord,
  toElementGraph,
  touchedUuids,
} from "../utils/storedGraph.js";

/* eslint-disable @typescript-eslint/no-unsafe-assignment -- db results can not be typed (only with assertion) which is too cumbersome for now */

/**
 * How findings of a write are handled (env `VALIDATION_MODE`): `report` logs and returns them and saves anyway,
 * `enforce` rejects writes with errors. `report` until the data of the projects is migrated.
 */
type ValidationMode = "report" | "enforce";

/** The longest chain of annotations on annotations that is followed to find the carrier of an annotation */
const MAX_CARRIER_CHAIN = 5;

/**
 * Validates writes with the model before they are saved: loads the part of the database the write touches, applies the
 * write, and validates the result with RAMEN core and the app's own checks (`utils/instanceMapper.ts`). Only findings
 * of the touched nodes count, since the edges of the loaded part produce findings that don't belong to the write.
 */
export default class WriteValidationService {
  /**
   * Validates the changes of a write.
   *
   * The scope is every touched node with all its relationships and neighbours (so its relation counts are complete),
   * plus the carriers of the loaded annotations (to resolve their annotation type).
   *
   * Known gap: deleting a node doesn't touch its neighbours, so e.g. a required reference that disappears with a
   * deleted entity isn't reported.
   *
   * @param {ModelContext} context - The model context.
   * @param {NodeUpdateObject} changes - The changes of the write, with the values as sent.
   * @returns {Promise<ElementDiagnostic[]>} The findings of the touched nodes.
   * @throws {ValidationError} In `enforce` mode, if there are errors.
   */
  public async validate(context: ModelContext, changes: NodeUpdateObject): Promise<ElementDiagnostic[]> {
    const mode: ValidationMode = process.env.VALIDATION_MODE === "enforce" ? "enforce" : "report";
    const touched: Set<string> = touchedUuids(changes);
    let diagnostics: ElementDiagnostic[];

    try {
      const graph: StoredGraph = await this.loadScope([...touched]);

      applyChanges(graph, changes);
      diagnostics = this.validateGraph(context, graph, touched);
    } catch (error: unknown) {
      if (mode === "enforce") {
        throw error;
      }

      logger.error("Write validation failed, the write is saved without validation", error);

      return [];
    }

    if (diagnostics.length > 0) {
      logger.warn(`Write validation: ${diagnostics.length} finding(s) on ${touched.size} touched node(s)`, {
        mode,
        diagnostics,
      });
    }

    if (mode === "enforce" && diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      throw new ValidationError("The data doesn't match the model.", diagnostics);
    }

    return diagnostics;
  }

  /**
   * Validates a graph, with the findings of resolving its names, filtered to the touched nodes.
   *
   * @param {ModelContext} context - The model context.
   * @param {StoredGraph} graph - The graph after the write.
   * @param {Set<string>} touched - uuids of the touched nodes.
   * @returns {ElementDiagnostic[]} The findings.
   */
  private validateGraph(context: ModelContext, graph: StoredGraph, touched: Set<string>): ElementDiagnostic[] {
    const { elements, findings } = toElementGraph(context, graph);
    const touchedFindings: ResolutionFinding[] = findings.filter((finding) => finding.uuids.some((uuid) => touched.has(uuid)));
    const unresolvedUuids = new Set<string>(
      findings
        .filter((finding) => finding.diagnostic.code === ELEMENT_DIAGNOSTIC_CODE.NODE_TYPE_UNRESOLVED)
        .flatMap((finding) => finding.uuids),
    );
    // The resolution already reported unresolvable nodes, with the reason
    const validation: ElementDiagnostic[] = validateElements(context, elements, touched).filter(
      (diagnostic) =>
        !(diagnostic.code === ELEMENT_DIAGNOSTIC_CODE.NODE_TYPE_UNRESOLVED && unresolvedUuids.has(diagnostic.uuid ?? "")),
    );

    return [...touchedFindings.map((finding) => finding.diagnostic), ...validation];
  }

  /**
   * Loads the scope of a write: the existing touched nodes with all their relationships and neighbours, and the chains
   * of carriers of the loaded annotations whose carrier isn't loaded yet.
   *
   * @param {string[]} uuids - uuids of the touched nodes. New nodes don't exist yet and are skipped.
   * @returns {Promise<StoredGraph>} The graph as stored.
   */
  private async loadScope(uuids: string[]): Promise<StoredGraph> {
    const graph: StoredGraph = { nodes: new Map(), relations: new Map() };

    const scopeResult = await Neo4jDriver.runQuery(
      `
      UNWIND $uuids AS uuid
      MATCH (n:Annotation|Content|Collection|Entity {uuid: uuid})
      OPTIONAL MATCH (n)-[r]-(m:Annotation|Content|Collection|Entity)

      RETURN
        {data: n {.*}, nodeLabels: labels(n)} AS node,
        collect(CASE WHEN r IS NULL THEN null ELSE {
          type: type(r),
          from: startNode(r).uuid,
          to: endNode(r).uuid,
          neighbour: {data: m {.*}, nodeLabels: labels(m)}
        } END) AS links
      `,
      { uuids },
    );

    for (const record of scopeResult.records) {
      addStoredNode(graph, record.get("node"));

      for (const link of record.get("links") as (StoredGraphRelation & { neighbour: StoredNodeRecord })[]) {
        addStoredNode(graph, link.neighbour);
        addStoredRelation(graph, { type: link.type, from: link.from, to: link.to });
      }
    }

    const withoutCarrier: string[] = this.annotationsWithoutCarrier(graph);

    if (withoutCarrier.length === 0) {
      return graph;
    }

    const chainResult = await Neo4jDriver.runQuery(
      `
      UNWIND $uuids AS uuid
      MATCH path = (carrier)-[:HAS_ANNOTATION*1..${MAX_CARRIER_CHAIN}]->(a:Annotation {uuid: uuid})
      WHERE NOT carrier:Annotation AND (carrier:Content OR carrier:Collection OR carrier:Entity)

      RETURN [x IN nodes(path) | {data: x {.*}, nodeLabels: labels(x)}] AS chain
      `,
      { uuids: withoutCarrier },
    );

    for (const record of chainResult.records) {
      const chain: StoredNodeRecord[] = record.get("chain");

      chain.forEach((node, index) => {
        addStoredNode(graph, node);

        if (index > 0) {
          addStoredRelation(graph, {
            type: "HAS_ANNOTATION",
            from: (chain[index - 1].data as BaseNodeData).uuid,
            to: (node.data as BaseNodeData).uuid,
          });
        }
      });
    }

    return graph;
  }

  /** uuids of the annotations in the graph without an incoming `HAS_ANNOTATION` from a node in the graph */
  private annotationsWithoutCarrier(graph: StoredGraph): string[] {
    const carried = new Set<string>(
      [...graph.relations.values()]
        .filter((relation) => relation.type === "HAS_ANNOTATION" && graph.nodes.has(relation.from))
        .map((relation) => relation.to),
    );

    return [...graph.nodes.entries()]
      .filter(([uuid, node]) => node.nodeLabels.includes("Annotation") && !carried.has(uuid))
      .map(([uuid]) => uuid);
  }
}
