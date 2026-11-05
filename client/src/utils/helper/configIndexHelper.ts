import {
  DataTypes,
  RAMEN_ELEMENT,
  RAMEN_MODEL,
  type AnnotationShape,
  type AnnotationShapeSuggestion,
  type Attribute,
  type AttributeInfo,
  type DataType,
  type Node,
  type RamenModel,
  type Relation,
} from "@ramen-suite/core";
import type {
  AnnotationMisoConfig,
  AnnotationShapeMisoConfig,
  AnnotationType,
  AttributeMisoConfig,
  ContentTypeMisoConfig,
  NodeMisoConfig,
  PropertyConfig,
  PropertyConfigDataType,
} from "../../models/types";
import type { ConfigBaseEntry, MisoConfig } from "../../schemas/misoConfig.schema";

// Builds the lookup index of the guidelines store. Every model question (lineage, attributes, data types, which
// annotation shapes a node carries) is answered by RAMEN core; the config only adds Miso's settings (`ext.miso`,
// `miso.base`, `miso.mappings`). Names are only the lookup keys (`additionalLabel`, `type`), as long as the lookups match
// by name.
//
// The same derivation exists on the server (`server/src/utils/configIndex.ts`). Keep both in sync.

/** A refinement of the Collection, Content or Entity node */
export interface NodeTypeConfig {
  /** The node label, i.e. the classifier name. Used for matching until the lookups use IDs. */
  additionalLabel: string;
  /** Qualified ref (`<modelId>:<id>`) of the classifier */
  classifierRef: string;
  /** The `ext.miso` block of the classifier */
  miso?: ContentTypeMisoConfig;
  /** The attributes of the classifier and of its refinement ancestors (not of the RAMEN base node) */
  properties: PropertyConfig[];
}

/** A refinement of the Collection node, with the annotation types only it carries */
export interface CollectionTypeConfig extends NodeTypeConfig {
  annotationTypes: AnnotationType[];
}

/** The lookups of the guidelines store by name, derived from the model and the Miso config */
export interface ConfigIndex {
  collections: {
    /** Settings of the RAMEN Collection node, from `miso.base` */
    miso?: NodeMisoConfig;
    /** Attributes declared by the RAMEN Collection node (identity attributes like `uuid` excluded) */
    properties: PropertyConfig[];
    types: CollectionTypeConfig[];
    /** Annotation types carried by every Collection */
    annotationTypes: AnnotationType[];
  };
  contents: {
    /** Settings of the RAMEN Content node, from `miso.base` */
    miso?: NodeMisoConfig;
    types: NodeTypeConfig[];
    /** Annotation types carried by Content nodes */
    annotationTypes: AnnotationType[];
  };
  entities: {
    /** Settings of the RAMEN Entity node, from `miso.base` */
    miso?: NodeMisoConfig;
    types: NodeTypeConfig[];
  };
  /** Problems found while building the index. The index is still usable, the affected entries are left out. */
  warnings: string[];
}

const COLLECTION_REF: string = `${RAMEN_MODEL.id}:${RAMEN_ELEMENT.COLLECTION}`;
const CONTENT_REF: string = `${RAMEN_MODEL.id}:${RAMEN_ELEMENT.CONTENT}`;
const ENTITY_REF: string = `${RAMEN_MODEL.id}:${RAMEN_ELEMENT.ENTITY}`;
const BASE_NODE_REFS: readonly string[] = [
  COLLECTION_REF,
  CONTENT_REF,
  ENTITY_REF,
  `${RAMEN_MODEL.id}:${RAMEN_ELEMENT.ANNOTATION}`,
];

const BUILTIN_TYPES: readonly string[] = Object.values(DataTypes);

/** RAMEN data types with a property type of their own. The other data types are edited as their base type. */
const PROPERTY_TYPE_BY_RAMEN_TYPE_REF: Record<string, PropertyConfigDataType> = {
  [`${RAMEN_MODEL.id}:${RAMEN_ELEMENT.DATE}`]: "Date",
  [`${RAMEN_MODEL.id}:${RAMEN_ELEMENT.DATE_TIME}`]: "DateTime",
};

