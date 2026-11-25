import { describe, expect, test } from "vitest";
import { RAMEN_ELEMENT, RAMEN_MODEL, RamenModel, Relation } from "@ramen-suite/core";
import type { Annotation, EditGraph, EditNode, ElementGraph } from "../../../../src/models/types";
import { parseMisoConfig } from "../../../../src/schemas/misoConfig.schema";
import { createModelContext } from "../../../../src/utils/helper/modelHelper";
import { relationRefOf, toContentSaveGraph, toWritePayload } from "../../../../src/utils/helper/writePayload";

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
    general: { templates: [] },
    elements: { classifiers: {}, annotations: {} },
    editors: { text: { mappings: [] } },
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

describe("relationRefOf", () => {
  test("the relation between the classifiers", () => {
    expect(relationRefOf(context, refs.family, "REFERS_TO", refs.person)).toBe(refs.refersToPerson);
  });

  test("a relation the model doesn't allow gets RAMEN's base relation", () => {
    expect(relationRefOf(context, refs.text, "PART_OF", refs.letter)).toMatch(new RegExp(`^${RAMEN_MODEL.id}:`));
  });
});

describe("toContentSaveGraph", () => {
  test("refs from the Content and the type, a carrier relation for created annotations, a shared node once", () => {
    const content = { classifierRef: refs.text, nodeLabels: ["Content", "Text"], properties: { uuid: "t1", text: "Abcd" } };
    const person: EditNode = { status: "unchanged", classifierRef: refs.person, nodeLabels: ["Entity", "Person"], properties: { uuid: "p1" } };
    // Annotations rebuilt by the editor carry no refs: they are resolved from the Content and their type
    const created: Annotation = {
      node: { nodeLabels: ["Annotation"], properties: { uuid: "a1", type: "persName" } } as unknown as Annotation["node"],
      status: "created",
      nodes: [{ ...person }],
      relations: [{ status: "added", relationRef: refs.refersToPerson, type: "REFERS_TO", from: "a1", to: "p1" }],
    };
    const withEditedPerson: Annotation = {
      node: { nodeLabels: ["Annotation"], properties: { uuid: "a2", type: "persName" } } as unknown as Annotation["node"],
      status: "unchanged",
      nodes: [{ ...person, status: "modified", properties: { uuid: "p1", label: "New" } }],
      relations: [{ status: "unchanged", relationRef: refs.refersToPerson, type: "REFERS_TO", from: "a2", to: "p1" }],
    };

    const graph: EditGraph = toContentSaveGraph(context, content, [created, withEditedPerson]);

    expect(graph.nodes.map((node) => [node.properties.uuid, node.status, node.classifierRef, node.shapeRef])).toEqual([
      ["t1", "modified", refs.text, undefined],
      ["a1", "created", refs.family, refs.persName],
      ["p1", "modified", refs.person, undefined],
      ["a2", "unchanged", refs.family, refs.persName],
    ]);
    expect(graph.relations).toEqual([
      { status: "added", relationRef: refs.onText, type: "HAS_ANNOTATION", from: "t1", to: "a1" },
      { status: "added", relationRef: refs.refersToPerson, type: "REFERS_TO", from: "a1", to: "p1" },
      { status: "unchanged", relationRef: refs.refersToPerson, type: "REFERS_TO", from: "a2", to: "p1" },
    ]);
  });
});

describe("toWritePayload", () => {
  test("only changed nodes and relations are sent, without the stored labels", () => {
    const graph: EditGraph = {
      nodes: [
        { status: "unchanged", classifierRef: refs.text, nodeLabels: ["Content", "Text"], properties: { uuid: "t1" } },
        {
          status: "created",
          classifierRef: refs.family,
          shapeRef: refs.persName,
          nodeLabels: ["Annotation"],
          properties: { uuid: "a1", type: "persName" },
        },
        { status: "modified", classifierRef: refs.person, nodeLabels: ["Entity", "Person"], properties: { uuid: "p1", label: "New" } },
      ],
      relations: [
        { status: "added", relationRef: refs.onText, type: "HAS_ANNOTATION", from: "t1", to: "a1" },
        { status: "added", relationRef: refs.refersToPerson, type: "REFERS_TO", from: "a1", to: "p1" },
        { status: "unchanged", relationRef: refs.refersToPerson, type: "REFERS_TO", from: "a0", to: "p1" },
      ],
    };

    const payload: ElementGraph = toWritePayload(context, graph);

    expect(payload.nodes).toEqual([
      { status: "created", classifierRef: refs.family, shapeRef: refs.persName, properties: { uuid: "a1", type: "persName" } },
      { status: "modified", classifierRef: refs.person, properties: { uuid: "p1", label: "New" } },
    ]);
    expect(payload.relations).toEqual([
      { status: "added", relationRef: refs.onText, type: "HAS_ANNOTATION", from: "t1", to: "a1" },
      { status: "added", relationRef: refs.refersToPerson, type: "REFERS_TO", from: "a1", to: "p1" },
    ]);
  });

  test("a node whose classifier couldn't be resolved gets its RAMEN base node", () => {
    const graph: EditGraph = {
      nodes: [{ status: "modified", classifierRef: null, nodeLabels: ["Entity", "Unknown"], properties: { uuid: "e1" } }],
      relations: [],
    };

    expect(toWritePayload(context, graph).nodes[0].classifierRef).toMatch(new RegExp(`^${RAMEN_MODEL.id}:`));
  });

  test("a removed relation without a relation definition keeps its stored type", () => {
    const graph: EditGraph = {
      nodes: [],
      relations: [{ status: "removed", relationRef: null, type: "REFERS_TO", from: "a1", to: "e1" }],
    };

    expect(toWritePayload(context, graph).relations).toEqual([
      { status: "removed", relationRef: null, type: "REFERS_TO", from: "a1", to: "e1" },
    ]);
  });
});
