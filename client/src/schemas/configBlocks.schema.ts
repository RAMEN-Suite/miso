import { z } from "zod";
import { BUILTIN_STRUCTURAL_CONFIGS } from "../editors/text/src/config/constants";

// Schemas and types of the settings of model elements (the entries of `elements.classifiers`/`elements.annotations`).
// The types are inferred from the schemas, so the format is defined only once. Objects are strict, so unknown or
// misplaced keys (e.g. a typo, a key on the wrong level or an option of another element kind) are reported instead of
// being ignored silently. The config file itself is described by `misoConfigSchema`. The schemas are mirrored in
// `server/src/schemas/configBlocks.schema.ts`, keep them in sync.

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

const iconSpecInputSchema = z
  .union([z.string(), iconSpecSchema])
  .describe(
    "Icon of the type in the toolbar, lists and the hierarchy: a Lucide icon name (e.g. folder-open), an image URL or raw SVG markup.",
  );

/** The kinds of icons, from the schema */
export const ICON_KINDS = iconSpecSchema.options.map((option) => option.shape.kind.value);

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
  letterSpacing: z.string().optional(),
  verticalAlign: z.string().optional(),
  textDecorationLine: z.string().optional(),
  textDecorationStyle: z.string().optional(),
  textDecorationColor: z.string().optional(),
  textDecorationThickness: z.string().optional(),
});

const iconStyleSchema = z.strictObject({ kind: z.literal("icon"), icon: iconSpecInputSchema });

const mathTextStyleSchema = z.strictObject({
  kind: z.literal("math"),
  /** Attribute ref (`<modelId>:<attributeId>`) of the annotation property that holds the LaTeX notation */
  property: z.string(),
  /** CSS `display` of the formula. `block` also renders it in display mode (own line, larger operators). */
  display: z.string().optional(),
});

const highlightTextStyleSchema = z
  .discriminatedUnion("kind", [propertiesTextStyleSchema])
  .describe("How the annotated text looks in the editor (color, font, decoration). Only for annotations with extent range.");

const markerStyleSchema = z
  .discriminatedUnion("kind", [iconStyleSchema, mathTextStyleSchema])
  .describe(
    "What the editor shows at the position of the annotation: an icon, or a formula from one of its properties. Only for annotations with extent zeroPoint; without one, a crossed box is shown.",
  );

/** The CSS properties a highlight can set (its keys without `kind`), from the schema */
export const HIGHLIGHT_STYLE_KEYS = propertiesTextStyleSchema
  .keyof()
  .options.filter((key): key is Exclude<keyof z.infer<typeof propertiesTextStyleSchema>, "kind"> => key !== "kind");

/** The kinds of markers, from the schema */
export const MARKER_KINDS = markerStyleSchema.options.map((option) => option.shape.kind.value);

/** Predefined CSS properties. The keys are the camelCase names of the corresponding CSS properties. */
export type PropertiesTextStyle = z.infer<typeof propertiesTextStyleSchema>;

/** An icon rendered at the position of an annotation. */
export type IconStyle = z.infer<typeof iconStyleSchema>;

/**
 * A formula rendered at the position of an annotation with KaTeX, from the LaTeX notation stored in the annotation
 * property `property`. The other keys are predefined CSS properties applied to the marker, keyed by their camelCase
 * names (like {@linkcode PropertiesTextStyle}). In the config, `property` is an attribute ref; the text editor gets the
 * property name (see `toEditorAppearance`).
 *
 * @example
 * { "kind": "math", "property": "<modelId>:<attributeId of latex>", "display": "block" }
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

/** What each extent means, for help texts; also the description of the schema */
export const ANNOTATION_EXTENT_DESCRIPTIONS = {
  range: "Covers a stretch of text, from a start to an end character.",
  zeroPoint: "Sits between two characters without covering text, e.g. a line break or a gap marker.",
} as const;

/** What each representation means, for help texts; also the description of the schema */
export const TEXT_ANNOTATION_REPRESENTATION_DESCRIPTIONS = {
  inline: "An interpretation of a text range, shown with a highlight or a marker. The default.",
  structure:
    "Document scaffolding like paragraphs, headings and tables, shown as blocks. Comes from a mapping to a native type; unmapped shapes can't have it.",
  blockClassification: "Adds meaning to whole blocks (e.g. opener, closer), shown as tags and lines next to them.",
} as const;

/** "value: description" per value, for the description of an enum */
function describeValues(descriptions: Record<string, string>): string {
  return Object.entries(descriptions)
    .map(([value, description]) => `${value}: ${description}`)
    .join(" ");
}