/**
 * Qualifies a local ref (without model prefix) with the model of the element that holds it.
 *
 * @param {string} ref - A local or qualified ref.
 * @param {string} contextModelId - The model of the element that holds the ref.
 * @returns {string} The qualified ref (`<modelId>:<id>`).
 */
function qualify(ref: string, contextModelId: string): string {
  if (ref.includes(":")) {
    return ref;
  } else {
    return `${contextModelId}:${ref}`;
  }
}

/**
 * Builds the lookup index of the guidelines store.
 *
 * @param {MisoConfig} config - The validated Miso config, for its `ext.miso` blocks and global settings.
 * @param {RamenModel} model - The model of the config, imported by RAMEN core.
 * @returns {ConfigIndex} The index, with the problems found in `warnings`.
 */
export function buildConfigIndex(config: MisoConfig, model: RamenModel): ConfigIndex {
  const warnings: string[] = [];
  const baseEntries = new Map<string, ConfigBaseEntry>((config.miso.base ?? []).map((e) => [`${e.modelId}:${e.id}`, e]));
  const shapes = new Map<string, AnnotationShape & { modelId: string }>(
    config.model.annotations.map((shape) => [`${shape.modelId}:${shape.id}`, shape]),
  );

  /** The ref of the RAMEN base node a node refines, from its base-first lineage */
  function baseRefOf(nodeRef: string): string | undefined {
    const root = model.getNodeLineage(nodeRef)[0];

    return root ? `${root.modelId}:${root.nodeId}` : undefined;
  }

  /** The `ext.miso` of a node. Base level elements have theirs in `miso.base`. */
  function nodeMiso(nodeRef: string, node: Node): ContentTypeMisoConfig | undefined {
    if (nodeRef.startsWith(`${RAMEN_MODEL.id}:`)) {
      return baseEntries.get(nodeRef)?.ext?.miso;
    } else {
      return node.ext?.miso as ContentTypeMisoConfig | undefined;
    }
  }

  /** Property type and options of an attribute type */
  function valueTypeOf(typeRef: string, label: string): { type: PropertyConfigDataType; options?: string[] | number[] } {
    if (BUILTIN_TYPES.includes(typeRef)) {
      return { type: typeRef as PropertyConfigDataType };
    }

    if (PROPERTY_TYPE_BY_RAMEN_TYPE_REF[typeRef]) {
      return { type: PROPERTY_TYPE_BY_RAMEN_TYPE_REF[typeRef] };
    }

    const dataType: DataType | undefined = model.getDataType(typeRef);

    if (!dataType) {
      warnings.push(`${label}: unknown data type "${typeRef}", edited as String`);
      return { type: "String" };
    }

    const type = dataType.baseType as PropertyConfigDataType;
    const literals = dataType.literals ?? [];

    if (literals.length === 0) {
      return { type };
    } else if (type === "Integer" || type === "Float") {
      return { type, options: literals.map((l) => l.value ?? Number(l.literal ?? l.name)) };
    } else {
      return { type, options: literals.map((l) => l.literal ?? l.name) };
    }
  }

  /**
   * The property config of an attribute, with its `ext.miso` settings.
   *
   * @param {Attribute} attribute - The declared attribute (with `isReadOnly` and `ext`).
   * @param {string} declaringModelId - The model of the declaring element, to resolve local type refs.
   * @param {AttributeMisoConfig | undefined} miso - The attribute's Miso settings.
   * @param {string} label - For warnings.
   */
  function toPropertyConfig(
    attribute: Attribute,
    declaringModelId: string,
    miso: AttributeMisoConfig | undefined,
    label: string,
  ): PropertyConfig {
    const { type, options } = valueTypeOf(qualifyType(attribute.typeId, declaringModelId), label);
    const { lowerBound, upperBound } = attribute.bounds;
    const isList: boolean = upperBound === -1 || upperBound > 1;

    const config: PropertyConfig = {
      name: attribute.name,
      type: isList ? "Array" : type,
      required: lowerBound >= 1,
      editable: attribute.isReadOnly === true ? false : (miso?.editable ?? true),
      visible: miso?.visible ?? true,
      attributeId: attribute.id,
    };

    if (isList) {
      config.items = { type, ...(options ? { options } : {}) };

      if (upperBound > 1) {
        config.maxItems = upperBound;
      }
    } else if (options) {
      config.options = options;
    }

    return config;
  }

  /** Built-in type names stay as they are, other type refs are qualified */
  function qualifyType(typeId: string, declaringModelId: string): string {
    if (BUILTIN_TYPES.includes(typeId)) {
      return typeId;
    } else {
      return qualify(typeId, declaringModelId);
    }
  }

  /** The property config of an attribute visible on a node, read from its declaring node */
  function attributeConfig(info: AttributeInfo): PropertyConfig | undefined {
    const declaringRef: string = `${info.declaredBy.modelId}:${info.declaredBy.nodeId}`;
    const attribute: Attribute | undefined = model.getNode(declaringRef)?.attributes.find((a) => a.id === info.attributeId);

    if (!attribute || attribute.isKey === true) {
      return undefined;
    }

    const miso: AttributeMisoConfig | undefined = declaringRef.startsWith(`${RAMEN_MODEL.id}:`)
      ? baseEntries.get(declaringRef)?.attributes?.find((a) => a.id === attribute.id)?.ext?.miso
      : (attribute.ext?.miso as AttributeMisoConfig | undefined);

    return toPropertyConfig(attribute, info.declaredBy.modelId, miso, `${info.declaredBy.name}.${attribute.name}`);
  }

  /** The properties of a node, optionally only the ones not declared by its RAMEN base node */
  function propertiesOf(nodeRef: string, withoutBaseNode: boolean): PropertyConfig[] {
    return model
      .getAttributes(nodeRef)
      .filter((info) => !withoutBaseNode || !BASE_NODE_REFS.includes(`${info.declaredBy.modelId}:${info.declaredBy.nodeId}`))
      .map(attributeConfig)
      .filter((config): config is PropertyConfig => config !== undefined);
  }

  /** Whether an annotation shape may refer to an Entity, from the targets of its outgoing relation rules */
  function refersToEntities(shape: AnnotationShape & { modelId: string }): boolean {
    return shape.relations
      .filter((rule) => rule.direction === "outgoing")
      .flatMap((rule) => rule.relationIds.map((relationId) => qualify(relationId, shape.modelId)))
      .some((relationRef) => {
        const relation: Relation | undefined = model.getRelation(relationRef);
        const relationModelId: string = relationRef.split(":")[0];

        return relation !== undefined && baseRefOf(qualify(relation.to.nodeId, relationModelId)) === ENTITY_REF;
      });
  }

  /** The annotation type of a shape suggested for a carrier */
  function toAnnotationType(suggestion: AnnotationShapeSuggestion): AnnotationType | undefined {
    const shapeRef: string = `${suggestion.modelId}:${suggestion.annotationId}`;
    const shape = shapes.get(shapeRef);

    if (!shape) {
      warnings.push(`Annotation shape "${suggestion.type}" (${shapeRef}) is not in the ingested model, left out`);
      return undefined;
    }

    const miso = shape.ext?.miso as AnnotationShapeMisoConfig | undefined;

    return {
      type: shape.type,
      properties: shape.properties.map((property) =>
        toPropertyConfig(
          property,
          shape.modelId,
          property.ext?.miso as AttributeMisoConfig | undefined,
          `${shape.type}.${property.name}`,
        ),
      ),
      hasEntities: refersToEntities(shape),
      ...(miso ? { miso: structuredClone(miso) as AnnotationMisoConfig } : {}),
      annotationRef: shapeRef,
      familyRef: qualify(shape.annotationId, shape.modelId),
    };
  }

  /** The annotation types of the shapes a node may carry, without the excluded refs and duplicate shapes */
  function annotationTypesOf(nodeRef: string, excludedRefs: Set<string>): AnnotationType[] {
    return model
      .suggestAnnotationShapesForNode(nodeRef)
      .filter((suggestion) => !excludedRefs.has(`${suggestion.modelId}:${suggestion.annotationId}`))
      .map(toAnnotationType)
      .filter((annotationType): annotationType is AnnotationType => annotationType !== undefined);
  }

  /** Adds annotation types unless the list already has one with that type, which name matching couldn't tell apart */
  function addAnnotationTypes(list: AnnotationType[], annotationTypes: AnnotationType[]): void {
    for (const annotationType of annotationTypes) {
      const existing: AnnotationType | undefined = list.find((t) => t.type === annotationType.type);

      if (!existing) {
        list.push(annotationType);
      } else if (existing.annotationRef !== annotationType.annotationRef) {
        warnings.push(`A second annotation shape with type "${annotationType.type}" is left out (${annotationType.annotationRef})`);
      }
    }
  }

  const index: ConfigIndex = {
    collections: {
      miso: baseEntries.get(COLLECTION_REF)?.ext?.miso,
      properties: propertiesOf(COLLECTION_REF, false),
      types: [],
      annotationTypes: annotationTypesOf(COLLECTION_REF, new Set()),
    },
    contents: { miso: baseEntries.get(CONTENT_REF)?.ext?.miso, types: [], annotationTypes: [] },
    entities: { miso: baseEntries.get(ENTITY_REF)?.ext?.miso, types: [] },
    warnings,
  };

  const collectionWideRefs = new Set<string>(index.collections.annotationTypes.map((t) => t.annotationRef ?? ""));

  addAnnotationTypes(index.contents.annotationTypes, annotationTypesOf(CONTENT_REF, new Set()));

  // Node types: every refinement of the Collection, Content and Entity node, in model order

  for (const classifier of config.model.classifiers) {
    const ref: string = `${classifier.modelId}:${classifier.id}`;

    if (classifier.kind !== "Node" || BASE_NODE_REFS.includes(ref)) {
      continue;
    }

    const baseRef: string | undefined = baseRefOf(ref);
    const miso: ContentTypeMisoConfig | undefined = nodeMiso(ref, classifier);
    const entry: NodeTypeConfig = {
      additionalLabel: classifier.name,
      classifierRef: ref,
      ...(miso ? { miso } : {}),
      properties: propertiesOf(ref, true),
    };

    if (baseRef === COLLECTION_REF) {
      index.collections.types.push({ ...entry, annotationTypes: annotationTypesOf(ref, collectionWideRefs) });
    } else if (baseRef === CONTENT_REF) {
      index.contents.types.push(entry);
      addAnnotationTypes(index.contents.annotationTypes, annotationTypesOf(ref, new Set()));
    } else if (baseRef === ENTITY_REF) {
      index.entities.types.push(entry);
    }
  }

  // Shapes no Content or Collection carries (e.g. annotations on annotations) have no place in the lookups yet

  const placedRefs = new Set<string>([
    ...index.contents.annotationTypes.map((t) => t.annotationRef ?? ""),
    ...collectionWideRefs,
    ...index.collections.types.flatMap((type) => type.annotationTypes.map((t) => t.annotationRef ?? "")),
  ]);

  for (const [ref, shape] of shapes) {
    if (!placedRefs.has(ref)) {
      warnings.push(`Annotation shape "${shape.type}" (${ref}) is not carried by a Content or Collection node, left out`);
    }
  }

  // Native mappings become `editing.native` of the annotation types that implement them

  const mappedNativeTypes = new Set<string>();

  for (const mapping of config.miso.mappings) {
    const annotationType: AnnotationType | undefined = index.contents.annotationTypes.find(
      (t) => t.annotationRef === mapping.annotation,
    );

    if (!annotationType) {
      warnings.push(`miso.mappings: "${mapping.annotation}" (${mapping.native}) is no annotation shape on Content nodes`);
      continue;
    }

    if (mappedNativeTypes.has(mapping.native)) {
      warnings.push(`miso.mappings: native type "${mapping.native}" is mapped twice, the second mapping is ignored`);
      continue;
    }

    if (annotationType.type !== mapping.type) {
      warnings.push(`miso.mappings: "${mapping.annotation}" has type "${annotationType.type}", not "${mapping.type}"`);
    }

    mappedNativeTypes.add(mapping.native);
    annotationType.miso = {
      ...annotationType.miso,
      editing: {
        ...annotationType.miso?.editing,
        native: { type: mapping.native, ...(mapping.attributes ? { attributes: mapping.attributes } : {}) },
      },
    };
  }

  return index;
}
