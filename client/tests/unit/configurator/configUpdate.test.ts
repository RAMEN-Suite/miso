import { describe, expect, test } from "vitest";
import type { RamenFile } from "@ramen-suite/core";
import { testConfig } from "../../fixtures/config";
import { parseMisoConfig, type MisoConfig } from "../../../src/schemas/misoConfig.schema";
import {
  editAnnotationEntry,
  pruneGoneEntries,
  refreshNameHints,
  serializeConfig,
  toExportConfig,
  withKey,
} from "../../../src/configurator/utils/configUpdate";

/** A deep copy of the test config, to change */
function copyOfTestConfig(): MisoConfig {
  return structuredClone(testConfig.config);
}

/** The qualified ref of the test model's shape with the given type */
function shapeRef(config: MisoConfig, type: string): string {
  const shape = config.model.annotations.find((candidate) => candidate.type === type);

  if (!shape) {
    throw new Error(`No shape ${type}`);
  }

  return `${shape.modelId}:${shape.id}`;
}

describe("withKey", () => {
  test("sets a key, removes it for undefined or an empty string, and returns undefined when empty", () => {
    expect(withKey<{ a?: string; b?: string }, "a">({ b: "x" }, "a", "y")).toEqual({ a: "y", b: "x" });
    expect(withKey<{ a?: string; b?: string }, "a">({ a: "y", b: "x" }, "a", "")).toEqual({ b: "x" });
    expect(withKey<{ a?: string }, "a">({ a: "y" }, "a", undefined)).toBeUndefined();
  });
});

describe("toExportConfig", () => {
  test("leaves out entries that hold only their name hint and empty containers", () => {
    const config: MisoConfig = copyOfTestConfig();
    const ref: string = shapeRef(config, "p");

    editAnnotationEntry(config, ref, "p", (entry) => {
      entry.controls = {};
    });

    const exported: MisoConfig = toExportConfig(config);

    expect(exported.elements.annotations[ref]).toBeUndefined();
    expect(exported.elements.annotations[shapeRef(config, "add")]).toEqual(
      testConfig.config.elements.annotations[shapeRef(config, "add")],
    );
  });

  test("writes the top-level keys in a fixed order", () => {
    const config: MisoConfig = copyOfTestConfig();
    const shuffled = { editors: config.editors, model: config.model, ...config } as MisoConfig;

    expect(Object.keys(toExportConfig(shuffled))).toEqual(["$schema", "id", "model", "general", "elements", "editors"]);
  });

  test("the export is a valid config with the model unchanged", () => {
    const config: MisoConfig = copyOfTestConfig();

    editAnnotationEntry(config, shapeRef(config, "add"), "add", (entry) => {
      entry.appearance = { highlight: { kind: "properties", color: "#2563eb" } };
    });

    const parsed = parseMisoConfig(JSON.parse(serializeConfig(config)));

    expect(parsed.config.model).toEqual(testConfig.config.model);
    expect(parsed.config.elements.annotations[shapeRef(config, "add")]?.appearance?.highlight?.color).toBe("#2563eb");
  });
});

describe("name hints and gone entries", () => {
  test("refreshNameHints takes the names from the model", () => {
    const config: MisoConfig = copyOfTestConfig();
    const ref: string = shapeRef(config, "add");

    config.elements.annotations[ref].name = "outdated";
    config.editors.text.mappings[0].type = "outdated";

    const refreshed: MisoConfig = refreshNameHints(config);

    expect(refreshed.elements.annotations[ref].name).toBe("add");
    expect(refreshed.editors.text.mappings[0].type).not.toBe("outdated");
    expect(config.elements.annotations[ref].name).toBe("outdated");
  });

  test("pruneGoneEntries removes the entries of removed shapes and keeps the others", () => {
    const config: MisoConfig = copyOfTestConfig();
    const removedRef: string = shapeRef(config, "del");
    const model: RamenFile = { ...config.model, annotations: config.model.annotations.filter((shape) => shape.type !== "del") };
    const pruned: MisoConfig = pruneGoneEntries({ ...config, model });

    expect(pruned.elements.annotations[removedRef]).toBeUndefined();
    expect(pruned.elements.annotations[shapeRef(config, "add")]).toBeDefined();
  });
});
