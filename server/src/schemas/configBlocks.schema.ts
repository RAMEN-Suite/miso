import { z } from "zod";
import type { Attribute, Constraint, RamenFile } from "@ramen-suite/core";
import type { ConfigBaseEntry, ConfigMapping } from "../models/IMisoConfig.js";

// Schemas of the Miso settings in the config (`ext.miso` blocks, `miso.mappings`) and their checks. Mirrors
// `client/src/schemas/configBlocks.schema.ts`, `checkExtBlocks`/`checkBuiltinAttributes` in
// `client/src/schemas/misoConfig.schema.ts` and the built-in attributes of `BUILTIN_STRUCTURAL_CONFIGS`
// (`client/src/editors/text/src/config/constants.ts`); keep them in sync. Not mirrored: the types, since the server only
// reads a few keys.

// ----- Built-in structural types of the text editor -----

/** An attribute the editor sets itself on a built-in type, in RAMEN terms */
type BuiltinAttribute = Pick<Attribute, "name" | "typeId" | "bounds"> & {
  constraints?: Pick<Constraint, "language" | "expression">[];
};

const OPTIONAL = { lowerBound: 0, upperBound: 1 };
const REQUIRED = { lowerBound: 1, upperBound: 1 };

/** TEI `att.tableDecoration` of rows and cells */
const TABLE_DECORATION_ATTRIBUTES: BuiltinAttribute[] = [
  { name: "rowspan", typeId: "Integer", bounds: OPTIONAL },
  { name: "colspan", typeId: "Integer", bounds: OPTIONAL },
  {
    name: "role",
    typeId: "String",
    bounds: OPTIONAL,
    constraints: [{ language: "json-schema", expression: { enum: ["data", "label"] } }],
  },
];

/** The structural types the text editor implements natively, with the attributes it sets itself */
const BUILTIN_ATTRIBUTES: Readonly<Record<string, BuiltinAttribute[]>> = {
  paragraph: [],
  heading: [
    {
      name: "level",
      typeId: "Integer",
      bounds: REQUIRED,
      constraints: [{ language: "json-schema", expression: { minimum: 1, maximum: 6 } }],
    },
  ],
  hardBreak: [],
  table: [],
  tableRow: TABLE_DECORATION_ATTRIBUTES,
  tableCell: TABLE_DECORATION_ATTRIBUTES,
  bulletList: [],
  listItem: [],
};

const mappingSchema = z
  .strictObject({
    native: z.enum(Object.keys(BUILTIN_ATTRIBUTES) as [string, ...string[]]),
    annotation: z.string(),
    type: z.string(),
    attributes: z.record(z.string(), z.string()).optional(),
  })
  .superRefine((mapping, ctx) => {
    const nativeAttributes: string[] = (BUILTIN_ATTRIBUTES[mapping.native] ?? []).map((attribute) => attribute.name);

    for (const attribute of Object.keys(mapping.attributes ?? {})) {
      if (!nativeAttributes.includes(attribute)) {
        ctx.addIssue({
          code: "custom",
          message: `Unknown attribute "${attribute}" for native type "${mapping.native}"`,
          path: ["attributes", attribute],
        });
      }
    }
  });

// ----- Icons -----

const iconSpecSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("lucide"), name: z.string() }),
  z.strictObject({ kind: z.literal("url"), url: z.string() }),
  z.strictObject({ kind: z.literal("svg"), svg: z.string() }),
]);

const iconSpecInputSchema = z.union([z.string(), iconSpecSchema]);

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
  property: z.string(),
  display: z.string().optional(),
});

const highlightTextStyleSchema = z.discriminatedUnion("kind", [propertiesTextStyleSchema]);

const markerStyleSchema = z.discriminatedUnion("kind", [iconStyleSchema, mathTextStyleSchema]);

// ----- Annotation shapes -----

const appearanceOverrideSchema = z.strictObject({
  highlight: highlightTextStyleSchema.optional(),
  marker: markerStyleSchema.optional(),
});

const annotationAppearanceSchema = z.strictObject({
  icon: iconSpecInputSchema.optional(),
  highlight: highlightTextStyleSchema.optional(),
  marker: markerStyleSchema.optional(),
  variants: z
    .array(z.strictObject({ property: z.string(), values: z.record(z.string(), appearanceOverrideSchema) }))
    .optional(),
});

/** The `ext.miso` block of an annotation shape */
const annotationShapeConfigSchema = z.strictObject({
  group: z.string().optional(),
  controls: z.strictObject({ shortcut: z.string().optional() }).optional(),
  appearance: annotationAppearanceSchema.optional(),
  editing: z
    .strictObject({
      extent: z.enum(["zeroPoint", "range"]).optional(),
      representation: z.enum(["structure", "inline", "blockClassification"]).optional(),
    })
    .optional(),
});

// ----- Node types and attributes -----

/** The `ext.miso` block of a classifier. `medium` only applies to Content refinements. */
const classifierConfigSchema = z.strictObject({
  appearance: z.strictObject({ icon: iconSpecInputSchema.optional() }).optional(),
  medium: z.enum(["text", "image"]).optional(),
});

