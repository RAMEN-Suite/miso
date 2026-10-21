import { z } from "zod";
import { EDITOR_OWNED_ATTRIBUTES } from "../config/editor";
import GuidelinesValidationError from "../utils/errors/guidelinesValidation.error";

// Schemas and types of the guidelines. The types are inferred from the schemas, so the format is defined only once.
// Objects are strict, so unknown or misplaced keys (e.g. a typo or a key on the wrong level) are reported instead of
// being ignored silently.

// ----- Icons -----

const lucideIconSpecSchema = z.strictObject({
  kind: z.literal("lucide"),
  /** Name of the lucide icon, in kebab-case (e.g. `folder-open`) */
  name: z.string(),
});

const urlIconSpecSchema = z.strictObject({
  kind: z.literal("url"),
  /** URL of the icon. */
  url: z.string(),
});

const svgIconSpecSchema = z.strictObject({
  kind: z.literal("svg"),
  /** Raw SVG markup. */
  svg: z.string(),
});

const iconSpecSchema = z.discriminatedUnion("kind", [lucideIconSpecSchema, urlIconSpecSchema, svgIconSpecSchema]);

const iconSpecInputSchema = z.union([z.string(), iconSpecSchema]);

/** An icon from the Lucide set. */
export type LucideIconSpec = z.infer<typeof lucideIconSpecSchema>;

/** An icon loaded from an external URL. */
export type UrlIconSpec = z.infer<typeof urlIconSpecSchema>;

/** Raw inline SVG markup. */
export type SvgIconSpec = z.infer<typeof svgIconSpecSchema>;

/**
 * Description of an icon that can be injected by the configuration to describe annotation types,
 * RAMEN node refinements etc.
 *
 * Can be configured in different ways, e.g. as a Lucide icon name, a URL, or a SVG icon.
 */
export type IconSpec = z.infer<typeof iconSpecSchema>;

/**
 * What a configuration may write: the full object form, or a bare Lucide name as shorthand.
 * Used to allow users to write `icon: "folder-open"` instead of `icon: { kind: "lucide", name: "folder-open" }`.
 */
export type IconSpecInput = z.infer<typeof iconSpecInputSchema>;

// ----- Annotation styles -----

const propertiesTextStyleSchema = z.strictObject({
  kind: z.literal("properties"),
  color: z.string().optional(),
  backgroundColor: z.string().optional(),
  fontWeight: z.string().optional(),
  fontStyle: z.string().optional(),
  fontVariant: z.string().optional(),
  fontSize: z.string().optional(),
  verticalAlign: z.string().optional(),
  textDecorationLine: z.string().optional(),
  textDecorationStyle: z.string().optional(),
  textDecorationColor: z.string().optional(),
  textDecorationThickness: z.string().optional(),
});

const iconStyleSchema = z.strictObject({ kind: z.literal("icon"), icon: iconSpecInputSchema });

const mathTextStyleSchema = z.strictObject({
  kind: z.literal("math"),
  /** Name of the annotation property that holds the LaTeX notation */
  property: z.string(),
  /** CSS `display` of the formula. `block` also renders it in display mode (own line, larger operators). */
  display: z.string().optional(),
});

const highlightTextStyleSchema = z.discriminatedUnion("kind", [propertiesTextStyleSchema]);

const markerStyleSchema = z.discriminatedUnion("kind", [iconStyleSchema, mathTextStyleSchema]);

/** Predefined CSS properties. The keys are the camelCase names of the corresponding CSS properties. */
export type PropertiesTextStyle = z.infer<typeof propertiesTextStyleSchema>;

/** An icon rendered at the position of an annotation. */
export type IconStyle = z.infer<typeof iconStyleSchema>;

/**
 * A formula rendered at the position of an annotation with KaTeX, from the LaTeX notation stored in the annotation
 * property `property`. The other keys are predefined CSS properties applied to the marker, keyed by their camelCase
 * names (like {@linkcode PropertiesTextStyle}).
 *
 * @example
 * { "kind": "math", "property": "latex", "display": "block" }
 */
