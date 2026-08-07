import { TreeNode } from "primevue/treenode";
import { IAnnotation } from "./IAnnotation";
import ICharacter from "./ICharacter";
import { ICollection } from "./ICollection";
import { IEntity } from "./IEntity";
import { IText } from "./IText";
import type { BuiltinEditorAttribute } from "../config/editor";
import type { AnnotationMapping } from "../config/editor";

export interface AdditionalText {
  annotation: IAnnotation;
  text: TextNode;
}

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

export type Annotation = NodeStatusObject<AnnotationNode>;

export type AnnotationNode = Node<IAnnotation>;

/** A node object for retrieving data */
export interface NodeDto<T extends Node<BaseNodeData> = AnnotationNode | EntityNode | CollectionNode | TextNode> {
  node: T;
  connectedNodes: NodeDto[];
}

export interface AnnotationData {
  additionalTexts: AdditionalText[];
  entities: EntityNode[];
  properties: IAnnotation;
}

/**
 * Miso-internal role of the annotation in a text document. Defines how an annotation is represented
 * in the tiptap editor. Options are:
 * - `structure`: document scaffolding (paragraph, heading, table, hardBreak etc.). Used by
 *    the built-in types, can be (partially) overriden by the user with custom type names and additional properties
 * - `semanticBlock`: whole-block labels. Are always attached to a whole built-in document blocks and give them as semantic meaning.
 *    Mirror TEI-like block elements (opener, closer, addrLine etc.) to a certain extent.
 * - `inline`: user interpretation of a text range (font styling, commentaries, entities). Kind of the default annotation.
 */
export type AnnotationRole = "structure" | "inline" | "semanticBlock";

/**
 * How an annotation sits in the text.
 * - `range`: covers a range in the text, marked with `startIndex` and `endIndex` (both inclusive).
 *    Required for annotations with role `semanticBlock`.
 * - `zeroPoint`: an atom between two characters; `startIndex` is an offset, not a range start.
 */
export type AnnotationBehaviour = "zeroPoint" | "range";

export interface AnnotationType {
  category: string; // Miso
  defaultSelected: boolean; // Miso
  /** @deprecated Use `behaviour: "zeroPoint"`. Kept as a legacy input the normalization derives from. */
  isZeroPoint?: boolean; // Miso and Nori
  hasAdditionalTexts?: boolean; // Derived from Nori
  hasEntities?: boolean; // Derived from Nori
  entityNodes?: string[]; // Derived from Nori
  properties?: PropertyConfig[]; // Nori
  shortcut: string[]; // Miso
  text: string; // Miso
  type: string; // Nori -> discriminator, also property there
  /** @deprecated Use `role`. Kept as a legacy input the normalization derives from. */
  isBlock?: boolean; // Miso
  contains?: string[]; // Miso -> only for builtin structural elements
  topLevel?: boolean; // Miso -> deprecated, but keep for now
  priority?: number; // Miso
  role?: AnnotationRole; // Miso -> operational category (structure/inline/semanticBlock)
  behaviour?: AnnotationBehaviour; // Miso -> zeroPoint vs range
}

export interface AnnotationReference {
  isFirstCharacter: boolean;
  isLastCharacter: boolean;
  subType: string | null;
  type: string;
  uuid: string;
}

