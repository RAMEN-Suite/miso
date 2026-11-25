import { IAnnotation } from "./IAnnotation.js";
import { ICollection } from "./ICollection.js";
import { IEntity } from "./IEntity.js";
import { IText } from "./IText.js";
import type { AnnotationShape, Attribute, Diagnostic, Node as RamenNode, Owned, RamenModel } from "@ramen-suite/core";
import type { IMisoConfig } from "./IMisoConfig.js";

/** The model and the config every model lookup works on */
export interface ModelContext {
  /** The model, imported by RAMEN core */
  model: RamenModel;
  config: IMisoConfig;
}

/** An attribute of a node, or a property of an annotation shape, with the element that declares it */
export interface ModelAttribute {
  /** The attribute as declared in the model */
  attribute: Attribute;
  /** Qualified ref (`<modelId>:<id>`) of the declaring node or annotation shape */
  ownerRef: string;
}

/**
 * An annotation shape as listed in a RamenFile: with the `modelId` of the model level it is declared in, since the file
 * flattens all levels into one `annotations` list.
 */
export type ModelAnnotationShape = Owned<AnnotationShape>;

/** An element that declares attributes, as listed in a RamenFile: a node classifier or an annotation shape */
export type AttributeOwner = Owned<RamenNode> | ModelAnnotationShape;

/**
 * The model element a stored name (node labels, annotation `type`) resolves to: its qualified ref, or `null` and the
 * problem, so reads can report unresolvable data instead of failing.
 */
export type RefResolution = { ref: string; problem?: undefined } | { ref: null; problem: string };

/** A node in the element format: `uuid` inside `properties`, values by attribute name, the model refs next to them */
export interface ElementNode {
  /** What a write does with the node. Missing on reads. */
  status?: ElementNodeStatus;
  /** Qualified ref of the node's classifier, `null` if it couldn't be resolved */
  classifierRef: string | null;
  /** Annotations only: qualified ref of the annotation shape */
  shapeRef?: string | null;
  /** Reads only: the labels as stored. Writes derive them from `classifierRef`. */
  nodeLabels?: string[];
  properties: BaseNodeProperties & Record<string, unknown>;
}

/** A relation in the element format. Relations have no id of their own: they are identified by `from`, `relationRef` and `to`. */
export interface ElementRelation {
  /** What a write does with the relation (`added`/`removed`). Missing on reads. */
  status?: ElementRelationStatus;
  /** Qualified ref of the relation definition. `null` on reads if the stored relationship can't be resolved. */
  relationRef: string | null;
  /**
   * The relationship type as stored (`HAS_ANNOTATION`, `REFERS_TO`, `PART_OF`). Writes take it from `relationRef` and use
   * it only for removing a relation without one.
   */
  type: string;
  /** uuid of the start node */
  from: string;
  /** uuid of the end node */
  to: string;
}

/** Nodes and relations in the element format, as validated by `validateElements` */
export interface ElementGraph {
  nodes: ElementNode[];
  relations: ElementRelation[];
}

/** A read in the element format: the stored nodes and relations, and the problems of resolving them to the model */
export interface ElementResponse extends ElementGraph {
  diagnostics: ElementDiagnostic[];
}

/** The response of a write: the findings of the validation and the annotations deleted as orphans */
export interface WriteResponse {
  /** The findings of the validation, for the touched nodes */
  diagnostics: ElementDiagnostic[];
  /** uuids of the annotations the write deleted because they had no carrier left */
  deletedOrphans: string[];
}

/** The status of a node: what a write does with it, or `unchanged`. Unlinking is a status of the relation. */
export type ElementNodeStatus = "created" | "modified" | "deleted" | "unchanged";

/** The status of a relation: what a write does with it, or `unchanged` */
export type ElementRelationStatus = "added" | "removed" | "unchanged";

/** A validation finding, mapped back to the element it belongs to */
export interface ElementDiagnostic {
  severity: Diagnostic["severity"];
  /** RAMEN core's code, or a `MISO_` code for the app's own checks */
  code: string;
  message: string;
  /** uuid of the node the finding belongs to */
  uuid?: string;
  /** The relation the finding belongs to */
  relation?: Omit<ElementRelation, "status">;
  /** Name of the property the finding belongs to */
  attribute?: string;
}

/** The settings of an element or attribute (its entry in `elements`). The server passes them through, the client validates them. */
export type ConfigBlock = Record<string, unknown> | undefined;

/** The medium of a Content type (`medium` of its `elements.classifiers` entry), which decides the selector type of its annotations */
export type ContentMedium = "text" | "image";

export type AnnotationNode = Node<IAnnotation>;

/** Base node labels in RAMEN */
export type BaseNodeLabel = "Annotation" | "Collection" | "Entity" | "Content";

export interface BaseNodeProperties {
  uuid: string;
}

export type CollectionNode = Node<ICollection>;

