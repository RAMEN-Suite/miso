import { z } from "zod";
import { Attribute, Constraint, RamenModel, RamenFile } from "@ramen-suite/core";
import { BUILTIN_STRUCTURAL_CONFIGS } from "../editors/text/src/config/constants";
import { NativeTypeConfig } from "../editors/text/src/models/types";
import {
  annotationShapeConfigSchema,
  attributeConfigSchema,
  builtinStructuralTypeSchema,
  checkNativeAttributes,
  classifierConfigSchema,
} from "./configBlocks.schema";
import ConfigValidationError from "../utils/errors/configValidation.error";

// Schema of the Miso config file: `$schema`, `id`, `meta`, the model with `ext.miso` blocks, and the global `miso` settings.
// The model is validated and read by RAMEN core, so it is typed with RAMEN core's `RamenFile`. Only the Miso parts are
// described here: the global settings by the schema below, the `ext.miso` blocks element by element in `parseMisoConfig`.

/** The `ext` of a model element: Miso reads only its own namespace, other tools' keys are kept */
function extSchema<T extends z.ZodType>(misoSchema: T) {
  return z.looseObject({ miso: misoSchema.optional() }).optional();
}

const mappingSchema = z
  .strictObject({
    /** The editor's native type */
    native: builtinStructuralTypeSchema,
    /** Qualified ref (`<modelId>:<id>`) of the annotation shape that implements it */
    annotation: z.string(),
    /** Type of the annotation shape. A hint for readers, the ref decides. */
    type: z.string(),
    /** Native attribute -> name of the shape property that holds it */
    attributes: z.record(z.string(), z.string()).optional(),
  })
  .superRefine((mapping, ctx) => checkNativeAttributes(mapping.native, mapping.attributes, ctx));

const baseClassifierSchema = z.strictObject({
  kind: z.string(),
  id: z.string(),
  modelId: z.string(),
  /** Name of the base node. A hint for readers, the ID decides. */
  name: z.string(),
  ext: extSchema(classifierConfigSchema),
  attributes: z.array(z.strictObject({ id: z.string(), name: z.string(), ext: extSchema(attributeConfigSchema) })).optional(),
});

/** Settings only the text editor reads */
const textEditorConfigSchema = z.strictObject({
  /** The editor's native types and the annotation shapes that implement them */
  mappings: z.array(mappingSchema),
});

/** URL of the config format, with its version, e.g. `https://ramen-schema.org/miso/1.0.0/config.schema.json` */
const CONFIG_SCHEMA_URL_PATTERN: RegExp = /^https:\/\/ramen-schema\.org\/miso\/\d+\.\d+\.\d+\/config\.schema\.json$/;

const misoConfigSchema = z.strictObject({
  /** The config format and its version */
  $schema: z.string().regex(CONFIG_SCHEMA_URL_PATTERN, "Not a Miso config schema URL"),
  /** Identity of the config, kept across regenerations */
  id: z.string().min(1),
  /** About the config itself. The project's name and description are in the model's `project`. */
  meta: z
    .strictObject({
      /** What this editor configuration is for */
      description: z.string().optional(),
    })
    .optional(),
  /** The ingested model. Validated by RAMEN core in `parseMisoConfig`. */
  model: z.custom<RamenFile>((value) => typeof value === "object" && value !== null, "The model must be an object"),
  miso: z.strictObject({
    /** Settings that concern the whole app, not a single editor */
    general: z.strictObject({
      /** Subgraph templates. Not migrated yet, always empty for now. */
      templates: z.array(z.unknown()),
      /**
       * Settings of RAMEN base level classifiers (e.g. the Collection node and its `label`). RAMEN core accepts the
       * embedded base model only unchanged, so they can't be set in `ext` of the model elements.
       */
      baseClassifiers: z.array(baseClassifierSchema).optional(),
    }),
    /** Settings of the Content editors, one section per editor */
    editors: z.strictObject({
      text: textEditorConfigSchema,
    }),
  }),
});

/** The Miso config: the ingested RAMEN model with Miso settings in `ext.miso`, plus the global Miso settings */
export type MisoConfig = z.infer<typeof misoConfigSchema>;