/** The `ext.miso` block of an attribute (or annotation shape property) */
const attributeConfigSchema = z.strictObject({
  visible: z.boolean().optional(),
  editable: z.boolean().optional(),
});

/**
 * Checks the `ext.miso` blocks of all model elements and `miso.base` entries against their schemas. Keys of other tools
 * next to `miso` are allowed, but Miso's own keys there (e.g. `ext.appearance` instead of `ext.miso.appearance`) are
 * reported, since they would be silently ignored.
 *
 * @param {RamenFile} model - The ingested model.
 * @param {ConfigBaseEntry[]} base - The `miso.base` entries.
 * @returns {string[]} The problems found, each with the element it belongs to.
 */
export function checkExtBlocks(model: RamenFile, base: ConfigBaseEntry[]): string[] {
  const problems: string[] = [];

  function check(schema: z.ZodObject, ext: Record<string, unknown> | undefined, label: string): void {
    const misplaced: string[] = Object.keys(ext ?? {}).filter((key) => key !== "miso" && key in schema.shape);

    misplaced.forEach((key) => problems.push(`${label}: "ext.${key}" is ignored, it belongs in "ext.miso.${key}"`));

    if (ext?.miso === undefined) {
      return;
    }

    const result = schema.safeParse(ext.miso);

    if (!result.success) {
      problems.push(`${label} ext.miso:\n${z.prettifyError(result.error)}`);
    }
  }

  for (const classifier of model.classifiers) {
    const label: string = `${classifier.kind} "${classifier.name}" (${classifier.modelId}:${classifier.id})`;

    check(classifierConfigSchema, classifier.ext, label);

    if (classifier.kind === "Node") {
      classifier.attributes.forEach((attribute) => check(attributeConfigSchema, attribute.ext, `${label}.${attribute.name}`));
    }
  }

  for (const shape of model.annotations) {
    const label: string = `Annotation shape "${shape.type}" (${shape.modelId}:${shape.id})`;

    check(annotationShapeConfigSchema, shape.ext, label);
    shape.properties.forEach((property) => check(attributeConfigSchema, property.ext, `${label}.${property.name}`));
  }

  for (const entry of base) {
    const label: string = `miso.base "${entry.name}" (${entry.modelId}:${entry.id})`;

    check(classifierConfigSchema, entry.ext, label);
    entry.attributes?.forEach((attribute) => check(attributeConfigSchema, attribute.ext, `${label}.${attribute.name}`));
  }

  return problems;
}

/**
 * Checks the entries of `miso.mappings` (known native type, its attributes) and that the mapped annotation shapes don't
 * override the editor's built-in attributes: each one must be a property of the shape (under its mapped name) with the
 * built-in type, cardinality and constraints. Shapes may add properties of their own.
 *
 * @param {RamenFile} model - The ingested model.
 * @param {ConfigMapping[]} mappings - The native mappings.
 * @returns {string[]} The problems found, each with the mapping, shape or attribute it belongs to.
 */
export function checkMappings(model: RamenFile, mappings: ConfigMapping[]): string[] {
  const problems: string[] = [];
  const constraintsKey = (constraints: Pick<Constraint, "language" | "expression">[] | undefined): string =>
    (constraints ?? [])
      .map((constraint) => `${constraint.language}:${JSON.stringify(constraint.expression)}`)
      .sort()
      .join("|");

  mappings.forEach((mapping, index) => {
    const result = mappingSchema.safeParse(mapping);

    if (!result.success) {
      problems.push(`miso.mappings[${index}]:\n${z.prettifyError(result.error)}`);
      return;
    }

    const shape = model.annotations.find((candidate) => `${candidate.modelId}:${candidate.id}` === mapping.annotation);

    if (!shape) {
      return;
    }

    for (const builtinAttribute of BUILTIN_ATTRIBUTES[mapping.native] ?? []) {
      const name: string = mapping.attributes?.[builtinAttribute.name] ?? builtinAttribute.name;
      const property: Attribute | undefined = shape.properties.find((candidate) => candidate.name === name);
      const label: string = `Annotation shape "${shape.type}" (${mapping.annotation}).${name}, built-in attribute "${builtinAttribute.name}" of "${mapping.native}"`;

      if (!property) {
        problems.push(`${label}: missing, the editor sets it`);
      } else {
        if (property.typeId !== builtinAttribute.typeId) {
          problems.push(`${label}: type "${property.typeId}" overrides the built-in "${builtinAttribute.typeId}"`);
        }

        if (
          property.bounds.lowerBound !== builtinAttribute.bounds.lowerBound ||
          property.bounds.upperBound !== builtinAttribute.bounds.upperBound
        ) {
          problems.push(
            `${label}: bounds ${property.bounds.lowerBound}..${property.bounds.upperBound} override the built-in ${builtinAttribute.bounds.lowerBound}..${builtinAttribute.bounds.upperBound}`,
          );
        }

        if (constraintsKey(property.constraints) !== constraintsKey(builtinAttribute.constraints)) {
          problems.push(`${label}: constraints differ from the built-in ones`);
        }
      }
    }
  });

  return problems;
}
