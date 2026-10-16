import { TreeNode } from "primevue/treenode";
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
 * and each entry of `_semanticBlocks`.
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

/**
 * Miso-internal role of the annotation in a text document, configured in `miso.editing.role`. Defines how an
 * annotation is represented in the tiptap editor. Options are:
 * - `structure`: document scaffolding (paragraph, heading, table, hardBreak etc.). Used by
 *    the built-in types, can be (partially) overriden by the user with custom type names and additional properties
 * - `semanticBlock`: whole-block labels. Are always attached to a whole built-in document blocks and give them as semantic meaning.
 *    Mirror TEI-like block elements (opener, closer, addrLine etc.) to a certain extent.
 * - `inline`: user interpretation of a text range (font styling, commentaries, entities). Kind of the default annotation.
 */
export type AnnotationRole = "structure" | "inline" | "semanticBlock";

/**
 * How an annotation is anchored in its content, configured in `miso.editing.anchor`.
 * - `range`: covers a range in the text, marked with `startIndex` and `endIndex` (both inclusive).
 *    Required for annotations with role `semanticBlock`.
 * - `zeroPoint`: an atom between two characters; `startIndex` is an offset, not a range start.
 */
export type AnnotationBehaviour = "zeroPoint" | "range";

export interface AnnotationType {
  hasEntities?: boolean; // Derived from Nori
  properties?: PropertyConfig[]; // Nori
  type: string; // Nori -> discriminator, also property there
  /** Miso-only configuration (editor behaviour, controls, appearance) */
  miso?: AnnotationMisoConfig;
}

/**
 * Miso-only configuration of an annotation type. Everything in here is frontend-only and not part of the data model.
 */
export interface AnnotationMisoConfig {
  /** Group the annotation type is listed under in the toolbar and the filter */
  group?: string;
  /** How the user creates and interacts with annotations of this type */
  controls?: {
    /** Keyboard shortcut in keymap notation, e.g. `Mod-Shift-e`. `Mod` is Cmd on macOS and Ctrl elsewhere. */
    shortcut?: string;
    /** Whether annotations of this type are visible when the editor is opened */
    defaultSelected?: boolean;
  };
  /** How annotations of this type are anchored in the content */
  editing?: {
    anchor?: AnnotationBehaviour;
    role?: AnnotationRole;
    /** Nesting priority, only relevant for structural types */
    priority?: number;
    /** Editor roles of structural types that can be nested inside, only relevant for structural types */
    contains?: string[];
  };
  appearance?: AnnotationAppearance;
}

/** How annotations of a type are rendered */
export interface AnnotationAppearance {
  /** Icon in the toolbar and in annotation lists */
  icon?: IconSpecInput;
  /** Styling of the annotated text. Only applies to `range` annotations. */
  highlight?: HighlightTextStyle;
  /** Marker that is rendered at the position of the annotation. Only applies to `zeroPoint` annotations. */
  marker?: MarkerStyle;
  /**
   * Overrides per property value, keyed by property name and then by value, e.g. `variants.subType.deletion`.
   * Variants override the type's appearance and are applied in config order, so later matches win.
   * Highlights are merged field by field, a marker replaces the previous one. The icon can't be overridden, since it
   * identifies the annotation type in places without annotation data (e.g. the toolbar).
   *
   * @example
   * { "variants": { "display": { "block": { "marker": { "kind": "icon", "icon": "square-sigma" } } } } }
   */
  variants?: Record<string, Record<string, AppearanceVariant>>;
}

/** Appearance overrides for annotations with a certain property value */
export type AppearanceVariant = Pick<AnnotationAppearance, "highlight" | "marker">;

/**
 * Styling of the text covered by a `range` annotation.
 */
export type HighlightTextStyle = PropertiesTextStyle;

/** An icon rendered at the position of an annotation. */
export interface IconStyle {
  kind: "icon";
  icon: IconSpecInput;
}

/**
 * Styling of the position of a `zeroPoint` annotation.
 */
export type MarkerStyle = IconStyle;

