import { z } from "zod";
import { Attribute, Constraint, RamenModel, RamenFile } from "@ramen-suite/core";
import { BUILTIN_STRUCTURAL_CONFIGS } from "../editors/text/src/config/constants";
import { NativeTypeConfig, SpecialCharacterGroupConfig } from "../editors/text/src/models/types";
import {
  annotationEntrySchema,
  builtinStructuralTypeSchema,
  checkNativeAttributes,
  classifierEntrySchema,
} from "./configBlocks.schema";
import type { AttributeOwner } from "../models/types";
import ConfigValidationError from "../utils/errors/configValidation.error";
import { findAttribute } from "../utils/helper/modelHelper";

// Schema of the config file: `$schema`, `id`, `meta`, the raw model, and the app's settings (`general`, `elements`,
// `editors`). The model is validated and read by RAMEN core, so it is typed with RAMEN core's `RamenFile` and never
// changed. The settings refer to model elements by qualified ref (`<modelId>:<id>`, attributes included); the refs are
// checked against the model in `parseMisoConfig`.

const mappingSchema = z
  .strictObject({
    /** The editor's native type */
    native: builtinStructuralTypeSchema,
    /** Qualified ref (`<modelId>:<id>`) of the annotation shape that implements it */
    annotation: z.string(),
    /** Type of the annotation shape. A hint for readers, the ref decides. */
    type: z.string(),
    /**
     * Native attribute -> attribute ref (`<modelId>:<attributeId>`) of the shape property that holds it. The native
     * side is a name, since it's the editor's own vocabulary.
     */
    attributes: z.record(z.string(), z.string()).optional(),
  })
  .superRefine((mapping, ctx) => checkNativeAttributes(mapping.native, mapping.attributes, ctx));

const specialCharacterGroupConfigSchema: z.ZodType<SpecialCharacterGroupConfig> = z.union([
  z.string().min(1),
  z.strictObject({
    id: z.string().min(1),
    /** Optional for a group that is merged into an existing one, which keeps its label then */
    label: z.string().min(1).optional(),
    characters: z.array(z.strictObject({ character: z.string().min(1), name: z.string() })),
  }),
]);

/** Settings only the text editor reads */
const textEditorConfigSchema = z.strictObject({
  /** The editor's native types and the annotation shapes that implement them */
  mappings: z.array(mappingSchema),
  /**
   * The groups of the special characters picker, in the picker's order: ids of built-in groups and groups of the
   * project's own (see `SpecialCharacterGroupConfig`). Without it, all built-in groups are offered.
   */
  specialCharacters: z.array(specialCharacterGroupConfigSchema).optional(),
});

/** How model elements are shown and edited, by section of element kind and keyed by qualified ref */
const elementsSchema = z.strictObject({
  /** Settings of node classifiers (RAMEN base nodes included) */
  classifiers: z.record(z.string(), classifierEntrySchema),
  /** Settings of annotation shapes */
  annotations: z.record(z.string(), annotationEntrySchema),
});

/** URL of the config format, with its version, e.g. `https://ramen-schema.org/miso/1.0.0/config.schema.json` */
const CONFIG_SCHEMA_URL_PATTERN: RegExp = /^https:\/\/ramen-schema\.org\/miso\/\d+\.\d+\.\d+\/config\.schema\.json$/;

/** URL of the current version of the config format, for new configs */
export const CONFIG_SCHEMA_URL = "https://ramen-schema.org/miso/1.0.0/config.schema.json" as const;

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
  /** The raw model, never changed by the app. Validated by RAMEN core in `parseMisoConfig`. */
  model: z.custom<RamenFile>((value) => typeof value === "object" && value !== null, "The model must be an object"),
  /** Settings that concern the whole app, not a single editor */
  general: z.strictObject({
    /** Subgraph templates (currently always empty) */
    templates: z.array(z.unknown()),
  }),
  elements: elementsSchema,
  /** Settings of the Content editors, one section per editor */
  editors: z.strictObject({
    text: textEditorConfigSchema,
  }),
});

