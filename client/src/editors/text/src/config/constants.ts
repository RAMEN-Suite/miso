import type { NativeTypeConfig } from "../models/types";

/**
 * The structural types the editor implements natively, with the attributes it sets itself. A project names them via
 * `miso.mappings` (type and attributes) and declares matching annotation shapes in its model, which may add further
 * properties. The built-in attributes can be renamed, but not redefined.
 *
 * Also read by `scripts/build-ramen-from-introspection.mjs`, which declares these types in a generated model.
 */
export const BUILTIN_STRUCTURAL_CONFIGS: NativeTypeConfig[] = [
  {
    type: "paragraph",
    extent: "range",
    attributes: [],
  },
  {
    type: "heading",
    extent: "range",
    attributes: [{ name: "level", type: "Integer", minimum: 1, maximum: 6, required: true }],
  },
  {
    type: "hardBreak",
    extent: "zeroPoint",
    attributes: [],
  },
  {
    type: "table",
    extent: "range",
    attributes: [],
  },
  {
    type: "tableRow",
    extent: "range",
    // TEI `att.tableDecoration`. Optional on rows: only kept from stored data, the editor doesn't set them.
    attributes: [
      { name: "rowspan", type: "Integer", required: false },
      { name: "colspan", type: "Integer", required: false },
      { name: "role", type: "String", required: false, options: ["data", "label"] },
    ],
  },
  {
    type: "tableCell",
    extent: "range",
    // TEI `att.tableDecoration`. Set by the editor on cells: rowspan/colspan on merge/split, role `label` via the
    // header toggles (`data` is accepted, but not set).
    attributes: [
      { name: "rowspan", type: "Integer", required: false },
      { name: "colspan", type: "Integer", required: false },
      { name: "role", type: "String", required: false, options: ["data", "label"] },
    ],
  },
  {
    type: "bulletList",
    extent: "range",
    attributes: [],
  },
  {
    type: "listItem",
    extent: "range",
    attributes: [],
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