export type MathTextStyle = z.infer<typeof mathTextStyleSchema>;

/**
 * Styling of the text covered by a `range` annotation.
 */
export type HighlightTextStyle = z.infer<typeof highlightTextStyleSchema>;

/**
 * Styling of the position of a `zeroPoint` annotation: an icon or a formula.
 */
export type MarkerStyle = z.infer<typeof markerStyleSchema>;

// ----- Annotation miso configuration -----

const annotationExtentSchema = z.enum(["zeroPoint", "range"]);

const textAnnotationRepresentationSchema = z.enum(["structure", "inline", "blockClassification"]);

const builtinStructuralTypeSchema = z.enum([
  "paragraph",
  "heading",
  "hardBreak",
  "table",
  "tableRow",
  "tableCell",
  "bulletList",
  "listItem",
]);

const appearanceOverrideSchema = z.strictObject({
  highlight: highlightTextStyleSchema.optional(),
  marker: markerStyleSchema.optional(),
});

const appearanceVariantSchema = z.strictObject({
  /** Name of the annotation property whose value is matched */
  property: z.string(),
  /** Appearance overrides keyed by property value */
  values: z.record(z.string(), appearanceOverrideSchema),
});

const annotationAppearanceSchema = z.strictObject({
  /** Icon in the toolbar and in annotation lists */
  icon: iconSpecInputSchema.optional(),
  /** Styling of the annotated text. Only applies to `range` annotations. */
  highlight: highlightTextStyleSchema.optional(),
  /** Marker that is rendered at the position of the annotation. Only applies to `zeroPoint` annotations. */
  marker: markerStyleSchema.optional(),
  /**
   * Overrides for annotations with certain property values. They override the type's appearance and are applied in
   * order, so later matches win. Highlights are merged field by field, a marker replaces the previous one. The icon
   * can't be overridden, since it identifies the annotation type in places without annotation data (e.g. the toolbar).
   *
   * @example
   * [{ "property": "hand", "values": { "#author": { "highlight": { "kind": "properties", "backgroundColor": "green" } } } }]
   */
  variants: z.array(appearanceVariantSchema).optional(),
});

const nativeTypeMappingSchema = z.strictObject({
  /** The native type */
  type: builtinStructuralTypeSchema,
  /**
   * Names of the annotation properties that hold the native type's attributes, keyed by native attribute
   * (native attribute -> project property). Attributes that are not listed keep their name from the default mapping.
   */
  attributes: z.partialRecord(z.enum(EDITOR_OWNED_ATTRIBUTES), z.string()).optional(),
});

const annotationMisoConfigSchema = z.strictObject({
  /** Group the annotation type is listed under in the toolbar and the filter */
  group: z.string().optional(),
  /** How the user creates and interacts with annotations of this type */
  controls: z
    .strictObject({
      /** Keyboard shortcut in keymap notation, e.g. `Mod-Shift-e`. `Mod` is Cmd on macOS and Ctrl elsewhere. */
      shortcut: z.string().optional(),
    })
    .optional(),
  /** How annotations of this type are placed and represented in the content */
  editing: z
    .strictObject({
      extent: annotationExtentSchema.optional(),
      representation: textAnnotationRepresentationSchema.optional(),
      /**
       * The editor's native type that implements this annotation type. Its extent and representation are then taken
       * from the native type.
       */
      native: nativeTypeMappingSchema.optional(),
    })
    .optional(),
  appearance: annotationAppearanceSchema.optional(),
});

/**
 * How far an annotation extends in its content, configured in `miso.editing.extent`. Both values correspond to a
 * Web Annotation `TextPositionSelector` (a zero point has the same start and end).
 * - `range`: covers a range in the text, marked with `startIndex` and `endIndex` (both inclusive).
 *    Required for annotations with representation `blockClassification`.
 * - `zeroPoint`: an atom between two characters; `startIndex` is an offset, not a range start.
 */