/** A parsed hierarchy listing request: which nodes to list, and how to filter/sort/paginate them. */
export interface HierarchyQuery {
  scope: HierarchyScope;
  filters: FilterSpec;
  /** What to order by (a certain property etc.) */
  sort: FilterTarget;
  order: "asc" | "desc";
  limit: number;
  cursor: string | null;
  /** The allowlist of properties used for filtering and sorting, derived from the model's attributes */
  properties: Map<string, ModelAttribute>;
}

/**
 * How a single condition compares. Mirror of the client type — kept deliberately
 * framework-neutral, so a table library on the client is a translation concern and not a wire one.
 */
export type FilterComparator =
  | "contains"
  | "notContains"
  | "startsWith"
  | "endsWith"
  | "equals"
  | "notEquals"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "between"
  | "in"
  | "dateIs"
  | "dateBefore"
  | "dateAfter"
  | "isEmpty"
  | "isNotEmpty";

export type FilterOperator = "and" | "or";

/** A single condition/constraint for filtering a list of nodes. */
export interface FilterCondition {
  comparator: FilterComparator;
  value: unknown;
}

/** A group of filter conditions which are applied together, and the concatenation operator */
export interface FilterConditionGroup {
  operator: FilterOperator;
  conditions: FilterCondition[];
}

/**
 * What a rule or a sort points at. Shared by both, so anything filterable is sortable and both
 * resolve through one expression builder (`targetExpression`).
 */
export type FilterTarget =
  /** A node property: `n.<field>`. The only variant whose name is interpolated into Cypher. */
  | { kind: "property"; field: string }
  /** The node's default value to fulltext-search — `label`, falling back to a `text` preview. */
  | { kind: "distinct" }
  /**
   * The node's type: an `in` condition over classifier refs matches nodes of these types and their refinements (resolved
   * to labels on the server). Filter only — not a valid sort target.
   */
  | { kind: "classifier" };

export type FilterRule = { target: FilterTarget } & FilterConditionGroup;

/** All rules of a listing. Rules are ANDed with each other. */
export type FilterSpec = FilterRule[];

/**
 * Which set of nodes a hierarchy listing is drawn from. This is the *scope*, not a filter:
 * a {@link FilterSpec} narrows a set, a scope defines it, and the five kinds are mutually
 * exclusive.
 *
 * - `children`: the direct `PART_OF` children of one Collection (the column view below level 0).
 * - `descendants`: everything below one Collection, at any depth of the `PART_OF` hierarchy
 *   (level 0 of a smart view that searches inside a Collection).
 * - `top`: the top of the `PART_OF` hierarchy (level 0 of the database root).
 * - `all`: every Collection and Content, wherever it sits in the hierarchy (level 0 of a smart
 *   view that searches everywhere).
 * - `uuids`: an explicit set of nodes, gathered client-side and independent of `PART_OF`
 *   (level 0 of a tag root). The nodes may sit anywhere in the graph.
 */
export type HierarchyScope =
  | { kind: "children"; parentUuid: string }
  | { kind: "descendants"; ancestorUuid: string }
  | { kind: "top" }
  | { kind: "all" }
  | { kind: "uuids"; uuids: string[] };

export type EntityNode = Node<IEntity>;

export interface FaviconResponse {
  contentType: string;
  data: Buffer;
}

export interface Node<T = AnnotationNode | CollectionNode | EntityNode | ContentNode> {
  properties: T;
  /** The labels as stored in the database */
  nodeLabels: string[];
  /**
   * Qualified ref of the node's classifier, resolved from the labels on reads (for annotations: the family of its
   * shape), see `toElementGraph`. `null` if the stored data can't be resolved. On writes, taken from the payload
   * (see `toNodeChanges`).
   */
  classifierRef?: string | null;
  /** Annotations only: qualified ref of the annotation shape, resolved from the carrier and `type` on reads */
  shapeRef?: string | null;
}

/** A node search, see `SearchService` */
export interface NodeSearchParams {
  /** Qualified ref of the node type to search, refinements included */
  classifierRef: string;
  order: string;
  offset: number;
  limit: number;
  /** The text the node's label (Contents: text) must contain, case-insensitive */
  search: string;
}

export interface PaginationData {
  limit: number;
  offset?: number | null;
  order: string;
  totalRecords: number;
  /** The opaque cursor of the next hierarchy page, `null` on the last one */
  nextCursor?: string | null;
}

export interface PaginationResult<T> {
  data: T;
  pagination: PaginationData;
}

export type ContentNode = Node<IText>;

/** The changes of a write, grouped by operation, as the write query takes them (see `buildSubgraphUpdateQuery`) */
export interface NodeUpdateObject {
  create: Node<object>[];
  update: Node<object>[];
  delete: Node<object>[];
  /** Relationships by the name of their relation definition */
  remove: { type: string; startUuid: string; endUuid: string }[];
  attach: { type: string; startUuid: string; endUuid: string }[];
}
