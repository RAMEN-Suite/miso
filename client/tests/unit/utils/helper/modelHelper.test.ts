import { describe, expect, test } from "vitest";
import { RAMEN_ELEMENT, RamenModel, Relation } from "@ramen-suite/core";
import { BASE_NODE_REF } from "../../../../src/config/ramen";
import type { ModelAnnotationShape } from "../../../../src/models/types";
import { parseMisoConfig } from "../../../../src/schemas/misoConfig.schema";
import {
  createModelContext,
  familyRefOf,
  findShape,
  getMissingReferences,
  getReferenceTargetRefs,
  requiresReferences,
  resolveClassifierRef,
  resolveShapeRef,
} from "../../../../src/utils/helper/modelHelper";

/**
 * A model for the resolution of stored names:
 * - Collection > Letter > DraftLetter, and Collection > Volume on a separate branch
 * - Content > Text, Entity > Person
 * - the family TextAnnotation on Text, with `persName` and `commentary`
 * - the family NoteAnnotation on TextAnnotation (annotations on annotations), with another `commentary`
 * - the family OtherTextAnnotation on Text, which also has a `seg` like TextAnnotation
 */
function buildResolutionTestModel() {
  const edition = RamenModel.create("Resolution test");
  const letter = edition.createNode({ name: "Letter", refines: RAMEN_ELEMENT.COLLECTION }).element;
  const draftLetter = edition.createNode({ name: "DraftLetter", refines: letter }).element;
  const volume = edition.createNode({ name: "Volume", refines: RAMEN_ELEMENT.COLLECTION }).element;
  const text = edition.createNode({ name: "Text", refines: RAMEN_ELEMENT.CONTENT }).element;
  const person = edition.createNode({ name: "Person", refines: RAMEN_ELEMENT.ENTITY }).element;
  const textFamily = edition.createNode({ name: "TextAnnotation", refines: RAMEN_ELEMENT.ANNOTATION }).element;
  const noteFamily = edition.createNode({ name: "NoteAnnotation", refines: RAMEN_ELEMENT.ANNOTATION }).element;
  const otherFamily = edition.createNode({ name: "OtherTextAnnotation", refines: RAMEN_ELEMENT.ANNOTATION }).element;

  const onText = edition.hasAnnotation(text, textFamily).element;
  const onAnnotation = edition.hasAnnotation(textFamily, noteFamily).element;
  const otherOnText = edition.hasAnnotation(text, otherFamily).element;
  const incoming = (relation: Relation) => [
    { relations: [relation], direction: "incoming" as const, bounds: { lowerBound: 1, upperBound: 1 } },
  ];

  const persName = edition.createAnnotationShape({ node: textFamily, type: "persName", relations: incoming(onText) });
  const textCommentary = edition.createAnnotationShape({ node: textFamily, type: "commentary", relations: incoming(onText) });
  const noteCommentary = edition.createAnnotationShape({
    node: noteFamily,
    type: "commentary",
    relations: incoming(onAnnotation),
  });
  edition.createAnnotationShape({ node: textFamily, type: "seg", relations: incoming(onText) });
  edition.createAnnotationShape({ node: otherFamily, type: "seg", relations: incoming(otherOnText) });

  const { config, model } = parseMisoConfig({
    $schema: "https://ramen-schema.org/miso/1.0.0/config.schema.json",
    id: "resolutionTest",
    model: edition.export(),
    miso: { templates: [], mappings: [] },
  });
  const modelId: string = edition.getModel().id;
  const ref = (element: { id: string }): string => `${modelId}:${element.id}`;

  return {
    context: createModelContext(config, model),
    refs: {
      letter: ref(letter),
      draftLetter: ref(draftLetter),
      volume: ref(volume),
      text: ref(text),
      person: ref(person),
      textFamily: ref(textFamily),
      noteFamily: ref(noteFamily),
      persName: ref(persName.element),
      textCommentary: ref(textCommentary.element),
      noteCommentary: ref(noteCommentary.element),
    },
  };
}

const { context, refs } = buildResolutionTestModel();

describe("resolveClassifierRef", () => {
  test.for([
    [["Collection", "Letter"], "letter"],
    [["Collection", "Letter", "DraftLetter"], "draftLetter"],
    [["DraftLetter", "Collection"], "draftLetter"],
    [["Collection", "DraftLetter"], "draftLetter"],
    [["Content", "Text"], "text"],
    [["Entity", "Person"], "person"],
  ] as const)("%j resolves to the most specific type (%s)", ([labels, expected]) => {
    expect(resolveClassifierRef(context, [...labels])).toEqual({ ref: refs[expected] });
  });

  test("ignores labels that name no node type", () => {
    expect(resolveClassifierRef(context, ["Content", "Text", "Section"])).toEqual({ ref: refs.text });
  });

  test("resolves a node with only a base label to the base node", () => {
    expect(resolveClassifierRef(context, ["Entity"])).toEqual({ ref: BASE_NODE_REF.Entity });
  });

  test("gives no ref for labels on separate branches", () => {
    const resolution = resolveClassifierRef(context, ["Collection", "Letter", "Volume"]);

    expect(resolution.ref).toBeNull();
    expect(resolution.problem).toContain("separate branches");
  });

  test("gives no ref if no label names a node type", () => {
    const resolution = resolveClassifierRef(context, ["Character"]);

    expect(resolution.ref).toBeNull();
    expect(resolution.problem).toContain("Character");
  });

  test("returns the cached resolution for the same labels in another order", () => {
    expect(resolveClassifierRef(context, ["Letter", "Collection"])).toBe(
      resolveClassifierRef(context, ["Collection", "Letter"]),
    );
  });
});

