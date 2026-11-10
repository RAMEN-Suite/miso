import { describe, expect, test } from "vitest";
import { DataTypes, RAMEN_ELEMENT, RamenModel, Relation } from "@ramen-suite/core";
import type { ElementDiagnostic, ElementGraph, ElementNode, ElementRelation } from "../../../../src/models/types";
import { parseMisoConfig } from "../../../../src/schemas/misoConfig.schema";
import { createModelContext } from "../../../../src/utils/helper/modelHelper";
import {
  ELEMENT_DIAGNOSTIC_CODE,
  relationInstanceId,
  validateElements,
} from "../../../../src/utils/helper/instanceMapper";

/**
 * A model for validating elements: a Letter (Collection) with a required `status`, a Text (Content), a Person (Entity)
 * and the text annotation family with `persName`, which needs exactly one carrier and may refer to a Person.
 */
function buildMapperTestModel() {
  const edition = RamenModel.create("Mapper test");
  const letter = edition.createNode({ name: "Letter", refines: RAMEN_ELEMENT.COLLECTION }).element;
  const text = edition.createNode({ name: "Text", refines: RAMEN_ELEMENT.CONTENT }).element;
  const person = edition.createNode({ name: "Person", refines: RAMEN_ELEMENT.ENTITY }).element;
  const family = edition.createNode({ name: "TextAnnotation", refines: RAMEN_ELEMENT.ANNOTATION }).element;

  edition.createAttribute(letter, { name: "status", typeId: DataTypes.String, bounds: { lowerBound: 1, upperBound: 1 } });

  const onText: Relation = edition.hasAnnotation(text, family).element;
  const refersToPerson: Relation = edition.refersTo(family, person).element;

  edition.createAnnotationShape({
    node: family,
    type: "persName",
    relations: [
      { relations: [onText], direction: "incoming", bounds: { lowerBound: 1, upperBound: 1 } },
      { relations: [refersToPerson], direction: "outgoing", bounds: { lowerBound: 0, upperBound: 1 } },
    ],
  });

  const { config, model } = parseMisoConfig({
    $schema: "https://ramen-schema.org/miso/1.0.0/config.schema.json",
    id: "mapperTest",
    model: edition.export(),
    miso: { general: { templates: [] }, editors: { text: { mappings: [] } } },
  });
  const modelId: string = edition.getModel().id;
  const ref = (element: { id: string }): string => `${modelId}:${element.id}`;

  return {
    context: createModelContext(config, model),
    refs: { letter: ref(letter), text: ref(text), person: ref(person), family: ref(family), onText: ref(onText) },
  };
}

const { context, refs } = buildMapperTestModel();

/** Node uuids. RAMEN core requires instance ids with at least 16 characters, and `uuid` must be a valid UUID. */
const L1 = "00000000-0000-4000-8000-000000000001";
const T1 = "00000000-0000-4000-8000-000000000002";
const A1 = "00000000-0000-4000-8000-000000000003";
const X1 = "00000000-0000-4000-8000-000000000004";

/** A text with one valid `persName` annotation, and a valid Letter */
function buildValidGraph(): { nodes: ElementNode[]; relations: ElementRelation[] } {
  return {
    nodes: [
      { classifierRef: refs.letter, data: { uuid: L1, label: "A letter", status: "40" } },
      { classifierRef: refs.text, data: { uuid: T1, text: "Abcd efgh" } },
      {
        classifierRef: refs.family,
        data: {
          uuid: A1,
          type: "persName",
          selector: { type: "TextPositionSelector", start: 0, end: 4 },
          text: "Abcd",
          isZeroPoint: false,
        },
      },
    ],
    relations: [{ relationRef: refs.onText, from: T1, to: A1 }],
  };
}

/** The findings of one node */
function findingsOf(diagnostics: ElementDiagnostic[], uuid: string): ElementDiagnostic[] {
  return diagnostics.filter((diagnostic) => diagnostic.uuid === uuid);
}

