import type { Attribute } from "@ramen-suite/core";
import {
  getOptions,
  getShapeProperties,
  getTypeRef,
  type AttributeOwner,
  type ModelAnnotationShape,
  type ModelContext,
} from "../external";
/** An attribute an element declares itself */
export interface AttributeRow {
  attributeRef: string;
  name: string;
  /** The built-in type, e.g. `String` (the base type of a project data type) */
  type: string;
  /** Name of the project data type, e.g. `SicIsDeleted`; `undefined` for built-in types */
  dataTypeName?: string;
  /** The allowed values, `undefined` if the type has no literals */
  options?: string[];
  /** Cardinality, e.g. `0..1`, `1..*` */
  bounds: string;
  /** At least one value is required */
  isRequired: boolean;
  /** More than one value is allowed */
  isList: boolean;
  /** Read-only in the model */
  isReadOnly: boolean;
}

/**
 * The attributes an element declares itself.
 *
 * @param {ModelContext} context - The model context.
 * @param {AttributeOwner} owner - The node classifier or annotation shape.
 * @returns {AttributeRow[]} The attributes in model order.
 */
export function attributeRowsOf(context: ModelContext, owner: AttributeOwner): AttributeRow[] {
  const attributes: readonly Attribute[] = "properties" in owner ? owner.properties : owner.attributes;
  const ownerRef: string = `${owner.modelId}:${owner.id}`;

  return attributes
    .filter((attribute) => attribute.isKey !== true)
    .map((attribute) => {
      const attributeRef: string = `${owner.modelId}:${attribute.id}`;
      const typeRef: string = getTypeRef({ attribute, ownerRef });
      const upper: string = attribute.bounds.upperBound === -1 ? "*" : String(attribute.bounds.upperBound);
      const dataType = context.model.getDataType(typeRef);
      const type: string = dataType?.baseType ?? typeRef;

      return {
        attributeRef,
        name: attribute.name,
        type,
        dataTypeName: dataType && dataType.name !== type ? dataType.name : undefined,
        options: getOptions(context, { attribute, ownerRef })?.map(String),
        bounds: `${attribute.bounds.lowerBound}..${upper}`,
        isRequired: attribute.bounds.lowerBound >= 1,
        isList: attribute.bounds.upperBound !== 1,
        isReadOnly: attribute.isReadOnly === true,
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