describe("resolveShapeRef", () => {
  test("resolves a type on its carrier", () => {
    expect(resolveShapeRef(context, refs.text, "persName")).toEqual({ ref: refs.persName });
  });

  test("tells shapes with the same type apart by their carrier", () => {
    expect(resolveShapeRef(context, refs.text, "commentary")).toEqual({ ref: refs.textCommentary });
    expect(resolveShapeRef(context, refs.textFamily, "commentary")).toEqual({ ref: refs.noteCommentary });
  });

  test("the annotation's classifier is the family of its shape", () => {
    const shape: ModelAnnotationShape | undefined = findShape(context, refs.noteCommentary);

    expect(shape && familyRefOf(shape)).toBe(refs.noteFamily);
  });

  test("gives no ref for a type the carrier may not have", () => {
    const resolution = resolveShapeRef(context, refs.text, "unknown");

    expect(resolution.ref).toBeNull();
    expect(resolution.problem).toContain("Text");
  });

  test("gives no ref if the carrier may have several shapes of the type", () => {
    const resolution = resolveShapeRef(context, refs.text, "seg");

    expect(resolution.ref).toBeNull();
    expect(resolution.problem).toContain("Several");
  });
});

/**
 * A text annotation type `rs` that may refer to at most one Person (or a refinement) and to any number of Letters,
 * each rule counted on its own.
 *
 * @param personBounds - Bounds of the Person rule, `0..1` by default.
 */
function buildReferenceTestModel(personBounds = { lowerBound: 0, upperBound: 1 }) {
  const edition = RamenModel.create("Reference test");
  const letter = edition.createNode({ name: "Letter", refines: RAMEN_ELEMENT.COLLECTION }).element;
  const text = edition.createNode({ name: "Text", refines: RAMEN_ELEMENT.CONTENT }).element;
  const person = edition.createNode({ name: "Person", refines: RAMEN_ELEMENT.ENTITY }).element;
  const saint = edition.createNode({ name: "Saint", refines: person }).element;
  const family = edition.createNode({ name: "TextAnnotation", refines: RAMEN_ELEMENT.ANNOTATION }).element;

  const onText: Relation = edition.hasAnnotation(text, family).element;
  const refersToPerson: Relation = edition.refersTo(family, person).element;
  const refersToLetter: Relation = edition.refersTo(family, letter).element;

  const rs = edition.createAnnotationShape({
    node: family,
    type: "rs",
    relations: [
      { relations: [onText], direction: "incoming", bounds: { lowerBound: 1, upperBound: 1 } },
      { relations: [refersToPerson], direction: "outgoing", bounds: personBounds },
      { relations: [refersToLetter], direction: "outgoing", bounds: { lowerBound: 0, upperBound: -1 } },
    ],
  });

  const { config, model } = parseMisoConfig({
    $schema: "https://ramen-schema.org/miso/1.0.0/config.schema.json",
    id: "referenceTest",
    model: edition.export(),
    miso: { templates: [], mappings: [] },
  });
  const modelId: string = edition.getModel().id;
  const ref = (element: { id: string }): string => `${modelId}:${element.id}`;

  return {
    context: createModelContext(config, model),
    refs: { letter: ref(letter), person: ref(person), saint: ref(saint), rs: ref(rs.element) },
  };
}

describe("getReferenceTargetRefs, getMissingReferences", () => {
  const reference = buildReferenceTestModel();
  const shape = findShape(reference.context, reference.refs.rs) as ModelAnnotationShape;

  test("lists the targets of the outgoing REFERS_TO rules", () => {
    expect(getReferenceTargetRefs(reference.context, shape).toSorted()).toEqual(
      [reference.refs.person, reference.refs.letter].toSorted(),
    );
  });

  test("leaves out the targets of a rule whose upper bound is reached, a refinement counts for its target", () => {
    expect(getReferenceTargetRefs(reference.context, shape, [reference.refs.saint])).toEqual([reference.refs.letter]);
  });

  test("a required rule is missing until a reference to its target (or a refinement) exists", () => {
    const required = buildReferenceTestModel({ lowerBound: 1, upperBound: 1 });
    const requiredShape = findShape(required.context, required.refs.rs) as ModelAnnotationShape;

    expect(requiresReferences(required.context, requiredShape)).toBe(true);
    expect(getMissingReferences(required.context, requiredShape, [required.refs.letter])).toEqual([
      { targetRefs: [required.refs.person], missing: 1 },
    ]);
    expect(getMissingReferences(required.context, requiredShape, [required.refs.saint])).toEqual([]);
  });

  test("optional rules are never missing", () => {
    expect(requiresReferences(reference.context, shape)).toBe(false);
    expect(getMissingReferences(reference.context, shape, [])).toEqual([]);
  });

  test("keeps the targets of an unbounded rule", () => {
    expect(
      getReferenceTargetRefs(reference.context, shape, [reference.refs.letter, reference.refs.letter]).toSorted(),
    ).toEqual([reference.refs.person, reference.refs.letter].toSorted());
  });
});
