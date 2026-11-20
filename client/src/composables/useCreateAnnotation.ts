import { useConfigStore } from "../store/config";
import { Annotation, AnnotationNode, CollectionNode, ModelAnnotationShape, ModelAttribute } from "../models/types";
import {
  familyRefOf,
  getDefaultValue,
  getOptions,
  getShapeProperties,
  isRequired,
  shapeRefOf,
} from "../utils/helper/modelHelper";
import { IAnnotation } from "../models/IAnnotation";
import { createTextPositionSelector } from "../utils/helper/selector";

/**
 * Return type for the `useCreateAnnotation` hook.
 * Provides factory functions for creating different types of annotations.
 */
interface UseCreateAnnotationReturnType {
  createCollectionAnnotation: (params: { collection: CollectionNode; subType?: string | number; type: string }) => Annotation;
  createTextAnnotation: (params: { selectedText: string; subType?: string | number; type: string }) => Annotation;
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
   * The annotation object contains the annotation node (with its properties created from the fields), no connected
   * nodes yet and the status `created`.
   *
   * @param {Object} params - The parameters object. Contains the properties of the shape, subType (optional) and type of the annotation.
   * @returns {Annotation} The new annotation.
   */
  function createAnnotationObject(params: { fields: ModelAttribute[]; subType?: string | number; type: string }): Annotation {
    const properties: IAnnotation = createProperties({ ...params });
    const node: AnnotationNode = {
      properties,
      nodeLabels: ["Annotation"],
    };

    const newAnnotation: Annotation = {
      node,
      connectedNodes: [],
      meta: {
        status: "created",
      },
    };

    return newAnnotation;
  }

  /**
   * Creates the base properties of an annotation node.
   *
   * The object contains the annotation type, subType (if applicable), and fields specific to the annotation type.
   * If the subType field exists, but not subType was provided, the first option is set as default value.
   *
   * @param {Object} params - The parameters object. Contains the properties of the shape, subType (optional) and type of the annotation.
   * @returns {IAnnotation} The base properties.
   */
  function createBaseProperties(params: { fields: ModelAttribute[]; subType?: string | number; type: string }): IAnnotation {
    const { type, subType, fields } = params;
    const subTypeField: ModelAttribute | undefined = fields.find((field) => field.attribute.name === "subType");

    const baseProperties: IAnnotation = {} as IAnnotation;

    fields.forEach((field: ModelAttribute) => {
      baseProperties[field.attribute.name] = isRequired(field) ? getDefaultValue(getModelContext(), field) : null;
    });

    // Set explicitly after the fields are set to override default values if necessary
    baseProperties.type = type;
    baseProperties.uuid = crypto.randomUUID();

    // If a subType field exists (filled with a default value just before), but not subType was provided
    // (= the user clicked the button directly instead of selecting an entry from the dropdown),
    // set the first option as default value
    if (subTypeField) {
      baseProperties.subType = subType ?? (getOptions(getModelContext(), subTypeField) ?? [])[0];
    }

    return baseProperties;
  }

  /**
   * Creates an annotation with the given type for a collection. Its shape is resolved from the collection's classifier
   * and the type, and set as `shapeRef` (its family as `classifierRef`), like on annotations read from the server.
   * The subType is optional and will default to the first option if not provided.
   *
   * @param {Object} params - The parameters object. Contains the type, subType (optional) and the collection.
   * @returns {Annotation} An object containing the properties, entities and additional texts of the annotation.
   */
  function createCollectionAnnotation(params: {
    type: string;
    subType?: string | number;
    collection: CollectionNode;
  }): Annotation {
    const { type, subType, collection } = params;
    const shape: ModelAnnotationShape | undefined = findCollectionAnnotationShape(collection, type);
    const fields: ModelAttribute[] = shape ? getShapeProperties(shape) : [];

    const annotationObject: Annotation = createAnnotationObject({ type, subType, fields });

    annotationObject.node.shapeRef = shape ? shapeRefOf(shape) : null;
    annotationObject.node.classifierRef = shape ? familyRefOf(shape) : null;

    return annotationObject;
  }

  /**
   * Creates the properties of an annotation node: the base properties (see {@linkcode createBaseProperties}) and, if
   * the scope is 'Content', the fields specific to content annotations (`selector` and `text`).
   *
   * @param {Object} params - The parameters object. Contains the fields, subType (optional) and type of the annotation.
   * @returns {IAnnotation} The properties.
   */
  function createProperties(params: { fields: ModelAttribute[]; subType?: string | number; type: string }): IAnnotation {
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
   * Creates a content annotation with the given type and subtype. Its shape is the text annotation type (the editor's
   * key), set as `shapeRef` (its family as `classifierRef`), like on annotations read from the server.
   *
   * @param {Object} params - The parameters object. Currently consists only of the type and subtype (optional).
   * @returns {Annotation} - The created content annotation object.
   */
  function createTextAnnotation(params: { type: string; subType?: string | number; selectedText: string }): Annotation {
    const { type, subType, selectedText } = params;
    const shape: ModelAnnotationShape | undefined = getTextAnnotationShape(type);
    const fields: ModelAttribute[] = shape ? getShapeProperties(shape) : [];

    const annotation: Annotation = createAnnotationObject({ type, subType, fields });

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