/** An entry of `miso.general.baseClassifiers` */
export type ConfigBaseClassifier = z.infer<typeof baseClassifierSchema>;

/** An entry of `miso.editors.text.mappings`: a native editor type and the annotation shape that implements it */
export type ConfigMapping = z.infer<typeof mappingSchema>;

/** A validated Miso config together with its imported model */
export interface ParsedMisoConfig {
  config: MisoConfig;
  /** The model of the config, imported (and thereby validated) by RAMEN core */
  model: RamenModel;
}

/**
 * Checks the `ext.miso` blocks of all model elements and `miso.general.baseClassifiers` against their schemas. Keys of other tools
 * next to `miso` are allowed, but Miso's own keys there (e.g. `ext.appearance` instead of `ext.miso.appearance`) are
 * reported, since they would be silently ignored. Mirrored in `server/src/schemas/configBlocks.schema.ts`.
 *
 * @param {RamenFile} model - The ingested model.
 * @param {ConfigBaseClassifier[]} baseClassifiers - The `miso.general.baseClassifiers` entries.
 * @returns {string[]} The problems found, each with the element it belongs to.
 */
function checkExtBlocks(model: RamenFile, baseClassifiers: ConfigBaseClassifier[]): string[] {
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

  for (const entry of baseClassifiers) {
    const label: string = `miso.general.baseClassifiers "${entry.name}" (${entry.modelId}:${entry.id})`;

    check(classifierConfigSchema, entry.ext, label);
    entry.attributes?.forEach((attribute) => check(attributeConfigSchema, attribute.ext, `${label}.${attribute.name}`));
  }

  return problems;
}

/**
 * Checks that the annotation shapes in `miso.editors.text.mappings` don't override the editor's built-in attributes: each one must be
 * a property of the shape (under its mapped name) with the built-in type, cardinality and constraints. Shapes may add
 * properties of their own.
 *
 * @param {RamenFile} model - The ingested model.
 * @param {ConfigMapping[]} mappings - The native mappings.
 * @returns {string[]} The problems found, each with the shape and attribute it belongs to.
 */
function checkBuiltinAttributes(model: RamenFile, mappings: ConfigMapping[]): string[] {
  const problems: string[] = [];
  const constraintsKey = (constraints: Pick<Constraint, "language" | "expression">[] | undefined): string =>
    (constraints ?? [])
      .map((constraint) => `${constraint.language}:${JSON.stringify(constraint.expression)}`)
      .sort()
      .join("|");

  for (const mapping of mappings) {
    const shape = model.annotations.find((candidate) => `${candidate.modelId}:${candidate.id}` === mapping.annotation);
    const builtin: NativeTypeConfig | undefined = BUILTIN_STRUCTURAL_CONFIGS.find((c) => c.type === mapping.native);

    if (!shape || !builtin) {
      continue;
    }

    for (const builtinAttribute of builtin.attributes) {
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
  }

  return problems;
}

/**
 * Checks that the given data is a Miso config and imports its model. The global settings and the `ext.miso` blocks are
 * checked against their schemas, the model by RAMEN core, and the mapped shapes against the editor's built-in
 * attributes.
 *
 * @param {unknown} data - The config as received, e.g. the parsed JSON response of the API.
 * @returns {ParsedMisoConfig} The validated config and its imported model.
 * @throws {ConfigValidationError} If the data does not match the format or the model is invalid. The message lists
 * the problems with their paths.
 */
export function parseMisoConfig(data: unknown): ParsedMisoConfig {
  const result = misoConfigSchema.safeParse(data);

  if (!result.success) {
    throw new ConfigValidationError(z.prettifyError(result.error));
  }

  let model: RamenModel;

  try {
    model = RamenModel.import(structuredClone(result.data.model));
  } catch (error: unknown) {
    throw new ConfigValidationError(`The model in the config is invalid: ${(error as Error).message}`);
  }

  const problems: string[] = [
    ...checkExtBlocks(result.data.model, result.data.miso.general.baseClassifiers ?? []),
    ...checkBuiltinAttributes(result.data.model, result.data.miso.editors.text.mappings),
  ];

  if (problems.length > 0) {
    throw new ConfigValidationError(problems.join("\n"));
  }

  return { config: result.data, model };
}
