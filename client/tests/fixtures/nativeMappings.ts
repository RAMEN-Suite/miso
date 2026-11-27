import { ModelFactory, RAMEN_ELEMENT, RamenModel, type AnnotationShapeInput, type Node } from "@ramen-suite/core";
import type { NativeType } from "../../src/models/types";
import { getNativeTypeConfig, NATIVE_TYPES } from "../../src/editors/text/src/config/constants";

/** An entry of `editors.text.mappings` */
interface NativeMapping {
  native: NativeType;
  annotation: string;
  type: string;
}

/** The type of the annotation shape of each native type, as the project configs name them */
const NATIVE_SHAPE_TYPES: Record<NativeType, string> = {
  paragraph: "p",
  heading: "head",
  hardBreak: "lb",
  bulletList: "list",
  listItem: "item",
  table: "table",
  tableRow: "row",
  tableCell: "cell",
};

/**
 * Adds an annotation shape for every native type of the text editor to a test model, with the editor's native
 * attributes unchanged, and returns what every config needs for them (see `checkMappings`, `checkContentMedia`): their
 * mappings, and the `elements.classifiers` entry that makes the carrier a text Content.
 *
 * Without a family, the shapes get one of their own that only the carrier carries, so they don't change what the other
 * elements of the model can carry.
 *
 * @param {RamenModel} edition - The test model.
 * @param {Node} carrier - The text Content refinement that carries the shapes.
 * @param {AnnotationShapeInput["node"]} [family] - The annotation family of the shapes.
 * @param {AnnotationShapeInput["relations"]} [relations] - The relations of the shapes, which must include one from the
 *   carrier. Without, the shapes get a `HAS_ANNOTATION` relation from it.
 * @returns {{ mappings: NativeMapping[]; classifiers: Record<string, { name: string; medium: "text" }>; shapeRefByType:
 *   Record<string, string> }} The mappings, the classifier entry of the carrier, and the ref of each shape by its type.
 */
export function addNativeShapes(
  edition: RamenModel,
  carrier: Node,
  family?: AnnotationShapeInput["node"],
  relations?: AnnotationShapeInput["relations"],
): {
  mappings: NativeMapping[];
  classifiers: Record<string, { name: string; medium: "text" }>;
  shapeRefByType: Record<string, string>;
} {
  const modelId: string = edition.getModel().id;
  const node = family ?? edition.createNode({ name: "NativeStructure", refines: RAMEN_ELEMENT.ANNOTATION }).element;
  const shapeRelations: AnnotationShapeInput["relations"] = relations ?? [
    {
      relations: [edition.hasAnnotation(carrier, node).element],
      direction: "incoming",
      bounds: { lowerBound: 1, upperBound: 1 },
    },
  ];
  const mappings: NativeMapping[] = [];
  const shapeRefByType: Record<string, string> = {};

  for (const native of NATIVE_TYPES) {
    const { attributes } = getNativeTypeConfig(native);
    const type: string = NATIVE_SHAPE_TYPES[native];
    const shape = edition.createAnnotationShape({
      node,
      type,
      properties: attributes.map(({ constraints, ...attribute }) => ({
        ...attribute,
        ...(constraints
          ? { constraints: constraints.map((constraint) => ({ ...constraint, id: ModelFactory.createIdentifier() })) }
          : {}),
      })),
      relations: shapeRelations,
    }).element;

    shapeRefByType[type] = `${modelId}:${shape.id}`;
    mappings.push({ native, annotation: shapeRefByType[type], type });
  }

  return {
    mappings,
    classifiers: { [`${modelId}:${carrier.id}`]: { name: carrier.name, medium: "text" } },
    shapeRefByType,
  };
}
