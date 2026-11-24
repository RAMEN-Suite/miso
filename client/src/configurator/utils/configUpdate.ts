import type { RamenFile } from "@ramen-suite/core";
import { findAttribute, shapeRefOf, type AttributeOwner, type MisoConfig } from "../external";

/**
 * Changes of the config as the configurator makes them: entries created on the first edit, name hints from the model,
 * entries of removed elements dropped, and the export form.
 *
 * @packageDocumentation
 */

/** An entry of `elements.classifiers` */
export type ClassifierEntry = MisoConfig["elements"]["classifiers"][string];

/** An entry of `elements.annotations` */
export type AnnotationEntry = MisoConfig["elements"]["annotations"][string];

/** An entry of an element's `attributes` */
export type AttributeEntry = NonNullable<ClassifierEntry["attributes"]>[string];

/** The top-level keys of the config, in the order of the export */
const CONFIG_KEY_ORDER = ["$schema", "id", "meta", "model", "general", "elements", "editors"] as const;

/** Optional containers of an entry that are left out of the export when empty */
const ENTRY_CONTAINERS = ["controls", "appearance", "editing", "attributes"] as const;

/**
 * Returns a copy of `object` with `key` set to `value`, or without `key` if `value` is `undefined` or an empty string.
 *
 * @param {T | undefined} object - The object, `undefined` if there is none yet.
 * @param {K} key - The key.
 * @param {T[K] | undefined} value - The new value.
 * @returns {T | undefined} The copy, `undefined` if it has no keys left.
 */
export function withKey<T extends object, K extends keyof T>(object: T | undefined, key: K, value: T[K] | undefined): T | undefined {
  const copy: Partial<T> = { ...object };

  if (value === undefined || value === "") {
    delete copy[key];
  } else {
    copy[key] = value;
  }

  return Object.keys(copy).length > 0 ? (copy as T) : undefined;
}

/**
 * Changes the entry of a node classifier, which is created (with its name hint) if there is none. Changes the config
 * in place.
 *
 * @param {MisoConfig} config - The config.
 * @param {string} ref - Qualified ref of the classifier.
 * @param {string} name - Its name in the model, the hint of a new entry.
 * @param {(entry: ClassifierEntry) => void} change - Changes the entry in place.
 */
export function editClassifierEntry(config: MisoConfig, ref: string, name: string, change: (entry: ClassifierEntry) => void): void {
  config.elements.classifiers[ref] ??= { name };
  change(config.elements.classifiers[ref]);
}

/**
 * Changes the entry of an annotation shape, which is created (with its name hint) if there is none. Changes the config
 * in place.
 *
 * @param {MisoConfig} config - The config.
 * @param {string} ref - Qualified ref of the shape.
 * @param {string} name - Its `type` in the model, the hint of a new entry.
 * @param {(entry: AnnotationEntry) => void} change - Changes the entry in place.
 */
export function editAnnotationEntry(config: MisoConfig, ref: string, name: string, change: (entry: AnnotationEntry) => void): void {
  config.elements.annotations[ref] ??= { name };
  change(config.elements.annotations[ref]);
}

/**
 * Returns the config with another model. The settings are kept as they are; the checks show what doesn't fit.
 *
 * @param {MisoConfig} config - The config.
 * @param {RamenFile} model - The new model (a RamenFile, e.g. a new Nori export).
 * @returns {MisoConfig} The config with the new model.
 */
export function withModel(config: MisoConfig, model: RamenFile): MisoConfig {
  return { ...config, model };
}

/**
 * Returns a copy of the config with the name hints of all entries (attribute entries included) and the `type` hints of
 * the mappings set from the model. Entries of elements the model doesn't have are left as they are.
 *
 * @param {MisoConfig} config - The config.
 * @returns {MisoConfig} The copy.
 */
export function refreshNameHints(config: MisoConfig): MisoConfig {
  const copy: MisoConfig = copyConfig(config);
  const owners: Map<string, { name: string; owner: AttributeOwner }> = ownersByRef(copy.model);

  for (const entries of [copy.elements.classifiers, copy.elements.annotations]) {
    for (const [ref, entry] of Object.entries(entries)) {
      const element = owners.get(ref);

      if (!element) {
        continue;
      }

      entry.name = element.name;

      for (const [attributeRef, attributeEntry] of Object.entries(entry.attributes ?? {})) {
        attributeEntry.name = findAttribute(element.owner, attributeRef)?.name ?? attributeEntry.name;
      }
    }
  }

  for (const mapping of copy.editors.text.mappings) {
    mapping.type = owners.get(mapping.annotation)?.name ?? mapping.type;
  }

  return copy;
}

