import { computed, readonly, ref, shallowRef } from "vue";
import { useFilterStore } from "./filter";
import {
  AnnotationAppearance,
  AnnotationExtent,
  AnnotationNode,
  AnnotationShapeConfig,
  BaseNodeProperties,
  BuiltinStructuralType,
  CollectionNode,
  ContentMedium,
  ContentNode,
  TextAnnotationRepresentation,
  ModelAnnotationShape,
  ModelAttribute,
  ModelContext,
  Node,
  NodeTypeOption,
} from "../models/types";
import type { AnnotationMapping } from "../editors/text/src";
import type { NativeTypeConfig, StructuralType } from "../editors/text/src/models/types";
import { BUILTIN_STRUCTURAL_CONFIGS, BUILTIN_STRUCTURAL_NESTING } from "../editors/text/src/config/constants";
import { DEFAULT_ANNOTATION_MAPPING } from "../editors/text/src/config/editor";
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
  getTextShapesByType,
  isRequired,
  getMissingReferences,
  getReferenceTargetRefs,
  isAllowedTarget,
  type MissingReference,
  refersToEntities,
  requiresReferences,
  resolveRelationRef,
  resolveShapeRef,
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
/**
 * The annotation shapes Content nodes may carry, by type. Built once on initialization, since the editor looks them up
 * for every annotation it renders.
 */
const textShapesByType = shallowRef<Map<string, ModelAnnotationShape>>(new Map());
const isInitialized = computed<boolean>(() => modelContext.value !== undefined);

const groupedAndSortedAnnotationShapes = shallowRef<Record<string, ModelAnnotationShape[]>>();

/**
 * The appearances of the text annotation types as the text editor reads them (property names instead of attribute
 * refs), by type. Built once on initialization, since the editor looks them up for every annotation it renders.
 */
const editorAppearancesByType = shallowRef<Map<string, AnnotationAppearance>>(new Map());

/** The structural annotation types of the project and their editor node types. Rebuilt when the mapping changes. */
const structuralTypes = ref<StructuralType[]>([]);

