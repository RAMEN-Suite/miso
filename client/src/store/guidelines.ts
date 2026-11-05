import { computed, readonly, ref, shallowRef } from "vue";
import { useFilterStore } from "./filter";
import { useShortcutsStore } from "./shortcuts";
import {
  AnnotationExtent,
  AnnotationMisoConfig,
  AnnotationNode,
  AnnotationType,
  AppearanceOverride,
  BaseNodeLabel,
  BuiltinStructuralType,
  ContentMedium,
  NativeTypeMapping,
  PropertyConfig,
  TextAnnotationRepresentation,
} from "../models/types";
import type { AnnotationMapping } from "../editors/text/src";
import { BUILTIN_STRUCTURAL_CONFIGS, BUILTIN_STRUCTURAL_NESTING } from "../editors/text/src/config/constants";
import { DEFAULT_ANNOTATION_MAPPING } from "../editors/text/src/config/editor";
import { registerNodeIcon } from "../config/icons";
import type { ParsedMisoConfig } from "../schemas/misoConfig.schema";
import { buildConfigIndex, ConfigIndex } from "../utils/helper/configIndexHelper";
import {
  BASE_NODE_REF,
  createModelContext,
  findRefinementRef,
  getNodeAttributes,
  getRefinements,
  getShapeProperties,
  getShapesForNode,
  shapeRefOf,
  type ModelAnnotationShape,
  type ModelAttribute,
  type ModelContext,
} from "../utils/helper/modelHelper";

/** Group for annotation types without a configured `miso.group`.*/
const DEFAULT_ANNOTATION_GROUP = "other" as const;

const { initializeFilter } = useFilterStore();
const { parseShortcut } = useShortcutsStore();
/**
 * The model of the Miso config and its settings, read by the accessors in `modelHelper.ts`. Not deeply reactive: it
 * doesn't change after the initialization, and the RAMEN core model is a class instance.
 */
const modelContext = shallowRef<ModelContext>();
/** TRANSITIONAL: the lookup index in the old view types, until all access methods return model types */
const configIndex = ref<ConfigIndex>();
const isFetching = ref<boolean>(false);
const error = ref<Error | null>(null);
const isInitialized = computed<boolean>(() => configIndex.value !== undefined && !isFetching.value);

const groupedAnnotationTypes = ref<Record<string, AnnotationType[]>>();
const availableCollectionLabels = ref<string[]>([]);
const availableEntityLabels = ref<string[]>([]);
const availableTextLabels = ref<string[]>([]);
const groupedAndSortedAnnotationTypes = ref<Record<string, AnnotationType[]>>();

// Merged structural configs: built-ins + any entries with role `structure` from the guidelines JSON.
// Populated after initializeGuidelines; starts from built-in defaults.
const mergedStructuralConfigs = ref<AnnotationType[]>([...BUILTIN_STRUCTURAL_CONFIGS]);

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
 * Store for making the edition guidelines available to all components. When the app is mounted, the store is
 * initialized with the fetched Miso config, from which a lookup index is built. The store is static, meaning that no
 * properties are changed after the initialization. Other stores (filter.ts) are derived from this store.
 *
 * The lookups still match by name (annotation `type`, node label), the returned configs already carry the model IDs.
 */