/** Predefined CSS properties. The keys are the camelCase names of the corresponding CSS properties. */
export interface PropertiesTextStyle {
  kind: "properties";
  color?: string;
  backgroundColor?: string;
  fontWeight?: string;
  fontStyle?: string;
  fontVariant?: string;
  fontSize?: string;
  verticalAlign?: string;
  textDecorationLine?: string;
  textDecorationStyle?: string;
  textDecorationColor?: string;
  textDecorationThickness?: string;
}

export interface AnnotationConfigEntity {
  category: string;
  nodeLabel: string;
  /** Miso-only configuration */
  miso?: NodeMisoConfig;
}

/** Miso-only configuration of a node type (Collection or Entity refinement) */
export interface NodeMisoConfig {
  icon?: IconSpecInput;
}

export interface ApiJson {
  text: string;
  annotations: NodeDto[];
}

export type BuiltinStructuralType =
  | "paragraph"
  | "heading"
  | "hardBreak"
  | "table"
  | "tableRow"
  | "tableCell"
  | "bulletList"
  | "listItem";

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
  _semanticBlocks?: DocAnnotation[];
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

/**
 * Description of an icon that can be injected by the configuration to describe annotation types,
 * RAMEN node refinements etc.
 *
 * Can be configured in different ways, e.g. as a Lucide icon name, a URL, or a SVG icon.
 */
export type IconSpec = LucideIconSpec | UrlIconSpec | SvgIconSpec;

/**
 * What a configuration may write: the full object form, or a bare Lucide name as shorthand.
 * Used to allow users to write `icon: "folder-open"` instead of `icon: { kind: "lucide", name: "folder-open" }`.
 */
export type IconSpecInput = IconSpec | string;

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

/** An icon from the Lucide set. */
export interface LucideIconSpec {
  kind: "lucide";
  /** Name of the lucide icon, in kebab-case (e.g. `folder-open`) */
  name: string;
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

export interface PropertyConfig {
  /** folioEnd, label, websiteUrl */
  name: string; // Miso -> name to display. Or remove kompletely, type is type
  /** data type (raw string, dropdown, multiple options) */
  type: PropertyConfigDataType; // Nori
  /** required or optional */
  required: boolean; // Nori
  /** Editable by user */
  editable: boolean; // Miso
  /** Visible by user */
  visible: boolean; // Miso;
  /** Render as normal input or textarea? */
  template?: PropertyConfigStringTemplate; // Miso;
  // The rest here is Miso
  /* Only relevant if type is "Array" */
  items?: Partial<PropertyConfig>;
  minItems?: number;
  maxItems?: number;
  /* Only relevant if type is "Float"/"Integer" */
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  /* Only relevant if type is "String" */
  minLength?: number;
  maxLength?: number;
  options?: string[] | number[] /* Options if type is dropdown */;
}

export type PropertyConfigDataType = "Array" | "Boolean" | "Date" | "DateTime" | "Float" | "Integer" | "String" | "Time";

export type PropertyConfigStringTemplate = "input" | "textarea";

export interface Range {
  from: number;
  to: number;
}

export interface SemanticBlockRange {
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

/** Raw inline SVG markup. */
export interface SvgIconSpec {
  kind: "svg";
  /** Raw SVG markup. */
  svg: string;
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

export type ToCItem = TreeNode & {
  data: {
    nodeSize: number;
    nodeType: string;
    /** Canonical (project-configured) annotation type, derived from the live node, not _annotation. */
    type: string;
    /** Heading level when the node is a heading; read from the live native attr. */
    level?: number;
    pos: number;
    text: string;
    /** Annotation of the node itself, as stored in its `_annotation` attribute. */
    _annotation: DocAnnotation;
    /** Semantic blocks wrapping the node, as stored in its `_semanticBlocks` attribute. Empty when none. */
    _semanticBlocks: DocAnnotation[];
  };
  children: ToCItem[];
};

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

/** An icon loaded from an external URL. */
export interface UrlIconSpec {
  kind: "url";
  /** URL of the icon. */
  url: string;
}
