import { useConfigStore } from "../store/config";
import { Annotation, AnnotationNode, CollectionNode, ModelAnnotationShape, ModelAttribute } from "../models/types";
import { familyRefOf, getDefaultValue, getShapeProperties, isRequired, shapeRefOf } from "../utils/helper/modelHelper";
import { IAnnotation } from "../models/IAnnotation";
import { createTextPositionSelector } from "../utils/helper/selector";

/**
 * Return type for the `useCreateAnnotation` hook.
 * Provides factory functions for creating different types of annotations.
 */
interface UseCreateAnnotationReturnType {
  createCollectionAnnotation: (params: { collection: CollectionNode; type: string }) => AnnotationNode;
  createTextAnnotation: (params: { selectedText: string; type: string }) => Annotation;
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
  const { getTextAnnotationShape, findCollectionAnnotationShape, getAnnotationExtent, getModelContext } = useConfigStore();

  /**
   * Creates an annotation object with the given parameters.
   *
   * The annotation object contains the annotation node (with its properties created from the fields), no nodes or
   * relations below it yet and the status `created`.
   *
   * @param {Object} params - The parameters object. Contains the properties of the shape and the type of the annotation.
   * @returns {Annotation} The new annotation.
   */
  function createAnnotationObject(params: { fields: ModelAttribute[]; type: string }): Annotation {
    const properties: IAnnotation = createProperties({ ...params });
    const node: AnnotationNode = {
      properties,
      nodeLabels: ["Annotation"],
    };

    const newAnnotation: Annotation = {
      node,
      status: "created",
      nodes: [],
      relations: [],
    };

    return newAnnotation;
  }

  /**
   * Creates the base properties of an annotation node.
   *
   * The object contains the annotation type and the fields specific to the annotation type: required fields get their
   * default value, optional ones `null`.
   *
   * @param {Object} params - The parameters object. Contains the properties of the shape and the type of the annotation.
   * @returns {IAnnotation} The base properties.
   */
  function createBaseProperties(params: { fields: ModelAttribute[]; type: string }): IAnnotation {
    const { type, fields } = params;

    const baseProperties: IAnnotation = {} as IAnnotation;

    fields.forEach((field: ModelAttribute) => {
      baseProperties[field.attribute.name] = isRequired(field) ? getDefaultValue(getModelContext(), field) : null;
    });

    // Set explicitly after the fields are set to override default values if necessary
    baseProperties.type = type;
    baseProperties.uuid = crypto.randomUUID();

    return baseProperties;
  }

  /**
   * Creates an annotation with the given type for a collection. Its shape is resolved from the collection's classifier
   * and the type, and set as `shapeRef` (its family as `classifierRef`), like on annotations read from the server.
   *
   * @param {Object} params - The parameters object. Contains the type and the collection.
   * @returns {AnnotationNode} The annotation node.
   */
  function createCollectionAnnotation(params: { type: string; collection: CollectionNode }): AnnotationNode {
    const { type, collection } = params;
    const shape: ModelAnnotationShape | undefined = findCollectionAnnotationShape(collection, type);
    const fields: ModelAttribute[] = shape ? getShapeProperties(shape) : [];

    const { node } = createAnnotationObject({ type, fields });

    node.shapeRef = shape ? shapeRefOf(shape) : null;
    node.classifierRef = shape ? familyRefOf(shape) : null;

    return node;
  }

  /**
   * Creates the properties of an annotation node: the base properties (see {@linkcode createBaseProperties}) and, if
   * the scope is 'Content', the fields specific to content annotations (`selector` and `text`).
   *
   * @param {Object} params - The parameters object. Contains the fields and the type of the annotation.
   * @returns {IAnnotation} The properties.
   */
  function createProperties(params: { fields: ModelAttribute[]; type: string }): IAnnotation {
    const properties: IAnnotation = createBaseProperties(params);

    // Other fields specifically for content annotations
    if (scope === "Content") {
      // Start and end can be 0 since the real values are set from the editor on save
      properties.selector = createTextPositionSelector(0, 0);
      // Empty string since value is added in createTextAnnotation().
      properties.text = "";

      if (getAnnotationExtent(params.type) === "zeroPoint") {
        properties.isZeroPoint = true;
      }
    }

    return properties;
  }

  /**
   * Creates a content annotation with the given type. Its shape is the text annotation type (the editor's key), set as
   * `shapeRef` (its family as `classifierRef`), like on annotations read from the server.
   *
   * @param {Object} params - The parameters object. Contains the type and the selected text.
   * @returns {Annotation} - The created content annotation object.
   */
  function createTextAnnotation(params: { type: string; selectedText: string }): Annotation {
    const { type, selectedText } = params;
    const shape: ModelAnnotationShape | undefined = getTextAnnotationShape(type);
    const fields: ModelAttribute[] = shape ? getShapeProperties(shape) : [];

    const annotation: Annotation = createAnnotationObject({ type, fields });

    // Without a modelled shape (e.g. an editor built-in the project doesn't model) the refs stay unset, `null` is for
    // stored data that can't be resolved
    if (shape) {
      annotation.node.shapeRef = shapeRefOf(shape);
      annotation.node.classifierRef = familyRefOf(shape);
    }

    // Initial text property from text selection.
    annotation.node.properties.text = selectedText;

    return annotation;
  }

  return {
    createCollectionAnnotation,
    createTextAnnotation,
  };
}
