import { computed, readonly, ref, shallowRef } from "vue";
import { useFilterStore } from "./filter";
import { useShortcutsStore } from "./shortcuts";
import {
  AnnotationExtent,
  AnnotationNode,
  AnnotationShapeConfig,
  AppearanceOverride,
  BaseNodeLabel,
  BuiltinStructuralType,
  CollectionNode,
  ContentMedium,
  ContentNode,
  TextAnnotationRepresentation,
  ModelAnnotationShape,
  ModelAttribute,
  ModelContext,
  NodeStatusObject,
  NodeTypeOption,
} from "../models/types";
import type { AnnotationMapping } from "../editors/text/src";
import type { NativeTypeConfig, StructuralType } from "../editors/text/src/models/types";
import { BUILTIN_STRUCTURAL_CONFIGS, BUILTIN_STRUCTURAL_NESTING } from "../editors/text/src/config/constants";
import { DEFAULT_ANNOTATION_MAPPING } from "../editors/text/src/config/editor";
import { initializeNodeIcons } from "../config/icons";
import { STRUCTURE_ANNOTATION_GROUP } from "../config/annotations";
import type { ParsedMisoConfig } from "../schemas/misoConfig.schema";
import { BASE_NODE_REF } from "../config/ramen";
import {
  createModelContext,
  findShape,
  getClassifierRef,
  getContentMedium as getContentMediumOfType,
  getNodeAttributes,
  getNodeTypeOption,
  getOptions,
  getRefinements,
  getShapeConfig,
  getShapeProperties,
  getShapesForNode,
  isRequired,
  getMissingReferences,
  getReferenceTargetRefs,
  isAllowedTarget,
  isAnnotationNode,
  type MissingReference,
  refersToEntities,
  requiresReferences,
  resolveRelationRef,
  resolveShapeRef,
  shapeRefOf,
} from "../utils/helper/modelHelper";

/** Group for annotation types without a configured `miso.group`.*/
const DEFAULT_ANNOTATION_GROUP = "other" as const;

/** The RAMEN base relation that places a Collection or Content in a Collection */
const PART_OF = "PART_OF";

const { initializeFilter } = useFilterStore();
const { parseShortcut } = useShortcutsStore();
/**
 * The model of the Miso config and its settings, read by the accessors in `modelHelper.ts`. Not deeply reactive: it
 * doesn't change after the initialization, and the RAMEN core model is a class instance.
 */
const modelContext = shallowRef<ModelContext>();
/**
 * The annotation shapes Content nodes may carry, by type. Built once on initialization, since the editor looks them up
 * for every annotation it renders. Name matching, until the lookups use IDs.
 */
const textShapesByType = shallowRef<Map<string, ModelAnnotationShape>>(new Map());
const isFetching = ref<boolean>(false);
const error = ref<Error | null>(null);
const isInitialized = computed<boolean>(() => modelContext.value !== undefined && !isFetching.value);

const groupedAnnotationTypes = shallowRef<Record<string, ModelAnnotationShape[]>>();
const availableCollectionLabels = ref<string[]>([]);
const availableEntityLabels = ref<string[]>([]);
const availableTextLabels = ref<string[]>([]);
const groupedAndSortedAnnotationTypes = shallowRef<Record<string, ModelAnnotationShape[]>>();

/** The structural annotation types of the project and their editor node types. Rebuilt when the mapping changes. */
const structuralTypes = ref<StructuralType[]>([]);

/**
 * Mapping between default and project-specific structural annotations.
 *
 * Is {@linkcode DEFAULT_ANNOTATION_MAPPING} at first, but gets replaced with project-specific mapping via
 * {@linkcode setAnnotationMapping}
 */
const annotationMapping = ref<AnnotationMapping>(DEFAULT_ANNOTATION_MAPPING);

/** Inverse of the `typeByRole` key in the config (project type name -> built-in role)
 *
 * @example
 * {
 *    "p": "paragraph",
 *    "lb": "hardBreak"
 * }
 */
const roleByType = computed<Record<string, BuiltinStructuralType>>(() => {
  const out: Record<string, BuiltinStructuralType> = {};

  for (const role of Object.keys(annotationMapping.value.typeByRole) as BuiltinStructuralType[]) {
    const projectType: string | undefined = annotationMapping.value.typeByRole[role];

    if (projectType !== undefined) {
      out[projectType] = role;
    }
  }

  return out;
});

