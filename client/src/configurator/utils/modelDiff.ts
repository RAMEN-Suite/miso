import type { Attribute, Node } from "@ramen-suite/core";
import { getOptions, getShapesForNode, shapeRefOf, type AttributeOwner, type ModelContext } from "../external";

/**
 * The changes between two versions of a model, by qualified ref (`<modelId>:<id>`), as far as they concern the config
 * or the stored data: node classifiers, annotation shapes and relations, their names, attributes and carriers.
 *
 * @packageDocumentation
 */

export type ChangeKind = "added" | "removed" | "changed";

/** A change of an attribute (or shape property) of an element */
export interface AttributeChange {
  /** Attribute ref (`<modelId>:<attributeId>`) */
  attributeRef: string;
  change: ChangeKind;
  /** The name in the new model (the old one for removed attributes) */
  name: string;
  /** What changed, e.g. `renamed from "hand"`, `options removed: "a", "b"` */
  details: string[];
  /** Stored data has to be migrated: properties are stored by name */
  needsDataMigration: boolean;
}

/** A change of a model element */
export interface ElementChange {
  kind: "classifier" | "annotation" | "relation";
  ref: string;
  change: ChangeKind;
  /** The name (shapes: the `type`) in the new model, the old one for removed elements */
  name: string;
  details: string[];
  attributes: AttributeChange[];
  /** Stored data has to be migrated: labels, annotation `type`s, relationship types and property names are names */
  needsDataMigration: boolean;
}

/** An element as compared: its name and, for nodes and shapes, its attributes */
interface ComparedElement {
  name: string;
  owner?: AttributeOwner;
}

/**
 * Compares two versions of a model.
 *
 * @param {ModelContext} previous - The context of the current model.
 * @param {ModelContext} next - The context of the new model (same settings, new `model`).
 * @returns {ElementChange[]} The changed elements: classifiers, then annotation shapes, then relations, each in model
 *   order (removed ones after the others).
 */
export function diffModels(previous: ModelContext, next: ModelContext): ElementChange[] {
  const previousCarriers: Map<string, string[]> = carrierNamesByShape(previous);
  const nextCarriers: Map<string, string[]> = carrierNamesByShape(next);

  const classifiers: ElementChange[] = diffElements(
    "classifier",
    nodesByRef(previous),
    nodesByRef(next),
    previous,
    next,
    (ref) => {
      const before: string[] = lineageNames(previous, ref);
      const after: string[] = lineageNames(next, ref);

      return before.join(" > ") === after.join(" > ") ? [] : [`lineage changed: ${before.join(" > ")} -> ${after.join(" > ")}`];
    },
  );

  const annotations: ElementChange[] = diffElements(
    "annotation",
    shapesByRef(previous),
    shapesByRef(next),
    previous,
    next,
    (ref) => {
      const before: string[] = previousCarriers.get(ref) ?? [];
      const after: string[] = nextCarriers.get(ref) ?? [];
      const added: string[] = after.filter((name) => !before.includes(name));
      const removed: string[] = before.filter((name) => !after.includes(name));

      return [
        ...(added.length > 0 ? [`now on ${added.join(", ")}`] : []),
        ...(removed.length > 0 ? [`no longer on ${removed.join(", ")}`] : []),
      ];
    },
  );

  const relations: ElementChange[] = diffElements("relation", relationsByRef(previous), relationsByRef(next), previous, next);

  return [...classifiers, ...annotations, ...relations];
}

/** Compares the elements of one kind: added, removed, renamed, attributes and the kind-specific details */
function diffElements(
  kind: ElementChange["kind"],
  before: Map<string, ComparedElement>,
  after: Map<string, ComparedElement>,
  previous: ModelContext,
  next: ModelContext,
  extraDetails: (ref: string) => string[] = () => [],
): ElementChange[] {
  const changes: ElementChange[] = [];

  for (const [ref, element] of after) {
    const old: ComparedElement | undefined = before.get(ref);

    if (!old) {
      changes.push({ kind, ref, change: "added", name: element.name, details: [], attributes: [], needsDataMigration: false });
      continue;
    }

    const renamed: boolean = old.name !== element.name;
    const details: string[] = [...(renamed ? [`renamed from "${old.name}"`] : []), ...extraDetails(ref)];
    const attributes: AttributeChange[] =
      old.owner && element.owner ? diffAttributes(previous, old.owner, next, element.owner) : [];

    if (details.length > 0 || attributes.length > 0) {
      changes.push({
        kind,
        ref,
        change: "changed",
        name: element.name,
        details,
        attributes,
        needsDataMigration: renamed || attributes.some((attribute) => attribute.needsDataMigration),
      });
    }
  }

  for (const [ref, element] of before) {
    if (!after.has(ref)) {
      changes.push({ kind, ref, change: "removed", name: element.name, details: [], attributes: [], needsDataMigration: false });
    }
  }

  return changes;
}

