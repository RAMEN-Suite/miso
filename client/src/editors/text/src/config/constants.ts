import type { NativeTypeAttribute, NativeTypeConfig } from "../models/types";

const OPTIONAL = { lowerBound: 0, upperBound: 1 } as const;
const REQUIRED = { lowerBound: 1, upperBound: 1 } as const;

/** TEI `att.tableDecoration` of rows and cells */
const TABLE_DECORATION_ATTRIBUTES: NativeTypeAttribute[] = [
  { name: "rowspan", typeId: "Integer", bounds: OPTIONAL },
  { name: "colspan", typeId: "Integer", bounds: OPTIONAL },
  {
    name: "role",
    typeId: "String",
    bounds: OPTIONAL,
    constraints: [
      {
        name: "Table role",
        language: "json-schema",
        expression: { enum: ["data", "label"] },
        message: 'Value must be "data" or "label".',
      },
    ],
  },
];

/**
 * The structural types the editor implements natively, with the attributes it sets itself. A project names them via
 * `miso.editors.text.mappings` (type and attributes) and declares matching annotation shapes in its model, which may add further
 * properties. The built-in attributes can be renamed, but not redefined.
 *
 * Also read by `scripts/build-ramen-from-introspection.mjs`, which declares these types in a generated model. The
 * attributes are mirrored in `server/src/schemas/configBlocks.schema.ts`, keep them in sync.
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
    attributes: [
      {
        name: "level",
        typeId: "Integer",
        bounds: REQUIRED,
        constraints: [
          {
            name: "Heading level",
            language: "json-schema",
            expression: { minimum: 1, maximum: 6 },
            message: "Value must be between 1 and 6.",
          },
        ],
      },
    ],
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
    // Only kept from stored data on rows, the editor doesn't set them
    attributes: TABLE_DECORATION_ATTRIBUTES,
  },
  {
    type: "tableCell",
    extent: "range",
    // Set by the editor on cells: rowspan/colspan on merge/split, role `label` via the header toggles (`data` is
    // accepted, but not set)
    attributes: TABLE_DECORATION_ATTRIBUTES,
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
