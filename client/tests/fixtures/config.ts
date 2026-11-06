import { RAMEN_ELEMENT, RamenModel, type AnnotationShapeInput } from "@ramen-suite/core";
import type { AnnotationShapeConfig, BuiltinStructuralType } from "../../src/models/types";
import { parseMisoConfig, type ParsedMisoConfig } from "../../src/schemas/misoConfig.schema";

/** Annotation types of the text family: the built-in structure types plus one or two per representation and extent */
const TEXT_ANNOTATION_TYPES: { type: string; native?: BuiltinStructuralType; miso?: AnnotationShapeConfig }[] = [
  { type: "p", native: "paragraph" },
  { type: "head", native: "heading" },
  { type: "lb", native: "hardBreak" },
  { type: "list", native: "bulletList" },
  { type: "item", native: "listItem" },
  { type: "table", native: "table" },
  { type: "row", native: "tableRow" },
  { type: "cell", native: "tableCell" },
  { type: "opener", miso: { editing: { extent: "range", representation: "blockClassification" } } },
  { type: "closer", miso: { editing: { extent: "range", representation: "blockClassification" } } },
  { type: "add", miso: { editing: { extent: "range", representation: "inline" } } },
  { type: "del", miso: { editing: { extent: "range", representation: "inline" } } },
  { type: "metamark", miso: { editing: { extent: "zeroPoint", representation: "inline" } } },
];

/**
 * Builds a minimal Miso config for the tests: a `Text` content type, one text annotation family with the types above,
 * and the native mappings of the structure types. The model is built with RAMEN core, so it stays valid when the
 * library changes, and the config is validated the same way the app does on load.
 *
 * @returns {ParsedMisoConfig} The validated config and its imported model.
 */
function buildTestConfig(): ParsedMisoConfig {
  const edition = RamenModel.create("Test edition");
  const text = edition.createNode({ name: "Text", refines: RAMEN_ELEMENT.CONTENT }).element;
  const family = edition.createNode({ name: "TextAnnotation", refines: RAMEN_ELEMENT.ANNOTATION }).element;
  const onText = edition.hasAnnotation(text, family).element;
  const modelId: string = edition.getModel().id;
  const mappings: { native: BuiltinStructuralType; annotation: string; type: string }[] = [];

  for (const { type, native, miso } of TEXT_ANNOTATION_TYPES) {
    const input: AnnotationShapeInput = {
      node: family,
      type,
      relations: [{ relations: [onText], direction: "incoming", bounds: { lowerBound: 1, upperBound: 1 } }],
      ...(miso ? { ext: { miso } } : {}),
    };
    const shape = edition.createAnnotationShape(input).element;

    if (native) {
      mappings.push({ native, annotation: `${modelId}:${shape.id}`, type });
    }
  }

  return parseMisoConfig({
    meta: { configVersion: "1.0.0", project: "test" },
    model: edition.export(),
    miso: { templates: [], mappings },
  });
}

/** The validated Miso config the unit tests initialize the config store with. */
export const testConfig: ParsedMisoConfig = buildTestConfig();
