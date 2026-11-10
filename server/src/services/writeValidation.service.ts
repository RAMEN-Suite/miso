import { ManagedTransaction, QueryResult } from "neo4j-driver";
import Neo4jDriver from "../database/neo4j.js";
import NotFoundError from "../errors/notFound.error.js";
import ValidationError from "../errors/validation.error.js";
import logger from "../logger.js";
import { env } from "../env.js";
import type { Env } from "../schemas/env.schema.js";
import type { BaseNodeData, ElementDiagnostic, ModelContext, NodeUpdateObject } from "../models/types.js";
import { ELEMENT_DIAGNOSTIC_CODE, validateElements } from "../utils/instanceMapper.js";
import { buildSubgraphUpdateQuery, toNeo4jChanges } from "../utils/nodeUpdate.js";
import {
  addStoredNode,
  addStoredRelation,
  ResolutionFinding,
  StoredGraph,
  StoredGraphRelation,
  StoredNodeRecord,
  toElementGraph,
  touchedUuids,
} from "../utils/storedGraph.js";

/* eslint-disable @typescript-eslint/no-unsafe-assignment -- db results can not be typed (only with assertion) which is too cumbersome for now */

/** The longest chain of annotations on annotations that is followed to find the carrier of an annotation */
const MAX_CARRIER_CHAIN = 5;

/** The result of a validated write */
export interface ValidatedWrite {
  /** The root node after the write */
  node: StoredNodeRecord;
  /** The findings of the touched nodes */
  diagnostics: ElementDiagnostic[];
}

/**
 * Writes changes and validates them with the model in one transaction: the write runs first, then the part of the
 * database it touches is read back (with the uncommitted changes) and validated with RAMEN core and the app's own
 * checks (`utils/instanceMapper.ts`). Only findings of the touched nodes count, since the edges of the loaded part
 * produce findings that don't belong to the write.
 */
export default class WriteValidationService {
  /**
   * Writes the changes of a subgraph and validates the result. `report` mode (env `VALIDATION_MODE`) logs and returns
   * the findings and commits anyway, `enforce` rolls back writes with errors.
   *
   * @param {ModelContext} context - The model context.
   * @param {NodeUpdateObject} changes - The changes of the write, with the values as sent.
   * @param {string} uuid - The uuid of the root node (a Content or a Collection).
   * @returns {Promise<ValidatedWrite>} The root node after the write and the findings.
   * @throws {NotFoundError} If the root node doesn't exist after the write (rolled back).
   * @throws {ValidationError} In `enforce` mode, if there are errors (rolled back).
   */
  public async write(context: ModelContext, changes: NodeUpdateObject, uuid: string): Promise<ValidatedWrite> {
    const params = { uuid, ...toNeo4jChanges(changes, context) };

    // Returning from the callback commits the transaction, throwing rolls it back
    return Neo4jDriver.commitOrRollback(async (tx) => {
      const query: string = buildSubgraphUpdateQuery();
      const writeResult: QueryResult = await tx.run(query, params);
      const record = writeResult.records[0];

      if (!record) {
        throw new NotFoundError(`Content or Collection with UUID ${uuid} not found`);
      }

      const touched: Set<string> = touchedUuids(changes, record.get("neighboursOfDeleted") as string[]);
      const diagnostics: ElementDiagnostic[] = await this.validate(tx, context, touched);

      return { node: record.get("node"), diagnostics };
    });
  }

  /**
   * Validates the touched nodes as the transaction sees them.
   *
   * The scope is every touched node with all its relationships and neighbours (so its relation counts are complete),
   * plus the carriers of the loaded annotations (to resolve their annotation type).
   *
   * In `report` mode a failing validation is logged and the write is saved without it. A failing scope query fails the
   * transaction, and with it the write, in every mode.
   *
   * @param {ManagedTransaction} tx - The transaction of the write.
   * @param {ModelContext} context - The model context.
   * @param {Set<string>} touched - uuids of the touched nodes.
   * @returns {Promise<ElementDiagnostic[]>} The findings of the touched nodes.
   * @throws {ValidationError} In `enforce` mode, if there are errors.
   */
  private async validate(tx: ManagedTransaction, context: ModelContext, touched: Set<string>): Promise<ElementDiagnostic[]> {
    const mode: Env["VALIDATION_MODE"] = env.VALIDATION_MODE;
    let diagnostics: ElementDiagnostic[];

    try {
      diagnostics = this.validateGraph(context, await this.loadScope(tx, [...touched]), touched);
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
   * Loads the scope of a write: the touched nodes with all their relationships and neighbours, and the chains of
   * carriers of the loaded annotations whose carrier isn't loaded yet.
   *
   * @param {ManagedTransaction} tx - The transaction of the write, so the changes are visible.
   * @param {string[]} uuids - uuids of the touched nodes.
   * @returns {Promise<StoredGraph>} The graph as stored.
   */
  private async loadScope(tx: ManagedTransaction, uuids: string[]): Promise<StoredGraph> {
    const graph: StoredGraph = { nodes: new Map(), relations: new Map() };

    const scopeResult = await tx.run(
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
      addStoredNode(graph, record.get("node") as StoredNodeRecord);

      for (const link of record.get("links") as (StoredGraphRelation & { neighbour: StoredNodeRecord })[]) {
        addStoredNode(graph, link.neighbour);
        addStoredRelation(graph, { type: link.type, from: link.from, to: link.to });
      }
    }

    const withoutCarrier: string[] = this.annotationsWithoutCarrier(graph);

    if (withoutCarrier.length === 0) {
      return graph;
    }

    const chainResult = await tx.run(
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
