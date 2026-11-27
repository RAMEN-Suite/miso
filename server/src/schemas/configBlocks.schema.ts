import { z } from "zod";
import type { Attribute, Constraint, RamenFile } from "@ramen-suite/core";
import type { ConfigMapping, IMisoConfig } from "../models/IMisoConfig.js";
import type { AttributeOwner } from "../models/types.js";
import { findAttribute } from "../utils/modelHelper.js";

// Schemas of the settings in the config (`elements`, `editors.text.mappings`) and their checks against the model.
// Mirrors `client/src/schemas/configBlocks.schema.ts`, `checkElements`/`checkMappings` in
// `client/src/schemas/misoConfig.schema.ts` and the native attributes in `NATIVE_TYPE_CONFIGS`
// (`client/src/editors/text/src/config/constants.ts`); keep them in sync. Not mirrored: the types, since the server only
// reads a few keys.

/** What the checks against the model found: `problems` make the config unusable, `warnings` don't */
export interface ConfigFindings {
  problems: string[];
  warnings: string[];
}

// ----- Native types of the text editor -----

/** An attribute the editor sets itself on a native type, in RAMEN terms */
type NativeTypeAttribute = Pick<Attribute, "name" | "typeId" | "bounds"> & {
  constraints?: Pick<Constraint, "language" | "expression">[];
};

const OPTIONAL = { lowerBound: 0, upperBound: 1 };
const REQUIRED = { lowerBound: 1, upperBound: 1 };

/** TEI `att.tableDecoration` of rows and cells */
const TABLE_DECORATION_ATTRIBUTES: NativeTypeAttribute[] = [
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
const NATIVE_TYPE_ATTRIBUTES: Readonly<Record<string, NativeTypeAttribute[]>> = {
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
    native: z.enum(Object.keys(NATIVE_TYPE_ATTRIBUTES) as [string, ...string[]]),
    annotation: z.string(),
    type: z.string(),
    attributes: z.record(z.string(), z.string()).optional(),
  })
  .superRefine((mapping, ctx) => {
    const nativeAttributes: string[] = (NATIVE_TYPE_ATTRIBUTES[mapping.native] ?? []).map((attribute) => attribute.name);

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
  /** Attribute ref of the annotation property that holds the LaTeX notation */
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
  /** `property` is the attribute ref of an annotation property */
  variants: z.array(z.strictObject({ property: z.string(), values: z.record(z.string(), appearanceOverrideSchema) })).optional(),
});

/** The settings of an annotation shape */
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

/** The settings of a node classifier. `medium` only applies to Content refinements. */
const classifierConfigSchema = z.strictObject({
  appearance: z.strictObject({ icon: iconSpecInputSchema.optional() }).optional(),
  medium: z.enum(["text", "image"]).optional(),
});

/** The settings of an attribute (or annotation shape property) */
const attributeConfigSchema = z.strictObject({
  visible: z.boolean().optional(),
  editable: z.boolean().optional(),
});

// ----- Entries of `elements` -----

/** Attribute settings keyed by attribute ref, each with the `name` hint */
const attributeEntriesSchema = z.record(z.string(), attributeConfigSchema.extend({ name: z.string() })).optional();

/** `elements`: settings by section of element kind, keyed by qualified ref, each with the `name` hint */
const elementsSchema = z.strictObject({
  classifiers: z.record(z.string(), classifierConfigSchema.extend({ name: z.string(), attributes: attributeEntriesSchema })),
  annotations: z.record(z.string(), annotationShapeConfigSchema.extend({ name: z.string(), attributes: attributeEntriesSchema })),
});

/**
 * Checks `elements` against its schema (the kind-specific options by section) and its refs against the model.
 * - A ref of an element of another kind than its section is a problem, a ref that the model doesn't have
 *   is a warning, and the entry is ignored.
 * - Attribute refs must be declared on the entry's element; any other attribute ref (removed from the model, or of
 *   another element) is a warning, and the entry is ignored.
 * - `name` hints that differ from the model are warnings, the model wins.
 *
 * @param {RamenFile} model - The raw model.
 * @param {unknown} elements - The `elements` of the config.
 * @returns {ConfigFindings} The problems and warnings, each with the entry it belongs to.
 */