export function useGuidelinesStore() {
  /**
   * Checks if an annotation type has constraints such as required properties, entities etc.
   *
   * Currently used for when the user clicks on an annotation button to enforce constraints.
   *
   * @param {AnnotationType} config The annotation type to check.
   * @returns {boolean} True if the annotation type has constraints.
   */
  function annotationHasConstraints(config: AnnotationType): boolean {
    // TODO: The subType field requires a lot of hacks -> Refactor later
    if (config.properties?.some((p) => p.required && p.name !== "subType")) {
      return true;
    }

    if (config.hasEntities === true) {
      return true;
    }

    return false;
  }

  /**
   * Registers the node icons configured in the `ext.miso` blocks of the Collection, Content and Entity nodes and their
   * types, so that {@linkcode resolveNodeIcon} picks them up.
   *
   * @param {ConfigIndex} index - The lookup index to read the icons from.
   * @return {void} This function does not return anything.
   */
  function applyConfiguredNodeIcons(index: ConfigIndex): void {
    registerNodeIcon("Collection", index.collections.miso?.appearance?.icon);
    registerNodeIcon("Content", index.contents.miso?.appearance?.icon);
    registerNodeIcon("Entity", index.entities.miso?.appearance?.icon);

    index.collections.types.forEach((c) => registerNodeIcon(c.additionalLabel, c.miso?.appearance?.icon));
    index.contents.types.forEach((c) => registerNodeIcon(c.additionalLabel, c.miso?.appearance?.icon));
    index.entities.types.forEach((e) => registerNodeIcon(e.additionalLabel, e.miso?.appearance?.icon));
  }

  /**
   * Builds the mapping between the editor's native structural types/attributes and the project's annotation
   * types/properties. Starts from the default mapping in {@linkcode DEFAULT_ANNOTATION_MAPPING} and overrides it with
   * the `miso.editing.native` keys of the annotation types (taken from `miso.mappings` of the config).
   *
   * @param {ConfigIndex} index - The lookup index to read the native type mappings from.
   * @returns {AnnotationMapping} The annotation mapping.
   */
  function buildAnnotationMapping(index: ConfigIndex): AnnotationMapping {
    const typeByRole: Partial<Record<BuiltinStructuralType, string>> = { ...DEFAULT_ANNOTATION_MAPPING.typeByRole };
    const attrByRole: Partial<Record<BuiltinStructuralType, Record<string, string>>> = {
      ...DEFAULT_ANNOTATION_MAPPING.attrByRole,
    };

    for (const config of index.contents.annotationTypes) {
      const native: NativeTypeMapping | undefined = config.miso?.editing?.native;

      if (!native) {
        continue;
      }

      typeByRole[native.type] = config.type;
      attrByRole[native.type] = { ...attrByRole[native.type], ...native.attributes };
    }

    return { typeByRole, attrByRole };
  }

  /**
   * Builds the merged structural configs: the built-in configs combined with each type's properties, all keyed by
   * the project's type names via the active editor mapping. The nesting rules stay internal, see
   * {@linkcode BUILTIN_STRUCTURAL_NESTING}.
   *
   * Each built-in role becomes an entry under its project type name (`typeByRole[role] ?? role`), with
   * its editor-owned properties renamed to their project names (`attrByRole[role][attr] ?? attr`). A project
   * entry with the same type extends it (see {@linkcode extendBuiltinProperties}); any other structural entry
   * is kept as a custom structural type.
   *
   * @param {ConfigIndex} index The lookup index
   * @returns {AnnotationType[]} The merged structural configs keyed by project type name
   */
  function buildMergedStructuralConfigs(index: ConfigIndex): AnnotationType[] {
    // 1. Built-in types, renamed to the project's type/property names if configured
    const builtInDerived: AnnotationType[] = BUILTIN_STRUCTURAL_CONFIGS.map((config) => {
      const editorRole: string = config.type;
      const annotationType: string = annotationMapping.value.typeByRole[editorRole as BuiltinStructuralType] ?? editorRole;
      const propertyByAttribute = annotationMapping.value.attrByRole[editorRole as BuiltinStructuralType] ?? {};

      const properties: PropertyConfig[] = (config.properties ?? []).map((p) => ({
        ...p,
        name: propertyByAttribute[p.name] ?? p.name,
      }));

      return {
        ...config,
        type: annotationType,
        properties,
      };
    });

    // 2. All types in the custom configuration. Types mapped to a native type are structural without saying so.
    for (const entry of index.contents.annotationTypes) {
      if (!entry.miso?.editing?.native && entry.miso?.editing?.representation !== "structure") {
        continue;
      }

      const existing: AnnotationType | undefined = builtInDerived.find((c) => c.type === entry.type);

      if (existing) {
        existing.properties = extendBuiltinProperties(existing, entry);
      } else {
        builtInDerived.push({ ...entry, properties: [...(entry.properties ?? [])] });
      }
    }

    return builtInDerived;
  }

  /**
   * Retrieves the configuration for an annotation of given type. The configuration is an object containing internal information
   * as well as information about rendering behaviour (input type in forms, selection status etc.).
   *
   * This function is only used for Text annotations, not Collections annotations.
   *
   * @param {string} type - The type of the annotation.
   * @return {AnnotationType | undefined} The configuration of the annotation type, `undefined` if the type is not configured.
   */
  function getAnnotationConfig(type: string): AnnotationType | undefined {
    return getLoadedConfigIndex().contents.annotationTypes.find((t) => t.type === type);
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

    const config: AnnotationType | undefined = getAnnotationConfig(type);

    const extent: AnnotationExtent | undefined = config?.miso?.editing?.extent;

    if (!extent) {
      console.error('No extent found for annotation type "' + type + '"');
    }

    return extent ?? "range";
  }

  /**
   * Retrieves the properties an annotation of given type should should have. Used for rendering input fields in forms
   * where properties of the annotation can be edited. The fields are the properties of the annotation shape. Shared
   * system properties (e.g. `text`) are not configured yet.
   *
   * This function is only used for Text annotations, not Collections annotations.
   *
   * @param {string} type - The type of the annotation.
   * @return {PropertyConfig[]} The fields for the annotation type.
   */
  function getAnnotationFields(type: string): PropertyConfig[] {
    return getAnnotationConfig(type)?.properties ?? [];
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

    const config: AnnotationType | undefined = getAnnotationConfig(type);

    const representation: TextAnnotationRepresentation | undefined = config?.miso?.editing?.representation;

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
   * Retrieves the annotation types available on a Collection with the given node labels: the ones carried by all
   * Collections, plus the ones carried only by one of its types.
   *
   * @param {string[]} collectionNodeLabels - The node labels of the Collection.
   * @return {AnnotationType[]} The available annotation types.
   */
  function getAvailableCollectionAnnotationConfigs(collectionNodeLabels: string[]): AnnotationType[] {
    const index: ConfigIndex = getLoadedConfigIndex();
    const additional: AnnotationType[] = index.collections.types
      .filter((type) => collectionNodeLabels.includes(type.additionalLabel))
      .flatMap((type) => type.annotationTypes);

    // A shape carried by several types of the Collection would be listed once per type
    return [...index.collections.annotationTypes, ...additional].filter(
      (config, position, all) => all.findIndex((other) => other.annotationRef === config.annotationRef) === position,
    );
  }

  /**
   * Retrieves the available labels that can be assigned to a Collection node.
   *
   * @return {string[]} The available labels.
   */
  function getAvailableCollectionLabels(): string[] {
    return configIndex.value?.collections.types.map((collection) => collection.additionalLabel) ?? [];
  }

  /**
   * Retrieves the available labels that can be assigned to a a Content node.
   *
   * @return {string[]} The available labels.
   */
  function getAvailableContentLabels(): string[] {
    return configIndex.value?.contents.types.map((content) => content.additionalLabel) ?? [];
  }

  /**
   * Retrieves the medium of a Content node from its labels. The first label with a configured medium wins.
   *
   * @param {string[]} nodeLabels - All node labels of the Content node.
   * @return {ContentMedium} The configured medium, `text` if none is configured.
   */
  function getContentMedium(nodeLabels: string[]): ContentMedium {
    const contentType = configIndex.value?.contents.types.find(
      (content) => nodeLabels.includes(content.additionalLabel) && content.miso?.medium,
    );

    return contentType?.miso?.medium ?? "text";
  }

  /**
   * Retrieves the available labels that can be assigned to a an Entity node.
   *
   * @return {string[]} The available labels.
   */
  function getAvailableEntityLabels(): string[] {
    return configIndex.value?.entities.types.map((e) => e.additionalLabel) ?? [];
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
    const config: AnnotationType | undefined = BUILTIN_STRUCTURAL_CONFIGS.find((c) => c.type === editorRole);

    return config?.miso?.editing?.extent ?? "range";
  }

  // TODO: This is a hack since the guidelines structure can change. It should be refactored to use the same structure as the annotations.
  function getCollectionAnnotationConfig(collectionLabels: string[], annotationType: string): AnnotationType | undefined {
    const availableConfigs: AnnotationType[] = getAvailableCollectionAnnotationConfigs(collectionLabels);

    const desired: AnnotationType | undefined = availableConfigs.find((t) => t.type === annotationType);

    return desired;
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

    const config: AnnotationType | undefined = BUILTIN_STRUCTURAL_CONFIGS.find((c) => c.type === editorRole);

    return (config?.properties ?? []).map((p: PropertyConfig) => ({
      attribute: p.name,
      property: propertyByAttribute[p.name] ?? p.name,
      required: p.required,
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
   * Returns the lookup index. Only call this from code that runs after {@linkcode initializeGuidelines}.
   *
   * @returns {ConfigIndex} The lookup index built from the Miso config.
   * @throws {Error} If the config has not been loaded yet.
   */
  function getLoadedConfigIndex(): ConfigIndex {
    if (!configIndex.value) {
      throw new Error("Guidelines are not initialized");
    }

    return configIndex.value;
  }

  /**
   * Returns the model context for the accessors in `modelHelper.ts`. Only call this from code that runs after
   * {@linkcode initializeGuidelines}.
   *
   * @returns {ModelContext} The model of the Miso config and its settings.
   * @throws {Error} If the config has not been loaded yet.
   */
  function getModelContext(): ModelContext {
    if (!modelContext.value) {
      throw new Error("Guidelines are not initialized");
    }

    return modelContext.value;
  }

  /**
   * Returns the attributes of a Collection with the given node labels: the ones declared by the Collection node, then
   * the ones of its matching types. Matched by label until the lookups use IDs.
   *
   * @param {string[]} nodeLabels - The node labels of the Collection.
   * @returns {ModelAttribute[]} The attributes, without identity attributes like `uuid`.
   */
  function getCollectionAttributes(nodeLabels: string[]): ModelAttribute[] {
    const context: ModelContext = getModelContext();
    const typeRefs: string[] = nodeLabels
      .map((label) => findRefinementRef(context, BASE_NODE_REF.Collection, label))
      .filter((ref): ref is string => ref !== undefined);

    return [
      ...getNodeAttributes(context, BASE_NODE_REF.Collection),
      ...typeRefs.flatMap((ref) => getNodeAttributes(context, ref, true)),
    ];
  }

  /**
   * Returns the attributes of all Collection types, each name once (the first declaration wins). Used for filters and
   * sorting across types.
   *
   * @returns {ModelAttribute[]} The attributes, without identity attributes like `uuid`.
   */
  function getAllCollectionAttributes(): ModelAttribute[] {
    const context: ModelContext = getModelContext();
    const all: ModelAttribute[] = getCollectionAttributes(
      getRefinements(context, BASE_NODE_REF.Collection).map(({ node }) => node.name),
    );

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
   * Returns the properties of the annotations with the given type on a Collection with the given node labels.
   *
   * @param {string[]} nodeLabels - The node labels of the Collection.
   * @param {string} type - The type of the annotation.
   * @returns {ModelAttribute[]} The properties, empty if the Collection can't carry that type.
   */
  function getCollectionAnnotationProperties(nodeLabels: string[], type: string): ModelAttribute[] {
    const shape: ModelAnnotationShape | undefined = getCollectionAnnotationShapes(nodeLabels).find((s) => s.type === type);

    return shape ? getShapeProperties(shape) : [];
  }

  /**
   * Returns the annotation shape of the text annotations with the given type, i.e. one a Content node may carry.
   * Matched by type until the lookups use IDs.
   *
   * @param {string} type - The type of the annotation.
   * @returns {ModelAnnotationShape | undefined} The shape, `undefined` if no Content node carries that type.
   */
  function getTextAnnotationShape(type: string): ModelAnnotationShape | undefined {
    const context: ModelContext = getModelContext();
    const carrierRefs: string[] = [
      BASE_NODE_REF.Content,
      ...getRefinements(context, BASE_NODE_REF.Content).map(({ ref }) => ref),
    ];

    for (const carrierRef of carrierRefs) {
      const shape: ModelAnnotationShape | undefined = getShapesForNode(context, carrierRef).find((s) => s.type === type);

      if (shape) {
        return shape;
      }
    }

    return undefined;
  }

  /**
   * Returns the annotation shapes a Collection with the given node labels may carry. Matched by label until the
   * lookups use IDs.
   *
   * @param {string[]} nodeLabels - The node labels of the Collection.
   * @returns {ModelAnnotationShape[]} The shapes, each once.
   */
  function getCollectionAnnotationShapes(nodeLabels: string[]): ModelAnnotationShape[] {
    const context: ModelContext = getModelContext();
    const carrierRefs: string[] = [
      BASE_NODE_REF.Collection,
      ...nodeLabels
        .map((label) => findRefinementRef(context, BASE_NODE_REF.Collection, label))
        .filter((ref): ref is string => ref !== undefined),
    ];
    const shapes = new Map<string, ModelAnnotationShape>();

    for (const shape of carrierRefs.flatMap((ref) => getShapesForNode(context, ref))) {
      shapes.set(shapeRefOf(shape), shape);
    }

    return [...shapes.values()];
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

  function getStructuralAnnotationConfig(type: string): AnnotationType | undefined {
    return mergedStructuralConfigs.value.find((t) => t.type === type);
  }

  /**
   * Groups the annotation types by category.
   *
   * @return {Record<string, AnnotationType[]>} An object where the keys are the categories and the values are arrays of annotation types belonging to that category.
   */
  function groupAnnotationTypes(): Record<string, AnnotationType[]> {
    return getLoadedConfigIndex().contents.annotationTypes.reduce(
      (grouped: Record<string, AnnotationType[]>, current: AnnotationType) => {
        const category: string = current.miso?.group ?? DEFAULT_ANNOTATION_GROUP;

        if (!grouped[category]) {
          grouped[category] = [];
        }

        grouped[category].push(current);

        return grouped;
      },
      {},
    );
  }

  /**
   * Initializes the store with the Miso config: builds the lookup index and initializes the filter store.
   *
   * @param {ParsedMisoConfig} parsed - The validated Miso config and its imported model.
   * @return {void} This function does not return anything.
   */
  function initializeGuidelines(parsed: ParsedMisoConfig): void {
    const context: ModelContext = createModelContext(parsed.config, parsed.model);
    const index: ConfigIndex = buildConfigIndex(context);

    modelContext.value = context;

    index.warnings.forEach((warning) => console.warn(`Miso config: ${warning}`));
    validateMisoConfig(index);
    applyConfiguredNodeIcons(index);

    // Must be set before the structural configs are merged, since they are keyed by the project's type names
    annotationMapping.value = buildAnnotationMapping(index);
    configIndex.value = index;
    mergedStructuralConfigs.value = buildMergedStructuralConfigs(index);
    groupedAnnotationTypes.value = groupAnnotationTypes();
    groupedAndSortedAnnotationTypes.value = sortAnnotationTypesInGroup();
    availableCollectionLabels.value = getAvailableCollectionLabels();
    availableEntityLabels.value = getAvailableEntityLabels();
    availableTextLabels.value = getAvailableContentLabels();

    initializeFilter(index.contents.annotationTypes.map((type) => type.type));
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
   * types or it is configured in the guidelines.
   *
   * Used to check the annotation validity during document parsing on load.
   *
   * @param {string} annotationType The annotation type
   * @returns {boolean} `true` if the annotation type is built-in or configured, `false` otherwise
   */
  function isConfiguredAnnotationType(annotationType: string): boolean {
    return isBuiltinStructuralType(annotationType) || getAnnotationConfig(annotationType) !== undefined;
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
   * Extends the properties of a built-in structural type with the new properties of the project's entry for it,
   * e.g. a `rend` property for paragraphs. Built-in properties can't be redefined: a differing definition is ignored
   * with a warning.
   *
   * @param {AnnotationType} builtin The built-in-derived config, with properties already renamed to the project's names
   * @param {AnnotationType} entry The project's entry for the same annotation type
   * @returns {PropertyConfig[]} The built-in properties followed by the new project properties
   */
  function extendBuiltinProperties(builtin: AnnotationType, entry: AnnotationType): PropertyConfig[] {
    const combined: PropertyConfig[] = [...(builtin.properties ?? [])];

    for (const prop of entry.properties ?? []) {
      const builtinProp: PropertyConfig | undefined = combined.find((p) => p.name === prop.name);

      if (!builtinProp) {
        combined.push(prop);
      } else if (!isSamePropertyConfig(builtinProp, prop)) {
        console.warn(
          `Property "${prop.name}" of annotation type "${entry.type}" is defined by the editor, the differing configured definition is ignored`,
        );
      }
    }

    return combined;
  }

  /**
   * Checks if two property configs are identical, independent of the order of their keys.
   *
   * @param {PropertyConfig} a The first property config
   * @param {PropertyConfig} b The second property config
   * @returns {boolean} `true` if both have the same keys with the same values, `false` otherwise
   */
  function isSamePropertyConfig(a: PropertyConfig, b: PropertyConfig): boolean {
    const keys = new Set<string>([...Object.keys(a), ...Object.keys(b)]);

    return [...keys].every(
      (key: string) =>
        JSON.stringify(a[key as keyof PropertyConfig]) === JSON.stringify(b[key as keyof PropertyConfig]),
    );
  }

  /**
   * Sets the active annotation mapping (project names <-> built-in editor roles/attributes) and
   * rebuilds the merged structural configs so the renames take effect. On load, the mapping is built from the
   * `miso.mappings` of the config; this function replaces it afterwards.
   *
   * @param {AnnotationMapping} mapping - The annotation mapping to apply.
   * @return {void} This function does not return anything.
   */
  function setAnnotationMapping(mapping: AnnotationMapping): void {
    annotationMapping.value = mapping;

    if (configIndex.value) {
      mergedStructuralConfigs.value = buildMergedStructuralConfigs(configIndex.value);
    }
  }

  /**
   * Sorts each group of annotation types alphabetically by their type within their respective category.
   *
   * @return {Record<string, AnnotationType[]>} An object where the keys are the categories and the values are arrays of sorted annotation types.
   */
  function sortAnnotationTypesInGroup(): Record<string, AnnotationType[]> {
    return Object.fromEntries(
      Object.entries(groupedAnnotationTypes.value ?? {}).map(([category, types]) => [
        category,
        types.toSorted((a, b) => a.type.localeCompare(b.type)),
      ]),
    );
  }

  /**
   * Checks the `miso` configuration of all annotation types for mistakes and logs a warning for each one found.
   * Invalid parts are not removed, they are just ignored where they don't apply.
   *
   * @param {ConfigIndex} index - The lookup index to validate.
   * @return {void} This function does not return anything.
   */
  function validateMisoConfig(index: ConfigIndex): void {
    const warn = (type: string, message: string): void => {
      console.warn(`Invalid miso configuration for annotation type "${type}": ${message}`);
    };

    const annotationTypes: AnnotationType[] = [
      ...index.contents.annotationTypes,
      ...index.collections.annotationTypes,
      ...index.collections.types.flatMap((c) => c.annotationTypes),
    ];

    for (const config of annotationTypes) {
      const miso: AnnotationMisoConfig | undefined = config.miso;

      if (!miso) {
        continue;
      }

      // The mapping is not built yet, so the extent of a native type is read from its built-in config directly
      const nativeConfig: AnnotationType | undefined = BUILTIN_STRUCTURAL_CONFIGS.find(
        (c) => c.type === miso.editing?.native?.type,
      );
      const extent: AnnotationExtent = nativeConfig?.miso?.editing?.extent ?? miso.editing?.extent ?? "range";
      const appearances: [string, AppearanceOverride][] = [["miso.appearance", miso.appearance ?? {}]];

      (miso.appearance?.variants ?? []).forEach((variant, index) => {
        const propertyConfig: PropertyConfig | undefined = config.properties?.find((p) => p.name === variant.property);
        const options: string[] | undefined = propertyConfig?.options?.map(String);

        if (!propertyConfig) {
          warn(
            config.type,
            `"${variant.property}" in miso.appearance.variants[${index}] is not a property of the annotation type`,
          );
        }

        for (const [value, override] of Object.entries(variant.values)) {
          const path: string = `miso.appearance.variants[${index}].values.${value}`;

          if (options && !options.includes(value)) {
            warn(config.type, `"${value}" in ${path} is not an option of the "${variant.property}" property`);
          }

          appearances.push([path, override]);
        }
      });

      for (const [path, appearance] of appearances) {
        if (extent === "range" && appearance.marker) {
          warn(config.type, `${path}.marker only applies to zeroPoint annotations`);
        }

        if (extent === "zeroPoint" && appearance.highlight) {
          warn(config.type, `${path}.highlight only applies to range annotations`);
        }
      }
    }

    // Shortcuts are only registered for the editor's annotation types
    const typesByShortcut = new Map<string, string[]>();

    for (const config of index.contents.annotationTypes) {
      const shortcut: string | undefined = config.miso?.controls?.shortcut;

      if (shortcut) {
        const normalized: string = parseShortcut(shortcut);
        typesByShortcut.set(normalized, [...(typesByShortcut.get(normalized) ?? []), config.type]);
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
    getAnnotationConfig,
    getAnnotationExtent,
    getAnnotationFields,
    getAnnotationRepresentation,
    getAnnotationType,
    getAvailableCollectionAnnotationConfigs,
    getAvailableCollectionLabels,
    getAvailableContentLabels,
    getAvailableEntityLabels,
    getAvailableNodeLabels,
    getCollectionAnnotationConfig,
    getAllCollectionAttributes,
    getCollectionAnnotationProperties,
    getCollectionAnnotationShapes,
    getCollectionAttributes,
    getContentMedium,
    getEditorOwnedProperties,
    getEditorRole,
    getModelContext,
    getPriorityForType,
    getStructuralAnnotationConfig,
    getStructuralAnnotationConfigs: (): AnnotationType[] => mergedStructuralConfigs.value,
    getTextAnnotationProperties,
    getTextAnnotationShape,
    groupedAndSortedAnnotationTypes,
    groupedAnnotationTypes,
    initializeGuidelines,
    isBuiltinStructuralType,
    isConfiguredAnnotationType,
    isFetching: readonly(isFetching),
    isInitialized: readonly(isInitialized),
    isZeroPoint,
    setAnnotationMapping,
  };
}
