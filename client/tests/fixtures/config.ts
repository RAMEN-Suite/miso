import { RAMEN_ELEMENT, RamenModel, AnnotationShapeInput } from "@ramen-suite/core";
import type { AnnotationShapeConfig } from "../../src/models/types";
import { parseMisoConfig, ParsedMisoConfig } from "../../src/schemas/misoConfig.schema";
import { addNativeShapes } from "./nativeMappings";

/** Annotation types of the text family besides the native structure types: one or two per representation and extent */
const TEXT_ANNOTATION_TYPES: { type: string; settings: AnnotationShapeConfig }[] = [
  { type: "opener", settings: { editing: { extent: "range", representation: "blockClassification" } } },
  { type: "closer", settings: { editing: { extent: "range", representation: "blockClassification" } } },
  { type: "add", settings: { editing: { extent: "range", representation: "inline" } } },
  { type: "del", settings: { editing: { extent: "range", representation: "inline" } } },
  { type: "metamark", settings: { editing: { extent: "zeroPoint", representation: "inline" } } },
];

/**
 * Builds a minimal Miso config for the tests: a `Text` content type of medium `text`, one text annotation family with the native
 * structure types (see `addNativeShapes`, mapped) and the types above (with their settings in `elements.annotations`).
 * The model is built with RAMEN core, so it stays valid when the library changes, and the config is validated the same
 * way the app does on load.
 *
 * @returns {{ parsed: ParsedMisoConfig; shapeRefByType: Record<string, string> }} The validated config with its
 *   imported model, and the ref of each annotation shape by its type.
 */
function buildTestConfig(): { parsed: ParsedMisoConfig; shapeRefByType: Record<string, string> } {
  const edition = RamenModel.create("Test edition");
  const text = edition.createNode({ name: "Text", refines: RAMEN_ELEMENT.CONTENT }).element;
  const family = edition.createNode({ name: "TextAnnotation", refines: RAMEN_ELEMENT.ANNOTATION }).element;
  const onText = edition.hasAnnotation(text, family).element;
  const modelId: string = edition.getModel().id;
  const relations: AnnotationShapeInput["relations"] = [
    { relations: [onText], direction: "incoming", bounds: { lowerBound: 1, upperBound: 1 } },
  ];
  const { mappings, classifiers, shapeRefByType } = addNativeShapes(edition, text, family, relations);
  const annotations: Record<string, AnnotationShapeConfig & { name: string }> = {};

  for (const { type, settings } of TEXT_ANNOTATION_TYPES) {
    const shape = edition.createAnnotationShape({ node: family, type, relations }).element;

    shapeRefByType[type] = `${modelId}:${shape.id}`;
    annotations[shapeRefByType[type]] = { name: type, ...settings };
  }

  const parsed: ParsedMisoConfig = parseMisoConfig({
    $schema: "https://ramen-schema.org/miso/1.0.0/config.schema.json",
    id: "testConfig",
    model: edition.export(),
    general: { templates: [] },
    elements: { classifiers, annotations },
    editors: { text: { mappings } },
  });

  return { parsed, shapeRefByType };
}

const built = buildTestConfig();

/** The validated Miso config the unit tests initialize the config store with. */
export const testConfig: ParsedMisoConfig = built.parsed;

/** The ref of each annotation shape of {@linkcode testConfig} by its type, e.g. for fixture annotations. */
export const testShapeRefByType: Readonly<Record<string, string>> = built.shapeRefByType;
