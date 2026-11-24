import { describe, expect, test } from "vitest";
import { RamenModel, type RamenFile } from "@ramen-suite/core";
import { testConfig } from "../../fixtures/config";
import type { MisoConfig } from "../../../src/schemas/misoConfig.schema";
import type { ModelContext } from "../../../src/models/types";
import { createModelContext } from "../../../src/utils/helper/modelHelper";
import { diffModels, type ElementChange } from "../../../src/configurator/utils/modelDiff";

const model: RamenFile = testConfig.config.model;

/** The context of the test config with another model */
function contextWith(file: RamenFile): ModelContext {
  const config: MisoConfig = { ...testConfig.config, model: file };

  return createModelContext(config, RamenModel.import(structuredClone(file)));
}

describe("diffModels", () => {
  const previous: ModelContext = contextWith(model);

  test("the same model has no changes", () => {
    expect(diffModels(previous, contextWith(structuredClone(model)))).toEqual([]);
  });

  test("a renamed shape type is a change that needs a data migration", () => {
    const next: ModelContext = contextWith({
      ...model,
      annotations: model.annotations.map((shape) => (shape.type === "add" ? { ...shape, type: "addition" } : shape)),
    });
    const change: ElementChange | undefined = diffModels(previous, next).find((candidate) => candidate.name === "addition");

    expect(change?.kind).toBe("annotation");
    expect(change?.change).toBe("changed");
    expect(change?.details).toContain('renamed from "add"');
    expect(change?.needsDataMigration).toBe(true);
  });

  test("a removed shape is reported as removed", () => {
    const next: ModelContext = contextWith({ ...model, annotations: model.annotations.filter((shape) => shape.type !== "del") });

    expect(diffModels(previous, next)).toContainEqual(
      expect.objectContaining({ kind: "annotation", change: "removed", name: "del" }),
    );
  });

  test("a renamed property is an attribute change that needs a data migration", () => {
    const next: ModelContext = contextWith({
      ...model,
      annotations: model.annotations.map((shape) =>
        shape.type === "head"
          ? {
              ...shape,
              properties: shape.properties.map((property) => (property.name === "level" ? { ...property, name: "depth" } : property)),
            }
          : shape,
      ),
    });
    const change: ElementChange | undefined = diffModels(previous, next).find((candidate) => candidate.name === "head");

    expect(change?.attributes).toContainEqual(expect.objectContaining({ change: "changed", name: "depth", needsDataMigration: true }));
  });

  test("a renamed classifier is a change that needs a data migration", () => {
    const next: ModelContext = contextWith({
      ...model,
      classifiers: model.classifiers.map((classifier) => (classifier.name === "Text" ? { ...classifier, name: "Document" } : classifier)),
    });

    expect(diffModels(previous, next)).toContainEqual(
      expect.objectContaining({ kind: "classifier", change: "changed", name: "Document", needsDataMigration: true }),
    );
  });
});
