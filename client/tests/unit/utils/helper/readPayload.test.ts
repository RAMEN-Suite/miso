import { describe, expect, test } from "vitest";
import type { ElementGraph, ElementNode, NodeDto } from "../../../../src/models/types";
import { toAncestryPaths, toNodeDto, toNodeDtoTrees, toNodes } from "../../../../src/utils/helper/readPayload";

/** An element with the given uuid and labels */
function element(uuid: string, nodeLabels: string[], extra: Partial<ElementNode> = {}): ElementNode {
  return { classifierRef: `M:${nodeLabels.at(-1)}`, nodeLabels, data: { uuid }, ...extra };
}

/** The uuids of a tree, nested like the tree */
type UuidTree = [string, UuidTree[]];

function uuidsOf(tree: NodeDto): UuidTree {
  return [tree.node.data.uuid, tree.connectedNodes.map(uuidsOf)];
}

describe("toNodeDtoTrees", () => {
  test("nested annotations, referenced nodes, and a person shared by two annotations", () => {
    const elements: ElementGraph = {
      nodes: [
        element("a1", ["Annotation"], { shapeRef: "M:place" }),
        element("a2", ["Annotation"], { shapeRef: "M:commentary" }),
        element("a3", ["Annotation"], { shapeRef: "M:persName" }),
        element("e1", ["Entity", "Place"]),
        element("p1", ["Entity", "Person"]),
        element("t2", ["Content", "Text"]),
      ],
      relations: [
        { relationRef: "M:onText", from: "t1", to: "a1" },
        { relationRef: "M:onText", from: "t1", to: "a3" },
        { relationRef: "M:refersToPlace", from: "a1", to: "e1" },
        { relationRef: "M:refersToPerson", from: "a1", to: "p1" },
        { relationRef: "M:refersToPerson", from: "a3", to: "p1" },
        { relationRef: "M:refersToText", from: "a2", to: "t2" },
        { relationRef: "M:onAnnotation", from: "a1", to: "a2" },
      ],
    };

    const trees: NodeDto[] = toNodeDtoTrees(elements, "t1");

    expect(trees.map(uuidsOf)).toEqual([
      [
        "a1",
        [
          ["e1", []],
          ["p1", []],
          ["a2", [["t2", []]]],
        ],
      ],
      ["a3", [["p1", []]]],
    ]);
    expect(trees[0].node).toEqual(
      expect.objectContaining({ classifierRef: "M:Annotation", shapeRef: "M:place", nodeLabels: ["Annotation"] }),
    );
  });

  test("a shared node is copied, so editing one copy leaves the other unchanged", () => {
    const elements: ElementGraph = {
      nodes: [element("a1", ["Annotation"]), element("a2", ["Annotation"]), element("p1", ["Entity", "Person"])],
      relations: [
        { relationRef: "M:onText", from: "t1", to: "a1" },
        { relationRef: "M:onText", from: "t1", to: "a2" },
        { relationRef: "M:refersToPerson", from: "a1", to: "p1" },
        { relationRef: "M:refersToPerson", from: "a2", to: "p1" },
      ],
    };

    const [first, second] = toNodeDtoTrees(elements, "t1");

    first.connectedNodes[0].node.data.uuid = "changed";

    expect(second.connectedNodes[0].node.data.uuid).toBe("p1");
  });

  test("an annotation that refers to its own carrier ends the tree there", () => {
    const elements: ElementGraph = {
      nodes: [element("a1", ["Annotation"]), element("t1", ["Content", "Text"])],
      relations: [
        { relationRef: "M:onText", from: "t1", to: "a1" },
        { relationRef: "M:refersToText", from: "a1", to: "t1" },
      ],
    };

    expect(toNodeDtoTrees(elements, "t1").map(uuidsOf)).toEqual([["a1", [["t1", []]]]]);
  });

  test("relations to nodes that are not part of the read are skipped, unresolved relations are kept", () => {
    const elements: ElementGraph = {
      nodes: [element("a1", ["Annotation"], { classifierRef: null }), element("e1", ["Entity"])],
      relations: [
        { relationRef: null, from: "t1", to: "a1" },
        { relationRef: null, from: "a1", to: "e1" },
        { relationRef: "M:refersTo", from: "a1", to: "missing" },
      ],
    };

    expect(toNodeDtoTrees(elements, "t1").map(uuidsOf)).toEqual([["a1", [["e1", []]]]]);
  });
});

describe("toNodes, toNodeDto", () => {
  const listing: ElementGraph = {
    nodes: [element("c2", ["Collection", "Letter"]), element("c1", ["Collection", "Letter"]), element("t1", ["Content", "Text"])],
    relations: [],
  };

  test("keeps the order of the response", () => {
    expect(toNodes(listing).map((node) => node.data.uuid)).toEqual(["c2", "c1", "t1"]);
  });

  test("gives one node without connected nodes", () => {
    expect(toNodeDto(listing, "c1")).toEqual({
      node: expect.objectContaining({ classifierRef: "M:Letter", data: { uuid: "c1" } }),
      connectedNodes: [],
    });
  });

  test("throws if the response doesn't contain the node", () => {
    expect(() => toNodeDto(listing, "missing")).toThrow("missing");
  });
});

describe("toAncestryPaths", () => {
  /** The uuids of each path */
  function uuidPaths(elements: ElementGraph, uuid: string): string[][] {
    return toAncestryPaths(elements, uuid).map((path) => path.map((entry) => entry.node.data.uuid));
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