const annotationExtentSchema = z
  .enum(["zeroPoint", "range"])
  .describe(`How far an annotation extends in the text. ${describeValues(ANNOTATION_EXTENT_DESCRIPTIONS)}`);

const textAnnotationRepresentationSchema = z
  .enum(["structure", "inline", "blockClassification"])
  .describe(`How the text editor shows the annotation. ${describeValues(TEXT_ANNOTATION_REPRESENTATION_DESCRIPTIONS)}`);

export const builtinStructuralTypeSchema = z
  .enum(["paragraph", "heading", "hardBreak", "table", "tableRow", "tableCell", "bulletList", "listItem"])
  .describe(
    "The editor's native types, which it implements itself. A native mapping says which annotation shape of the project stands for one of them.",
  );

/** The extents of annotations, from the schema */
export const ANNOTATION_EXTENTS = annotationExtentSchema.options;

/** The representations of text annotations, from the schema */
export const TEXT_ANNOTATION_REPRESENTATIONS = textAnnotationRepresentationSchema.options;

const appearanceOverrideSchema = z.strictObject({
  highlight: highlightTextStyleSchema.optional(),
  marker: markerStyleSchema.optional(),
});

const appearanceVariantSchema = z.strictObject({
  /** Attribute ref (`<modelId>:<attributeId>`) of the annotation property whose value is matched */
  property: z.string(),
  /** Appearance overrides keyed by property value */
  values: z.record(z.string(), appearanceOverrideSchema),
});

const appearanceVariantsSchema = z
  .array(appearanceVariantSchema)
  .describe(
    "Different highlights or markers for annotations with certain property values, e.g. another color per hand. Later variants win.",
  );

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
   * In the config, `property` is an attribute ref; the text editor gets the property name.
   *
   * @example
   * [{ "property": "<modelId>:<attributeId of hand>", "values": { "#author": { "highlight": { "kind": "properties", "backgroundColor": "green" } } } }]
   */
  variants: appearanceVariantsSchema.optional(),
});

/**
 * Reports every attribute of a native mapping that the native type doesn't have.
 *
 * @param {string} nativeType - The native type.
 * @param {Record<string, string> | undefined} attributes - Native attribute -> attribute ref of the project property.
 * @param {z.RefinementCtx} ctx - The refinement context to add the issues to.
 * @returns {void} This function does not return anything.
 */
export function checkNativeAttributes(
  nativeType: string,
  attributes: Record<string, string> | undefined,
  ctx: z.RefinementCtx,
): void {
  const nativeAttributes: string[] =
    BUILTIN_STRUCTURAL_CONFIGS.find((c) => c.type === nativeType)?.attributes.map((a) => a.name) ?? [];

  for (const attribute of Object.keys(attributes ?? {})) {
    if (!nativeAttributes.includes(attribute)) {
      ctx.addIssue({
        code: "custom",
        message: `Unknown attribute "${attribute}" for native type "${nativeType}"`,
        path: ["attributes", attribute],
      });
    }
  }
}

/**
 * The settings of an annotation shape (without the `name` hint and the attribute settings of its entry, see
 * {@linkcode annotationEntrySchema}). The native mapping lives in `editors.text.mappings`.
 */
const groupSchema = z
  .string()
  .describe("The group the annotation type is listed under in the toolbar and the filter. Without one: other.");

const shortcutSchema = z
  .string()
  .describe("Keyboard shortcut that creates the annotation, e.g. Mod-Shift-e. Mod is Cmd on macOS and Ctrl elsewhere.");

const annotationShapeConfigSchema = z.strictObject({
  /** Group the annotation type is listed under in the toolbar and the filter */
  group: groupSchema.optional(),
  /** How the user creates and interacts with annotations of this type */
  controls: z
    .strictObject({
      /** Keyboard shortcut in keymap notation, e.g. `Mod-Shift-e`. `Mod` is Cmd on macOS and Ctrl elsewhere. */
      shortcut: shortcutSchema.optional(),
    })
    .optional(),
  appearance: annotationAppearanceSchema.optional(),
  /**
   * How annotations of this type are placed and represented in the content. Ignored for annotation types mapped to a
   * native type of the editor, which brings its own.
   */
  editing: z
    .strictObject({
      extent: annotationExtentSchema.optional(),
      representation: textAnnotationRepresentationSchema.optional(),
    })
    .optional(),
});

/**
 * How far an annotation extends in its content, configured in `editing.extent` of its entry. Both are stored as a
 * `TextPositionSelector` (a zero point has the same start and end).
 * - `range`: covers a range in the text, marked with the selector's `start` and `end` (both inclusive).
 *    Required for annotations with representation `blockClassification`.
 * - `zeroPoint`: an atom between two characters; `start` is an offset, not a range start.
 */