/** The config: the raw RAMEN model and the app's settings of its elements, keyed by ref */
export type MisoConfig = z.infer<typeof misoConfigSchema>;

/** The `elements` of the config: element settings by section and qualified ref */
export type ConfigElements = z.infer<typeof elementsSchema>;

/** An entry of `editors.text.mappings`: a native editor type and the annotation shape that implements it */
export type ConfigMapping = z.infer<typeof mappingSchema>;

/** A validated config together with its imported model */
export interface ParsedMisoConfig {
  config: MisoConfig;
  /** The model of the config, imported (and thereby validated) by RAMEN core */
  model: RamenModel;
  /** Problems that don't stop the app, e.g. entries of removed elements (ignored) or outdated `name` hints */
  warnings: string[];
}

/** Something a config check found: a `problem` makes the config unusable, a `warning` doesn't */
export interface ConfigFinding {
  severity: "problem" | "warning";
  /** Where in the config, e.g. `elements.annotations["<ref>"] ("name")`; empty for the format and the model as a whole */
  path: string;
  message: string;
  /** Qualified ref of the model element the finding concerns (an entry's element, a mapping's shape) */
  ref?: string;
  /** Attribute ref, for findings on an attribute entry */
  attributeRef?: string;
}

/** The result of {@linkcode checkConfig}: the config and its model, if the format and the model are valid */
export interface ConfigCheckResult {
  config?: MisoConfig;
  model?: RamenModel;
  findings: ConfigFinding[];
}

/**
 * A finding as one line of text.
 *
 * @param {ConfigFinding} finding - The finding.
 * @returns {string} `<path>: <message>`, or the message alone if there is no path.
 */
export function formatFinding(finding: ConfigFinding): string {
  if (finding.path) {
    return `${finding.path}: ${finding.message}`;
  } else {
    return finding.message;
  }
}

/**
 * Checks the refs of `elements` against the model. Mirrored in `server/src/schemas/configBlocks.schema.ts`.
 * - A ref of an element of another kind than its section is a problem, a ref that the model doesn't have
 *   is a warning, and the entry is ignored.
 * - Attribute refs must be declared on the entry's element; any other attribute ref (removed from the model, or of
 *   another element) is a warning, and the entry is ignored.
 * - `name` hints that differ from the model are warnings, the model wins.
 *
 * @param {RamenFile} model - The raw model.
 * @param {ConfigElements} elements - The element settings.
 * @returns {ConfigFinding[]} The problems and warnings, each with the entry it belongs to.
 */
function checkElements(model: RamenFile, elements: ConfigElements): ConfigFinding[] {
  const findings: ConfigFinding[] = [];
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
        findings.push({ severity: "problem", path, ref, message: `is a ${kind}, not a ${expectedKind}` });
      } else {
        findings.push({ severity: "warning", path, ref, message: "no such element in the model, the entry is ignored" });
      }

      return;
    }

    if (entry.name !== modelElement.name) {
      findings.push({
        severity: "warning",
        path,
        ref,
        message: `name hint "${entry.name}" differs from the model's "${modelElement.name}", the model wins`,
      });
    }

    for (const [attributeRef, attributeEntry] of Object.entries(entry.attributes ?? {})) {
      const attributePath: string = `${path}.attributes["${attributeRef}"] ("${attributeEntry.name}")`;
      const attribute: Attribute | undefined = findAttribute(modelElement.owner, attributeRef);

      if (!attribute) {
        findings.push({
          severity: "warning",
          path: attributePath,
          ref,
          attributeRef,
          message: "the element declares no such attribute, the entry is ignored",
        });
      } else if (attributeEntry.name !== attribute.name) {
        findings.push({
          severity: "warning",
          path: attributePath,
          ref,
          attributeRef,
          message: `name hint "${attributeEntry.name}" differs from the model's "${attribute.name}", the model wins`,
        });
      }
    }
  }

  for (const [ref, entry] of Object.entries(elements.classifiers)) {
    checkEntry("classifiers", ref, entry, nodesByRef, "node classifier");
  }

  for (const [ref, entry] of Object.entries(elements.annotations)) {
    checkEntry("annotations", ref, entry, shapesByRef, "annotation shape");
  }

  return findings;
}