describe("validateElements", () => {
  test("a valid annotation and Letter have no findings, the editor fields are not validated by RAMEN core", () => {
    const diagnostics: ElementDiagnostic[] = validateElements(context, buildValidGraph(), new Set([A1, L1]));

    expect(diagnostics).toEqual([]);
  });

  test("a missing editor field of a text annotation is reported", () => {
    const graph: ElementGraph = buildValidGraph();

    delete graph.nodes[2].data.text;

    expect(findingsOf(validateElements(context, graph), A1)).toEqual([
      expect.objectContaining({ code: ELEMENT_DIAGNOSTIC_CODE.EDITOR_FIELD_REQUIRED, attribute: "text" }),
    ]);
  });

  test("a missing selector of an annotation on a Content is reported", () => {
    const graph: ElementGraph = buildValidGraph();

    delete graph.nodes[2].data.selector;

    expect(findingsOf(validateElements(context, graph), A1)).toEqual([
      expect.objectContaining({ code: ELEMENT_DIAGNOSTIC_CODE.SELECTOR_REQUIRED, attribute: "selector" }),
    ]);
  });

  test.for([
    { type: "TextPositionSelector", start: 5, end: 4 },
    { type: "TextPositionSelector", start: 0, end: 4.5 },
    { type: "TextPositionSelector", start: 0, end: 4, exact: "Abcd" },
    { type: "SvgSelector", value: "<svg/>" },
  ])("the invalid selector %j of an annotation on a text is reported by the app, not by RAMEN core", (selector) => {
    const graph: ElementGraph = buildValidGraph();

    graph.nodes[2].data.selector = selector;

    expect(findingsOf(validateElements(context, graph), A1)).toEqual([
      expect.objectContaining({ code: ELEMENT_DIAGNOSTIC_CODE.SELECTOR_INVALID, attribute: "selector" }),
    ]);
  });

  test("a missing isZeroPoint is accepted, it is only set on zero-point annotations", () => {
    const graph: ElementGraph = buildValidGraph();

    delete graph.nodes[2].data.isZeroPoint;

    expect(findingsOf(validateElements(context, graph), A1)).toEqual([]);
  });

  test("an editor field with the wrong type is reported", () => {
    const graph: ElementGraph = buildValidGraph();

    graph.nodes[2].data.text = 4;

    expect(findingsOf(validateElements(context, graph), A1)).toEqual([
      expect.objectContaining({ code: ELEMENT_DIAGNOSTIC_CODE.EDITOR_FIELD_INVALID, attribute: "text" }),
    ]);
  });

  test("an unknown annotation property is mapped back to its node and name", () => {
    const graph: ElementGraph = buildValidGraph();

    graph.nodes[2].data.foo = "bar";

    const findings: ElementDiagnostic[] = findingsOf(validateElements(context, graph), A1);

    // RAMEN core may report it twice: unknown to the node type, and not allowed for the annotation shape
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((diagnostic) => diagnostic.severity === "error" && diagnostic.attribute === "foo")).toBe(true);
  });

  test.for([undefined, null, "", "   "])("a required property with the value %j is reported", (status) => {
    const graph: ElementGraph = buildValidGraph();

    graph.nodes[0].data.status = status;

    expect(findingsOf(validateElements(context, graph), L1)).toEqual([
      expect.objectContaining({ severity: "error", attribute: "status" }),
    ]);
  });

  test("a removed carrier relation leaves the annotation without its required carrier", () => {
    const graph: ElementGraph = buildValidGraph();

    graph.relations[0].status = "removed";

    expect(findingsOf(validateElements(context, graph), A1).map((diagnostic) => diagnostic.severity)).toContain("error");
  });

  test("deleted nodes are not validated", () => {
    const graph: ElementGraph = buildValidGraph();

    graph.nodes[2].status = "deleted";
    graph.nodes[2].data.foo = "bar";

    expect(findingsOf(validateElements(context, graph), A1)).toEqual([]);
  });

  test("a node whose labels couldn't be resolved is reported and left out", () => {
    const graph: ElementGraph = buildValidGraph();

    graph.nodes.push({ classifierRef: null, data: { uuid: X1 } });

    expect(findingsOf(validateElements(context, graph), X1)).toEqual([
      expect.objectContaining({ code: ELEMENT_DIAGNOSTIC_CODE.NODE_TYPE_UNRESOLVED }),
    ]);
  });

  test.for(["xcx_qlm_zdb", "legacy.id.with.dots:0001"])("the legacy uuid %s is only reported on its node, not as a schema error of its relations", (shortUuid) => {
    const graph: ElementGraph = buildValidGraph();

    graph.nodes[1].data.uuid = shortUuid;
    graph.relations[0].from = shortUuid;

    const diagnostics: ElementDiagnostic[] = validateElements(context, graph);

    expect(diagnostics.filter((diagnostic) => diagnostic.code === "INSTANCE_SCHEMA_INVALID")).toEqual([]);
    // The test model's Text declares no `text`, so RAMEN core reports that too; only the uuid finding matters here
    expect(findingsOf(diagnostics, shortUuid)).toEqual(
      expect.arrayContaining([expect.objectContaining({ attribute: "uuid", code: "CONSTRAINT_FORMAT_MISMATCH" })]),
    );
    expect(findingsOf(diagnostics, A1)).toEqual([]);
  });

  test("only the findings of touched nodes are returned", () => {
    const graph: ElementGraph = buildValidGraph();

    delete graph.nodes[0].data.status;

    expect(validateElements(context, graph, new Set([A1]))).toEqual([]);
    expect(validateElements(context, graph, new Set([L1]))).toEqual([
      expect.objectContaining({ uuid: L1, attribute: "status" }),
    ]);
  });
});

describe("relationInstanceId", () => {
  test("derives the id from the ends and the relation definition's id", () => {
    expect(relationInstanceId({ relationRef: "M:rel1", from: L1, to: A1 })).toBe(`${L1}_rel1_${A1}`);
  });

  test("uses the instance ids of ends with legacy uuids", () => {
    // "a.b" hex-encoded
    expect(relationInstanceId({ relationRef: "M:rel1", from: "a.b", to: A1 })).toBe(`miso-instance-id-612e62_rel1_${A1}`);
  });
});
