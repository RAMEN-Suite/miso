import { useConfigStore } from "../store/config";
import { Annotation, AnnotationNode, ModelAnnotationShape, ModelAttribute } from "../models/types";
import { familyRefOf, getDefaultValue, getShapeProperties, isRequired, shapeRefOf } from "../utils/helper/modelHelper";
import { IAnnotation } from "../models/IAnnotation";
import { createTextPositionSelector } from "../utils/helper/selector";

/**
 * Return type for the `useCreateAnnotation` hook.
 * Provides factory functions for creating different types of annotations.
 */
interface UseCreateAnnotationReturnType {
  createCollectionAnnotation: (params: { shape: ModelAnnotationShape }) => AnnotationNode;
  createTextAnnotation: (params: { selectedText: string; shape: ModelAnnotationShape }) => Annotation;
}

/**
 * A composable function that is used to create annotations for collections and texts.
 * It exposes two functions: One for adding annotations to text (mostly used), and one for adding annotations to collections.
 *
 * Since the annotations currently differ a bit (text annotations contain more character-specific data), there must be two functions.
 * In the future, the annotation handling should be more generic.
 *
 * @param {('Content' | 'Collection')} scope - The scope for which the annotation is being created. This determines the type of annotation that will be created.
 * @returns {UseCreateAnnotationReturnType} An object containing the functions to create annotations.
 */
export function useCreateAnnotation(scope: "Content" | "Collection"): UseCreateAnnotationReturnType {
  const { getAnnotationExtent, getModelContext } = useConfigStore();

  /**
   * Creates an annotation object of the given shape: its node (with the properties of the shape, `shapeRef` and its
   * family as `classifierRef`, like on annotations read from the server), no nodes or relations below it yet and the
   * status `created`.
   *
   * @param {ModelAnnotationShape} shape - The annotation shape.
   * @returns {Annotation} The new annotation.
   */
  function createAnnotationObject(shape: ModelAnnotationShape): Annotation {
    const node: AnnotationNode = {
      properties: createProperties(shape),
      nodeLabels: ["Annotation"],
      shapeRef: shapeRefOf(shape),
      classifierRef: familyRefOf(shape),
    };

    return {
      node,
      status: "created",
      nodes: [],
      relations: [],
    };
  }

  /**
   * Creates the base properties of an annotation node: the type of the shape and its properties. Required properties
   * get their default value, optional ones `null`.
   *
   * @param {ModelAnnotationShape} shape - The annotation shape.
   * @returns {IAnnotation} The base properties.
   */
  function createBaseProperties(shape: ModelAnnotationShape): IAnnotation {
    const baseProperties: IAnnotation = {} as IAnnotation;

    getShapeProperties(shape).forEach((field: ModelAttribute) => {
      baseProperties[field.attribute.name] = isRequired(field) ? getDefaultValue(getModelContext(), field) : null;
    });

    // Set explicitly after the fields are set to override default values if necessary
    baseProperties.type = shape.type;
    baseProperties.uuid = crypto.randomUUID();

    return baseProperties;
  }

  /**
   * Creates an annotation of the given shape for a collection.
   *
   * @param {Object} params - The parameters object. Contains the shape, one a Collection may carry.
   * @returns {AnnotationNode} The annotation node.
   */
  function createCollectionAnnotation(params: { shape: ModelAnnotationShape }): AnnotationNode {
    return createAnnotationObject(params.shape).node;
  }

  /**
   * Creates the properties of an annotation node: the base properties (see {@linkcode createBaseProperties}) and, if
   * the scope is 'Content', the fields specific to content annotations (`selector` and `text`).
   *
   * @param {ModelAnnotationShape} shape - The annotation shape.
   * @returns {IAnnotation} The properties.
   */
  function createProperties(shape: ModelAnnotationShape): IAnnotation {
    const properties: IAnnotation = createBaseProperties(shape);

    // Other fields specifically for content annotations
    if (scope === "Content") {
      // Start and end can be 0 since the real values are set from the editor on save
      properties.selector = createTextPositionSelector(0, 0);
      // Empty string since value is added in createTextAnnotation().
      properties.text = "";

      if (getAnnotationExtent(shape) === "zeroPoint") {
        properties.isZeroPoint = true;
      }
    }

    return properties;
  }

  /**
   * Creates a content annotation of the given shape.
   *
   * @param {Object} params - The parameters object. Contains the shape and the selected text.
   * @returns {Annotation} - The created content annotation object.
   */
  function createTextAnnotation(params: { shape: ModelAnnotationShape; selectedText: string }): Annotation {
    const annotation: Annotation = createAnnotationObject(params.shape);

    // Initial text property from text selection.
    annotation.node.properties.text = params.selectedText;

    return annotation;
  }

  return {
    createCollectionAnnotation,
    createTextAnnotation,
  };
}
