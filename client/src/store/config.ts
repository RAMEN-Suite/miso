import { computed, readonly, shallowRef } from "vue";
import { useFilterStore } from "./filter";
import {
  AnnotationAppearance,
  AnnotationExtent,
  AnnotationNode,
  BaseNodeProperties,
  CollectionNode,
  ContentMedium,
  ContentNode,
  TextAnnotationRepresentation,
  ModelAnnotationShape,
  ModelAttribute,
  ModelContext,
  NativeType,
  Node,
  NodeTypeOption,
} from "../models/types";
import type { AnnotationMapping, NativeShape } from "../editors/text/src";
import { getNativeTypeConfig, NATIVE_TYPES } from "../editors/text/src/config/constants";
import { initializeNodeIcons } from "../config/icons";
import { STRUCTURE_ANNOTATION_GROUP } from "../config/annotations";
import { formatFinding, type ParsedMisoConfig } from "../schemas/misoConfig.schema";
import { collectConfigWarnings } from "../utils/helper/configChecks";
import { BASE_NODE_REF } from "../config/ramen";
import {
  createModelContext,
  findShape,
  getClassifierRef,
  getContentMedium as getContentMediumOfType,
  getMappedAttributeNames,
  getNodeAttributes,
  getNodeTypeOption,
  getRefinements,
  getShapeConfig,
  getShapeProperties,
  getShapesForNode,
  getTextShapes,
  isRequired,
  getMissingReferences,
  getReferenceTargetRefs,
  isAllowedTarget,
  type MissingReference,
  refersToEntities,
  requiresReferences,
  resolveRelationRef,
  shapeRefOf,
} from "../utils/helper/modelHelper";
import { toEditorAppearance } from "../utils/helper/appearance";
import { TEXT_ANNOTATION_EDITOR_FIELDS } from "../utils/helper/instanceMapper";

/** Group for annotation types without a configured `group`.*/
const DEFAULT_ANNOTATION_GROUP = "other" as const;

/** The RAMEN base relation that places a Collection or Content in a Collection */
const PART_OF = "PART_OF";

const { initializeFilter } = useFilterStore();
/**
 * The model of the Miso config and its settings, read by the model lookups. Not deeply reactive: it
 * doesn't change after the initialization, and the RAMEN core model is a class instance.
 */
const modelContext = shallowRef<ModelContext>();
/** The annotation shapes Content nodes may carry, each once. Built on initialization. */
const textShapes = shallowRef<ModelAnnotationShape[]>([]);
const isInitialized = computed<boolean>(() => modelContext.value !== undefined);

const groupedAndSortedAnnotationShapes = shallowRef<Record<string, ModelAnnotationShape[]>>();

/**
 * The appearances of the text annotation shapes as the text editor reads them (property names instead of attribute
 * refs), by shape ref. Built once on initialization, since the editor looks them up for every annotation it renders.
 */
const editorAppearancesByRef = shallowRef<Map<string, AnnotationAppearance>>(new Map());

/** Mapping between the editor's native types and the project's annotation shapes. Built on initialization. */
const annotationMapping = shallowRef<AnnotationMapping>({ shapeByNative: {}, attrByNative: {} });

/** The native type of each mapped annotation shape, by shape ref. Inverse of `shapeByNative`. */
const nativeByShapeRef = computed<Map<string, NativeType>>(() => {
  const byRef = new Map<string, NativeType>();

  for (const [native, shape] of Object.entries(annotationMapping.value.shapeByNative)) {
    if (shape) {
      byRef.set(shapeRefOf(shape), native as NativeType);
    }
  }

  return byRef;
});

/**
 * Store for making the Miso config available to all components. When the app is mounted, the store is
 * initialized with the fetched Miso config. Model questions are answered by RAMEN core, the config of model elements
 * comes from `elements` and `editors.text.mappings`.
 *
 * Nodes are looked up by their classifier (`classifierRef`, see {@link getClassifierRef}), annotations by their
 * annotation shape (`shapeRef`, see {@link getAnnotationShape}). The `type` of an annotation is only its stored value.
 */