export interface AnnotationConfigEntity {
  category: string;
  nodeLabel: string;
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
  | "tableHeader"
  | "bulletList"
  | "listItem";

// Editor-framework facts live in `config/editor` (imported above). Re-exported here for convenience
// so existing model-type importers keep working.
export type { BuiltinEditorAttribute };
export type { AnnotationMapping };

export interface TiptapMark {
  type: string;
  attrs: Record<string, any>;
}

export type AllowedTiptapNodeTypes = string;

export interface TiptapNode {
  type: AllowedTiptapNodeTypes;
  attrs?: Record<string, any>;
  content?: TiptapNode[];
  marks?: TiptapMark[];
  text?: string;
}

export type TiptapJson = TiptapNode;

export interface BaseNodeData {
  uuid: string;
}

/** Base node labels in RAMEN */
export type BaseNodeLabel = "Annotation" | "Character" | "Collection" | "Entity" | "Content";

/** The base node labels that can be searched for and referenced from an Annotation */
export type ReferenceNodeLabel = Extract<BaseNodeLabel, "Collection" | "Entity" | "Content">;

/** Name of a layout component wrapping a route's view, resolved in `src/config/layouts.ts` */
export type LayoutName = "default" | "blank";

export interface Bookmark {
  data: CollectionNode | TextNode;
  createdAt: string; // ISO 8601 string
  updatedAt: string; // ISO 8601 string
}

export interface Character {
  data: ICharacter;
  annotations: AnnotationReference[];
}

export interface CharacterPostData {
  characters: ICharacter[];
  text: string;
  textUuid: string;
  uuidEnd: string;
  uuidStart: string;
}

export type CollectionNode = Node<ICollection>;

export interface CollectionAccessObject {
  annotations: NodeDto<AnnotationNode>[];
  collection: NodeDto<CollectionNode>;
  texts: NodeDto<TextNode>[];
}

export interface CollectionAccessStatusObject {
  collection: NodeStatusObject<CollectionNode>;
  texts: NodeStatusObject<TextNode>[];
  annotations: NodeStatusObject[];
}

export type CollectionCreationData = CollectionAccessObject & {
  parentCollection: CollectionNode | null;
};

export type CollectionNetworkActionType = "move" | "reference" | "dereference" | "delete";

export interface CollectionPostData {
  data: CollectionAccessObject;
  initialData: CollectionAccessObject;
}

export interface CollectionPreview {
  collection: CollectionNode;
  nodeCounts: {
    annotations: number;
    texts: number;
    collections: number;
  };
}

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

export type HistoryStack = HistoryRecord[];

export interface HistoryRecord {
  caretPosition: string | null;
  timestamp: Date;
  data: {
    afterEndCharacter: Character | null;
    annotations: Annotation[];
    beforeStartCharacter: Character | null;
    characters: Character[];
  };
}

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
}

/**
 * Root element for any kind of Collection/Content hierarchies in the editor.
 * Which set of items the first column lists. `"database"` lists the top of the `PART_OF` hierarchy;
 * the other kinds list a client-side set of items (bookmarks, or the members of one workspace).
 * Every column below the first shows `PART_OF` children regardless of the root.
 */
export interface HierarchyRoot {
  kind: "database" | "bookmarks" | "workspace";
  /** Workspace uuid; `null` for the other kinds. */
  uuid: string | null;
}

/** Focus-pane data for a Collection: the node itself plus its (editable) annotations. */
export interface CollectionFocus {
  kind: "collection";
  collection: NodeStatusObject<CollectionNode>;
  annotations: NodeStatusObject[];
}

/** Focus-pane data for a Content: the node itself, shown read-only. */
export interface ContentFocus {
  kind: "content";
  content: NodeStatusObject<TextNode>;
}

/** What the focus pane renders — a Collection (editable) or a Content (read-only preview). */
export type FocusData = CollectionFocus | ContentFocus;

/** Sort state for a hierarchy listing. */
export interface HierarchySort {
  /** Field to sort by. Normally defaults to `distinct` if no specific field is provided. Backend handles this by
   * applying the default value for the given node (`text`, `label`, `etc`).
   */
  field: "distinct" | string;
  /** Direction to sort by. */
  direction: "asc" | "desc";
}

/**
 * Filter state for a hierarchy listing. Kept as an object (not flat params) so property predicates
 * can be added later without changing call signatures. `nodeLabels` is one flat, global set (union
 * of Collection + Content labels).
 */
export interface HierarchyFilters {
  search: string;
  nodeLabels: string[];
}

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
}

export type PropertyConfigDataType = "array" | "boolean" | "date" | "date-time" | "integer" | "number" | "string" | "time";

export type PropertyConfigStringTemplate = "input" | "textarea";

export interface Range {
  from: number;
  to: number;
}

export interface RedrawModeOptions {
  direction: "on" | "off";
  cause?: "success" | "cancel";
  annotationUuid?: string;
}

export interface SemanticBlockRange {
  startPos: number;
  endPos: number;
  type: string;
  uuid: string;
}

export interface StandoffAnnotation {
  [key: string]: any;
  startIndex: number;
  endIndex: number;
  text: string;
  type: string;
  subType?: string | number;
}

export interface StandoffJson {
  annotations: StandoffAnnotation[];
  text: string;
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

export interface TextOperationResult {
  leftBoundary?: string | null;
  rightBoundary?: string | null;
  changeSet?: Character[];
}

export type ToCItem = TreeNode & {
  data: {
    nodeSize: number;
    nodeType: string;
    /** Canonical (project-configured) annotation type, derived from the live node, not _annotationData. */
    type: string;
    /** Heading level when the node is a heading; read from the live native attr. */
    level?: number;
    pos: number;
    text: string;
    _annotationData: Record<string, any>;
    _semanticBlocks: { uuid: string; annotationType: string }[] | null;
  };
  children: ToCItem[];
};