/**
 * Checks the entries of `editors.text.mappings` against the model: every native type must be mapped, the annotation
 * shape must exist (its `type` hint only warns), the mapped attribute refs must be properties of that shape, and the shape must not override the
 * editor's built-in attributes: each one must be a property of the shape (the mapped one, otherwise the one with the
 * built-in name) with the built-in type, cardinality and constraints. Shapes may add properties of their own.
 *
 * @param {RamenFile} model - The raw model.
 * @param {ConfigMapping[]} mappings - The native mappings.
 * @returns {ConfigFinding[]} The problems and warnings, each with the mapping, shape or attribute it belongs to.
 */
function checkMappings(model: RamenFile, mappings: ConfigMapping[]): ConfigFinding[] {
  const findings: ConfigFinding[] = [];
  const constraintsKey = (constraints: Pick<Constraint, "language" | "expression">[] | undefined): string =>
    (constraints ?? [])
      .map((constraint) => `${constraint.language}:${JSON.stringify(constraint.expression)}`)
      .sort()
      .join("|");

  mappings.forEach((mapping, index) => {
    const path: string = `editors.text.mappings[${index}] (${mapping.native})`;
    const shape = model.annotations.find((candidate) => `${candidate.modelId}:${candidate.id}` === mapping.annotation);
    const builtin: NativeTypeConfig | undefined = BUILTIN_STRUCTURAL_CONFIGS.find((c) => c.type === mapping.native);
    const ref: string = mapping.annotation;
    const problem = (findingPath: string, message: string, attributeRef?: string): void => {
      findings.push({ severity: "problem", path: findingPath, message, ref, attributeRef });
    };

    if (!shape) {
      problem(path, `the annotation shape "${mapping.annotation}" doesn't exist in the model`);
      return;
    }

    if (mapping.type !== shape.type) {
      findings.push({
        severity: "warning",
        path,
        ref,
        message: `type hint "${mapping.type}" differs from the model's "${shape.type}", the model wins`,
      });
    }

    const mappedNames: Record<string, string> = {};

    for (const [nativeAttribute, attributeRef] of Object.entries(mapping.attributes ?? {})) {
      const property: Attribute | undefined = findAttribute(shape, attributeRef);

      if (property) {
        mappedNames[nativeAttribute] = property.name;
      } else {
        problem(
          `${path}.attributes.${nativeAttribute}`,
          `"${attributeRef}" is no property of the annotation shape "${shape.type}"`,
          attributeRef,
        );
      }
    }

    for (const builtinAttribute of builtin?.attributes ?? []) {
      const name: string = mappedNames[builtinAttribute.name] ?? builtinAttribute.name;
      const property: Attribute | undefined = shape.properties.find((candidate) => candidate.name === name);
      const label: string = `Annotation shape "${shape.type}" (${mapping.annotation}).${name}, built-in attribute "${builtinAttribute.name}" of "${mapping.native}"`;
      const attributeRef: string | undefined = property ? `${shape.modelId}:${property.id}` : undefined;

      if (!property) {
        problem(label, "missing, the editor sets it");
      } else {
        if (property.typeId !== builtinAttribute.typeId) {
          problem(label, `type "${property.typeId}" overrides the built-in "${builtinAttribute.typeId}"`, attributeRef);
        }

        if (
          property.bounds.lowerBound !== builtinAttribute.bounds.lowerBound ||
          property.bounds.upperBound !== builtinAttribute.bounds.upperBound
        ) {
          problem(
            label,
            `bounds ${property.bounds.lowerBound}..${property.bounds.upperBound} override the built-in ${builtinAttribute.bounds.lowerBound}..${builtinAttribute.bounds.upperBound}`,
            attributeRef,
          );
        }

        if (constraintsKey(property.constraints) !== constraintsKey(builtinAttribute.constraints)) {
          problem(label, "constraints differ from the built-in ones", attributeRef);
        }
      }
    }
  });

  for (const builtin of BUILTIN_STRUCTURAL_CONFIGS) {
    if (!mappings.some((mapping) => mapping.native === builtin.type)) {
      findings.push({
        severity: "problem",
        path: "editors.text.mappings",
        message: `the native type "${builtin.type}" is not mapped to an annotation shape`,
      });
    }
  }

  return findings;
}

