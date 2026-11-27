import type { IconSpecInput, NativeType } from "../external";
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
 * `editors.text.mappings` (type and attributes) and declares matching annotation shapes in its model, which may add further
 * properties. The native attributes can be renamed, but not redefined.
 */
export const NATIVE_TYPE_CONFIGS: NativeTypeConfig[] = [
  {
    native: "paragraph",
    extent: "range",
    attributes: [],
    icon: "pilcrow",
  },
  {
    native: "heading",
    extent: "range",
    icon: "heading",
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
    native: "hardBreak",
    extent: "zeroPoint",
    attributes: [],
    icon: "text-wrap",
  },
  {
    native: "table",
    extent: "range",
    attributes: [],
    icon: "table",
  },
  {
    native: "tableRow",
    extent: "range",
    icon: "rows-3",
    // Only kept from stored data on rows, the editor doesn't set them
    attributes: TABLE_DECORATION_ATTRIBUTES,
  },
  {
    native: "tableCell",
    extent: "range",
    icon: "square",
    // Set by the editor on cells: rowspan/colspan on merge/split, role `label` via the header toggles (`data` is
    // accepted, but not set)
    attributes: TABLE_DECORATION_ATTRIBUTES,
  },
  {
    native: "bulletList",
    extent: "range",
    attributes: [],
    icon: "list",
  },
  {
    native: "listItem",
    extent: "range",
    attributes: [],
    icon: "dot",
  },
];

/**
 * The config of a native type.
 *
 * @param {string | undefined} native - The native type.
 * @returns {NativeTypeConfig | undefined} The config, `undefined` for an unknown native type.
 */
export function getNativeTypeConfig(native: string | undefined): NativeTypeConfig | undefined {
  return NATIVE_TYPE_CONFIGS.find((config) => config.native === native);
}

/**
 * The icon of a native type.
 *
 * @param {NativeType} native - The native type.
 * @returns {IconSpecInput | undefined} The icon, `undefined` for an unknown native type.
 */
export function nativeTypeIcon(native: NativeType): IconSpecInput | undefined {
  return getNativeTypeConfig(native)?.icon;
}

/**
 * Nesting rules of the editor's native types, used to build the document tree from standoff annotations.
 * They are editor internals and not configurable.
 * - `priority`: decides which of two annotations with the same range is the outer one. Higher is more outer.
 * - `contains`: the native types allowed as direct children. Empty means no restriction (or a leaf).
 */
export const NATIVE_TYPE_NESTING = {
  bulletList: { priority: 60, contains: ["listItem"] },
  listItem: { priority: 50, contains: ["paragraph", "heading", "bulletList", "table"] },
  hardBreak: { priority: 10, contains: [] },
  heading: { priority: 30, contains: [] },
  table: { priority: 90, contains: ["tableRow"] },
  paragraph: { priority: 20, contains: [] },
  tableCell: { priority: 70, contains: ["paragraph", "heading", "bulletList", "table"] },
  tableRow: { priority: 80, contains: ["tableCell"] },
} as const;
