import { describe, expect, test } from "vitest";
import { RamenModel } from "@ramen-suite/core";
import type { Annotation, EditGraph, ElementGraph, ElementNode } from "../../../../src/models/types";
import { parseMisoConfig } from "../../../../src/schemas/misoConfig.schema";
import { createModelContext } from "../../../../src/utils/helper/modelHelper";
import {
  toAncestryPaths,
  toAnnotations,
  toEditGraph,
  toNode,
  toNodes,
} from "../../../../src/utils/helper/readPayload";

/** An element with the given uuid and labels */
function element(uuid: string, nodeLabels: string[], extra: Partial<ElementNode> = {}): ElementNode {
  return { classifierRef: `M:${nodeLabels.at(-1)}`, nodeLabels, properties: { uuid }, ...extra };
}

describe("toEditGraph", () => {
  test("every node once, everything unchanged, values copied", () => {
    const elements: ElementGraph = {
      nodes: [element("a1", ["Annotation"]), element("p1", ["Entity", "Person"]), element("p1", ["Entity", "Person"])],
      relations: [{ relationRef: "M:refersToPerson", from: "a1", to: "p1" }],
    };

    const graph: EditGraph = toEditGraph(elements);

    expect(graph.nodes.map((node) => [node.properties.uuid, node.status])).toEqual([
      ["a1", "unchanged"],
      ["p1", "unchanged"],
    ]);
    expect(graph.relations).toEqual([{ relationRef: "M:refersToPerson", from: "a1", to: "p1", status: "unchanged" }]);

    graph.nodes[1].properties.label = "Changed";

    expect(elements.nodes[1].properties).toEqual({ uuid: "p1" });
  });
});

describe("toAnnotations", () => {
  // Without a resolved classifier, the base nodes come from the labels, so an empty model will do
  const unresolved = (uuid: string, nodeLabels: string[]): ElementNode => element(uuid, nodeLabels, { classifierRef: null });
  const { config, model } = parseMisoConfig({
    $schema: "https://ramen-schema.org/miso/1.0.0/config.schema.json",
    id: "readTest",
    model: RamenModel.create("Read test").export(),
    general: { templates: [] },
    elements: { classifiers: {}, annotations: {} },
    editors: { text: { mappings: [] } },
  });
  const context = createModelContext(config, model);

  test("each annotation of the Content with everything below it; referenced nodes are leaves", () => {
    const graph: EditGraph = toEditGraph({
      nodes: [
        unresolved("t1", ["Content", "Text"]),
        unresolved("a1", ["Annotation"]),
        unresolved("a2", ["Annotation"]),
        unresolved("a3", ["Annotation"]),
        unresolved("p1", ["Entity", "Person"]),
      ],
      relations: [
        { relationRef: "M:onText", from: "t1", to: "a1" },
        { relationRef: "M:onText", from: "t1", to: "a3" },
        { relationRef: "M:onAnnotation", from: "a1", to: "a2" },
        { relationRef: "M:refersToPerson", from: "a2", to: "p1" },
        { relationRef: "M:refersToPerson", from: "a3", to: "p1" },
        { relationRef: "M:refersToText", from: "a3", to: "t1" },
      ],
    });

    const annotations: Annotation[] = toAnnotations(context, graph, "t1");
    const shape = (annotation: Annotation) => ({
      uuid: annotation.node.properties.uuid,
      status: annotation.status,
      nodes: annotation.nodes.map((node) => node.properties.uuid),
      relations: annotation.relations.map((relation) => `${relation.from}>${relation.to}`),
    });

    expect(annotations.map(shape)).toEqual([
      { uuid: "a1", status: "unchanged", nodes: ["a2", "p1"], relations: ["a1>a2", "a2>p1"] },
      // The Content is referenced, but not followed: its other annotations don't end up below a3
      { uuid: "a3", status: "unchanged", nodes: ["p1", "t1"], relations: ["a3>p1", "a3>t1"] },
    ]);
    expect(annotations[0].node).not.toHaveProperty("status");
  });

  test("a node below two annotations is copied", () => {
    const graph: EditGraph = toEditGraph({
      nodes: [unresolved("a1", ["Annotation"]), unresolved("a2", ["Annotation"]), unresolved("p1", ["Entity", "Person"])],
      relations: [
        { relationRef: "M:onText", from: "t1", to: "a1" },
        { relationRef: "M:onText", from: "t1", to: "a2" },
        { relationRef: "M:refersToPerson", from: "a1", to: "p1" },
        { relationRef: "M:refersToPerson", from: "a2", to: "p1" },
      ],
    });

    const [first, second] = toAnnotations(context, graph, "t1");

    first.nodes[0].properties.label = "Changed";

    expect(second.nodes[0].properties).toEqual({ uuid: "p1" });
  });
});

describe("toNodes, toNode", () => {
  const listing: ElementGraph = {
    nodes: [element("c2", ["Collection", "Letter"]), element("c1", ["Collection", "Letter"]), element("t1", ["Content", "Text"])],
    relations: [],
  };

  test("keeps the order of the response", () => {
    expect(toNodes(listing).map((node) => node.properties.uuid)).toEqual(["c2", "c1", "t1"]);
  });

  test("gives one node", () => {
    expect(toNode(listing, "c1")).toEqual(expect.objectContaining({ classifierRef: "M:Letter", properties: { uuid: "c1" } }));
  });

  test("throws if the response doesn't contain the node", () => {
    expect(() => toNode(listing, "missing")).toThrow("missing");
  });
});

describe("toAncestryPaths", () => {
  /** The uuids of each path */
  function uuidPaths(elements: ElementGraph, uuid: string): string[][] {
    return toAncestryPaths(elements, uuid).map((path) => path.map((node) => node.properties.uuid));
  }

  test("one path per way up, top-level Collection first, without the node itself", () => {
    // t1 is part of v1 and v2, both part of the top-level l1; v2 is also part of the top-level l2
    const elements: ElementGraph = {
      nodes: ["t1", "v1", "v2", "l1", "l2"].map((uuid) => element(uuid, ["Collection"])),
      relations: [
        { relationRef: "M:partOf", from: "t1", to: "v1" },
        { relationRef: "M:partOf", from: "t1", to: "v2" },
        { relationRef: "M:partOf", from: "v1", to: "l1" },
        { relationRef: "M:partOf", from: "v2", to: "l1" },
        { relationRef: "M:partOf", from: "v2", to: "l2" },
      ],
    };

    expect(uuidPaths(elements, "t1")).toEqual([
      ["l1", "v1"],
      ["l1", "v2"],
      ["l2", "v2"],
    ]);
  });

  test("a top-level node has one empty path, a missing node none", () => {
    const elements: ElementGraph = { nodes: [element("l1", ["Collection"])], relations: [] };

    expect(uuidPaths(elements, "l1")).toEqual([[]]);
    expect(uuidPaths({ nodes: [], relations: [] }, "l1")).toEqual([]);
  });

  test("a cycle ends the path", () => {
    const elements: ElementGraph = {
      nodes: ["t1", "c1", "c2"].map((uuid) => element(uuid, ["Collection"])),
      relations: [
        { relationRef: "M:partOf", from: "t1", to: "c1" },
        { relationRef: "M:partOf", from: "c1", to: "c2" },
        { relationRef: "M:partOf", from: "c2", to: "c1" },
      ],
    };

    expect(uuidPaths(elements, "t1")).toEqual([["c2", "c1"]]);
  });
});
