import type { IconSpecInput, NativeType } from "../external";
import type { NativeTypeAttribute, NativeTypeConfig } from "../models/types";

const OPTIONAL = { lowerBound: 0, upperBound: 1 } as const;
const REQUIRED = { lowerBound: 1, upperBound: 1 } as const;

/** Native types that hold blocks (paragraphs, headings, lists and tables) */
const BLOCK_CONTENT: readonly NativeType[] = ["paragraph", "heading", "bulletList", "table"];

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
 * The structural types the editor implements natively, with the attributes it sets itself and its nesting rules. A
 * project names them via `editors.text.mappings` (type and attributes) and declares matching annotation shapes in its
 * model, which may add further properties. The native attributes can be renamed, but not redefined; the nesting rules
 * are editor internals and not configurable. Keyed by native type, so every native type has exactly one entry.
 */
export const NATIVE_TYPE_CONFIGS: Readonly<Record<NativeType, NativeTypeConfig>> = {
  paragraph: {
    extent: "range",
    attributes: [],
    icon: "pilcrow",
    priority: 20,
    contains: [],
  },
  heading: {
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
    priority: 30,
    contains: [],
  },
  hardBreak: {
    extent: "zeroPoint",
    attributes: [],
    icon: "text-wrap",
    priority: 10,
    contains: [],
  },
  table: {
    extent: "range",
    attributes: [],
    icon: "table",
    priority: 90,
    contains: ["tableRow"],
  },
  tableRow: {
    extent: "range",
    icon: "rows-3",
    // Only kept from stored data on rows, the editor doesn't set them
    attributes: TABLE_DECORATION_ATTRIBUTES,
    priority: 80,
    contains: ["tableCell"],
  },
  tableCell: {
    extent: "range",
    icon: "square",
    // Set by the editor on cells: rowspan/colspan on merge/split, role `label` via the header toggles (`data` is
    // accepted, but not set)
    attributes: TABLE_DECORATION_ATTRIBUTES,
    priority: 70,
    contains: BLOCK_CONTENT,
  },
  bulletList: {
    extent: "range",
    attributes: [],
    icon: "list",
    priority: 60,
    contains: ["listItem"],
  },
  listItem: {
    extent: "range",
    attributes: [],
    icon: "dot",
    priority: 50,
    contains: BLOCK_CONTENT,
  },
};

/** The native types, in the order of {@linkcode NATIVE_TYPE_CONFIGS} */
export const NATIVE_TYPES = Object.keys(NATIVE_TYPE_CONFIGS) as NativeType[];

/**
 * The config of a native type.
 *
 * @param {NativeType} native - The native type.
 * @returns {NativeTypeConfig} The config.
 */
export function getNativeTypeConfig(native: NativeType): NativeTypeConfig {
  return NATIVE_TYPE_CONFIGS[native];
}

/**
 * The icon of a native type.
 *
 * @param {NativeType} native - The native type.
 * @returns {IconSpecInput} The icon.
 */
export function nativeTypeIcon(native: NativeType): IconSpecInput {
  return getNativeTypeConfig(native).icon;
}