export type AnnotationExtent = z.infer<typeof annotationExtentSchema>;

/**
 * How an annotation is represented in the text editor, configured in `editing.representation` of its entry. Only applies to
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
 * Configuration of an annotation shape (the settings of its `elements.annotations` entry). Everything in here is
 * frontend-only and not part of the data model. The native mapping lives in `editors.text.mappings`.
 */
export type AnnotationShapeConfig = z.infer<typeof annotationShapeConfigSchema>;

// ----- Node types -----

const nodeAppearanceSchema = z.strictObject({ icon: iconSpecInputSchema.optional() });

const nodeConfigSchema = z.strictObject({ appearance: nodeAppearanceSchema.optional() });

const contentMediumSchema = z
  .enum(["text", "image"])
  .describe(
    "What a Content type holds, which decides its editor and how its annotations are shown. Inherited from the nearest configured type in the lineage; default text.",
  );

/** The media of Content types, from the schema */
export const CONTENT_MEDIA = contentMediumSchema.options;

const contentTypeConfigSchema = nodeConfigSchema.extend({ medium: contentMediumSchema.optional() });

/** How nodes of a type are displayed, e.g. in the hierarchy */
export type NodeAppearance = z.infer<typeof nodeAppearanceSchema>;

/** Configuration of a node type (Collection, Content or Entity refinement) */
export type NodeConfig = z.infer<typeof nodeConfigSchema>;

/**
 * The medium of a Content type, which decides how its nodes are edited and how annotation configs are applied.
 */
export type ContentMedium = z.infer<typeof contentMediumSchema>;

/** Configuration of a Content type */
export type ContentTypeConfig = z.infer<typeof contentTypeConfigSchema>;

/** The settings of a node classifier. `medium` only applies to Content refinements. */
const classifierConfigSchema = contentTypeConfigSchema;

/** The settings of an attribute (or annotation shape property) */
const visibleSchema = z.boolean().describe("Whether users see the attribute in forms and cards. Default: yes.");

const editableSchema = z
  .boolean()
  .describe("Whether users can change the attribute. Default: yes; never for attributes that are read-only in the model.");

const attributeConfigSchema = z.strictObject({
  /** Visible by user. Defaults to `true`. */
  visible: visibleSchema.optional(),
  /** Editable by user. Defaults to `true`; always `false` for attributes that are read-only in the model. */
  editable: editableSchema.optional(),
});

/** Configuration of an attribute */
export type AttributeConfig = z.infer<typeof attributeConfigSchema>;

// ----- Entries of `elements` -----

/** Name of the element in the model. A hint for readers, the ref decides; a different name only warns. */
const nameHintSchema = z
  .string()
  .describe(
    "The element's name in the model, written next to its ref so the file is readable. Only a hint: the ref decides, a different name only warns.",
  );

/** An entry of an element's `attributes`, keyed by attribute ref (`<modelId>:<attributeId>`) */
const attributeEntrySchema = attributeConfigSchema.extend({ name: nameHintSchema });

/** Attribute settings keyed by attribute ref. The attributes must be declared on the entry's element. */
const attributeEntriesSchema = z.record(z.string(), attributeEntrySchema).optional();

/** An entry of `elements.classifiers`, keyed by the qualified ref of a node classifier */
export const classifierEntrySchema = classifierConfigSchema.extend({
  name: nameHintSchema,
  attributes: attributeEntriesSchema,
});

/** An entry of `elements.annotations`, keyed by the qualified ref of an annotation shape */
export const annotationEntrySchema = annotationShapeConfigSchema.extend({
  name: nameHintSchema,
  attributes: attributeEntriesSchema,
});

// ----- Descriptions -----

/** The schemas whose descriptions explain the terms of the config, e.g. in the configurator's help */
const CONFIG_TERM_SCHEMAS = {
  extent: annotationExtentSchema,
  representation: textAnnotationRepresentationSchema,
  native: builtinStructuralTypeSchema,
  medium: contentMediumSchema,
  group: groupSchema,
  shortcut: shortcutSchema,
  icon: iconSpecInputSchema,
  highlight: highlightTextStyleSchema,
  marker: markerStyleSchema,
  variants: appearanceVariantsSchema,
  nameHint: nameHintSchema,
} as const;

/** A term of the config with a description in the schema */
export type ConfigTerm = keyof typeof CONFIG_TERM_SCHEMAS;

/**
 * The description of a term of the config, as written in the schema (`.describe()`).
 *
 * @param {ConfigTerm} term - The term.
 * @returns {string} The description.
 */
export function describeConfigTerm(term: ConfigTerm): string {
  return CONFIG_TERM_SCHEMAS[term].description ?? "";
}
