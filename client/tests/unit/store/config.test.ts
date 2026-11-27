import { describe, expect, test } from "vitest";
import { testConfig, testShapeRefByType } from "../../fixtures/config";
import type { ContentNode } from "../../../src/models/types";
import { useConfigStore } from "../../../src/store/config";
import { useFilterStore } from "../../../src/store/filter";
import { BASE_NODE_REF } from "../../../src/config/ramen";

const configStore = useConfigStore();
const { allOptions } = useFilterStore();

configStore.initializeConfig(testConfig);

/** The ref of the test config's Text type, the only classifier with an entry */
const textRef: string = Object.keys(testConfig.config.elements.classifiers)[0];

/** A Content of the given classifier (`null`: unresolved) */
function contentOf(classifierRef: string | null): ContentNode {
  return { nodeLabels: ["Content"], classifierRef, properties: { uuid: "00000000-0000-4000-8000-000000000001", text: "" } };
}

/** The refs of all shapes in the groups the editor offers */
function offeredShapeRefs(): string[] {
  return Object.values(configStore.groupedAndSortedAnnotationShapes.value)
    .flat()
    .map((shape) => `${shape.modelId}:${shape.id}`)
    .toSorted();
}

describe("setEditorContentType", () => {
  test("the editor offers the shapes the opened text's Content type may carry, in the groups and the filter", () => {
    configStore.setEditorContentType(contentOf(textRef));

    expect(offeredShapeRefs()).toEqual(Object.values(testShapeRefByType).toSorted());
    expect(allOptions.value.toSorted()).toEqual(Object.values(testShapeRefByType).toSorted());
  });

  test("the editor offers no shape the Content type can't carry", () => {
    configStore.setEditorContentType(contentOf(BASE_NODE_REF.Content));

    expect(offeredShapeRefs()).toEqual([]);
    expect(allOptions.value).toEqual([]);
    expect(configStore.getAnnotationShortcuts()).toEqual({});
  });

  test("the editor offers nothing for a text whose Content type can't be resolved", () => {
    configStore.setEditorContentType(contentOf(null));

    expect(offeredShapeRefs()).toEqual([]);
  });
});

describe("getCarriedAnnotationShapes", () => {
  test("a node whose classifier can't be resolved carries none", () => {
    expect(configStore.getCarriedAnnotationShapes(contentOf(null))).toEqual([]);
  });
});
