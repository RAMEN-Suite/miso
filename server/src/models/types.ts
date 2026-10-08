import { IAnnotation } from "./IAnnotation.js";
import { ICollection } from "./ICollection.js";
import { IEntity } from "./IEntity.js";
import { IText } from "./IText.js";

export type AnnotationNode = Node<IAnnotation>;

/** A node object for retrieving data */
export interface NodeDto<T extends Node<BaseNodeData> = AnnotationNode | EntityNode | CollectionNode | TextNode> {
  node: T;
  connectedNodes: NodeDto[];
}

/**
 * A status field for nodes in the frontend and for API requests. Is accessed during editing
 * (to display the current edit state) and before saving to tell the backend how to process the data.
 */
export type NodeStatus = "added" | "removed" | "created" | "deleted" | "modified" | "unchanged";

/** Miso-internal operational category of an annotation (mirror of the client type). */
export type AnnotationRole = "structure" | "inline" | "semanticBlock";

/** How an annotation sits in the text: offset between characters vs covered span (mirror of the client type). */
export type AnnotationBehaviour = "zeroPoint" | "range";

export interface AnnotationType {
  category: string;
  defaultSelected: boolean;
  isSeparator?: boolean;
  isZeroPoint?: boolean;
  hasEntities?: boolean;
  properties?: PropertyConfig[];
  shortcut: string[];
  text: string;
  type: string;
  role?: AnnotationRole;
  behaviour?: AnnotationBehaviour;
}

export interface AnnotationConfigEntity {
  category: string;
  nodeLabel: string;
}

/** Base node labels in RAMEN */
export type BaseNodeLabel = "Annotation" | "Collection" | "Entity" | "Content";

export interface BaseNodeData {
  uuid: string;
}

/** Relationship types in RAMEN */
export type BaseRelationshipType = "HAS_ANNOTATION" | "PART_OF" | "REFERS_TO";

export type CollectionNode = Node<ICollection>;

/** A node that can live in the Collection/Content hierarchy (a Collection or a leaf Content). */
export type HierarchyNode = CollectionNode | ContentNode;

/** A parsed hierarchy listing request: which nodes to list, and how to filter/sort/paginate them. */
export interface HierarchyQuery {
  scope: HierarchyScope;
  filters: FilterSpec;
  /** What to order by (a certain property etc.) */
  sort: FilterTarget;
  order: "asc" | "desc";
  limit: number;
  cursor: string | null;
  /** The guidelines-derived allowlist for properties used for filtering and sorting */
  properties: Map<string, PropertyConfig>;
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
 * resolve through one expression builder (`targetExpression` in `utils/filter.ts`).
 */
export type FilterTarget =
  /** A node property: `n.<field>`. The only variant whose name is interpolated into Cypher. */
  | { kind: "property"; field: string }
  /** The node's default value to fulltext-search — `label`, falling back to a `text` preview. */
  | { kind: "distinct" }
  /** The node's labels. Filter only — not a valid sort target. */
  | { kind: "labels" };

export type FilterRule = { target: FilterTarget } & FilterConditionGroup;

/** All rules of a listing. Rules are ANDed with each other. */
export type FilterSpec = FilterRule[];

/**
 * Which set of nodes a hierarchy listing is drawn from. This is the *scope*, not a filter:
 * a {@link FilterSpec} narrows a set, a scope defines it, and the three kinds are mutually
 * exclusive.
 *
 * - `children`: the direct `PART_OF` children of one Collection (the column view below level 0).
 * - `top`: the top of the `PART_OF` hierarchy (level 0 of the database root).
 * - `uuids`: an explicit set of nodes, gathered client-side and independent of `PART_OF`
 *   (level 0 of a tag root). The nodes may sit anywhere in the graph.
 */
export type HierarchyScope = { kind: "children"; parentUuid: string } | { kind: "top" } | { kind: "uuids"; uuids: string[] };

export type CollectionNetworkActionType = "move" | "reference" | "dereference" | "delete";

/** Object for specifying relationship between two nodes. Used during preprocessing data before updating Text nodes */
export interface EdgeDescriptor {
  type: BaseRelationshipType;
  startUuid: string;
  endUuid: string;
}

export type EntityNode = Node<IEntity>;

export interface FaviconResponse {
  contentType: string;
  data: Buffer;
}

export interface Node<T = AnnotationNode | CollectionNode | EntityNode | TextNode> {
  data: T;
  nodeLabels: string[];
}

export interface NetworkPostData {
  type: CollectionNetworkActionType;
  nodes: (CollectionNode | TextNode)[];
  origin: CollectionNode | null;
  target: CollectionNode | null;
}

export type NodeAncestry = NodeDto<CollectionNode>[];

export interface NodeSearchParams {
  nodeLabels?: string[];
  order?: "asc" | "desc";
  offset?: number;
  limit?: number;
  search?: string;
}

/** A status object for incoming API requests that should update a subgraph */
export interface NodeStatusObject<T extends Node<BaseNodeData> = AnnotationNode | EntityNode | CollectionNode | TextNode> {
  node: T;
  connectedNodes: NodeStatusObject<T>[];
  meta: {
    status: NodeStatus;
    [key: string]: unknown;
  };
}

export interface PaginationData {
  limit: number;
  offset?: number | null;
  order: string;
  search: string;
  totalRecords: number;
  /** Legacy structured cursor ({@link CursorData}) or the opaque hierarchy cursor string. */
  nextCursor?: CursorData | string | null;
}

export interface CursorData {
  label: string;
  uuid: string;
}

export interface PaginationResult<T> {
  data: T;
  pagination: PaginationData;
}

export interface PropertyConfig {
  name: string /* folioEnd, label, websiteUrl */;
  type: PropertyConfigDataType /* raw string, dropdown, multiple options */;
  required: boolean /* required or optional */;
  editable: boolean /* Editable by user */;
  visible: boolean /* Visible by user */;
  /* Only relevant if type is "array" */
  items?: Partial<PropertyConfig>;
  minItems?: number;
  maxItems?: number;
  /* Only relevant if type is "number"/"integer" */
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  /* Only relevant if type is "string" */
  minLength?: number;
  maxLength?: number;
  options?: string[] | number[] /* Options if type is dropdown */;
  template?: PropertyConfigStringTemplate /* Render as normal input or textarea? */;
}

export type PropertyConfigDataType = "array" | "boolean" | "date" | "date-time" | "integer" | "number" | "string" | "time";

export type PropertyConfigStringTemplate = "input" | "textarea";

export type TextNode = Node<IText>;
// TODO: Remove TextNode (or remove IText) -> ContentNode will be default
export type ContentNode = Node<IText>;

export interface NodeUpdateObject {
  create: Node<object>[];
  update: Node<object>[];
  delete: Node<object>[];
  remove: { type: string; startUuid: string; endUuid: string }[];
  attach: { type: string; startUuid: string; endUuid: string }[];
}

/**
 * Type for updating text + annotations.
 */
export interface TextUpdateDto {
  text: NodeStatusObject<TextNode>;
  annotations: NodeStatusObject[];
}

export interface TextAccessObject {
  collection: CollectionNode | null;
  paths: NodeAncestry[];
  text: TextNode;
}