/**
 * Mapping between default and project-specific structural annotations.
 *
 * Is {@linkcode DEFAULT_ANNOTATION_MAPPING} at first, and gets replaced with the project's mapping on initialization.
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
 * initialized with the fetched Miso config. Model questions are answered by RAMEN core, the config of model elements
 * comes from `elements` and `editors.text.mappings`.
 *
 * Nodes are looked up by their classifier (`classifierRef`, see {@link getClassifierRef}), annotations
 * by their `shapeRef`. Text annotation types are matched by `type`, which is the editor's key.
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
   * Builds the mapping between the editor's native structural types/attributes and the project's annotation
   * types/properties. Starts from the default mapping in {@linkcode DEFAULT_ANNOTATION_MAPPING} and overrides it with
   * the `editors.text.mappings` of the config, whose attribute refs are resolved to the property names.
   *
   * @param {ModelContext} context - The model context to read the mappings from.
   * @returns {AnnotationMapping} The annotation mapping.
   */
  function buildAnnotationMapping(context: ModelContext): AnnotationMapping {
    const typeByRole: Partial<Record<BuiltinStructuralType, string>> = { ...DEFAULT_ANNOTATION_MAPPING.typeByRole };
    const attrByRole: Partial<Record<BuiltinStructuralType, Record<string, string>>> = {
      ...DEFAULT_ANNOTATION_MAPPING.attrByRole,
    };

    for (const mapping of context.config.editors.text.mappings) {
      const shape: ModelAnnotationShape | undefined = findShape(context, mapping.annotation);

      if (!shape) {
        console.warn(`Miso config: mapping of "${mapping.native}" points to an unknown annotation shape "${mapping.annotation}"`);
        continue;
      }

      typeByRole[mapping.native] = shape.type;
      attrByRole[mapping.native] = { ...attrByRole[mapping.native], ...getMappedAttributeNames(context, mapping) };
    }

    return { typeByRole, attrByRole };
  }

  /**
   * Builds the structural annotation types: every built-in type under its project name (via the active mapping). Only
   * mapped shapes may be represented as structure (enforced by `checkConfig`).
   *
   * @returns {StructuralType[]} The structural types.
   */
  function buildStructuralTypes(): StructuralType[] {
    return BUILTIN_STRUCTURAL_CONFIGS.map((config: NativeTypeConfig) => ({
      type: getAnnotationType(config.type),
      editorRole: config.type,
    }));
  }

  /**
   * Returns the extent of an annotation type (`zeroPoint`/`range`), computed on demand. A built-in mapping
   * uses the built-in's canonical extent; otherwise the configured `editing.extent` is used.
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
   * `editing.representation` is used. Unknown/collection types degrade to `inline`.
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

    if (byRef?.type === annotation.properties.type) {
      return byRef;
    } else if (annotation.shapeRef === null) {
      return undefined;
    } else {
      return getTextAnnotationShape(annotation.properties.type);
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
   * @returns {AnnotationShapeConfig | undefined} The `elements.annotations` entry of the shape, if there is one.
   */
  function getTextAnnotationConfig(type: string): AnnotationShapeConfig | undefined {
    const shape: ModelAnnotationShape | undefined = getTextAnnotationShape(type);

    return shape ? getShapeConfig(getModelContext(), shape) : undefined;
  }

  /**
   * Returns the appearance of the text annotations with the given type as the text editor reads it, see
   * {@linkcode toEditorAppearance}. Passed to the text editor, which renders highlights and markers from it.
   *
   * @param {string} type - The type of the annotation.
   * @returns {AnnotationAppearance | undefined} The appearance, if one is configured.
   */
  function getTextAnnotationAppearance(type: string): AnnotationAppearance | undefined {
    return editorAppearancesByType.value.get(type);
  }

  /**
   * Returns the configured shortcuts of the text annotation types. Passed to the text editor, which binds them.
   *
   * @returns {Record<string, string>} The annotation type per shortcut in keymap notation, e.g. `Mod-Shift-e`. If a
   *   shortcut is configured for several types, the last one wins (the config check warns about it).
   */
  function getAnnotationShortcuts(): Record<string, string> {
    const context: ModelContext = getModelContext();
    const shortcuts: Record<string, string> = {};

    for (const [type, shape] of textShapesByType.value) {
      const shortcut: string | undefined = getShapeConfig(context, shape)?.controls?.shortcut;

      if (shortcut) {
        shortcuts[shortcut] = type;
      }
    }

    return shortcuts;
  }

  /**
   * Builds the editor appearances of the text annotation types, see {@linkcode toEditorAppearance}.
   *
   * @param {ModelContext} context - The model context.
   * @returns {Map<string, AnnotationAppearance>} The appearances by type; types without a configured appearance are
   *   left out.
   */
  function collectEditorAppearances(context: ModelContext): Map<string, AnnotationAppearance> {
    const byType = new Map<string, AnnotationAppearance>();

    for (const [type, shape] of textShapesByType.value) {
      const appearance: AnnotationAppearance | undefined = getShapeConfig(context, shape)?.appearance;

      if (appearance) {
        byType.set(type, toEditorAppearance(shape, appearance));
      }
    }

    return byType;
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
   * Groups the text annotation shapes by their configured `group`. Shapes whose type is mapped to a built-in structural
   * type are always in {@linkcode STRUCTURE_ANNOTATION_GROUP}, like their representation is always `structure`.
   *
   * @return {Record<string, ModelAnnotationShape[]>} The annotation shapes by group.
   */
  function groupAnnotationShapes(): Record<string, ModelAnnotationShape[]> {
    const grouped: Record<string, ModelAnnotationShape[]> = {};

    for (const shape of textShapesByType.value.values()) {
      const category: string = isBuiltinStructuralType(shape.type)
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
    textShapesByType.value = getTextShapesByType(context);
    editorAppearancesByType.value = collectEditorAppearances(context);

    initializeNodeIcons(context);

    // Must be set before the structural types are built, since they are keyed by the project's type names
    annotationMapping.value = buildAnnotationMapping(context);
    structuralTypes.value = buildStructuralTypes();
    groupedAndSortedAnnotationShapes.value = sortAnnotationShapesInGroup(groupAnnotationShapes());

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
    return getAnnotationExtent(annotation.properties.type) === "zeroPoint";
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
    getAnnotationType,
    findCollectionAnnotationShape,
    getAnnotationNodeProperties,
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
    getTextAnnotationAppearance,
    getTextAnnotationConfig,
    getTextAnnotationProperties,
    getTextAnnotationShape,
    groupedAndSortedAnnotationShapes,
    initializeConfig,
    isBuiltinStructuralType,
    isConfiguredAnnotationType,
    isInitialized: readonly(isInitialized),
    isStructuralType,
    isZeroPoint,
  };
}