export function checkElements(model: RamenFile, elements: unknown): ConfigFindings {
  const findings: ConfigFindings = { problems: [], warnings: [] };
  const result = elementsSchema.safeParse(elements);

  if (!result.success) {
    findings.problems.push(`elements:\n${z.prettifyError(result.error)}`);
    return findings;
  }

  const kindByRef = new Map<string, string>([
    ...model.classifiers.map((classifier): [string, string] => [`${classifier.modelId}:${classifier.id}`, classifier.kind]),
    ...model.annotations.map((shape): [string, string] => [`${shape.modelId}:${shape.id}`, "annotation shape"]),
    ...model.relations.map((relation): [string, string] => [`${relation.modelId}:${relation.id}`, "Relation"]),
  ]);
  const nodesByRef = new Map<string, { name: string; owner: AttributeOwner }>(
    model.classifiers.flatMap((classifier) =>
      classifier.kind === "Node"
        ? [[`${classifier.modelId}:${classifier.id}`, { name: classifier.name, owner: classifier }]]
        : [],
    ),
  );
  const shapesByRef = new Map<string, { name: string; owner: AttributeOwner }>(
    model.annotations.map((shape) => [`${shape.modelId}:${shape.id}`, { name: shape.type, owner: shape }]),
  );

  function checkEntry(
    section: string,
    ref: string,
    entry: { name: string; attributes?: Record<string, { name: string }> },
    modelElements: Map<string, { name: string; owner: AttributeOwner }>,
    expectedKind: string,
  ): void {
    const path: string = `elements.${section}["${ref}"] ("${entry.name}")`;
    const modelElement: { name: string; owner: AttributeOwner } | undefined = modelElements.get(ref);

    if (!modelElement) {
      const kind: string | undefined = kindByRef.get(ref);

      if (kind) {
        findings.problems.push(`${path}: is a ${kind}, not a ${expectedKind}`);
      } else {
        findings.warnings.push(`${path}: no such element in the model, the entry is ignored`);
      }

      return;
    }

    if (entry.name !== modelElement.name) {
      findings.warnings.push(
        `${path}: name hint "${entry.name}" differs from the model's "${modelElement.name}", the model wins`,
      );
    }

    for (const [attributeRef, attributeEntry] of Object.entries(entry.attributes ?? {})) {
      const attributePath: string = `${path}.attributes["${attributeRef}"] ("${attributeEntry.name}")`;
      const attribute: Attribute | undefined = findAttribute(modelElement.owner, attributeRef);

      if (!attribute) {
        findings.warnings.push(`${attributePath}: the element declares no such attribute, the entry is ignored`);
      } else if (attributeEntry.name !== attribute.name) {
        findings.warnings.push(
          `${attributePath}: name hint "${attributeEntry.name}" differs from the model's "${attribute.name}", the model wins`,
        );
      }
    }
  }

  for (const [ref, entry] of Object.entries(result.data.classifiers)) {
    checkEntry("classifiers", ref, entry, nodesByRef, "node classifier");
  }

  for (const [ref, entry] of Object.entries(result.data.annotations)) {
    checkEntry("annotations", ref, entry, shapesByRef, "annotation shape");
  }

  return findings;
}

/**
 * Checks the entries of `editors.text.mappings` (known native type, its attributes) against the model: the annotation
 * shape must exist (its `type` hint only warns), the mapped attribute refs must be properties of that shape, and the
 * shape must not override the editor's built-in attributes: each one must be a property of the shape (the mapped one,
 * otherwise the one with the built-in name) with the built-in type, cardinality and constraints. Shapes may add
 * properties of their own.
 *
 * @param {RamenFile} model - The raw model.
 * @param {ConfigMapping[]} mappings - The native mappings.
 * @returns {ConfigFindings} The problems and warnings, each with the mapping, shape or attribute it belongs to.
 */
