import { describe, expect, test } from "vitest";
import { DataTypes, RAMEN_ELEMENT, RamenModel, Relation } from "@ramen-suite/core";
import { BASE_NODE_LABEL_BY_REF, BASE_NODE_LABELS, BASE_NODE_REF } from "../../../../src/config/ramen";
import type { ModelAnnotationShape, ModelAttribute, ModelContext } from "../../../../src/models/types";
import { parseMisoConfig } from "../../../../src/schemas/misoConfig.schema";
import {
  createModelContext,
  familyRefOf,
  findShape,
  getMissingReferences,
  getNodeAttributes,
  getNodeConfig,
  isVisible,
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

describe("RAMEN base nodes", () => {
  test("their labels are their names in RAMEN's reference model", () => {
    expect([...BASE_NODE_LABELS].sort()).toEqual(["Annotation", "Collection", "Content", "Entity"]);
    expect(BASE_NODE_LABEL_BY_REF[BASE_NODE_REF.Content]).toBe("Content");
  });
});

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
    general: { templates: [] },
    elements: { classifiers: {}, annotations: {} },
    editors: { text: { mappings: [] } },
  });
  const modelId: string = edition.getModel().id;
  const ref = (element: { id: string }): string => `${modelId}:${element.id}`;

  return {
    context: createModelContext(config, model),
    refs: { letter: ref(letter), person: ref(person), saint: ref(saint), rs: ref(rs.element) },
  };
}

/** {@linkcode findShape}, failing the test if the model has no shape for the ref */
function requireShape(context: ModelContext, ref: string): ModelAnnotationShape {
  const shape: ModelAnnotationShape | undefined = findShape(context, ref);

  if (!shape) {
    throw new Error(`The test model has no shape ${ref}`);
  }

  return shape;
}

describe("getReferenceTargetRefs, getMissingReferences", () => {
  const reference = buildReferenceTestModel();
  const shape = requireShape(reference.context, reference.refs.rs);

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
    const requiredShape = requireShape(required.context, required.refs.rs);

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

/**
 * A model for the settings by ref: Letter (Collection) declares `sentDate`, DraftLetter refines Letter, and the text
 * annotation family has the shape `persName` with a property `key`.
 */
function buildSettingsTestModel() {
  const edition = RamenModel.create("Settings test");
  const letter = edition.createNode({ name: "Letter", refines: RAMEN_ELEMENT.COLLECTION }).element;
  const draftLetter = edition.createNode({ name: "DraftLetter", refines: letter }).element;
  const text = edition.createNode({ name: "Text", refines: RAMEN_ELEMENT.CONTENT }).element;
  const family = edition.createNode({ name: "TextAnnotation", refines: RAMEN_ELEMENT.ANNOTATION }).element;
  const sentDate = edition.createAttribute(letter, {
    name: "sentDate",
    typeId: DataTypes.String,
    bounds: { lowerBound: 0, upperBound: 1 },
  }).element;
  const onText: Relation = edition.hasAnnotation(text, family).element;
  const persName = edition.createAnnotationShape({
    node: family,
    type: "persName",
    properties: [{ name: "key", typeId: DataTypes.String, bounds: { lowerBound: 0, upperBound: 1 } }],
    relations: [{ relations: [onText], direction: "incoming", bounds: { lowerBound: 1, upperBound: 1 } }],
  }).element;
  const modelId: string = edition.getModel().id;
  const ref = (element: { id: string }): string => `${modelId}:${element.id}`;

  return {
    edition,
    refs: {
      letter: ref(letter),
      draftLetter: ref(draftLetter),
      sentDate: ref(sentDate),
      persName: ref(persName),
      key: ref(persName.properties[0]),
    },
  };
}

/** Parses a config of the settings test model with the given `elements` */
function parseSettingsConfig(edition: RamenModel, elements: unknown) {
  return parseMisoConfig({
    $schema: "https://ramen-schema.org/miso/1.0.0/config.schema.json",
    id: "settingsTest",
    model: edition.export(),
    general: { templates: [] },
    elements,
    editors: { text: { mappings: [] } },
  });
}

describe("settings by ref", () => {
  const { edition, refs } = buildSettingsTestModel();

  test("an attribute's settings on its declaring node apply to subtypes", () => {
    const { config, model, warnings } = parseSettingsConfig(edition, {
      classifiers: {
        [refs.letter]: {
          name: "Letter",
          appearance: { icon: "mail" },
          attributes: { [refs.sentDate]: { name: "sentDate", visible: false } },
        },
      },
      annotations: {},
    });
    const context: ModelContext = createModelContext(config, model);
    const sentDate: ModelAttribute | undefined = getNodeAttributes(context, refs.draftLetter).find(
      (entry) => entry.attribute.name === "sentDate",
    );

    expect(warnings).toEqual([]);
    expect(getNodeConfig(context, refs.letter)?.appearance?.icon).toBe("mail");
    expect(sentDate && isVisible(context, sentDate)).toBe(false);
  });

  test("an entry of a removed element and an outdated name hint only warn", () => {
    const { warnings } = parseSettingsConfig(edition, {
      classifiers: { [refs.letter]: { name: "Brief" }, "unknownModel:unknownId": { name: "Gone" } },
      annotations: {},
    });

    expect(warnings).toHaveLength(2);
    expect(warnings.join("\n")).toContain('"Brief"');
    expect(warnings.join("\n")).toContain("unknownModel:unknownId");
  });

  test("a ref of another kind than its section is fatal", () => {
    expect(() =>
      parseSettingsConfig(edition, { classifiers: { [refs.persName]: { name: "persName" } }, annotations: {} }),
    ).toThrow("not a node classifier");
  });

  test("an attribute the element doesn't declare itself only warns", () => {
    const { warnings } = parseSettingsConfig(edition, {
      classifiers: {},
      annotations: { [refs.persName]: { name: "persName", attributes: { [refs.sentDate]: { name: "sentDate" } } } },
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("declares no such attribute");
  });

  test("kind-specific options are checked per section", () => {
    expect(() =>
      parseSettingsConfig(edition, {
        classifiers: { [refs.letter]: { name: "Letter", controls: { shortcut: "Mod-l" } } },
        annotations: {},
      }),
    ).toThrow();
  });
});