/**
 * Returns a copy of the config without the entries of elements the model doesn't have, and without attribute entries of
 * attributes their element doesn't declare. Mappings are kept: a mapping to a removed shape is a problem that needs a
 * decision.
 *
 * @param {MisoConfig} config - The config.
 * @returns {MisoConfig} The copy.
 */
export function pruneGoneEntries(config: MisoConfig): MisoConfig {
  const copy: MisoConfig = copyConfig(config);
  const owners: Map<string, { name: string; owner: AttributeOwner }> = ownersByRef(copy.model);

  for (const entries of [copy.elements.classifiers, copy.elements.annotations] as Record<string, ClassifierEntry | AnnotationEntry>[]) {
    for (const [ref, entry] of Object.entries(entries)) {
      const element = owners.get(ref);

      if (!element) {
        delete entries[ref];
        continue;
      }

      for (const attributeRef of Object.keys(entry.attributes ?? {})) {
        if (!findAttribute(element.owner, attributeRef)) {
          delete entry.attributes?.[attributeRef];
        }
      }
    }
  }

  return copy;
}

/**
 * The config as it is exported: name hints from the model, empty containers and entries that hold only their name hint
 * left out, and the top-level keys in a fixed order.
 *
 * @param {MisoConfig} config - The config.
 * @returns {MisoConfig} The export form, a copy.
 */
export function toExportConfig(config: MisoConfig): MisoConfig {
  const copy: MisoConfig = refreshNameHints(config);

  for (const entries of [copy.elements.classifiers, copy.elements.annotations] as Record<string, ClassifierEntry | AnnotationEntry>[]) {
    for (const [ref, entry] of Object.entries(entries)) {
      compactEntry(entry);

      if (Object.keys(entry).every((key) => key === "name")) {
        delete entries[ref];
      }
    }
  }

  return Object.fromEntries(
    CONFIG_KEY_ORDER.filter((key) => copy[key] !== undefined).map((key) => [key, copy[key]]),
  ) as MisoConfig;
}

/**
 * The config as JSON text, as it is exported (see {@linkcode toExportConfig}).
 *
 * @param {MisoConfig} config - The config.
 * @returns {string} The JSON, indented with two spaces, with a final newline.
 */
export function serializeConfig(config: MisoConfig): string {
  return `${JSON.stringify(toExportConfig(config), null, 2)}\n`;
}

/** Leaves out empty containers, attribute entries that hold only their name hint, and empty variant lists */
function compactEntry(entry: ClassifierEntry | AnnotationEntry): void {
  const record = entry as Record<string, unknown>;

  for (const [attributeRef, attributeEntry] of Object.entries(entry.attributes ?? {})) {
    if (Object.keys(attributeEntry).every((key) => key === "name")) {
      delete entry.attributes?.[attributeRef];
    }
  }

  if ("appearance" in entry && entry.appearance?.variants?.length === 0) {
    delete entry.appearance.variants;
  }

  for (const key of ENTRY_CONTAINERS) {
    const value: unknown = record[key];

    if (value !== null && typeof value === "object" && Object.keys(value).length === 0) {
      delete record[key];
    }
  }
}

/** A deep copy, without `undefined` values (as in the JSON) */
function copyConfig(config: MisoConfig): MisoConfig {
  return JSON.parse(JSON.stringify(config)) as MisoConfig;
}

/** Node classifiers (name) and annotation shapes (`type`) of a model, by qualified ref */
function ownersByRef(model: RamenFile): Map<string, { name: string; owner: AttributeOwner }> {
  const owners = new Map<string, { name: string; owner: AttributeOwner }>();

  for (const classifier of model.classifiers) {
    if (classifier.kind === "Node") {
      owners.set(`${classifier.modelId}:${classifier.id}`, { name: classifier.name, owner: classifier });
    }
  }

  for (const shape of model.annotations) {
    owners.set(shapeRefOf(shape), { name: shape.type, owner: shape });
  }

  return owners;
}
