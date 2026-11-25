import { describe, expect, test } from "vitest";
import { RAMEN_ELEMENT, RamenModel } from "@ramen-suite/core";
import type { EditGraph, ElementRelation } from "../../../../src/models/types";
import { parseMisoConfig } from "../../../../src/schemas/misoConfig.schema";
import {
  addExistingNode,
  addRelation,
  annotationsOf,
  applySaveResult,
  applySavedChanges,
  carriersOf,
  createNode,
  deleteNode,
  EditNodeData,
  findNode,
  hasChanges,
  partsOf,
  referencesOf,
  removeRelation,
  updateNode,
} from "../../../../src/utils/helper/editGraph";
import { createModelContext } from "../../../../src/utils/helper/modelHelper";
import { relationRefOf } from "../../../../src/utils/helper/writePayload";

/** A model with a Letter (Collection), a Text (Content), a Person (Entity) and a text annotation family that may refer to a Person */
function buildGraphTestModel() {
  const edition = RamenModel.create("Graph test");
  const letter = edition.createNode({ name: "Letter", refines: RAMEN_ELEMENT.COLLECTION }).element;
  const text = edition.createNode({ name: "Text", refines: RAMEN_ELEMENT.CONTENT }).element;
  const person = edition.createNode({ name: "Person", refines: RAMEN_ELEMENT.ENTITY }).element;
  const family = edition.createNode({ name: "TextAnnotation", refines: RAMEN_ELEMENT.ANNOTATION }).element;

  edition.hasAnnotation(text, family);
  edition.refersTo(family, person);

  const { config, model } = parseMisoConfig({
    $schema: "https://ramen-schema.org/miso/1.0.0/config.schema.json",
    id: "graphTest",
    model: edition.export(),
    general: { templates: [] },
    elements: { classifiers: {}, annotations: {} },
    editors: { text: { mappings: [] } },
  });
  const modelId: string = edition.getModel().id;
  const ref = (element: { id: string }): string => `${modelId}:${element.id}`;
  const context = createModelContext(config, model);
  const refs = { letter: ref(letter), text: ref(text), person: ref(person), family: ref(family) };

  return {
    context,
    refs,
    relationRefs: {
      onText: relationRefOf(context, refs.text, "HAS_ANNOTATION", refs.family),
      refersToPerson: relationRefOf(context, refs.family, "REFERS_TO", refs.person),
      partOfLetter: relationRefOf(context, refs.text, "PART_OF", refs.letter),
    },
  };
}

const { context, refs, relationRefs } = buildGraphTestModel();

/** A node of the given type */
function node(classifierRef: string, nodeLabels: string[], properties: EditNodeData["properties"]): EditNodeData {
  return { classifierRef, nodeLabels, properties };
}

const text: EditNodeData = node(refs.text, ["Content", "Text"], { uuid: "t1" });
const annotation: EditNodeData = node(refs.family, ["Annotation"], { uuid: "a1", type: "persName" });
const person: EditNodeData = node(refs.person, ["Entity", "Person"], { uuid: "p1", label: "Someone" });
const onText: ElementRelation = { relationRef: relationRefs.onText, from: "t1", to: "a1" };
const refersToPerson: ElementRelation = { relationRef: relationRefs.refersToPerson, from: "a1", to: "p1" };

/** A saved text with an annotation that refers to a person */
function savedGraph(): EditGraph {
  return {
    nodes: [text, annotation, person].map((entry) => ({ ...structuredClone(entry), status: "unchanged" })),
    relations: [onText, refersToPerson].map((relation) => ({ ...relation, status: "unchanged" })),
  };
}