export function checkMappings(model: RamenFile, mappings: ConfigMapping[]): ConfigFindings {
  const findings: ConfigFindings = { problems: [], warnings: [] };
  const constraintsKey = (constraints: Pick<Constraint, "language" | "expression">[] | undefined): string =>
    (constraints ?? [])
      .map((constraint) => `${constraint.language}:${JSON.stringify(constraint.expression)}`)
      .sort()
      .join("|");

  mappings.forEach((mapping, index) => {
    const path: string = `editors.text.mappings[${index}] (${mapping.native})`;
    const result = mappingSchema.safeParse(mapping);

    if (!result.success) {
      findings.problems.push(`${path}:\n${z.prettifyError(result.error)}`);
      return;
    }

    const shape = model.annotations.find((candidate) => `${candidate.modelId}:${candidate.id}` === mapping.annotation);

    if (!shape) {
      findings.problems.push(`${path}: the annotation shape "${mapping.annotation}" doesn't exist in the model`);
      return;
    }

    if (mapping.type !== shape.type) {
      findings.warnings.push(`${path}: type hint "${mapping.type}" differs from the model's "${shape.type}", the model wins`);
    }

    const mappedNames: Record<string, string> = {};

    for (const [nativeAttribute, attributeRef] of Object.entries(mapping.attributes ?? {})) {
      const property: Attribute | undefined = findAttribute(shape, attributeRef);

      if (property) {
        mappedNames[nativeAttribute] = property.name;
      } else {
        findings.problems.push(
          `${path}.attributes.${nativeAttribute}: "${attributeRef}" is no property of the annotation shape "${shape.type}"`,
        );
      }
    }

    for (const builtinAttribute of NATIVE_TYPE_ATTRIBUTES[mapping.native] ?? []) {
      const name: string = mappedNames[builtinAttribute.name] ?? builtinAttribute.name;
      const property: Attribute | undefined = shape.properties.find((candidate) => candidate.name === name);
      const label: string = `Annotation shape "${shape.type}" (${mapping.annotation}).${name}, built-in attribute "${builtinAttribute.name}" of "${mapping.native}"`;

      if (!property) {
        findings.problems.push(`${label}: missing, the editor sets it`);
      } else {
        if (property.typeId !== builtinAttribute.typeId) {
          findings.problems.push(`${label}: type "${property.typeId}" overrides the built-in "${builtinAttribute.typeId}"`);
        }

        if (
          property.bounds.lowerBound !== builtinAttribute.bounds.lowerBound ||
          property.bounds.upperBound !== builtinAttribute.bounds.upperBound
        ) {
          findings.problems.push(
            `${label}: bounds ${property.bounds.lowerBound}..${property.bounds.upperBound} override the built-in ${builtinAttribute.bounds.lowerBound}..${builtinAttribute.bounds.upperBound}`,
          );
        }

        if (constraintsKey(property.constraints) !== constraintsKey(builtinAttribute.constraints)) {
          findings.problems.push(`${label}: constraints differ from the built-in ones`);
        }
      }
    }
  });

  return findings;
}

/**
 * Runs all checks of the settings against the model: {@linkcode checkElements} and {@linkcode checkMappings}.
 *
 * @param {IMisoConfig} config - The config, with a model RAMEN core accepted.
 * @returns {ConfigFindings} The problems and warnings of all checks.
 */
export function checkConfigSettings(config: IMisoConfig): ConfigFindings {
  const elementFindings: ConfigFindings = checkElements(config.model, config.elements);
  const mappingFindings: ConfigFindings = checkMappings(config.model, config.editors.text.mappings);

  return {
    problems: [...elementFindings.problems, ...mappingFindings.problems],
    warnings: [...elementFindings.warnings, ...mappingFindings.warnings],
  };
}