export type AnnotationExtent = z.infer<typeof annotationExtentSchema>;

/**
 * How an annotation is represented in the text editor, configured in `miso.editing.representation`. Only applies to
 * annotations on text content. Options are:
 * - `structure`: document scaffolding (paragraph, heading, table, hardBreak etc.). Used by
 *    the built-in types, can be (partially) overriden by the user with custom type names and additional properties
 * - `blockClassification`: adds meaning to whole structural blocks (classifies them, like the Web Annotation motivation
 *    `classifying`), without creating or containing them. Mirror TEI-like block elements (opener, closer, addrLine etc.)
 *    to a certain extent. Unrelated to the classifiers (node types) of the data model.
 * - `inline`: user interpretation of a text range (font styling, commentaries, entities). Kind of the default annotation.
 */
export type TextAnnotationRepresentation = z.infer<typeof textAnnotationRepresentationSchema>;

/** The structural node types the editor implements natively */
export type BuiltinStructuralType = z.infer<typeof builtinStructuralTypeSchema>;

/** Appearance overrides for annotations with a certain property value */
export type AppearanceOverride = z.infer<typeof appearanceOverrideSchema>;

/** Overrides of the appearance per value of one annotation property */
export type AppearanceVariant = z.infer<typeof appearanceVariantSchema>;

/** How annotations of a type are rendered */
export type AnnotationAppearance = z.infer<typeof annotationAppearanceSchema>;

/**
 * Maps an annotation type to a native type of the editor, e.g. a TEI `cell` to the editor's `tableCell`.
 *
 * @example
 * { "type": "tableCell", "attributes": { "colspan": "cols", "rowspan": "rows" } }
 */
export type NativeTypeMapping = z.infer<typeof nativeTypeMappingSchema>;

/**
 * Miso-only configuration of an annotation type. Everything in here is frontend-only and not part of the data model.
 */
export type AnnotationMisoConfig = z.infer<typeof annotationMisoConfigSchema>;

// ----- Properties -----

const propertyConfigDataTypeSchema = z.enum(["Array", "Boolean", "Date", "DateTime", "Float", "Integer", "String", "Time"]);

const propertyConfigShape = {
  /** folioEnd, label, websiteUrl */
  name: z.string(), // Miso -> name to display. Or remove kompletely, type is type
  /** data type (raw string, dropdown, multiple options) */
  type: propertyConfigDataTypeSchema, // Nori
  /** required or optional */
  required: z.boolean(), // Nori
  /** Editable by user */
  editable: z.boolean(), // Miso
  /** Visible by user */
  visible: z.boolean(), // Miso
  // The rest here is Miso
  /** Only relevant if type is "Array" */
  minItems: z.number().optional(),
  /** Only relevant if type is "Array" */
  maxItems: z.number().optional(),
  /** Only relevant if type is "Float"/"Integer" */
  minimum: z.number().optional(),
  /** Only relevant if type is "Float"/"Integer" */
  maximum: z.number().optional(),
  /** Only relevant if type is "Float"/"Integer" */
  exclusiveMinimum: z.number().optional(),
  /** Only relevant if type is "Float"/"Integer" */
  exclusiveMaximum: z.number().optional(),
  /** Only relevant if type is "String" */
  minLength: z.number().optional(),
  /** Only relevant if type is "String" */
  maxLength: z.number().optional(),
  /** Options if type is dropdown */
  options: z.union([z.array(z.string()), z.array(z.number())]).optional(),
};

const propertyConfigSchema = z.strictObject({
  ...propertyConfigShape,
  /** Config of the items. Only relevant if type is "Array". Items can't be Arrays themselves, so this is not recursive. */
  items: z.strictObject(propertyConfigShape).partial().optional(),
});

const scopedPropertiesSchema = z.strictObject({
  system: z.array(propertyConfigSchema),
  base: z.array(propertyConfigSchema),
});