/**
 * Store for making the Miso config available to all components. When the app is mounted, the store is
 * initialized with the fetched Miso config. Model questions are answered by RAMEN core (see `modelHelper.ts`), the
 * config of model elements comes from `ext.miso` and `miso.editors.text.mappings`. The store is static, meaning that no properties are changed after
 * the initialization. Other stores (filter.ts) are derived from this store.
 *
 * Nodes are looked up by their classifier (`classifierRef`, see `getClassifierRef` in `modelHelper.ts`), annotations
 * by their `shapeRef`. Text annotation types are still matched by `type`, which is the editor's key.
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
    // TODO: The subType field requires a lot of hacks -> Refactor later
    if (getShapeProperties(shape).some((entry) => isRequired(entry) && entry.attribute.name !== "subType")) {
      return true;
    }

    return requiresReferences(getModelContext(), shape) || refersToEntities(getModelContext(), shape);
  }

  /**
   * The required references an annotation is still missing, from the `REFERS_TO` rules of its annotation type.
   *
   * @param {AnnotationNode} annotation - The annotation.
   * @param {NodeStatusObject[]} connectedNodes - Its connected nodes; removed ones and annotations are not counted.
   * @returns {MissingReference[]} The unfulfilled rules, empty if complete or if the annotation type can't be resolved.
   */
  function getMissingAnnotationReferences(annotation: AnnotationNode, connectedNodes: NodeStatusObject[]): MissingReference[] {
    const context: ModelContext = getModelContext();
    const shape: ModelAnnotationShape | undefined = getAnnotationShape(annotation);

    if (!shape) {
      return [];
    }

    const referencedRefs: string[] = connectedNodes
      .filter((node) => node.meta.status !== "deleted" && node.meta.status !== "removed" && !isAnnotationNode(context, node))
      .flatMap((node) => getClassifierRef(context, node.node) ?? []);

    return getMissingReferences(context, shape, referencedRefs);
  }

  /**
   * Builds the mapping between the editor's native structural types/attributes and the project's annotation
   * types/properties. Starts from the default mapping in {@linkcode DEFAULT_ANNOTATION_MAPPING} and overrides it with
   * the `miso.editors.text.mappings` of the config.
   *
   * @param {ModelContext} context - The model context to read the mappings from.
   * @returns {AnnotationMapping} The annotation mapping.
   */
  function buildAnnotationMapping(context: ModelContext): AnnotationMapping {
    const typeByRole: Partial<Record<BuiltinStructuralType, string>> = { ...DEFAULT_ANNOTATION_MAPPING.typeByRole };
    const attrByRole: Partial<Record<BuiltinStructuralType, Record<string, string>>> = {
      ...DEFAULT_ANNOTATION_MAPPING.attrByRole,
    };

    for (const mapping of context.config.miso.editors.text.mappings) {
      const shape: ModelAnnotationShape | undefined = findShape(context, mapping.annotation);

      if (!shape) {
        console.warn(`Miso config: mapping of "${mapping.native}" points to an unknown annotation shape "${mapping.annotation}"`);
        continue;
      }

      typeByRole[mapping.native] = shape.type;
      attrByRole[mapping.native] = { ...attrByRole[mapping.native], ...mapping.attributes };
    }

    return { typeByRole, attrByRole };
  }

  /**
   * Builds the structural annotation types: every built-in type under its project name (via the active mapping), plus
   * the project's text annotation types that are represented as structure without a native type.
   *
   * @returns {StructuralType[]} The structural types.
   */
  function buildStructuralTypes(): StructuralType[] {
    const builtins: StructuralType[] = BUILTIN_STRUCTURAL_CONFIGS.map((config: NativeTypeConfig) => ({
      type: getAnnotationType(config.type),
      editorRole: config.type,
    }));
    const custom: StructuralType[] = [...textShapesByType.value.values()]
      .filter((shape) => !builtins.some((b) => b.type === shape.type))
      .filter((shape) => getShapeConfig(shape)?.editing?.representation === "structure")
      .map((shape) => ({ type: shape.type, editorRole: shape.type }));

    return [...builtins, ...custom];
  }

  /**
   * Returns the extent of an annotation type (`zeroPoint`/`range`), computed on demand. A built-in mapping
   * uses the built-in's canonical extent; otherwise the configured `miso.editing.extent` is used.
   * Unknown/collection types degrade to `range`.
   *
   * @param {string} type The project annotation type
   * @returns {AnnotationExtent} The resolved extent
   */
  function getAnnotationExtent(type: string): AnnotationExtent {
    if (isBuiltinStructuralType(type)) {
      return getBuiltinExtent(type);
    }

    const extent: AnnotationExtent | undefined = getTextAnnotationConfig(type)?.editing?.extent;

    if (!extent) {
      console.error('No extent found for annotation type "' + type + '"');
    }

    return extent ?? "range";
  }

  /**
   * Returns how an annotation type is represented in the text editor (`structure`/`inline`/`blockClassification`),
   * computed on demand from the config. A built-in mapping always wins (early return); otherwise the configured
   * `miso.editing.representation` is used. Unknown/collection types degrade to `inline`.
   *
   * NOTE: this is the annotation's *classification*, distinct from {@linkcode getEditorRole}, which returns
   * the tiptap node name of a structural type.
   *
   * @param {string} type The project annotation type
   * @returns {TextAnnotationRepresentation} The resolved representation
   */
  function getAnnotationRepresentation(type: string): TextAnnotationRepresentation {
    if (isBuiltinStructuralType(type)) {
      return "structure";
    }

    const representation: TextAnnotationRepresentation | undefined = getTextAnnotationConfig(type)?.editing?.representation;

    if (!representation) {
      console.error('No representation found for annotation type "' + type + '"');
    }

    return representation ?? "inline";
  }

  /**
   * Returns the project annotation type name for a given editor role, via the active annotation mapping.
   *
   * E.g. `getAnnotationType('paragraph')` returns "p" when the mapping binds `paragraph -> 'p'`.
   * Falls back to the role itself if not mapped.
   *
   * Complementary function of {@linkcode getEditorRole}.
   *
   * @param {string} editorRole The editor role (e.g. `bulletList`)
   * @returns {string} The project annotation type (e.g. `list`) if mapped, else the given role
   */
  function getAnnotationType(editorRole: string): string {
    return annotationMapping.value.typeByRole[editorRole as BuiltinStructuralType] ?? editorRole;
  }

  /**
   * Retrieves the available labels that can be assigned to a Collection node.
   *
   * @return {string[]} The available labels.
   */
  function getAvailableCollectionLabels(): string[] {
    return modelContext.value ? getRefinements(modelContext.value, BASE_NODE_REF.Collection).map(({ node }) => node.name) : [];
  }

  /**
   * Retrieves the available labels that can be assigned to a a Content node.
   *
   * @return {string[]} The available labels.
   */
  function getAvailableContentLabels(): string[] {
    return modelContext.value ? getRefinements(modelContext.value, BASE_NODE_REF.Content).map(({ node }) => node.name) : [];
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
   * Retrieves the available labels that can be assigned to a an Entity node.
   *
   * @return {string[]} The available labels.
   */
  function getAvailableEntityLabels(): string[] {
    return modelContext.value ? getRefinements(modelContext.value, BASE_NODE_REF.Entity).map(({ node }) => node.name) : [];
  }

  /**
   * Retrieves the available labels that can be assigned to a node with given base type.
   *
   * Convenience wrapper for when only the base node label is known.
   *
   * @return {string[]} The available labels.
   */
  function getAvailableNodeLabels(baseLabel: BaseNodeLabel): string[] {
    switch (baseLabel) {
      case "Collection":
        return availableCollectionLabels.value;
      case "Entity":
        return availableEntityLabels.value;
      case "Content":
        return availableTextLabels.value;
      default:
        return [];
    }
  }

  /**
   * Canonical extent of the built-in editor role that `type` maps to (via the mapping). Used to force
   * a type that maps to a built-in onto the built-in's extent (e.g. a `lb` mapped to `hardBreak` is
   * always zero-point).
   *
   * @param {string} type The project annotation type
   * @returns {AnnotationExtent} The built-in's canonical extent (defaults to `range`)
   */
  function getBuiltinExtent(type: string): AnnotationExtent {
    const editorRole: string = getEditorRole(type);

    return BUILTIN_STRUCTURAL_CONFIGS.find((c) => c.type === editorRole)?.extent ?? "range";
  }

  /**
   * Returns the editor-owned properties of a structural annotation type: each pairs the editor
   * `attribute` (the tiptap-native attr the editor needs, e.g. `level`) with the `property` (the
   * project's name for it). The property equals the attribute unless the project mapped it — e.g.
   * applying TEI semantics, `rows` instead of the native `rowspan`. `required` is taken from the built-in config.
   *
   * @param {string} annotationType The project (configured) structural annotation type
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
  function getEditorOwnedProperties(annotationType: string): { property: string; attribute: string; required: boolean }[] {
    const editorRole: string = getEditorRole(annotationType);
    const propertyByAttribute: Record<string, string> =
      annotationMapping.value.attrByRole[editorRole as BuiltinStructuralType] ?? {};

    const config: NativeTypeConfig | undefined = BUILTIN_STRUCTURAL_CONFIGS.find((c) => c.type === editorRole);

    return (config?.attributes ?? []).map((attribute) => ({
      attribute: attribute.name,
      property: propertyByAttribute[attribute.name] ?? attribute.name,
      required: attribute.bounds.lowerBound >= 1,
    }));
  }

  /**
   * Returns the editor role (the built-in structural type / tiptap node type) for a given project
   * annotation type, via the active annotation mapping.
   *
   * E.g. `getEditorRole('p')` returns "paragraph" when the mapping binds `paragraph -> 'p'`.
   * Falls back to the type itself (built-in used by its own name, or a custom type).
   *
   * Complementary function of {@linkcode getAnnotationType}.
   *
   * @param {string} annotationType The project annotation type (e.g. `p`, `list`)
   * @returns {string} The editor role (e.g. `paragraph`, `bulletList`) if mapped, else the type
   */
  function getEditorRole(annotationType: string): string {
    return roleByType.value[annotationType] ?? annotationType;
  }

  /**
   * Returns the model context for the accessors in `modelHelper.ts`. Only call this from code that runs after
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
   * Returns the properties of the text annotations with the given type (without the shared ones like `uuid`).
   *
   * @param {string} type - The type of the annotation.
   * @returns {ModelAttribute[]} The properties, empty if no Content node carries that type.
   */
  function getTextAnnotationProperties(type: string): ModelAttribute[] {
    const shape: ModelAnnotationShape | undefined = getTextAnnotationShape(type);

    return shape ? getShapeProperties(shape) : [];
  }

  /**
   * Returns the annotation shape of an annotation, from its `shapeRef` (resolved by the server, or set on creation).
   * The text editor keys annotations by `type` and doesn't carry the ref (structural annotations are rebuilt, and their
   * type can change), so without a matching ref the text annotation type decides, see {@linkcode getTextAnnotationShape}.
   *
   * @param {AnnotationNode} annotation - The annotation.
   * @returns {ModelAnnotationShape | undefined} The shape, `undefined` for stored annotations that couldn't be resolved
   *   (`shapeRef: null`) or unknown types.
   */
  function getAnnotationShape(annotation: AnnotationNode): ModelAnnotationShape | undefined {
    const byRef: ModelAnnotationShape | undefined = annotation.shapeRef
      ? findShape(getModelContext(), annotation.shapeRef)
      : undefined;

    if (byRef?.type === annotation.data.type) {
      return byRef;
    } else if (annotation.shapeRef === null) {
      return undefined;
    } else {
      return getTextAnnotationShape(annotation.data.type);
    }
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
   * Returns the annotation shape of the text annotations with the given type, i.e. one a Content node may carry. The
   * type is the text editor's key for annotation types; with an annotation at hand, use {@linkcode getAnnotationShape}.
   *
   * @param {string} type - The type of the annotation.
   * @returns {ModelAnnotationShape | undefined} The shape, `undefined` if no Content node carries that type.
   */
  function getTextAnnotationShape(type: string): ModelAnnotationShape | undefined {
    return textShapesByType.value.get(type);
  }

  /**
   * Returns the config of the text annotations with the given type.
   *
   * @param {string} type - The type of the annotation.
   * @returns {AnnotationShapeConfig | undefined} The `ext.miso` block of the shape, if there is one.
   */
  function getTextAnnotationConfig(type: string): AnnotationShapeConfig | undefined {
    const shape: ModelAnnotationShape | undefined = getTextAnnotationShape(type);

    return shape ? getShapeConfig(shape) : undefined;
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
   * Returns the annotation shape of a new annotation with the given type on a Collection, resolved from the
   * Collection's classifier and the type. Existing annotations have theirs in `shapeRef`, see
   * {@linkcode getAnnotationShape}.
   *
   * @param {CollectionNode} collection - The Collection.
   * @param {string} type - The type of the annotation.
   * @returns {ModelAnnotationShape | undefined} The shape, `undefined` if the Collection can't carry that type.
   */
  function findCollectionAnnotationShape(collection: CollectionNode, type: string): ModelAnnotationShape | undefined {
    const context: ModelContext = getModelContext();
    const shapeRef: string | null = resolveShapeRef(
      context,
      getClassifierRef(context, collection) ?? BASE_NODE_REF.Collection,
      type,
    ).ref;

    return shapeRef ? findShape(context, shapeRef) : undefined;
  }

  /**
   * Returns the nesting priority of a structural annotation type, from the rules of its built-in type.
   *
   * @param {string} type The project annotation type
   * @returns {number} The priority (higher is more outer), `0` for types without a built-in type
   */
  function getPriorityForType(type: string): number {
    return BUILTIN_STRUCTURAL_NESTING[getEditorRole(type) as BuiltinStructuralType]?.priority ?? 0;
  }

  /**
   * Checks if an annotation type is structural: a built-in type (under its project name) or a project type
   * represented as structure.
   *
   * @param {string} type The project annotation type
   * @returns {boolean} `true` if the type is structural
   */
  function isStructuralType(type: string): boolean {
    return structuralTypes.value.some((structural) => structural.type === type);
  }

  /**
   * Collects the annotation shapes Content nodes may carry, by type. A second shape with the same type is left out,
   * since name matching couldn't tell them apart.
   *
   * @param {ModelContext} context - The model context.
   * @returns {Map<string, ModelAnnotationShape>} The shapes by type.
   */
  function collectTextShapes(context: ModelContext): Map<string, ModelAnnotationShape> {
    const byType = new Map<string, ModelAnnotationShape>();
    const carrierRefs: string[] = [
      BASE_NODE_REF.Content,
      ...getRefinements(context, BASE_NODE_REF.Content).map(({ ref }) => ref),
    ];

    for (const shape of carrierRefs.flatMap((ref) => getShapesForNode(context, ref))) {
      const existing: ModelAnnotationShape | undefined = byType.get(shape.type);

      if (!existing) {
        byType.set(shape.type, shape);
      } else if (shapeRefOf(existing) !== shapeRefOf(shape)) {
        console.warn(`Miso config: a second annotation shape with type "${shape.type}" is left out (${shapeRefOf(shape)})`);
      }
    }

    return byType;
  }

  /**
   * Groups the text annotation types by their configured `ext.miso.group`. Types mapped to a built-in structural type
   * are always in {@linkcode STRUCTURE_ANNOTATION_GROUP}, like their representation is always `structure`.
   *
   * @return {Record<string, ModelAnnotationShape[]>} The annotation shapes by group.
   */
  function groupAnnotationTypes(): Record<string, ModelAnnotationShape[]> {
    const grouped: Record<string, ModelAnnotationShape[]> = {};

    for (const shape of textShapesByType.value.values()) {
      const category: string = isBuiltinStructuralType(shape.type)
        ? STRUCTURE_ANNOTATION_GROUP
        : getShapeConfig(shape)?.group ?? DEFAULT_ANNOTATION_GROUP;

      grouped[category] = [...(grouped[category] ?? []), shape];
    }

    return grouped;
  }

  /**
   * Initializes the store with the Miso config and initializes the filter store.
   *
   * @param {ParsedMisoConfig} parsed - The validated Miso config and its imported model.
   * @return {void} This function does not return anything.
   */
  function initializeConfig(parsed: ParsedMisoConfig): void {
    const context: ModelContext = createModelContext(parsed.config, parsed.model);

    modelContext.value = context;
    textShapesByType.value = collectTextShapes(context);

    validateConfig(context);
    initializeNodeIcons(context);

    // Must be set before the structural types are built, since they are keyed by the project's type names
    annotationMapping.value = buildAnnotationMapping(context);
    structuralTypes.value = buildStructuralTypes();
    groupedAnnotationTypes.value = groupAnnotationTypes();
    groupedAndSortedAnnotationTypes.value = sortAnnotationTypesInGroup();
    availableCollectionLabels.value = getAvailableCollectionLabels();
    availableEntityLabels.value = getAvailableEntityLabels();
    availableTextLabels.value = getAvailableContentLabels();

    initializeFilter([...textShapesByType.value.keys()]);
  }

  /**
   * Checks if the given annotation type maps to one of the built-in structural types when set in the configuration.
   *
   * E.g. if the project has renamed 'paragraph' to 'p' in the configuration, this function returns true for 'paragraph'.
   *
   * @param {string} annotationType The annotation type
   * @returns {boolean} True if the annotation type maps to one of the built-in structural types, `false` if otherwise
   */
  function isBuiltinStructuralType(annotationType: string): boolean {
    const editorRole: string = getEditorRole(annotationType);

    return BUILTIN_STRUCTURAL_CONFIGS.some((c) => c.type === editorRole);
  }

  /**
   * Checks if the given annotation type is known to the editor: either it maps to one of the built-in structural
   * types or a Content node may carry it according to the model.
   *
   * Used to check the annotation validity during document parsing on load.
   *
   * @param {string} annotationType The annotation type
   * @returns {boolean} `true` if the annotation type is built-in or modelled, `false` otherwise
   */
  function isConfiguredAnnotationType(annotationType: string): boolean {
    return isBuiltinStructuralType(annotationType) || textShapesByType.value.has(annotationType);
  }

  /**
   * Returns whether an annotation is a zero-point annotation, based on its type's configured extent.
   * Configuration always beats instance data here; if it is configured as zero point, it will be treated
   * as zero point and it's `isZeroPoint` property will be updated to `true` on the next save.
   *
   * @param annotation - The annotation to check.
   * @returns {boolean} `true` if the annotation is a zero-point annotation, `false` otherwise.
   */
  function isZeroPoint(annotation: AnnotationNode): boolean {
    return getAnnotationExtent(annotation.data.type) === "zeroPoint";
  }

  /**
   * Sets the active annotation mapping (project names <-> built-in editor roles/attributes) and
   * rebuilds the structural types and the toolbar groups so the renames take effect. On load, the mapping is built
   * from the `miso.editors.text.mappings` of the config; this function replaces it afterwards.
   *
   * @param {AnnotationMapping} mapping - The annotation mapping to apply.
   * @return {void} This function does not return anything.
   */
  function setAnnotationMapping(mapping: AnnotationMapping): void {
    annotationMapping.value = mapping;
    structuralTypes.value = buildStructuralTypes();
    groupedAnnotationTypes.value = groupAnnotationTypes();
    groupedAndSortedAnnotationTypes.value = sortAnnotationTypesInGroup();
  }

  /**
   * Sorts each group of annotation types alphabetically by their type within their respective category.
   *
   * @return {Record<string, ModelAnnotationShape[]>} The annotation shapes by group, sorted by type.
   */
  function sortAnnotationTypesInGroup(): Record<string, ModelAnnotationShape[]> {
    return Object.fromEntries(
      Object.entries(groupedAnnotationTypes.value ?? {}).map(([category, shapes]) => [
        category,
        shapes.toSorted((a, b) => a.type.localeCompare(b.type)),
      ]),
    );
  }

  /**
   * Checks the config of all annotation shapes for mistakes and logs a warning for each one found.
   * Invalid parts are not removed, they are just ignored where they don't apply.
   *
   * @param {ModelContext} context - The model context to validate.
   * @return {void} This function does not return anything.
   */
  function validateConfig(context: ModelContext): void {
    const warn = (type: string, message: string): void => {
      console.warn(`Invalid configuration for annotation type "${type}": ${message}`);
    };

    for (const shape of context.config.model.annotations) {
      const shapeConfig: AnnotationShapeConfig | undefined = getShapeConfig(shape);

      if (!shapeConfig) {
        continue;
      }

      // The mapping is not built yet, so the extent of a native type is read from its built-in config directly
      const native: string | undefined = context.config.miso.editors.text.mappings.find(
        (m) => m.annotation === shapeRefOf(shape),
      )?.native;
      const nativeExtent: AnnotationExtent | undefined = BUILTIN_STRUCTURAL_CONFIGS.find((c) => c.type === native)?.extent;
      const extent: AnnotationExtent = nativeExtent ?? shapeConfig.editing?.extent ?? "range";
      const appearances: [string, AppearanceOverride][] = [["ext.miso.appearance", shapeConfig.appearance ?? {}]];

      if (native && shapeConfig.group !== undefined && shapeConfig.group !== STRUCTURE_ANNOTATION_GROUP) {
        warn(
          shape.type,
          `ext.miso.group "${shapeConfig.group}" is ignored, types mapped to a built-in are always in "${STRUCTURE_ANNOTATION_GROUP}"`,
        );
      }

      (shapeConfig.appearance?.variants ?? []).forEach((variant, index) => {
        const property: ModelAttribute | undefined = getShapeProperties(shape).find(
          (entry) => entry.attribute.name === variant.property,
        );
        const options: string[] | undefined = property ? getOptions(context, property)?.map(String) : undefined;

        if (!property) {
          warn(
            shape.type,
            `"${variant.property}" in ext.miso.appearance.variants[${index}] is not a property of the annotation type`,
          );
        }

        for (const [value, override] of Object.entries(variant.values)) {
          const path: string = `ext.miso.appearance.variants[${index}].values.${value}`;

          if (options && !options.includes(value)) {
            warn(shape.type, `"${value}" in ${path} is not an option of the "${variant.property}" property`);
          }

          appearances.push([path, override]);
        }
      });

      for (const [path, appearance] of appearances) {
        if (extent === "range" && appearance.marker) {
          warn(shape.type, `${path}.marker only applies to zeroPoint annotations`);
        }

        if (extent === "zeroPoint" && appearance.highlight) {
          warn(shape.type, `${path}.highlight only applies to range annotations`);
        }
      }
    }

    // Shortcuts are only registered for the editor's annotation types
    const typesByShortcut = new Map<string, string[]>();

    for (const shape of textShapesByType.value.values()) {
      const shortcut: string | undefined = getShapeConfig(shape)?.controls?.shortcut;

      if (shortcut) {
        const normalized: string = parseShortcut(shortcut);
        typesByShortcut.set(normalized, [...(typesByShortcut.get(normalized) ?? []), shape.type]);
      }
    }

    for (const [shortcut, types] of typesByShortcut) {
      if (types.length > 1) {
        console.warn(`Shortcut "${shortcut}" is configured for multiple annotation types: ${types.join(", ")}`);
      }
    }
  }

  return {
    annotationHasConstraints,
    availableCollectionLabels,
    availableEntityLabels,
    availableTextLabels,
    error: readonly(error),
    getAllCollectionAttributes,
    getAnnotationExtent,
    getAnnotationRepresentation,
    getAnnotationType,
    getAvailableCollectionLabels,
    getAvailableContentLabels,
    getAvailableEntityLabels,
    getAvailableNodeLabels,
    findCollectionAnnotationShape,
    getAnnotationProperties,
    getAnnotationShape,
    getCollectionAnnotationShapes,
    getCollectionAttributes,
    getContentMedium,
    getEditorOwnedProperties,
    getEditorRole,
    getModelContext,
    getHierarchyClassifierRefs,
    getNodeTypeOptions,
    getReferenceTypeOptions,
    getMissingAnnotationReferences,
    getPriorityForType,
    getStructuralTypes: (): StructuralType[] => structuralTypes.value,
    getTextAnnotationConfig,
    getTextAnnotationProperties,
    getTextAnnotationShape,
    groupedAndSortedAnnotationTypes,
    groupedAnnotationTypes,
    initializeConfig,
    isBuiltinStructuralType,
    isConfiguredAnnotationType,
    isFetching: readonly(isFetching),
    isInitialized: readonly(isInitialized),
    isStructuralType,
    isZeroPoint,
    setAnnotationMapping,
  };
}
