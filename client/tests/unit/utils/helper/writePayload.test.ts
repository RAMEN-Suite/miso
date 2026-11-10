import { describe, expect, test } from "vitest";
import { RAMEN_ELEMENT, RAMEN_MODEL, RamenModel, Relation } from "@ramen-suite/core";
import type { ElementGraph, NodeStatusObject } from "../../../../src/models/types";
import { parseMisoConfig } from "../../../../src/schemas/misoConfig.schema";
import { createModelContext } from "../../../../src/utils/helper/modelHelper";
import { toWritePayload } from "../../../../src/utils/helper/writePayload";

/**
 * A model for the write payload: a Letter (Collection), a Text (Content), a Person (Entity) and the text annotation
 * family with `persName`, which may refer to a Person. No Text may be part of a Letter.
 */
function buildPayloadTestModel() {
  const edition = RamenModel.create("Payload test");
  const letter = edition.createNode({ name: "Letter", refines: RAMEN_ELEMENT.COLLECTION }).element;
  const text = edition.createNode({ name: "Text", refines: RAMEN_ELEMENT.CONTENT }).element;
  const person = edition.createNode({ name: "Person", refines: RAMEN_ELEMENT.ENTITY }).element;
  const family = edition.createNode({ name: "TextAnnotation", refines: RAMEN_ELEMENT.ANNOTATION }).element;
  const onText: Relation = edition.hasAnnotation(text, family).element;
  const refersToPerson: Relation = edition.refersTo(family, person).element;
  const persName = edition.createAnnotationShape({
    node: family,
    type: "persName",
    relations: [
      { relations: [onText], direction: "incoming", bounds: { lowerBound: 1, upperBound: 1 } },
      { relations: [refersToPerson], direction: "outgoing", bounds: { lowerBound: 0, upperBound: 1 } },
    ],
  });

  const { config, model } = parseMisoConfig({
    $schema: "https://ramen-schema.org/miso/1.0.0/config.schema.json",
    id: "payloadTest",
    model: edition.export(),
    miso: { templates: [], editors: { text: { mappings: [] } } },
  });
  const modelId: string = edition.getModel().id;
  const ref = (element: { id: string }): string => `${modelId}:${element.id}`;

  return {
    context: createModelContext(config, model),
    refs: {
      letter: ref(letter),
      text: ref(text),
      person: ref(person),
      family: ref(family),
      onText: ref(onText),
      refersToPerson: ref(refersToPerson),
      persName: ref(persName.element),
    },
  };
}

const { context, refs } = buildPayloadTestModel();

// The trees below only carry the fields the conversion reads, hence the casts via `unknown`

describe("toWritePayload", () => {
  test("a text with a new annotation that refers to an existing person", () => {
    const root: NodeStatusObject = {
      node: { nodeLabels: ["Content", "Text"], data: { uuid: "t1", text: "Abcd" } },
      meta: { status: "modified" },
      connectedNodes: [
        {
          // Structural annotations rebuilt by the editor carry no refs: they are resolved from the carrier and type
          node: { nodeLabels: ["Annotation"], data: { uuid: "a1", type: "persName", selector: { type: "TextPositionSelector", start: 0, end: 3 }, text: "Abcd" } },
          meta: { status: "created" },
          connectedNodes: [
            {
              node: { nodeLabels: ["Entity", "Person"], data: { uuid: "p1", label: "Someone" } },
              meta: { status: "added" },
              connectedNodes: [],
            },
          ],
        },
      ],
    } as unknown as NodeStatusObject;

    const payload: ElementGraph = toWritePayload(context, root);

    expect(payload.nodes).toEqual([
      expect.objectContaining({ status: "modified", classifierRef: refs.text, data: expect.objectContaining({ uuid: "t1" }) }),
      expect.objectContaining({ status: "created", classifierRef: refs.family, shapeRef: refs.persName }),
    ]);
    expect(payload.relations).toEqual([
      { status: "added", relationRef: refs.onText, from: "t1", to: "a1" },
      { status: "added", relationRef: refs.refersToPerson, from: "a1", to: "p1" },
    ]);
  });

  test("a removed child removes its relation, unless its parent is deleted", () => {
    const root: NodeStatusObject = {
      node: { nodeLabels: ["Content", "Text"], data: { uuid: "t1", text: "Abcd" } },
      meta: { status: "unchanged" },
      connectedNodes: [
        {
          node: { nodeLabels: ["Annotation"], data: { uuid: "a1", type: "persName" } },
          meta: { status: "modified" },
          connectedNodes: [
            {
              node: { nodeLabels: ["Entity", "Person"], data: { uuid: "p1" } },
              meta: { status: "removed" },
              connectedNodes: [],
            },
          ],
        },
        {
          node: { nodeLabels: ["Annotation"], data: { uuid: "a2", type: "persName" } },
          meta: { status: "deleted" },
          connectedNodes: [
            {
              node: { nodeLabels: ["Entity", "Person"], data: { uuid: "p2" } },
              meta: { status: "removed" },
              connectedNodes: [],
            },
          ],
        },
      ],
    } as unknown as NodeStatusObject;

    const payload: ElementGraph = toWritePayload(context, root);

    expect(payload.nodes.map((node) => [node.status, node.data.uuid])).toEqual([
      ["modified", "a1"],
      ["deleted", "a2"],
    ]);
    expect(payload.relations).toEqual([{ status: "removed", relationRef: refs.refersToPerson, from: "a1", to: "p1" }]);
  });

  test("a part the model doesn't allow gets RAMEN's base relation, PART_OF points from the child to the parent", () => {
    const root: NodeStatusObject = {
      node: { nodeLabels: ["Collection", "Letter"], data: { uuid: "l1", label: "A letter" } },
      meta: { status: "unchanged" },
      connectedNodes: [
        {
          node: { nodeLabels: ["Content", "Text"], data: { uuid: "t1", text: "Abcd" } },
          meta: { status: "created" },
          connectedNodes: [],
        },
      ],
    } as unknown as NodeStatusObject;

    const [relation] = toWritePayload(context, root).relations;

    expect(relation).toEqual(expect.objectContaining({ status: "added", from: "t1", to: "l1" }));
    expect(relation.relationRef).toMatch(new RegExp(`^${RAMEN_MODEL.id}:`));
  });
});
