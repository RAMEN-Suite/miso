import { ModelFactory, RAMEN_ELEMENT, RamenModel, type AnnotationShapeInput } from "@ramen-suite/core";
import type { NativeType } from "../../src/models/types";
import { NATIVE_TYPE_CONFIGS } from "../../src/editors/text/src/config/constants";

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
 * attributes unchanged, and returns their mappings, which every config needs (see `checkMappings`).
 *
 * Without a family, the shapes get one of their own that nothing carries, so they don't change what the other
 * elements of the model can carry.
 *
 * @param {RamenModel} edition - The test model.
 * @param {AnnotationShapeInput["node"]} [family] - The annotation family of the shapes.
 * @param {AnnotationShapeInput["relations"]} [relations] - The relations of the shapes, e.g. to their carrier.
 * @returns {{ mappings: NativeMapping[]; shapeRefByType: Record<string, string> }} The mappings, and the ref of each
 *   shape by its type.
 */
export function addNativeShapes(
  edition: RamenModel,
  family?: AnnotationShapeInput["node"],
  relations: AnnotationShapeInput["relations"] = [],
): { mappings: NativeMapping[]; shapeRefByType: Record<string, string> } {
  const modelId: string = edition.getModel().id;
  const node = family ?? edition.createNode({ name: "NativeStructure", refines: RAMEN_ELEMENT.ANNOTATION }).element;
  const mappings: NativeMapping[] = [];
  const shapeRefByType: Record<string, string> = {};

  for (const { native, attributes } of NATIVE_TYPE_CONFIGS) {
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
      relations,
    }).element;

    shapeRefByType[type] = `${modelId}:${shape.id}`;
    mappings.push({ native, annotation: shapeRefByType[type], type });
  }

  return { mappings, shapeRefByType };
}
