import type { AnnotationShape, Attribute, Diagnostic, Owned, RamenModel } from "@ramen-suite/core";
import type { MisoConfig } from "../schemas/misoConfig.schema";
import { IAnnotation } from "./IAnnotation";
import { ICollection } from "./ICollection";
import { IEntity } from "./IEntity";
import { IText } from "./IText";

/** A status object for nodes in the frontend and for API requests */
export interface NodeStatusObject<T extends Node<BaseNodeData> = AnnotationNode | EntityNode | CollectionNode | TextNode> {
  node: T;
  connectedNodes: NodeStatusObject<T>[];
  meta: {
    status: NodeStatus;
    [key: string]: unknown;
  };
}

/**
 * A status field for nodes in the frontend and for API requests. Is accessed during editing
 * (to display the current edit state) and before saving to tell the backend how to process the data.
 */
export type NodeStatus = "added" | "removed" | "created" | "deleted" | "modified" | "unchanged";

/** A helper type for a {@linkcode NodeStatusObject} status object. Used for Annotations in the frontend an API requests. */
export type Annotation = NodeStatusObject<AnnotationNode>;

export type AnnotationNode = Node<IAnnotation>;

/** A node object for retrieving data */
export interface NodeDto<T extends Node<BaseNodeData> = AnnotationNode | EntityNode | CollectionNode | TextNode> {
  node: T;
  connectedNodes: NodeDto[];
}

// Types of the config blocks of model elements (`ext.miso`), inferred from their schemas. Re-exported here so
// existing importers keep working.
export type {
  AnnotationAppearance,
  AnnotationExtent,
  AnnotationShapeConfig,
  AppearanceOverride,
  AppearanceVariant,
  AttributeConfig,
  BuiltinStructuralType,
  ContentMedium,
  ContentTypeConfig,
  HighlightTextStyle,
  IconSpec,
  IconSpecInput,
  IconStyle,
  LucideIconSpec,
  MarkerStyle,
  MathTextStyle,
  NodeAppearance,
  NodeConfig,
  PropertiesTextStyle,
  SvgIconSpec,
  TextAnnotationRepresentation,
  UrlIconSpec,
} from "../schemas/configBlocks.schema";