/**
 * Checks that only shapes mapped to a native type have the representation `structure`: the editor builds blocks only
 * for its native types.
 *
 * @param {ConfigElements} elements - The settings of the model elements.
 * @param {ConfigMapping[]} mappings - The native mappings.
 * @returns {ConfigFinding[]} A problem per unmapped shape with `structure`.
 */
function checkRepresentations(elements: ConfigElements, mappings: ConfigMapping[]): ConfigFinding[] {
  const mappedRefs = new Set<string>(mappings.map((mapping) => mapping.annotation));

  return Object.entries(elements.annotations).flatMap(([ref, entry]): ConfigFinding[] =>
    entry.editing?.representation === "structure" && !mappedRefs.has(ref)
      ? [
          {
            severity: "problem",
            path: `elements.annotations["${ref}"] ("${entry.name}").editing.representation`,
            message: `"structure" is only allowed for shapes mapped to a native type`,
            ref,
          },
        ]
      : [],
  );
}

/**
 * Checks the given data like {@linkcode parseMisoConfig}, without throwing: the settings against their schemas (the
 * kind-specific options by the section of `elements`), the model by RAMEN core, the refs of the settings and the
 * mapped shapes against the model (see `checkElements`, `checkMappings`), and that only mapped shapes have the
 * representation `structure`. A format error or an invalid model stops the
 * checks; there is one problem then, and no `config`/`model`.
 *
 * @param {unknown} data - The config, e.g. the parsed JSON of a file.
 * @returns {ConfigCheckResult} The validated config and its imported model (if the format and the model are valid), and
 *   the findings.
 */
export function checkConfig(data: unknown): ConfigCheckResult {
  const result = misoConfigSchema.safeParse(data);

  if (!result.success) {
    return { findings: [{ severity: "problem", path: "", message: z.prettifyError(result.error) }] };
  }

  let model: RamenModel;

  try {
    model = RamenModel.import(structuredClone(result.data.model));
  } catch (error: unknown) {
    return {
      findings: [{ severity: "problem", path: "", message: `The model in the config is invalid: ${(error as Error).message}` }],
    };
  }

  return {
    config: result.data,
    model,
    findings: [
      ...checkElements(result.data.model, result.data.elements),
      ...checkMappings(result.data.model, result.data.editors.text.mappings),
      ...checkRepresentations(result.data.elements, result.data.editors.text.mappings),
    ],
  };
}

/**
 * Checks that the given data is a config and imports its model, see {@linkcode checkConfig}.
 *
 * @param {unknown} data - The config as received, e.g. the parsed JSON response of the API.
 * @returns {ParsedMisoConfig} The validated config, its imported model and the warnings.
 * @throws {ConfigValidationError} If the data does not match the format, the model is invalid or a ref is broken
 * (see the checks). The message lists the problems with their paths.
 */
export function parseMisoConfig(data: unknown): ParsedMisoConfig {
  const { config, model, findings } = checkConfig(data);
  const problems: ConfigFinding[] = findings.filter((finding) => finding.severity === "problem");

  if (problems.length > 0 || !config || !model) {
    throw new ConfigValidationError(problems.map(formatFinding).join("\n"));
  }

  return {
    config,
    model,
    warnings: findings.filter((finding) => finding.severity === "warning").map(formatFinding),
  };
}
