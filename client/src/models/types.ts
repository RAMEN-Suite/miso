import { IAnnotation } from "./IAnnotation";
import { ICollection } from "./ICollection";
import { IEntity } from "./IEntity";
import { IText } from "./IText";
import type { BuiltinEditorAttribute } from "../config/editor";
import type { AnnotationMapping } from "../config/editor";

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

/**
 * An annotation as stored in the tiptap document's node attributes: `_annotation` on structural nodes
 * and each entry of `_blockClassifications`.
 *
 * The `meta` field that contains the status is omitted since it gets recalculated before save
 * for every block of the document.
 */
export type DocAnnotation = Omit<Annotation, "meta">;

export type AnnotationNode = Node<IAnnotation>;

/** A node object for retrieving data */
export interface NodeDto<T extends Node<BaseNodeData> = AnnotationNode | EntityNode | CollectionNode | TextNode> {
  node: T;
  connectedNodes: NodeDto[];
}

// Types of the guidelines, inferred from their schema. Re-exported here so existing importers keep working.
export type {
  AnnotationAppearance,
  AnnotationExtent,
  AnnotationMisoConfig,
  AnnotationType,
  AppearanceOverride,
  AppearanceVariant,
  BuiltinStructuralType,
  ContentMedium,
  ContentTypeMisoConfig,
  HighlightTextStyle,
  IconSpec,
  IconSpecInput,
  IconStyle,
  LucideIconSpec,
  MarkerStyle,
  MathTextStyle,
  NativeTypeMapping,
  NodeAppearance,
  NodeMisoConfig,
  PropertiesTextStyle,
  PropertyConfig,
  PropertyConfigDataType,
  SvgIconSpec,
  TextAnnotationRepresentation,
  UrlIconSpec,
} from "../schemas/guidelines.schema";

export interface ApiJson {
  text: string;
  annotations: NodeDto[];
}

// Editor-framework facts live in `config/editor` (imported above). Re-exported here for convenience
// so existing model-type importers keep working.
export type { BuiltinEditorAttribute };
export type { AnnotationMapping };

export interface TiptapMark {
  type: string;
  attrs: Record<string, unknown>;
}

export type AllowedTiptapNodeTypes = string;

export interface TiptapNodeAttrs {
  [key: string]: unknown;
  uuid?: string;
  _annotation?: DocAnnotation;
  _blockClassifications?: DocAnnotation[];
}

export interface TiptapNode {
  type: AllowedTiptapNodeTypes;
  attrs?: TiptapNodeAttrs;
  content?: TiptapNode[];
  marks?: TiptapMark[];
  text?: string;
}

export type TiptapJson = TiptapNode;

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

export type CollectionNetworkActionType = "move" | "reference" | "dereference" | "delete";

export interface EditorSettings {
  blockDecorations: {
    outline: boolean;
    baseType: boolean;
    semanticTypes: boolean;
  };
  documentStructures: boolean;
}

export interface NodeSearchParams {
  searchInput?: string;
  nodeLabels?: string[];
  offset?: number;
  rowCount?: number;
  sortDirection?: "asc" | "desc";
}

export type EntityNode = Node<IEntity>;

export type IndexMap = Map<string, { startIndex: number; endIndex: number }>;

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
     * Derived from `data.node.nodeLabels` via `getBaseNodeLabel()`. Cached here because it is read
     * on every render (icon, click behaviour).
     */
    baseLabel: "Collection" | "Content";
    /** Multi-select flag — future drag & drop / bulk operations. */
    isSelected: boolean;
    /** Children shown in the next column / node unfolded in the tree. */
    isExpanded: boolean;
    /** Shown in the focus pane. */
    isFocused: boolean;
  };
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

/** Focus-pane data for a Content: the node itself, shown read-only. */
export interface ContentFocus {
  kind: "content";
  content: NodeStatusObject<TextNode>;
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
  /** The node's labels. Filter only — not a valid sort target. */
  | { kind: "labels" };

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
   * `{ kind: "labels" }` is rejected: a label set has no ordering.
   */
  target: FilterTarget;
  /** Direction to sort by. */
  order: "asc" | "desc";
}

/** Filter state for a hierarchy listing: the rules are ANDed with each other. */
export type HierarchyFilters = FilterSpec;

export interface MalformedAnnotation {
  reason: "indexOutOfBounds" | "unconfiguredType";
  data: StandoffAnnotation;
}

export interface NetworkPostData {
  type: CollectionNetworkActionType;
  nodes: (CollectionNode | TextNode)[];
  origin: CollectionNode | null;
  target: CollectionNode | null;
}

export interface Node<T = AnnotationNode | CollectionNode | EntityNode | TextNode> {
  data: T;
  nodeLabels: string[];
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

export interface Range {
  from: number;
  to: number;
}

export interface BlockClassificationRange {
  startPos: number;
  endPos: number;
  type: string;
  uuid: string;
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

export interface StandoffAnnotation {
  [key: string]: unknown;
  startIndex: number;
  endIndex: number;
  text: string;
  type: string;
  subType?: string | number;
}

/**
 * A problem found while a standoff document is parsed into a tiptap document.
 * - `warning`: the document was repaired while parsing (e.g. orphaned text merged into a neighbouring node). No data
 *    are lost, the repaired state is written to the database on the next save.
 * - `error`: the parsed document does not match the stored data, or contains annotations of a type that is not
 *    configured in the guidelines. Saving it can corrupt the stored data, so the user should be asked before continuing.
 */
export interface StandoffParseIssue {
  severity: "warning" | "error";
  reason: "clampedGap" | "textMismatch" | "unconfiguredType";
  message: string;
}

export type TextNode = Node<IText>;
// TODO: Remove TextNode (or remove IText) -> ContentNode will be default
export type ContentNode = Node<IText>;

export interface TextAccessObject {
  collection: CollectionNode | null;
  paths: NodeAncestry[];
  text: TextNode;
}

/**
 * Type for updating text + annotations.
 */
export interface TextUpdateDto {
  text: NodeStatusObject<TextNode>;
  annotations: Annotation[];
}

/**
 * One block node of the document outline. Items of unchanged ProseMirror nodes are reused across transactions,
 * so they deliberately carry no document position (which shifts with every edit before the node).
 */
export interface ToCItem {
  /** The node's `uuid` attribute, or its position at build time as a fallback for nodes without one. */
  key: string;
  data: {
    nodeType: string;
    /** Canonical (project-configured) annotation type, derived from the live node, not _annotation. */
    type: string;
    /** Heading level when the node is a heading; read from the live native attr. */
    level?: number;
    text: string;
    /** Annotation of the node itself, as stored in its `_annotation` attribute. */
    _annotation: DocAnnotation;
    /** Block classifications wrapping the node, as stored in its `_blockClassifications` attribute. Empty when none. */
    _blockClassifications: DocAnnotation[];
  };
  children: ToCItem[];
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