export type PropertyConfigDataType = z.infer<typeof propertyConfigDataTypeSchema>;

export type PropertyConfig = z.infer<typeof propertyConfigSchema>;

// ----- Annotation types -----

const annotationTypeSchema = z.strictObject({
  hasEntities: z.boolean().optional(), // Derived from Nori
  properties: z.array(propertyConfigSchema).optional(), // Nori
  type: z.string(), // Nori -> discriminator, also property there
  /** Miso-only configuration (editor behaviour, controls, appearance) */
  miso: annotationMisoConfigSchema.optional(),
});

export type AnnotationType = z.infer<typeof annotationTypeSchema>;

// ----- Node types -----

const nodeAppearanceSchema = z.strictObject({ icon: iconSpecInputSchema.optional() });

const nodeMisoConfigSchema = z.strictObject({ appearance: nodeAppearanceSchema.optional() });

const contentMediumSchema = z.enum(["text", "image"]);

const contentTypeMisoConfigSchema = nodeMisoConfigSchema.extend({ medium: contentMediumSchema.optional() });

/** How nodes of a type are displayed, e.g. in the hierarchy */
export type NodeAppearance = z.infer<typeof nodeAppearanceSchema>;

/** Miso-only configuration of a node type (Collection, Content or Entity refinement) */
export type NodeMisoConfig = z.infer<typeof nodeMisoConfigSchema>;

/**
 * The medium of a Content type, which decides how its nodes are edited and how annotation configs are applied.
 */
export type ContentMedium = z.infer<typeof contentMediumSchema>;

/** Miso-only configuration of a Content type */
export type ContentTypeMisoConfig = z.infer<typeof contentTypeMisoConfigSchema>;

// ----- Guidelines -----

const guidelinesSchema = z.strictObject({
  /** Refinements of the Collection node, e.g. Letter or Abstract */
  collections: z.strictObject({
    miso: nodeMisoConfigSchema.optional(),
    properties: scopedPropertiesSchema,
    types: z.array(
      z.strictObject({
        additionalLabel: z.string(),
        properties: z.array(propertyConfigSchema),
        annotations: z.strictObject({
          types: z.array(annotationTypeSchema),
          properties: z.array(propertyConfigSchema),
        }),
        miso: nodeMisoConfigSchema.optional(),
      }),
    ),
    annotations: z.strictObject({
      types: z.array(annotationTypeSchema),
      properties: scopedPropertiesSchema,
    }),
  }),
  /** Refinements of the Content node, e.g. Text or Image */
  contents: z.strictObject({
    miso: nodeMisoConfigSchema.optional(),
    types: z.array(
      z.strictObject({
        additionalLabel: z.string(),
        miso: contentTypeMisoConfigSchema.optional(),
      }),
    ),
    annotations: z.strictObject({
      types: z.array(annotationTypeSchema),
      properties: scopedPropertiesSchema,
    }),
  }),
  /** Refinements of the Entity node, e.g. Person or Place */
  entities: z.strictObject({
    miso: nodeMisoConfigSchema.optional(),
    types: z.array(
      z.strictObject({
        additionalLabel: z.string(),
        miso: nodeMisoConfigSchema.optional(),
      }),
    ),
  }),
});

export type IGuidelines = z.infer<typeof guidelinesSchema>;

/**
 * Checks that the given data has the format of {@linkcode IGuidelines} and returns it typed.
 *
 * @param {unknown} data - The guidelines as received, e.g. the parsed JSON response of the API.
 * @returns {IGuidelines} The validated guidelines.
 * @throws {GuidelinesValidationError} If the data does not match the format. The message lists every problem with
 * its path in the guidelines.
 */
export function parseGuidelines(data: unknown): IGuidelines {
  const result = guidelinesSchema.safeParse(data);

  if (!result.success) {
    throw new GuidelinesValidationError(z.prettifyError(result.error));
  }

  return result.data;
}
