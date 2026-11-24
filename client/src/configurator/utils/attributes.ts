import type { Attribute } from "@ramen-suite/core";
import {
  getOptions,
  getShapeProperties,
  getTypeRef,
  type AttributeOwner,
  type ModelAnnotationShape,
  type ModelContext,
} from "../external";
import { withKey, type AnnotationEntry, type AttributeEntry, type ClassifierEntry } from "./configUpdate";

/** An attribute an element declares itself, with its entry */
export interface AttributeRow {
  attributeRef: string;
  name: string;
  /** Type and cardinality, e.g. `String 0..1` */
  type: string;
  entry?: AttributeEntry;
}

/**
 * The attributes an element declares itself, with their entries. Inherited attributes are configured on the element
 * that declares them.
 *
 * @param {ModelContext} context - The model context.
 * @param {AttributeOwner} owner - The node classifier or annotation shape.
 * @param {ClassifierEntry | AnnotationEntry | undefined} entry - Its entry.
 * @returns {AttributeRow[]} The attributes in model order.
 */
export function attributeRowsOf(
  context: ModelContext,
  owner: AttributeOwner,
  entry: ClassifierEntry | AnnotationEntry | undefined,
): AttributeRow[] {
  const attributes: readonly Attribute[] = "properties" in owner ? owner.properties : owner.attributes;
  const ownerRef: string = `${owner.modelId}:${owner.id}`;

  return attributes
    .filter((attribute) => attribute.isKey !== true)
    .map((attribute) => {
      const attributeRef: string = `${owner.modelId}:${attribute.id}`;
      const typeRef: string = getTypeRef({ attribute, ownerRef });
      const upper: string = attribute.bounds.upperBound === -1 ? "*" : String(attribute.bounds.upperBound);

      return {
        attributeRef,
        name: attribute.name,
        type: `${context.model.getDataType(typeRef)?.name ?? typeRef} ${attribute.bounds.lowerBound}..${upper}`,
        entry: entry?.attributes?.[attributeRef],
      };
    });
}

/** A property of an annotation shape, as variants and math markers refer to it */
export interface VariantProperty {
  attributeRef: string;
  name: string;
  /** The allowed values, `undefined` if the property is not an enum */
  options?: string[];
}

/**
 * The properties of an annotation shape with their options.
 *
 * @param {ModelContext} context - The model context.
 * @param {ModelAnnotationShape} shape - The shape.
 * @returns {VariantProperty[]} The properties in model order.
 */
export function variantPropertiesOf(context: ModelContext, shape: ModelAnnotationShape): VariantProperty[] {
  return getShapeProperties(shape).map((entry) => ({
    attributeRef: `${shape.modelId}:${entry.attribute.id}`,
    name: entry.attribute.name,
    options: getOptions(context, entry)?.map(String),
  }));
}

/**
 * Sets a flag of an attribute entry, which is created (with its name hint) if there is none. An entry without flags is
 * left out. Changes the element's entry in place.
 *
 * @param {ClassifierEntry | AnnotationEntry} entry - The element's entry.
 * @param {AttributeRow} row - The attribute.
 * @param {"visible" | "editable"} key - The flag.
 * @param {boolean | undefined} value - The value, `undefined` for the default.
 */
export function setAttributeFlag(
  entry: ClassifierEntry | AnnotationEntry,
  row: AttributeRow,
  key: "visible" | "editable",
  value: boolean | undefined,
): void {
  const current: AttributeEntry = entry.attributes?.[row.attributeRef] ?? { name: row.name };
  const next: AttributeEntry | undefined = withKey(current, key, value);
  const attributes: Record<string, AttributeEntry> = { ...entry.attributes };

  if (next && Object.keys(next).some((k) => k !== "name")) {
    attributes[row.attributeRef] = next;
  } else {
    delete attributes[row.attributeRef];
  }

  entry.attributes = Object.keys(attributes).length > 0 ? attributes : undefined;
}