describe("nodes", () => {
  test("a created node that is deleted again disappears with its relations", () => {
    const graph: EditGraph = savedGraph();

    createNode(graph, node(refs.family, ["Annotation"], { uuid: "a2", type: "persName" }));
    addRelation(graph, { relationRef: relationRefs.onText, from: "t1", to: "a2" });
    addRelation(graph, { relationRef: relationRefs.refersToPerson, from: "a2", to: "p1" });
    deleteNode(graph, "a2");

    expect(graph).toEqual(savedGraph());
    expect(hasChanges(graph)).toBe(false);
  });

  test("a stored node is marked deleted, keeps its stored relations and drops the added ones", () => {
    const graph: EditGraph = savedGraph();

    addRelation(graph, { relationRef: relationRefs.refersToPerson, from: "a1", to: "p2" });
    deleteNode(graph, "a1");

    expect(findNode(graph, "a1")?.status).toBe("deleted");
    expect(graph.relations.map((relation) => [relation.to, relation.status])).toEqual([
      ["a1", "unchanged"],
      ["p1", "unchanged"],
    ]);
    expect(annotationsOf(context, graph, "t1")).toEqual([]);
  });

  test("updating a stored node modifies it, a created node stays created", () => {
    const graph: EditGraph = savedGraph();
    const newAnnotation: EditNodeData = node(refs.family, ["Annotation"], { uuid: "a2", type: "persName" });

    updateNode(graph, { ...person, properties: { uuid: "p1", label: "Someone else" } });
    createNode(graph, newAnnotation);
    updateNode(graph, { ...newAnnotation, properties: { uuid: "a2", type: "placeName" } });

    expect(findNode(graph, "p1")).toEqual(expect.objectContaining({ status: "modified", properties: { uuid: "p1", label: "Someone else" } }));
    expect(findNode(graph, "a2")).toEqual(expect.objectContaining({ status: "created", properties: { uuid: "a2", type: "placeName" } }));
  });

  test("an existing node that is linked and edited at once is modified and its relation added", () => {
    const graph: EditGraph = savedGraph();
    const otherPerson: EditNodeData = node(refs.person, ["Entity", "Person"], { uuid: "p2", label: "Other" });

    addExistingNode(graph, otherPerson);
    addExistingNode(graph, otherPerson);
    addRelation(graph, { relationRef: relationRefs.refersToPerson, from: "a1", to: "p2" });
    updateNode(graph, { ...otherPerson, properties: { uuid: "p2", label: "Renamed" } });

    expect(graph.nodes.filter((entry) => entry.properties.uuid === "p2")).toEqual([
      expect.objectContaining({ status: "modified", properties: { uuid: "p2", label: "Renamed" } }),
    ]);
    expect(graph.relations.at(-1)?.status).toBe("added");
  });

  test("creating a node twice throws", () => {
    expect(() => createNode(savedGraph(), person)).toThrow();
  });
});

describe("relations", () => {
  test("unlinking keeps both nodes, linking again restores the relation", () => {
    const graph: EditGraph = savedGraph();

    removeRelation(graph, refersToPerson);

    expect(graph.relations[1].status).toBe("removed");
    expect(findNode(graph, "p1")?.status).toBe("unchanged");
    expect(referencesOf(context, graph, "a1")).toEqual([]);

    addRelation(graph, refersToPerson);

    expect(graph).toEqual(savedGraph());
  });

  test("an added relation that is removed again disappears", () => {
    const graph: EditGraph = savedGraph();
    const refersToOther: ElementRelation = { relationRef: relationRefs.refersToPerson, from: "a1", to: "p2" };

    addExistingNode(graph, node(refs.person, ["Entity", "Person"], { uuid: "p2" }));
    addRelation(graph, refersToOther);
    addRelation(graph, refersToOther);

    expect(graph.relations.filter((relation) => relation.to === "p2")).toHaveLength(1);

    removeRelation(graph, refersToOther);

    expect(graph.relations.filter((relation) => relation.to === "p2")).toEqual([]);
  });
});

describe("selectors", () => {
  test("annotations, references, carriers and parts follow the relation types and directions", () => {
    const graph: EditGraph = savedGraph();

    addExistingNode(graph, node(refs.letter, ["Collection", "Letter"], { uuid: "l1" }));
    addRelation(graph, { relationRef: relationRefs.partOfLetter, from: "t1", to: "l1" });

    const uuids = (nodes: { properties: { uuid: string } }[]): string[] => nodes.map((entry) => entry.properties.uuid);

    expect(uuids(annotationsOf(context, graph, "t1"))).toEqual(["a1"]);
    expect(uuids(referencesOf(context, graph, "a1"))).toEqual(["p1"]);
    expect(uuids(carriersOf(context, graph, "a1"))).toEqual(["t1"]);
    expect(uuids(partsOf(context, graph, "l1"))).toEqual(["t1"]);
    expect(uuids(annotationsOf(context, graph, "a1"))).toEqual([]);
  });

  test("a deleted end hides the relation", () => {
    const graph: EditGraph = savedGraph();

    deleteNode(graph, "p1");

    expect(referencesOf(context, graph, "a1")).toEqual([]);
    expect(annotationsOf(context, graph, "t1")).toHaveLength(1);
  });
});

