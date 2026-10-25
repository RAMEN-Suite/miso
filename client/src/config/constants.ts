import type { AnnotationType } from "../models/types";

/**
 * Delay in miliseconds before fetching new data based on changed parameters
 */
export const FETCH_DELAY: number = 300;

/**
 * Prefix for lucide icon names. Is combined with the icon name
 * to form the full Lucide icon name (e.g. `icon-folder`).
 */
export const LUCIDE_ICON_PREFIX = "icon-" as const;

/**
 * Configurations of built-in structural annotation types. Is combined with the project-specific configuration
 * on load: these types can be renamed (type and attributes) via `miso.editing.native` and extended with new
 * properties, but their properties can't be redefined.
 */
export const BUILTIN_STRUCTURAL_CONFIGS: AnnotationType[] = [
  {
    type: "paragraph",
    properties: [],
    miso: {
      group: "structure",
      controls: {},
      editing: { extent: "range", representation: "structure" },
    },
  },
  {
    type: "heading",
    properties: [
      {
        name: "level",
        type: "Integer",
        minimum: 1,
        maximum: 6,
        required: true,
        editable: true,
        visible: true,
      },
    ],
    miso: {
      group: "structure",
      controls: {},
      editing: { extent: "range", representation: "structure" },
    },
  },
  {
    type: "hardBreak",
    properties: [],
    miso: {
      group: "structure",
      controls: {},
      editing: { extent: "zeroPoint", representation: "structure" },
    },
  },
  {
    type: "table",
    properties: [],
    miso: {
      group: "structure",
      controls: {},
      editing: { extent: "range", representation: "structure" },
    },
  },
  {
    type: "tableRow",
    // TEI `att.tableDecoration`. Optional on rows: only kept from stored data, the editor doesn't set them.
    properties: [
      { name: "rowspan", type: "Integer", required: false, editable: false, visible: true },
      { name: "colspan", type: "Integer", required: false, editable: false, visible: true },
      { name: "role", type: "String", required: false, editable: false, visible: true, options: ["data", "label"] },
    ],
    miso: {
      group: "structure",
      controls: {},
      editing: { extent: "range", representation: "structure" },
    },
  },
  {
    type: "tableCell",
    // TEI `att.tableDecoration`. Set by the editor on cells: rowspan/colspan on merge/split, role `label` via the
    // header toggles (`data` is accepted, but not set).
    properties: [
      { name: "rowspan", type: "Integer", required: false, editable: true, visible: true },
      { name: "colspan", type: "Integer", required: false, editable: true, visible: true },
      { name: "role", type: "String", required: false, editable: false, visible: true, options: ["data", "label"] },
    ],
    miso: {
      group: "structure",
      controls: {},
      editing: { extent: "range", representation: "structure" },
    },
  },
  {
    type: "bulletList",
    properties: [],
    miso: {
      group: "structure",
      controls: {},
      editing: { extent: "range", representation: "structure" },
    },
  },
  {
    type: "listItem",
    properties: [],
    miso: {
      group: "structure",
      controls: {},
      editing: { extent: "range", representation: "structure" },
    },
  },
];

/**
 * Nesting rules of the editor's built-in structural types, used to build the document tree from standoff annotations.
 * They are editor internals and not configurable.
 * - `priority`: decides which of two annotations with the same range is the outer one. Higher is more outer.
 * - `contains`: the built-in types allowed as direct children. Empty means no restriction (or a leaf).
 */
export const BUILTIN_STRUCTURAL_NESTING = {
  bulletList: { priority: 60, contains: ["listItem"] },
  listItem: { priority: 50, contains: ["paragraph", "heading", "bulletList", "table"] },
  hardBreak: { priority: 10, contains: [] },
  heading: { priority: 30, contains: [] },
  table: { priority: 90, contains: ["tableRow"] },
  paragraph: { priority: 20, contains: [] },
  tableCell: { priority: 70, contains: ["paragraph", "heading", "bulletList", "table"] },
  tableRow: { priority: 80, contains: ["tableCell"] },
} as const;