export function useConfigStore() {
  /**
   * Checks if an annotation type has constraints such as required properties, required references, or references to
   * entities.
   *
   * Used when the user clicks on an annotation button: with constraints, the annotation is created through the modal,
   * which only lets it through once it fulfils them.
   *
   * @param {ModelAnnotationShape} shape The annotation shape to check.
   * @returns {boolean} True if the annotation type has constraints.
   */
  function annotationHasConstraints(shape: ModelAnnotationShape): boolean {
    if (getShapeProperties(shape).some(isRequired)) {
      return true;
    }

    return requiresReferences(getModelContext(), shape) || refersToEntities(getModelContext(), shape);
  }

  /**
   * The required references an annotation is still missing, from the `REFERS_TO` rules of its annotation type.
   *
   * @param {AnnotationNode} annotation - The annotation.
   * @param {Node<BaseNodeProperties>[]} references - The nodes it currently refers to.
   * @returns {MissingReference[]} The unfulfilled rules, empty if complete or if the annotation type can't be resolved.
   */
  function getMissingAnnotationReferences(
    annotation: AnnotationNode,
    references: Node<BaseNodeProperties>[],
  ): MissingReference[] {
    const context: ModelContext = getModelContext();
    const shape: ModelAnnotationShape | undefined = getAnnotationShape(annotation);

    if (!shape) {
      return [];
    }

    const referencedRefs: string[] = references.flatMap((node) => getClassifierRef(context, node) ?? []);

    return getMissingReferences(context, shape, referencedRefs);
  }

  /**
   * Builds the mapping between the editor's native types/attributes and the project's annotation
   * shapes/properties from the `editors.text.mappings` of the config, whose attribute refs are resolved to the property
   * names. A native type mapped twice keeps its first mapping (the config check warns about it).
   *
   * @param {ModelContext} context - The model context to read the mappings from.
   * @returns {AnnotationMapping} The annotation mapping.
   */
  function buildAnnotationMapping(context: ModelContext): AnnotationMapping {
    const shapeByNative: Partial<Record<NativeType, ModelAnnotationShape>> = {};
    const attrByNative: Partial<Record<NativeType, Record<string, string>>> = {};

    for (const mapping of context.config.editors.text.mappings) {
      const shape: ModelAnnotationShape | undefined = findShape(context, mapping.annotation);

      if (!shape || shapeByNative[mapping.native]) {
        continue;
      }

      shapeByNative[mapping.native] = shape;
      attrByNative[mapping.native] = getMappedAttributeNames(context, mapping);
    }

    return { shapeByNative, attrByNative };
  }

  /**
   * Returns the extent of an annotation shape (`zeroPoint`/`range`). A shape mapped to a native type has the native
   * type's extent; otherwise the configured `editing.extent` is used, `range` if there is none.
   *
   * @param {ModelAnnotationShape} shape The annotation shape
   * @returns {AnnotationExtent} The resolved extent
   */
  function getAnnotationExtent(shape: ModelAnnotationShape): AnnotationExtent {
    const native: NativeType | undefined = getNativeType(shape);

    if (native) {
      return getNativeTypeConfig(native).extent;
    }

    return getShapeConfig(getModelContext(), shape)?.editing?.extent ?? "range";
  }

  /**
   * Returns how an annotation shape is represented in the text editor (`structure`/`inline`/`blockClassification`). A
   * shape mapped to a native type is always `structure`; otherwise the configured `editing.representation` is used,
   * `inline` if there is none.
   *
   * NOTE: this is the annotation's *classification*, distinct from {@linkcode getNativeType}, which returns
   * the tiptap node name of a structural shape.
   *
   * @param {ModelAnnotationShape} shape The annotation shape
   * @returns {TextAnnotationRepresentation} The resolved representation
   */
  function getAnnotationRepresentation(shape: ModelAnnotationShape): TextAnnotationRepresentation {
    if (getNativeType(shape)) {
      return "structure";
    }

    return getShapeConfig(getModelContext(), shape)?.editing?.representation ?? "inline";
  }

  /**
   * Retrieves the classifier refs of the node types listed in the hierarchy: the refinements of Collection and Content.
   * Empty before the config is loaded.
   *
   * @return {string[]} The qualified refs.
   */
  function getHierarchyClassifierRefs(): string[] {
    const context: ModelContext | undefined = modelContext.value;

    if (!context) {
      return [];
    }

    return [BASE_NODE_REF.Collection, BASE_NODE_REF.Content].flatMap((baseNodeRef) =>
      getRefinements(context, baseNodeRef).map(({ ref }) => ref),
    );
  }

  /**
   * Retrieves the node types new nodes of a base node can be created with: its refinements, sorted by name. With a
   * parent, only the types the model allows as `PART_OF` that parent.
   *
   * @param {string} baseNodeRef - One of `BASE_NODE_REF`.
   * @param {string | null} [partOfRef] - Classifier ref of the parent Collection. All refinements if omitted or `null`
   *   (top level, or a parent whose type can't be resolved).
   * @return {NodeTypeOption[]} The node types.
   */
  function getNodeTypeOptions(baseNodeRef: string, partOfRef: string | null = null): NodeTypeOption[] {
    const context: ModelContext = getModelContext();

    return getRefinements(context, baseNodeRef)
      .filter(({ ref }) => !partOfRef || resolveRelationRef(context, ref, PART_OF, partOfRef).ref !== null)
      .map(({ ref }) => getNodeTypeOption(context, ref))
      .toSorted((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Retrieves the node types of a base node an annotation may (still) refer to: the refinements that are or refine a
   * target of its annotation type's `REFERS_TO` rules whose upper bound isn't reached yet, sorted by name.
   *
   * @param {string} baseNodeRef - One of `BASE_NODE_REF` (Collection, Content or Entity).
   * @param {AnnotationNode} annotation - The annotation. If its annotation type can't be resolved, all refinements.
   * @param {string[]} [referencedRefs] - Classifier refs of the nodes the annotation already refers to, one per
   *   reference, see `getReferenceTargetRefs`.
   * @return {NodeTypeOption[]} The node types.
   */
  function getReferenceTypeOptions(
    baseNodeRef: string,
    annotation: AnnotationNode,
    referencedRefs: string[] = [],
  ): NodeTypeOption[] {
    const context: ModelContext = getModelContext();
    const shape: ModelAnnotationShape | undefined = getAnnotationShape(annotation);

    if (!shape) {
      return getNodeTypeOptions(baseNodeRef);
    }

    const targetRefs: string[] = getReferenceTargetRefs(context, shape, referencedRefs);

    return getRefinements(context, baseNodeRef)
      .filter(({ ref }) => isAllowedTarget(context, ref, targetRefs))
      .map(({ ref }) => getNodeTypeOption(context, ref))
      .toSorted((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Retrieves the medium of a Content node from its classifier: the nearest configured medium along its lineage.
   *
   * @param {ContentNode} content - The Content node.
   * @return {ContentMedium} The configured medium, `text` if none is configured or the node can't be resolved.
   */
  function getContentMedium(content: ContentNode): ContentMedium {
    const context: ModelContext | undefined = modelContext.value;
    const classifierRef: string | null = context ? getClassifierRef(context, content) : null;

    if (!context || !classifierRef) {
      return "text";
    }

    return getContentMediumOfType(context, classifierRef);
  }

  /**
   * Returns the editor-owned properties of a native type: each pairs the editor
   * `attribute` (the tiptap-native attr the editor needs, e.g. `level`) with the `property` (the
   * project's name for it). The property equals the attribute unless the project mapped it — e.g.
   * applying TEI semantics, `rows` instead of the native `rowspan`. `required` is taken from the native config.
   *
   * @param {NativeType} native The native type
   * @returns {{ property: string; attribute: string; required: boolean }[]} The editor-owned properties
   * @example
   * getEditorOwnedProperties("heading")
   *
   * // Could return (if configured)
   *
   * [{
   *    attribute: 'level',
   *    property: 'n',
   *    required: true,
   * }]
   */
  function getEditorOwnedProperties(native: NativeType): { property: string; attribute: string; required: boolean }[] {
    const propertyByAttribute: Readonly<Record<string, string>> = annotationMapping.value.attrByNative[native] ?? {};
    return getNativeTypeConfig(native).attributes.map((attribute) => ({
      attribute: attribute.name,
      property: propertyByAttribute[attribute.name] ?? attribute.name,
      required: attribute.bounds.lowerBound >= 1,
    }));
  }

  /**
   * Returns the model context for the model lookups. Only call this from code that runs after
   * {@linkcode initializeConfig}.
   *
   * @returns {ModelContext} The model of the Miso config and its settings.
   * @throws {Error} If the config has not been loaded yet.
   */
  function getModelContext(): ModelContext {
    if (!modelContext.value) {
      throw new Error("Config is not initialized");
    }

    return modelContext.value;
  }

  /**
   * Returns the attributes of a Collection, own and inherited, from its classifier. A Collection whose labels can't be
   * resolved gets the attributes of the RAMEN Collection node.
   *
   * @param {CollectionNode} collection - The Collection.
   * @returns {ModelAttribute[]} The attributes, most general first, without identity attributes like `uuid`.
   */
  function getCollectionAttributes(collection: CollectionNode): ModelAttribute[] {
    const context: ModelContext = getModelContext();

    return getNodeAttributes(context, getClassifierRef(context, collection) ?? BASE_NODE_REF.Collection);
  }

  /**
   * Returns the attributes of all Collection types, each name once (the first declaration wins). Used for filters and
   * sorting across types. With a parent, only the attributes of the Collection types allowed `PART_OF` it (see
   * {@linkcode getNodeTypeOptions}); the base Collection's attributes are always included.
   *
   * @param {string | null} [partOfRef] - Classifier ref of the parent Collection. All Collection types if omitted or
   *   `null`.
   * @returns {ModelAttribute[]} The attributes, without identity attributes like `uuid`.
   */
  function getAllCollectionAttributes(partOfRef: string | null = null): ModelAttribute[] {
    const context: ModelContext = getModelContext();
    const all: ModelAttribute[] = [
      ...getNodeAttributes(context, BASE_NODE_REF.Collection),
      ...getNodeTypeOptions(BASE_NODE_REF.Collection, partOfRef).flatMap(({ classifierRef }) =>
        getNodeAttributes(context, classifierRef, true),
      ),
    ];

    return all.filter((entry, position) => all.findIndex((other) => other.attribute.name === entry.attribute.name) === position);
  }

  /**
   * Returns the annotation shape of an annotation, from its `shapeRef`: resolved by the server for stored annotations,
   * set on creation, and by the text editor from the node's native type for its structural annotations.
   *
   * @param {AnnotationNode} annotation - The annotation.
   * @returns {ModelAnnotationShape | undefined} The shape, `undefined` for annotations without one (`shapeRef: null`
   *   for stored annotations the server couldn't resolve) or with a ref the model doesn't have.
   */
  function getAnnotationShape(annotation: AnnotationNode): ModelAnnotationShape | undefined {
    return annotation.shapeRef ? findShape(getModelContext(), annotation.shapeRef) : undefined;
  }

  /**
   * Returns the properties of an annotation's shape (without the shared ones like `uuid`).
   *
   * @param {AnnotationNode} annotation - The annotation.
   * @returns {ModelAttribute[]} The properties, empty if the annotation has no shape.
   */
  function getAnnotationProperties(annotation: AnnotationNode): ModelAttribute[] {
    const shape: ModelAnnotationShape | undefined = getAnnotationShape(annotation);

    return shape ? getShapeProperties(shape) : [];
  }

  /**
   * Returns the properties an annotation always keeps when its data are pruned to its shape's properties: the attributes
   * of its annotation node from the model (`uuid`, `type`, `selector` ...) and the text editor's fields (`text`,
   * `isZeroPoint`), which are not part of the model.
   *
   * @param {AnnotationNode} annotation - The annotation.
   * @returns {string[]} The property names.
   */
  function getAnnotationNodeProperties(annotation: AnnotationNode): string[] {
    const context: ModelContext = getModelContext();
    const classifierRef: string = getClassifierRef(context, annotation) ?? BASE_NODE_REF.Annotation;

    return [
      ...context.model.getAttributes(classifierRef).map((info) => info.name),
      ...Object.keys(TEXT_ANNOTATION_EDITOR_FIELDS),
    ];
  }

  /**
   * Returns the appearance of a text annotation shape as the text editor reads it, see {@linkcode toEditorAppearance}.
   * Passed to the text editor, which renders highlights and markers from it.
   *
   * @param {string} shapeRef - The ref of the annotation shape.
   * @returns {AnnotationAppearance | undefined} The appearance, if one is configured.
   */
  function getTextAnnotationAppearance(shapeRef: string): AnnotationAppearance | undefined {
    return editorAppearancesByRef.value.get(shapeRef);
  }

  /**
   * Returns the configured shortcuts of the text annotation shapes. Passed to the text editor, which binds them.
   *
   * @returns {Record<string, string>} The shape ref per shortcut in keymap notation, e.g. `Mod-Shift-e`. If a
   *   shortcut is configured for several shapes, the last one wins (the config check warns about it).
   */
  function getAnnotationShortcuts(): Record<string, string> {
    const context: ModelContext = getModelContext();
    const shortcuts: Record<string, string> = {};

    for (const shape of textShapes.value) {
      const shortcut: string | undefined = getShapeConfig(context, shape)?.controls?.shortcut;

      if (shortcut) {
        shortcuts[shortcut] = shapeRefOf(shape);
      }
    }

    return shortcuts;
  }

  /**
   * Builds the editor appearances of the text annotation shapes, see {@linkcode toEditorAppearance}.
   *
   * @param {ModelContext} context - The model context.
   * @returns {Map<string, AnnotationAppearance>} The appearances by shape ref; shapes without a configured appearance
   *   are left out.
   */
  function collectEditorAppearances(context: ModelContext): Map<string, AnnotationAppearance> {
    const byRef = new Map<string, AnnotationAppearance>();

    for (const shape of textShapes.value) {
      const appearance: AnnotationAppearance | undefined = getShapeConfig(context, shape)?.appearance;

      if (appearance) {
        byRef.set(shapeRefOf(shape), toEditorAppearance(shape, appearance));
      }
    }

    return byRef;
  }

  /**
   * Returns the annotation shapes a Collection may carry, from its classifier (the ones of the RAMEN Collection node
   * included).
   *
   * @param {CollectionNode} collection - The Collection.
   * @returns {ModelAnnotationShape[]} The shapes, each once.
   */
  function getCollectionAnnotationShapes(collection: CollectionNode): ModelAnnotationShape[] {
    const context: ModelContext = getModelContext();
    const classifierRef: string | null = getClassifierRef(context, collection);
    const carrierRefs: string[] = classifierRef ? [BASE_NODE_REF.Collection, classifierRef] : [BASE_NODE_REF.Collection];
    const shapes = new Map<string, ModelAnnotationShape>();

    for (const shape of carrierRefs.flatMap((ref) => getShapesForNode(context, ref))) {
      shapes.set(shapeRefOf(shape), shape);
    }

    return [...shapes.values()];
  }

  /**
   * Returns the nesting priority of a structural annotation shape, from the rules of its native type.
   *
   * @param {ModelAnnotationShape} shape The annotation shape
   * @returns {number} The priority (higher is more outer), `0` for shapes not mapped to a native type
   */
  function getPriority(shape: ModelAnnotationShape): number {
    const native: NativeType | undefined = getNativeType(shape);

    return native ? getNativeTypeConfig(native).priority : 0;
  }

  /**
   * Returns the native types with the annotation shapes mapped to them. Every native type is mapped (enforced
   * by `checkConfig`).
   *
   * @returns {NativeShape[]} The native types and their shapes.
   */
  function getNativeShapes(): NativeShape[] {
    return NATIVE_TYPES.flatMap((native: NativeType): NativeShape[] => {
      const shape: ModelAnnotationShape | undefined = getShapeOfNative(native);

      return shape ? [{ native, shape }] : [];
    });
  }

  /**
   * Returns the native type (tiptap node type) an annotation shape is mapped to.
   *
   * Complementary function of {@linkcode getShapeOfNative}.
   *
   * @param {ModelAnnotationShape} shape The annotation shape
   * @returns {NativeType | undefined} The native type (e.g. `paragraph`), `undefined` if the shape isn't mapped
   */
  function getNativeType(shape: ModelAnnotationShape): NativeType | undefined {
    return nativeByShapeRef.value.get(shapeRefOf(shape));
  }

  /**
   * Returns the annotation shape mapped to a native type.
   *
   * Complementary function of {@linkcode getNativeType}.
   *
   * @param {string} native The native type, usually a tiptap node type name (e.g. `paragraph`)
   * @returns {ModelAnnotationShape | undefined} The shape, `undefined` for node types that aren't native types
   */
  function getShapeOfNative(native: string): ModelAnnotationShape | undefined {
    return annotationMapping.value.shapeByNative[native as NativeType];
  }

  /**
   * Groups the text annotation shapes by their configured `group`. Shapes mapped to a native type are always
   * in {@linkcode STRUCTURE_ANNOTATION_GROUP}, like their representation is always `structure`.
   *
   * @return {Record<string, ModelAnnotationShape[]>} The annotation shapes by group.
   */
  function groupAnnotationShapes(): Record<string, ModelAnnotationShape[]> {
    const grouped: Record<string, ModelAnnotationShape[]> = {};

    for (const shape of textShapes.value) {
      const category: string = getNativeType(shape)
        ? STRUCTURE_ANNOTATION_GROUP
        : getShapeConfig(getModelContext(), shape)?.group ?? DEFAULT_ANNOTATION_GROUP;

      grouped[category] = [...(grouped[category] ?? []), shape];
    }

    return grouped;
  }

  /**
   * Initializes the store with the Miso config, logs the warnings of its checks and initializes the filter store.
   *
   * @param {ParsedMisoConfig} parsed - The validated Miso config, its imported model and the warnings of its checks.
   * @return {void} This function does not return anything.
   */
  function initializeConfig(parsed: ParsedMisoConfig): void {
    const context: ModelContext = createModelContext(parsed.config, parsed.model);

    parsed.warnings.forEach((warning) => console.warn(`Miso config: ${warning}`));
    collectConfigWarnings(context).forEach((finding) => console.warn(`Miso config: ${formatFinding(finding)}`));
    modelContext.value = context;
    textShapes.value = getTextShapes(context);
    editorAppearancesByRef.value = collectEditorAppearances(context);

    initializeNodeIcons(context);

    // Must be set before the shapes are grouped, since mapped shapes are always structural
    annotationMapping.value = buildAnnotationMapping(context);
    groupedAndSortedAnnotationShapes.value = sortAnnotationShapesInGroup(groupAnnotationShapes());

    initializeFilter(textShapes.value.map(shapeRefOf));
  }

  /**
   * Returns whether an annotation is a zero-point annotation, based on its shape's extent.
   * Configuration always beats instance data here; if it is configured as zero point, it will be treated
   * as zero point and it's `isZeroPoint` property will be updated to `true` on the next save.
   *
   * @param annotation - The annotation to check.
   * @returns {boolean} `true` if the annotation is a zero-point annotation, `false` otherwise (also without a shape).
   */
  function isZeroPoint(annotation: AnnotationNode): boolean {
    const shape: ModelAnnotationShape | undefined = getAnnotationShape(annotation);

    return shape !== undefined && getAnnotationExtent(shape) === "zeroPoint";
  }

  /**
   * Sorts the annotation shapes of each group alphabetically by their type.
   *
   * @param {Record<string, ModelAnnotationShape[]>} grouped - The annotation shapes by group.
   * @return {Record<string, ModelAnnotationShape[]>} The annotation shapes by group, sorted by type.
   */
  function sortAnnotationShapesInGroup(grouped: Record<string, ModelAnnotationShape[]>): Record<string, ModelAnnotationShape[]> {
    return Object.fromEntries(
      Object.entries(grouped).map(([category, shapes]) => [category, shapes.toSorted((a, b) => a.type.localeCompare(b.type))]),
    );
  }

  return {
    annotationHasConstraints,
    getAllCollectionAttributes,
    getAnnotationExtent,
    getAnnotationRepresentation,
    getAnnotationShortcuts,
    getAnnotationNodeProperties,
    getAnnotationProperties,
    getAnnotationShape,
    getCollectionAnnotationShapes,
    getCollectionAttributes,
    getContentMedium,
    getEditorOwnedProperties,
    getModelContext,
    getHierarchyClassifierRefs,
    getNativeShapes,
    getNativeType,
    getNodeTypeOptions,
    getReferenceTypeOptions,
    getMissingAnnotationReferences,
    getPriority,
    getShapeOfNative,
    getTextAnnotationAppearance,
    groupedAndSortedAnnotationShapes,
    initializeConfig,
    isInitialized: readonly(isInitialized),
    isZeroPoint,
  };
}
