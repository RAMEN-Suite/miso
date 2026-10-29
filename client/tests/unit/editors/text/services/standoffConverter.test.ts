import { getSchema } from "@tiptap/core";
import { beforeAll, describe, expect, test } from "vitest";
import { StandoffConverter, TiptapNode, createExtensions } from "../../../../../src/editors/text/src";
import { ApiJson } from "../../../../../src/editors/text/src/models/types";
import { useGuidelinesStore } from "../../../../../src/store/guidelines";
import { guidelines } from "../../../../fixtures/guidelines";
import * as fixtures from "../../../../fixtures/standoff";

// Appearance only affects rendering, the node types don't depend on it
const schema = getSchema(createExtensions({ getAppearance: () => undefined }));

beforeAll(() => {
  useGuidelinesStore().initializeGuidelines(guidelines);
});

function convert(doc: ApiJson) {
  return new StandoffConverter(doc, schema).getData();
}

/** Concatenates the text of all text nodes below the given node, in document order. */
function docText(node: TiptapNode): string {
  if (node.type === "text") {
    return node.text ?? "";
  }

  return (node.content ?? []).map(docText).join("");
}

/** Returns the top-level blocks of the converted document. */
function blocks(doc: ApiJson): TiptapNode[] {
  return convert(doc).tipTapJson.content ?? [];
}

describe("text invariant", () => {
  test.for(Object.entries(fixtures))("%s: document text equals standoff text", ([, doc]) => {
    const { tipTapJson, issues } = convert(doc);

    expect(docText(tipTapJson)).toBe(doc.text);
    expect(issues.filter((i) => i.reason === "textMismatch")).toEqual([]);
  });
});

describe("paragraphs", () => {
  test("creates one paragraph per paragraph annotation and keeps its uuid", () => {
    const { tipTapJson, structuralAnnotations } = convert(fixtures.twoParagraphs);

    expect(tipTapJson.content?.map((n) => [n.type, n.attrs?.uuid, docText(n)])).toEqual([
      ["paragraph", "p-0", "Hello"],
      ["paragraph", "p-1", "World"],
    ]);
    expect([...structuralAnnotations.keys()]).toEqual(["p-0", "p-1"]);
  });
});

describe("inline annotations", () => {
  test("keeps overlapping and nested annotations out of the tree with unchanged ranges", () => {
    const { tipTapJson, annotations } = convert(fixtures.inlineOverlap);

    expect(tipTapJson.content).toHaveLength(1);
    expect(tipTapJson.content?.[0].content).toEqual([{ type: "text", text: "abcdefghij" }]);
    expect([...annotations.values()].map((a) => [a.node.data.uuid, a.node.data.startIndex, a.node.data.endIndex])).toEqual([
      ["add-1", 1, 5],
      ["del-2", 3, 7],
      ["add-3", 2, 4],
    ]);
  });
});

describe("gaps", () => {
  test("wraps uncovered text in paragraphs and merges whitespace-only gaps into the previous block", () => {
    const content: TiptapNode[] = blocks(fixtures.gaps);

    expect(content.map((n) => [n.attrs?.uuid?.startsWith("p-") ? n.attrs.uuid : "synthetic", docText(n)])).toEqual([
      ["synthetic", "Hi "],
      ["p-0", "Alpha  "],
      ["p-1", "Beta"],
      ["synthetic", " Bye"],
    ]);
  });

  test("extends the range of the block a whitespace gap was merged into", () => {
    const merged: TiptapNode = blocks(fixtures.gaps)[1];

    expect(merged.attrs?._annotation?.node.data).toMatchObject({ startIndex: 3, endIndex: 9 });
  });
});

describe("zero points", () => {
  test("places each atom before the character at its index, and after the last character at text length", () => {
    const paragraph = blocks(fixtures.zeroPoints)[0];

    expect(paragraph.content?.map((n) => (n.type === "text" ? n.text : `${n.type}:${n.attrs?.uuid}`))).toEqual([
      "zeroPointAnnotation:metamark-1",
      "abc",
      "zeroPointAnnotation:metamark-2",
      "def",
      "hardBreak:lb-3",
      "ghij",
      "zeroPointAnnotation:metamark-4",
    ]);
  });
});

describe("block classifications", () => {
  test("attaches the classification to the blocks it covers instead of creating a node", () => {
    const { tipTapJson, structuralAnnotations } = convert(fixtures.blockClassification);
    const [first, second] = tipTapJson.content ?? [];

    expect(tipTapJson.content?.map((n) => n.type)).toEqual(["paragraph", "paragraph"]);
    expect(first.attrs?._blockClassifications?.map((a) => a.node.data.uuid)).toEqual(["opener-2"]);
    expect(second.attrs?._blockClassifications ?? []).toEqual([]);
    expect(structuralAnnotations.has("opener-2")).toBe(true);
  });
});

describe("unicode", () => {
  test("counts indices in UTF-16 code units, like JavaScript string length", () => {
    const { annotations } = convert(fixtures.unicode);
    const { startIndex, endIndex } = annotations.get("add-1")!.node.data;

    expect(fixtures.unicode.text).toHaveLength(9);
    expect(fixtures.unicode.text.slice(startIndex, endIndex + 1)).toBe("b́");
  });
});

describe("unconfigured types", () => {
  test("reports one error per unconfigured type with the number of annotations", () => {
    const { issues } = convert(fixtures.unconfigured);

    expect(issues).toEqual([
      {
        severity: "error",
        reason: "unconfiguredType",
        message: '2 annotation(s) of type "unknownType" are not configured.',
      },
    ]);
  });
});
