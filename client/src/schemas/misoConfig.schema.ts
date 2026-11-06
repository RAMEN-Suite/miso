import { z } from "zod";
import { RamenModel, type RamenFile } from "@ramen-suite/core";
import {
  annotationShapeConfigSchema,
  attributeConfigSchema,
  builtinStructuralTypeSchema,
  checkNativeAttributes,
  classifierConfigSchema,
} from "./guidelines.schema";
import ConfigValidationError from "../utils/errors/configValidation.error";

// Schema of the Miso config file: `meta`, the ingested model with `ext.miso` blocks, and the global `miso` settings.
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

const baseEntrySchema = z.strictObject({
  kind: z.string(),
  id: z.string(),
  modelId: z.string(),
  /** Name of the base node. A hint for readers, the ID decides. */
  name: z.string(),
  ext: extSchema(classifierConfigSchema),
  attributes: z
    .array(z.strictObject({ id: z.string(), name: z.string(), ext: extSchema(attributeConfigSchema) }))
    .optional(),
});

const misoConfigSchema = z.strictObject({
  $schema: z.string().optional(),
  meta: z.looseObject({
    configVersion: z.string(),
    project: z.string(),
    description: z.string().optional(),
    /** Where and when the model was ingested. Reserved for the drift check against the original model. */
    ingest: z
      .looseObject({
        source: z.string(),
        ingestedAt: z.string(),
        modelFileId: z.string(),
        checksum: z.string(),
      })
      .optional(),
  }),
  /** The ingested model. Validated by RAMEN core in `parseMisoConfig`. */
  model: z.custom<RamenFile>((value) => typeof value === "object" && value !== null, "The model must be an object"),
  miso: z.strictObject({
    /** Subgraph templates. Not migrated yet, always empty for now. */
    templates: z.array(z.unknown()),
    /** The editor's native types and the annotation shapes that implement them */
    mappings: z.array(mappingSchema),
    /**
     * Settings of RAMEN base level elements (e.g. the Collection node and its `label`). RAMEN core accepts the
     * embedded base model only unchanged, so they can't be set in `ext` of the model elements.
     */
    base: z.array(baseEntrySchema).optional(),
  }),
});

/** The Miso config: the ingested RAMEN model with Miso settings in `ext.miso`, plus the global Miso settings */
export type MisoConfig = z.infer<typeof misoConfigSchema>;

/** An entry of `miso.base` */
export type ConfigBaseEntry = z.infer<typeof baseEntrySchema>;

/** An entry of `miso.mappings`: a native editor type and the annotation shape that implements it */
export type ConfigMapping = z.infer<typeof mappingSchema>;

/** A validated Miso config together with its imported model */
export interface ParsedMisoConfig {
  config: MisoConfig;
  /** The model of the config, imported (and thereby validated) by RAMEN core */
  model: RamenModel;
}

/**
 * Checks the `ext.miso` blocks of all model elements against their schemas.
 *
 * @param {RamenFile} model - The ingested model.
 * @returns {string[]} The problems found, each with the element it belongs to.
 */
function checkExtBlocks(model: RamenFile): string[] {
  const problems: string[] = [];

  function check(schema: z.ZodType, miso: unknown, label: string): void {
    if (miso === undefined) {
      return;
    }

    const result = schema.safeParse(miso);

    if (!result.success) {
      problems.push(`${label} ext.miso:\n${z.prettifyError(result.error)}`);
    }
  }

  for (const classifier of model.classifiers) {
    const label: string = `${classifier.kind} "${classifier.name}" (${classifier.modelId}:${classifier.id})`;

    check(classifierConfigSchema, classifier.ext?.miso, label);

    if (classifier.kind === "Node") {
      classifier.attributes.forEach((attribute) =>
        check(attributeConfigSchema, attribute.ext?.miso, `${label}.${attribute.name}`),
      );
    }
  }

  for (const shape of model.annotations) {
    const label: string = `Annotation shape "${shape.type}" (${shape.modelId}:${shape.id})`;

    check(annotationShapeConfigSchema, shape.ext?.miso, label);
    shape.properties.forEach((property) =>
      check(attributeConfigSchema, property.ext?.miso, `${label}.${property.name}`),
    );
  }

  return problems;
}

/**
 * Checks that the given data is a Miso config and imports its model. The global settings and the `ext.miso` blocks are
 * checked against their schemas, the model by RAMEN core.
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

  const problems: string[] = checkExtBlocks(result.data.model);

  if (problems.length > 0) {
    throw new ConfigValidationError(problems.join("\n"));
  }

  return { config: result.data, model };
}