describe("applySaveResult", () => {
  test("drops deleted nodes, orphans, removed relations and relations of dropped nodes, the rest is unchanged", () => {
    const graph: EditGraph = savedGraph();

    createNode(graph, { ...person, properties: { uuid: "p2" } });
    addRelation(graph, { relationRef: relationRefs.refersToPerson, from: "a1", to: "p2" });
    removeRelation(graph, refersToPerson);
    addExistingNode(graph, node(refs.family, ["Annotation"], { uuid: "s1", type: "note" }));
    graph.relations.push({ status: "unchanged", relationRef: relationRefs.onText, from: "a1", to: "s1" });
    updateNode(graph, { ...text, properties: { uuid: "t1", text: "Changed" } });

    applySaveResult(graph, ["s1", "not-loaded"]);

    expect(graph.nodes.map((entry) => [entry.properties.uuid, entry.status])).toEqual([
      ["t1", "unchanged"],
      ["a1", "unchanged"],
      ["p1", "unchanged"],
      ["p2", "unchanged"],
    ]);
    expect(graph.relations.map((relation) => [relation.from, relation.to, relation.status])).toEqual([
      ["t1", "a1", "unchanged"],
      ["a1", "p2", "unchanged"],
    ]);
    expect(hasChanges(graph)).toBe(false);
  });

  test("a deleted annotation is dropped with its relations", () => {
    const graph: EditGraph = savedGraph();

    deleteNode(graph, "a1");
    applySaveResult(graph, []);

    expect(graph.nodes.map((entry) => entry.properties.uuid)).toEqual(["t1", "p1"]);
    expect(graph.relations).toEqual([]);
  });
});

describe("applySavedChanges", () => {
  test("takes over the changes of a saved copy and keeps what another save added meanwhile", () => {
    const target: EditGraph = savedGraph();
    const copy: EditGraph = savedGraph();

    updateNode(copy, { ...annotation, properties: { uuid: "a1", type: "persName", note: "Edited" } });
    createNode(copy, { ...person, properties: { uuid: "p2" } });
    addRelation(copy, { relationRef: relationRefs.refersToPerson, from: "a1", to: "p2" });
    removeRelation(copy, refersToPerson);

    // Another save that finished in the meantime
    addExistingNode(target, node(refs.family, ["Annotation"], { uuid: "a3", type: "persName" }));
    target.relations.push({ status: "unchanged", relationRef: relationRefs.onText, from: "t1", to: "a3" });

    applySavedChanges(target, copy, []);

    expect(findNode(target, "a1")?.properties).toEqual({ uuid: "a1", type: "persName", note: "Edited" });
    expect(target.nodes.map((entry) => [entry.properties.uuid, entry.status])).toEqual([
      ["t1", "unchanged"],
      ["a1", "unchanged"],
      ["p1", "unchanged"],
      ["a3", "unchanged"],
      ["p2", "unchanged"],
    ]);
    expect(target.relations.map((relation) => [relation.from, relation.to])).toEqual([
      ["t1", "a1"],
      ["t1", "a3"],
      ["a1", "p2"],
    ]);
  });

  test("a deleted annotation and its orphans are dropped with their relations", () => {
    const target: EditGraph = savedGraph();

    addExistingNode(target, node(refs.family, ["Annotation"], { uuid: "s1", type: "note" }));
    target.relations.push({ status: "unchanged", relationRef: relationRefs.onText, from: "a1", to: "s1" });

    const copy: EditGraph = structuredClone(target);

    deleteNode(copy, "a1");
    applySavedChanges(target, copy, ["s1"]);

    expect(target.nodes.map((entry) => entry.properties.uuid)).toEqual(["t1", "p1"]);
    expect(target.relations).toEqual([]);
  });
});