/** The model and the config the accessors in `modelHelper.ts` work on */
export interface ModelContext {
  /** The model, imported by RAMEN core */
  model: RamenModel;
  /** The validated Miso config */
  config: MisoConfig;
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

/** A node type new nodes can be created with, e.g. in the "add" menus */
export interface NodeTypeOption {
  /** Qualified ref of the classifier */
  classifierRef: string;
  /** The classifier's name, for display */
  name: string;
  /** The labels new nodes of the type are stored with: the names of its lineage, base first */
  nodeLabels: string[];
  /**
   * The values new nodes of the type start with: `false` for required Boolean attributes (an untouched checkbox would
   * otherwise have no value). Other required attributes stay empty, so they are filled in deliberately.
   */
  initialData: Record<string, unknown>;
}

/**
 * The model element a stored name (node labels, annotation `type`) resolves to: its qualified ref, or `null` and the
 * problem, so reads can report unresolvable data instead of failing.
 */
export type RefResolution = { ref: string; problem?: undefined } | { ref: null; problem: string };

/** A node in the element format: `uuid` inside `data`, attributes by name, the model refs next to them */
export interface ElementNode {
  /** What a write does with the node. Missing on reads. */
  status?: NodeStatus;
  /** Qualified ref of the node's classifier, `null` if it couldn't be resolved */
  classifierRef: string | null;
  /** Annotations only: qualified ref of the annotation shape */
  shapeRef?: string | null;
  /** Reads only: the labels as stored. Writes derive them from `classifierRef`. */
  nodeLabels?: string[];
  data: BaseNodeData & Record<string, unknown>;
}

/** A relation in the element format. Relations have no id of their own: they are identified by `from`, `relationRef` and `to`. */
export interface ElementRelation {
  /** What a write does with the relation (`added`/`removed`). Missing on reads. */
  status?: NodeStatus;
  /** Qualified ref of the relation definition. `null` on reads if the stored relationship can't be resolved. */
  relationRef: string | null;
  /** uuid of the start node */
  from: string;
  /** uuid of the end node */
  to: string;
}

/** Nodes and relations in the element format, as validated by `validateElements` in `instanceMapper.ts` */
export interface ElementGraph {
  nodes: ElementNode[];
  relations: ElementRelation[];
}

/** A read in the element format: the stored nodes and relations, and the problems of resolving them to the model */
export interface ElementResponse extends ElementGraph {
  diagnostics: ElementDiagnostic[];
}

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

export interface BaseNodeData {
  uuid: string;
}

/** Base node labels in RAMEN */
export type BaseNodeLabel = "Annotation" | "Collection" | "Entity" | "Content";

/** The base node labels that can be searched for and referenced from an Annotation */
export type ReferenceNodeLabel = Extract<BaseNodeLabel, "Collection" | "Entity" | "Content">;

/** Name of a layout component wrapping a route's view, resolved in `src/config/layouts.ts` */
export type LayoutName = "default" | "blank";

export type CollectionNode = Node<ICollection>;

export interface NodeSearchParams {
  searchInput?: string;
  nodeLabels?: string[];
  offset?: number;
  rowCount?: number;
  sortDirection?: "asc" | "desc";
}

export type EntityNode = Node<IEntity>;

/** A node that can live in the Collection/Content hierarchy (a Collection or a leaf Content). */
export type HierarchyNode = CollectionNode | TextNode;

/**
 * An ordered path of hierarchy nodes, root first, focused node last. */
export type HierarchyPath = NodeDto<HierarchyNode>[];

/** A single item in a hierarchy listing (column / directory / tree). */
export interface HierarchyEntry {
  data: NodeDto<HierarchyNode>;
  meta: {
    /**
     * Derived from the node type via `getBaseNodeLabel()` in `modelHelper.ts`. Cached here because it is read
     * on every render (icon, click behaviour).
     */
    baseLabel: "Collection" | "Content";
  };
}

/**
 * Several items selected inside one column at once. Only exists with two or more items — a single
 * selection is expressed by the hierarchy path alone.
 */
export interface MultiSelection {
  /** The level index (column) the selection lives in. */
  depth: number;
  /** The selected items, in the order they were added. Whole DTOs, since an item might not be in the column's loaded entries. */
  items: NodeDto<HierarchyNode>[];
  /** Where a range selection starts. */
  anchor: NodeDto<HierarchyNode>;
  /** The selection at the time the anchor was set. A range is always added to this base, not to the previous range. */
  baseItems: NodeDto<HierarchyNode>[];
}

/** The modifier keys held while selecting an item. */
export interface SelectionModifiers {
  /** Add or remove the item (Cmd on Mac, Ctrl elsewhere). */
  toggle: boolean;
  /** Select from the anchor up to the item (Shift). */
  range: boolean;
}

export interface Level {
  entries: HierarchyEntry[];
  /** The item selected in this level — the one whose children the next level shows. */
  activeItem: NodeDto<HierarchyNode> | null;
  parentUuid: string | null;
  query: LevelQuery;
  state: LevelState;
}

/**
 * User-editable constraints for the to-be-displayed items (filter, sorting, etc).
 *
 * Lives on the {@linkcode Level} rather than in the component rendering it, so that it can be
 * reached from anywhere.
 */
export interface LevelQuery {
  filters: HierarchyFilters;
  sort: HierarchySort;
}

/**
 * Non-editable state information for the level. Contains pagination, loading/initializing state etc.
 * Can be written by the fetching engine ({@link useHierarchyChildren}) and is invalidated
 * as soon as {@linkcode LevelQuery} changes — every field here describes the last request made.
 */
export interface LevelState {
  /** Opaque position handed out by the server, or null at the start of a listing. */
  cursor: string | null;
  pagination: PaginationData | null;
  isLoading: boolean;
  /** False until the first page has been fetched */
  initialized: boolean;
}

/**
 * Root element for any kind of Collection/Content hierarchies in the editor.
 * Which set of items the first column lists. `"database"` lists the top of the `PART_OF` hierarchy;
 * `"tag"` lists the nodes carrying one client-side tag, which may sit anywhere in the graph.
 * Every column below the first shows `PART_OF` children regardless of the root.
 */
export type HierarchyRoot =
  | { kind: "database" }
  | { kind: "tag"; uuid: string }
  /**
   * Same fetching mechanism as `database`, but the first column lists the set chosen by the
   * {@linkcode SmartView}'s stored scope and is seeded with its stored filter preset.
   */
  | { kind: "smartView"; uuid: string };

/**
 * Which set of nodes a hierarchy listing is drawn from.
 *
 * This is the *scope*, not a filter: {@link HierarchyFilters} narrows a set, a scope defines it,
 * and the five kinds are mutually exclusive. All of them are served by `POST /hierarchy/query`.
 *
 * - `children`: the direct `PART_OF` children of one Collection.
 * - `descendants`: everything below one Collection, at any depth of the `PART_OF` hierarchy.
 * - `top`: the top of the `PART_OF` hierarchy.
 * - `all`: every Collection and Content, wherever it sits in the hierarchy.
 * - `uuids`: an explicit set of nodes, independent of `PART_OF`.
 */
export type HierarchyScope =
  | { kind: "children"; parentUuid: string }
  | { kind: "descendants"; ancestorUuid: string }
  | { kind: "top" }
  | { kind: "all" }
  | { kind: "uuids"; uuids: string[] };

/** The scopes a {@linkcode SmartView} can search in. The other kinds are bound to navigation or tags. */
export type SmartViewScope = Extract<HierarchyScope, { kind: "all" | "descendants" }>;

/** Focus-pane data for a Collection: the node itself plus its (editable) annotations. */
export interface CollectionFocus {
  kind: "collection";
  collection: NodeStatusObject<CollectionNode>;
  annotations: Annotation[];
}

/** Focus-pane data for a Content: the node itself plus its structural annotations, both shown read-only as a text preview. */
export interface ContentFocus {
  kind: "content";
  content: NodeStatusObject<TextNode>;
  annotations: NodeDto<AnnotationNode>[];
}

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

/**
 * A single condition/constraint for filtering a list of nodes.
 */
export interface FilterCondition {
  comparator: FilterComparator;
  value: unknown;
}

/** A group of filter conditions which are applied together, and the concatenation operator */
export interface FilterConditionGroup {
  operator: FilterOperator;
  conditions: FilterCondition[];
}

export type FilterTarget =
  /** A node property: `n.<field>`. */
  | { kind: "property"; field: string }
  /** The node's default value to fulltext-search — `label`, falling back to a `text` currently */
  | { kind: "distinct" }
  /**
   * The node's type: an `in` condition over classifier refs matches nodes of these types and their refinements. Filter
   * only — not a valid sort target.
   */
  | { kind: "classifier" };

export type FilterOperator = "and" | "or";

export type FilterRule = { target: FilterTarget } & FilterConditionGroup;

export type FilterSpec = FilterRule[];

/**
 * One rule of the filter editor. Represents one condition of a filter rule.
 */
export interface FilterRow {
  id: string;
  target: FilterTarget;
  comparator: FilterComparator;
  value: unknown;
}

/** What the focus pane renders — a Collection (editable) or a Content (read-only preview). */
export type FocusData = CollectionFocus | ContentFocus;

/** Sort state for a hierarchy listing. */
export interface HierarchySort {
  /**
   * What to sort by, named the same way a {@linkcode FilterRule} names what it matches — so anything
   * filterable is sortable, and both resolve through the same expression builder on the server.
   * `{ kind: "classifier" }` is rejected: a set of node types has no ordering.
   */
  target: FilterTarget;
  /** Direction to sort by. */
  order: "asc" | "desc";
}

/** Filter state for a hierarchy listing: the rules are ANDed with each other. */
export type HierarchyFilters = FilterSpec;

export interface Node<T = AnnotationNode | CollectionNode | EntityNode | TextNode> {
  data: T;
  /** The labels as stored in the database */
  nodeLabels: string[];
  /**
   * Qualified ref of the node's classifier, resolved by the server from the labels (for annotations: the family of
   * its shape). `null` if the stored data can't be resolved, missing on nodes the client created itself.
   */
  classifierRef?: string | null;
  /** Annotations only: qualified ref of the annotation shape, resolved by the server from the carrier and `type` */
  shapeRef?: string | null;
}

export type NodeAncestry = NodeDto<CollectionNode>[];

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

/**
 * A user-defined view: a named scope and filter preset held in the browser. Selecting one lists the
 * nodes of its scope, pre-filtered by its filters (see {@linkcode SmartView.config}). Unlike a
 * {@linkcode Tag} it references no listed nodes at all — membership is decided by scope and filters
 * on every request, so it never goes stale.
 */
export interface SmartView {
  uuid: string;
  label: string;
  appearance?: {
    icon?: string;
  };
  config: {
    /** Where the view searches: everywhere, or everything below one Collection. */
    scope: SmartViewScope;
    filters: FilterSpec;
  };
}

export type TextNode = Node<IText>;
// TODO: Remove TextNode (or remove IText) -> ContentNode will be default
export type ContentNode = Node<IText>;

/**
 * Type for updating text + annotations.
 */
export interface TextUpdateDto {
  text: NodeStatusObject<TextNode>;
  annotations: Annotation[];
}

/**
 * A user-defined tag: a named set of hierarchy nodes, held in the browser. The label is free text
 * describing what the set is for ("Workspace", "In Review"). A node can carry any
 * number of tags, and a tag's members may sit anywhere in the graph.
 */
export interface Tag {
  uuid: string;
  label: string;
  appearance?: {
    icon?: string;
    color?: string;
  };
  entries: TagEntry[];
}

/**
 * One tagged node. A **reference only** — never a node snapshot, so a renamed or re-parented node
 * cannot go stale here. The node itself is resolved server-side via `POST /api/hierarchy/query`.
 */
export interface TagEntry {
  uuid: string;
  createdAt: string; // ISO 8601 string
}
