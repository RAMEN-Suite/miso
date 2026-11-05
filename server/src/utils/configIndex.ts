import { ConfigIndex, NodeTypeConfig } from "../models/IMisoConfig.js";
import { AnnotationType, PropertyConfig } from "../models/types.js";
import {
  BASE_NODE_REF,
  familyRefOf,
  getNodeAttributes,
  getNodeMiso,
  getOptions,
  getRefinements,
  getShapeMiso,
  getShapeProperties,
  getShapesForNode,
  getValueType,
  isEditable,
  isList,
  isRequired,
  isVisible,
  refersToEntities,
  shapeRefOf,
  type ModelAnnotationShape,
  type ModelAttribute,
  type ModelContext,
} from "./modelHelper.js";

// TRANSITIONAL: the lookup index of the guidelines service, in the old view types (`PropertyConfig`, `AnnotationType`).
// It only exists until the services use the accessors of `modelHelper.ts` directly (step 2e of the plan), and is built
// entirely from those accessors. Don't build new features on top of it.
//
// The same index exists on the client (`client/src/utils/helper/configIndexHelper.ts`). Keep both in sync.

/** The old view of an attribute */
function toPropertyConfig(context: ModelContext, entry: ModelAttribute): PropertyConfig {
  const type = getValueType(context, entry);
  const options = getOptions(context, entry);
  const config: PropertyConfig = {
    name: entry.attribute.name,
    type: isList(entry) ? "Array" : type,
    required: isRequired(entry),
    editable: isEditable(context, entry),
    visible: isVisible(context, entry),
    attributeId: entry.attribute.id,
  };

  if (isList(entry)) {
    config.items = { type, ...(options ? { options } : {}) };

    if (entry.attribute.bounds.upperBound > 1) {
      config.maxItems = entry.attribute.bounds.upperBound;
    }
  } else if (options) {
    config.options = options;
  }

  return config;
}

/** The old view of an annotation shape. The server doesn't need the native mapping, so it isn't added. */
function toAnnotationType(context: ModelContext, shape: ModelAnnotationShape): AnnotationType {
  const miso = getShapeMiso(shape);

  return {
    type: shape.type,
    properties: getShapeProperties(shape).map((entry) => toPropertyConfig(context, entry)),
    hasEntities: refersToEntities(context, shape),
    ...(miso ? { miso: structuredClone(miso) } : {}),
    annotationRef: shapeRefOf(shape),
    familyRef: familyRefOf(shape),
  };
}

/**
 * Builds the lookup index of the guidelines service from the model accessors.
 *
 * @param {ModelContext} context - The model context.
 * @returns {ConfigIndex} The index, with the problems found in `warnings`.
 */
export function buildConfigIndex(context: ModelContext): ConfigIndex {
  const warnings: string[] = [];

  /** Adds annotation types unless the list already has one with that type, which name matching couldn't tell apart */
  function addAnnotationTypes(list: AnnotationType[], shapes: ModelAnnotationShape[]): void {
    for (const shape of shapes) {
      const existing: AnnotationType | undefined = list.find((t) => t.type === shape.type);

      if (!existing) {
        list.push(toAnnotationType(context, shape));
      } else if (existing.annotationRef !== shapeRefOf(shape)) {
        warnings.push(`A second annotation shape with type "${shape.type}" is left out (${shapeRefOf(shape)})`);
      }
    }
  }

  const toNodeType = (ref: string, name: string): NodeTypeConfig => {
    const miso = getNodeMiso(context, ref);

    return {
      additionalLabel: name,
      classifierRef: ref,
      ...(miso ? { miso } : {}),
      properties: getNodeAttributes(context, ref, true).map((entry) => toPropertyConfig(context, entry)),
    };
  };

  const collectionWideShapes: ModelAnnotationShape[] = getShapesForNode(context, BASE_NODE_REF.Collection);
  const collectionWideRefs = new Set<string>(collectionWideShapes.map(shapeRefOf));

  const index: ConfigIndex = {
    collections: {
      miso: getNodeMiso(context, BASE_NODE_REF.Collection),
      properties: getNodeAttributes(context, BASE_NODE_REF.Collection).map((entry) => toPropertyConfig(context, entry)),
      types: getRefinements(context, BASE_NODE_REF.Collection).map(({ ref, node }) => ({
        ...toNodeType(ref, node.name),
        annotationTypes: getShapesForNode(context, ref)
          .filter((shape) => !collectionWideRefs.has(shapeRefOf(shape)))
          .map((shape) => toAnnotationType(context, shape)),
      })),
      annotationTypes: collectionWideShapes.map((shape) => toAnnotationType(context, shape)),
    },
    contents: {
      miso: getNodeMiso(context, BASE_NODE_REF.Content),
      types: getRefinements(context, BASE_NODE_REF.Content).map(({ ref, node }) => toNodeType(ref, node.name)),
      annotationTypes: [],
    },
    entities: {
      miso: getNodeMiso(context, BASE_NODE_REF.Entity),
      types: getRefinements(context, BASE_NODE_REF.Entity).map(({ ref, node }) => toNodeType(ref, node.name)),
    },
    warnings,
  };

  addAnnotationTypes(index.contents.annotationTypes, getShapesForNode(context, BASE_NODE_REF.Content));

  for (const type of index.contents.types) {
    addAnnotationTypes(index.contents.annotationTypes, getShapesForNode(context, type.classifierRef));
  }

  // Shapes no Content or Collection carries (e.g. annotations on annotations) have no place in the lookups yet

  const placedRefs = new Set<string>([
    ...index.contents.annotationTypes.map((t) => t.annotationRef ?? ""),
    ...collectionWideRefs,
    ...index.collections.types.flatMap((type) => type.annotationTypes.map((t) => t.annotationRef ?? "")),
  ]);

  for (const [ref, shape] of context.shapes) {
    if (!placedRefs.has(ref)) {
      warnings.push(`Annotation shape "${shape.type}" (${ref}) is not carried by a Content or Collection node, left out`);
    }
  }

  // Mappings that don't point to an annotation type of the editor, or map a native type twice

  const mappedNativeTypes = new Set<string>();

  for (const mapping of context.config.miso.mappings) {
    if (!index.contents.annotationTypes.some((t) => t.annotationRef === mapping.annotation)) {
      warnings.push(`miso.mappings: "${mapping.annotation}" (${mapping.native}) is no annotation shape on Content nodes`);
    } else if (mappedNativeTypes.has(mapping.native)) {
      warnings.push(`miso.mappings: native type "${mapping.native}" is mapped twice`);
    } else {
      mappedNativeTypes.add(mapping.native);
    }
  }

  return index;
}