/** Compares the attributes an element declares itself */
function diffAttributes(
  previous: ModelContext,
  previousOwner: AttributeOwner,
  next: ModelContext,
  nextOwner: AttributeOwner,
): AttributeChange[] {
  const before: Map<string, Attribute> = attributesByRef(previousOwner);
  const after: Map<string, Attribute> = attributesByRef(nextOwner);
  const previousOwnerRef: string = `${previousOwner.modelId}:${previousOwner.id}`;
  const nextOwnerRef: string = `${nextOwner.modelId}:${nextOwner.id}`;
  const changes: AttributeChange[] = [];

  for (const [attributeRef, attribute] of after) {
    const old: Attribute | undefined = before.get(attributeRef);

    if (!old) {
      changes.push({ attributeRef, change: "added", name: attribute.name, details: [], needsDataMigration: false });
      continue;
    }

    const details: string[] = [];
    const renamed: boolean = old.name !== attribute.name;

    if (renamed) {
      details.push(`renamed from "${old.name}"`);
    }

    if (old.typeId !== attribute.typeId) {
      details.push(`type ${old.typeId} -> ${attribute.typeId}`);
    }

    if (old.bounds.lowerBound !== attribute.bounds.lowerBound || old.bounds.upperBound !== attribute.bounds.upperBound) {
      details.push(
        `bounds ${old.bounds.lowerBound}..${old.bounds.upperBound} -> ${attribute.bounds.lowerBound}..${attribute.bounds.upperBound}`,
      );
    }

    const oldOptions: string[] = (getOptions(previous, { attribute: old, ownerRef: previousOwnerRef }) ?? []).map(String);
    const newOptions: string[] = (getOptions(next, { attribute, ownerRef: nextOwnerRef }) ?? []).map(String);
    const removedOptions: string[] = oldOptions.filter((option) => !newOptions.includes(option));
    const addedOptions: string[] = newOptions.filter((option) => !oldOptions.includes(option));

    if (removedOptions.length > 0) {
      details.push(`options removed: ${removedOptions.map((option) => `"${option}"`).join(", ")}`);
    }

    if (addedOptions.length > 0) {
      details.push(`options added: ${addedOptions.map((option) => `"${option}"`).join(", ")}`);
    }

    if (details.length > 0) {
      changes.push({
        attributeRef,
        change: "changed",
        name: attribute.name,
        details,
        needsDataMigration: renamed || removedOptions.length > 0 || old.typeId !== attribute.typeId,
      });
    }
  }

  for (const [attributeRef, attribute] of before) {
    if (!after.has(attributeRef)) {
      changes.push({ attributeRef, change: "removed", name: attribute.name, details: [], needsDataMigration: false });
    }
  }

  return changes;
}

function attributesByRef(owner: AttributeOwner): Map<string, Attribute> {
  const attributes: readonly Attribute[] = "properties" in owner ? owner.properties : owner.attributes;

  return new Map(attributes.map((attribute) => [`${owner.modelId}:${attribute.id}`, attribute]));
}

function nodesByRef(context: ModelContext): Map<string, ComparedElement> {
  return new Map(
    context.config.model.classifiers
      .filter((classifier): classifier is Node & { modelId: string } => classifier.kind === "Node")
      .map((node): [string, ComparedElement] => [`${node.modelId}:${node.id}`, { name: node.name, owner: node }]),
  );
}

function shapesByRef(context: ModelContext): Map<string, ComparedElement> {
  return new Map(
    context.config.model.annotations.map((shape): [string, ComparedElement] => [
      shapeRefOf(shape),
      { name: shape.type, owner: shape },
    ]),
  );
}

function relationsByRef(context: ModelContext): Map<string, ComparedElement> {
  return new Map(
    context.config.model.relations.map((relation): [string, ComparedElement] => [
      `${relation.modelId}:${relation.id}`,
      { name: relation.name },
    ]),
  );
}

/** Names of a node's lineage, base first */
function lineageNames(context: ModelContext, ref: string): string[] {
  return context.model.getNodeLineage(ref).map((item) => item.name);
}

/** The names of the nodes that may carry each annotation shape, by shape ref */
function carrierNamesByShape(context: ModelContext): Map<string, string[]> {
  const carriers = new Map<string, string[]>();

  for (const [ref, node] of nodesByRef(context)) {
    for (const shape of getShapesForNode(context, ref)) {
      const shapeRef: string = shapeRefOf(shape);

      carriers.set(shapeRef, [...(carriers.get(shapeRef) ?? []), node.name]);
    }
  }

  return carriers;
}
