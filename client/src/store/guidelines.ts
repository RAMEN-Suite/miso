import { computed, readonly, ref } from "vue";
import { IGuidelines } from "../models/IGuidelines";
import { useFilterStore } from "./filter";
import {
  AnnotationConfigEntity,
  AnnotationType,
  PropertyConfig,
  AnnotationNode,
  BaseNodeLabel,
  BuiltinEditorAttribute,
  BuiltinStructuralType,
  AnnotationMapping,
  AnnotationRole,
  AnnotationBehaviour,
} from "../models/types";
import { BUILTIN_STRUCTURAL_CONFIGS } from "../config/constants";
import { EDITOR_OWNED_ATTRIBUTES, DEFAULT_ANNOTATION_MAPPING } from "../config/editor";

const { initializeFilter } = useFilterStore();
const guidelines = ref<IGuidelines>();
const isFetching = ref<boolean>(false);
const error = ref<any>(null);
const isInitialized = computed<boolean>(() => guidelines.value && !isFetching.value);

const groupedAnnotationTypes = ref<Record<string, AnnotationType[]>>();
const availableCollectionLabels = ref<string[]>([]);
const availableEntityLabels = ref<string[]>([]);
const availableTextLabels = ref<string[]>([]);
const groupedAndSortedAnnotationTypes = ref<Record<string, AnnotationType[]>>();

// Merged structural configs: built-ins + any isBlock:true entries from the guidelines JSON.
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
 * Store for making the edition guidelines available to all components. When the component is mounted,
 * the store is initialized with the fetched guidelines. The store is static, meaning that no properties are changed
 * after the initialization. Other stores (filter.ts) are derived from this store.
 */
export function useGuidelinesStore() {
  /**
   * Initializes the store with the provided data and initializes the filter store.
   *
   * @param {IGuidelines} guidelinesData - The guidelines data to initialize with.
   * @return {void} This function does not return anything.
   */
  function initializeGuidelines(guidelinesData: IGuidelines): void {
    guidelines.value = guidelinesData;
    mergedStructuralConfigs.value = buildMergedStructuralConfigs(guidelinesData);
    groupedAnnotationTypes.value = groupAnnotationTypes();
    groupedAndSortedAnnotationTypes.value = sortAnnotationTypesInGroup();
    availableCollectionLabels.value = getAvailableCollectionLabels();
    availableEntityLabels.value = getAvailableEntityLabels();
    availableTextLabels.value = getAvailableContentLabels();

    initializeFilter(guidelines.value);
  }

  /**
   * Sets the active annotation mapping (project names <-> built-in editor roles/attributes) and
   * rebuilds the merged structural configs so the renames take effect. Call on app load once the
   * separate mapping JSON is fetched (alongside the guidelines); until then the default is used.
   *
   * @param {AnnotationMapping} mapping - The annotation mapping to apply.
   * @return {void} This function does not return anything.
   */
  function setAnnotationMapping(mapping: AnnotationMapping): void {
    annotationMapping.value = mapping;

    if (guidelines.value) {
      mergedStructuralConfigs.value = buildMergedStructuralConfigs(guidelines.value);
    }
  }

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
   * Retrieves the configuration for an annotation of given type. The configuration is an object containing internal information
   * as well as information about rendering behaviour (input type in forms, selection status etc.).
   *
   * This function is only used for Text annotations, not Collections annotations.
   *
   * @param {string} type - The type of the annotation.
   * @return {AnnotationType} The configuration of the annotation type.
   */
  function getAnnotationConfig(type: string): AnnotationType {
    return guidelines.value.annotations.types.find((t) => t.type === type);
  }

  function getStructuralAnnotationConfig(type: string): AnnotationType | undefined {
    return mergedStructuralConfigs.value.find((t) => t.type === type);
  }

  /**
   * Retrieves the properties an annotation of given type should should have. Used for rendering input fields in forms
   * where properties of the annotation can be edited. The fields are retrieved from the annotation type itself (if it has any)
   * and from the global annotation properties.
   *
   * This function is only used for Text annotations, not Collections annotations.
   *
   * @param {string} type - The type of the annotation.
   * @return {PropertyConfig[]} The fields for the annotation type.
   */
  function getAnnotationFields(type: string): PropertyConfig[] {
    const system: PropertyConfig[] = guidelines.value.annotations.properties.system;
    const base: PropertyConfig[] = guidelines.value.annotations.properties.base;
    const additional: PropertyConfig[] = getAnnotationConfig(type)?.properties ?? [];

    return [...additional, ...system, ...base];
  }

  /**
   * Retrieves the properties an annotation of given type should have in the context of a Collection with given node labels.
   * Used for rendering input fields in forms where properties of the annotation can be edited. Currently a hack.
   *
   * @param {string[]} collectionNodeLabels - The node labels of the Collection.
   * @param {string} annotationType - The type of the annotation.
   * @return {PropertyConfig[]} The fields for the annotation type in the context of the Collection.
   */
  function getCollectionAnnotationFields(collectionNodeLabels: string[], annotationType: string): PropertyConfig[] {
    // TODO: This is a hack since the guidelines structure can change. It should be refactored to use the same structure as the annotations.

    // Default properties for annotations that are in ALL collections
    const byDefault: PropertyConfig[] = [
      ...(guidelines.value.collections.annotations?.properties.system ?? []),
      ...(guidelines.value.collections.annotations?.properties.base ?? []),
    ];

    // Default properties for annotations that exists in the collections with given node labels
    const byCollectionType: PropertyConfig[] = guidelines.value.collections.types.reduce((total: PropertyConfig[], curr) => {
      if (collectionNodeLabels.includes(curr.additionalLabel)) {
        const nestedFields: PropertyConfig[] = curr.annotations?.properties ?? [];

        total.push(...nestedFields);
      }

      return total;
    }, []);

    // Properties for the given annotation type (no matter which level)
    const byAnnotationType: PropertyConfig[] =
      getAvailableCollectionAnnotationConfigs(collectionNodeLabels).find((t) => t.type === annotationType)?.properties ?? [];

    return [...byDefault, ...byCollectionType, ...byAnnotationType];
  }

  // TODO: This is a hack since the guidelines structure can change. It should be refactored to use the same structure as the annotations.
  function getCollectionAnnotationConfig(collectionLabels: string[], annotationType: string): AnnotationType {
    const availableConfigs: AnnotationType[] = getAvailableCollectionAnnotationConfigs(collectionLabels);

    const desired: AnnotationType = availableConfigs.find((t) => t.type === annotationType);

    return desired;
  }

  /**
   * Retrieves all available entity configurations for annotations from the guidelines.
   *
   * This method combines the entities defined in the annotations and collections sections
   * of the guidelines and removes any duplicates. It is currently a hack since the guidelines structure can change.
   *
   * @return {AnnotationConfigEntity[]} The combined and deduplicated entities.
   */
  function getAvailableAnnotationEntityConfigs(): AnnotationConfigEntity[] {
    const baseAnnotationEntities: AnnotationConfigEntity[] = guidelines.value.annotations.entities ?? [];

    const baseCollectionEntities: AnnotationConfigEntity[] = guidelines.value.collections.annotations.entities ?? [];

    const additionalCollectionEntities: AnnotationConfigEntity[] = guidelines.value.collections.types.flatMap(
      (c) => c.annotations?.entities ?? [],
    );

    const combined: AnnotationConfigEntity[] = [
      ...baseAnnotationEntities,
      ...baseCollectionEntities,
      ...additionalCollectionEntities,
    ];

    const unique: AnnotationConfigEntity[] = combined.reduce<AnnotationConfigEntity[]>((total, curr) => {
      if (!total.some((r) => r.category === curr.category && r.nodeLabel === curr.nodeLabel)) {
        total.push(curr);
      }
      return total;
    }, []);

    return unique;
  }

  function getAvailableCollectionAnnotationConfigs(collectionNodeLabels: string[]): AnnotationType[] {
    const base: AnnotationType[] = guidelines.value.collections.annotations.types;
    const additional: AnnotationType[] = guidelines.value.collections.types.reduce((total: AnnotationType[], curr) => {
      if (collectionNodeLabels.includes(curr.additionalLabel)) {
        const nested: AnnotationType[] = curr.annotations?.types ?? [];
        total.push(...nested);
      }
      return total;
    }, []);

    return [...base, ...additional];
  }

  /**
   * Retrieves the available labels that can be assigned to a Collection node.
   *
   * @return {string[]} The available labels.
   */
  function getAvailableCollectionLabels(): string[] {
    return guidelines.value?.collections.types.map((collection) => collection.additionalLabel) ?? [];
  }

  /**
   * Retrieves the available labels that can be assigned to a an Entity node.
   *
   * @return {string[]} The available labels.
   */
  function getAvailableEntityLabels(): string[] {
    return guidelines.value?.annotations.entities.map((e) => e.nodeLabel) ?? [];
  }

  /**
   * Retrieves the available labels that can be assigned to a a Content node.
   *
   * @return {string[]} The available labels.
   */
  function getAvailableContentLabels(): string[] {
    return guidelines.value?.texts.additionalLabels ?? [];
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
   * Retrieves field configuration of a collection with given additional node labels. Contains information about rendering behaviour as well as validation rules.
   * Used for rendering data tables or input fields in forms.
   *
   * @param {string[]} nodeLabels - The additional labels of the collection.
   * @return {PropertyConfig[]} The field configurations for the collection type.
   */
  function getCollectionConfigFields(nodeLabels: string[]): PropertyConfig[] {
    const system: PropertyConfig[] = guidelines.value?.collections.properties.system ?? [];
    const base: PropertyConfig[] = guidelines.value?.collections.properties.base ?? [];
    const additional: PropertyConfig[] =
      guidelines.value?.collections.types.reduce((total: PropertyConfig[], curr) => {
        if (nodeLabels.includes(curr.additionalLabel)) {
          total.push(...curr.properties);
        }
        return total;
      }, []) ?? [];

    return [...system, ...base, ...additional];
  }

  /**
   * Retrieves all available field configurations for collection properties.
   *
   * This method gathers all available collection labels and fetches their corresponding
   * field configurations, which are used for rendering data tables or input fields in forms.
   *
   * @return {PropertyConfig[]} The field configurations for all available collection types.
   */
  function getAllCollectionConfigFields(): PropertyConfig[] {
    const availableCollectionLabels: string[] = getAvailableCollectionLabels();

    return getCollectionConfigFields(availableCollectionLabels);
  }

  /**
   * Groups the annotation types by category.
   *
   * @return {Record<string, AnnotationType[]>} An object where the keys are the categories and the values are arrays of annotation types belonging to that category.
   */
  function groupAnnotationTypes(): Record<string, AnnotationType[]> {
    return guidelines.value.annotations.types.reduce((grouped: Record<string, AnnotationType[]>, current: AnnotationType) => {
      const category = current.category;

      if (!grouped[category]) {
        grouped[category] = [];
      }

      grouped[category].push(current);

      return grouped;
    }, {});
  }

  /**
   * Returns whether an annotation is a zero-point annotation, based on its type's configured behaviour.
   * Configuration always beats instance data here; if it is configured as zero point, it will be treated
   * as zero point and it's `isZeroPoint` property will be updated to `true` on the next save.
   *
   * @param annotation - The annotation to check.
   * @returns {boolean} `true` if the annotation is a zero-point annotation, `false` otherwise.
   */
  function isZeroPoint(annotation: AnnotationNode): boolean {
    return getAnnotationBehaviour(annotation.data.type) === "zeroPoint";
  }

  /**
   * Sorts each group of annotation types alphabetically by their type within their respective category.
   *
   * @return {Record<string, AnnotationType[]>} An object where the keys are the categories and the values are arrays of sorted annotation types.
   */
  function sortAnnotationTypesInGroup(): Record<string, AnnotationType[]> {
    return Object.fromEntries(
      Object.entries(groupedAnnotationTypes.value).map(([category, types]) => [
        category,
        types.toSorted((a, b) => a.type.localeCompare(b.type)),
      ]),
    );
  }

  function getPriorityForType(type: string): number {
    return mergedStructuralConfigs.value.find((c) => c.type === type)?.priority ?? 0;
  }

  /**
   * Returns the editor-owned properties of a structural annotation type: each pairs the editor
   * `attribute` (the tiptap-native attr the editor needs, e.g. `level`) with the `property` (the
   * project's name for it). The property equals the attribute unless the project mapped it — e.g.
   * applying TEI semantics, `rows` instead of the native `rowspan`.
   *
   * @param {string} annotationType The project (configured) structural annotation type
   * @returns {{ property: string; attribute: BuiltinEditorAttribute }[]} The editor-owned properties
   * @example
   * getEditorOwnedProperties("heading")
   *
   * // Could return (if configured)
   *
   * [{
   *    attribute: 'level',
   *    property: 'n',
   * }]
   */
  function getEditorOwnedProperties(annotationType: string): { property: string; attribute: BuiltinEditorAttribute }[] {
    const editorRole: BuiltinStructuralType | string = getEditorRole(annotationType);
    const propertyByAttribute: Partial<Record<BuiltinEditorAttribute, string | undefined>> =
      annotationMapping.value.attrByRole[editorRole as BuiltinStructuralType] ?? {};

    const config: AnnotationType | undefined = BUILTIN_STRUCTURAL_CONFIGS.find((c) => c.type === editorRole);

    const attributes: BuiltinEditorAttribute[] = (config?.properties ?? [])
      .filter((p) => EDITOR_OWNED_ATTRIBUTES.includes(p.name as BuiltinEditorAttribute))
      .map((p) => p.name as BuiltinEditorAttribute);

    return attributes.map((attribute: BuiltinEditorAttribute) => ({
      attribute,
      property: propertyByAttribute[attribute] ?? attribute,
    }));
  }

  /**
   * Merges project-defined properties onto a built-in-derived property list when they are configured for the
   * same annotation type.
   *
   * This is the case when the project extends built-in structural annotation types, e.g. when a "paragraph" annotation
   * should have a "rendtition" property.
   *
   * @param {PropertyConfig[]} base Built-in-derived properties
   * @param {PropertyConfig[]} incoming Project-defined properties
   * @returns {PropertyConfig[]} The merged property list
   */
  function mergeDomainProperties(base: PropertyConfig[], incoming: PropertyConfig[]): PropertyConfig[] {
    const combined: PropertyConfig[] = [...base];

    for (const prop of incoming) {
      const index: number = combined.findIndex((p) => p.name === prop.name);

      if (index !== -1) {
        combined[index] = { ...combined[index], ...prop };
      } else {
        combined.push(prop);
      }
    }

    return combined;
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
  function getEditorRole(annotationType: string): BuiltinStructuralType | string {
    return roleByType.value[annotationType] ?? annotationType;
  }

  /**
   * Returns the project annotation type name for a given editor role, via the active annotation mapping.
   *
   * E.g. `getAnnotationType('paragraph')` returns "p" when the mapping binds `paragraph -> 'p'`.
   * Falls back to the role itself if not mapped.
   *
   * Complementary function of {@linkcode getEditorRole}.
   *
   * @param {BuiltinStructuralType} editorRole The editor role (e.g. `bulletList`)
   * @returns {string} The project annotation type (e.g. `list`) if mapped, else the given role
   */
  function getAnnotationType(editorRole: BuiltinStructuralType | string): string {
    return annotationMapping.value.typeByRole[editorRole as BuiltinStructuralType] ?? editorRole;
  }

  /**
   * Builds the merged structural configs: built-in behavior (priority/contains/topLevel) combined with
   * each type's properties, all keyed by the project's type names via the active editor mapping.
   *
   * Each built-in role becomes an entry under its project type name (`typeByRole[role] ?? role`), with
   * its editor-owned properties renamed to their project names (`attrByRole[role][attr] ?? attr`) but
   * keeping the built-in constraints. A project JSON entry whose type matches one of those entries
   * merges its domain properties onto it; an entry that matches none is kept as a custom structural
   * type. `contains` keeps built-in role names (it is matched against editor roles).
   *
   * @param {IGuidelines} guidelinesData The domain guidelines
   * @returns {AnnotationType[]} The merged structural configs keyed by project type name
   */
  function buildMergedStructuralConfigs(guidelinesData: IGuidelines): AnnotationType[] {
    // 1. Built-in types, renamed to the project's type/property names if configured
    const builtInDerived: AnnotationType[] = BUILTIN_STRUCTURAL_CONFIGS.map((config) => {
      const editorRole: string = config.type;
      const annotationType: string = annotationMapping.value.typeByRole[editorRole as BuiltinStructuralType] ?? editorRole;
      const propertyByAttribute = annotationMapping.value.attrByRole[editorRole as BuiltinStructuralType] ?? {};

      const properties: PropertyConfig[] = (config.properties ?? []).map((p) => ({
        ...p,
        name: propertyByAttribute[p.name as BuiltinEditorAttribute] ?? p.name,
      }));

      return {
        ...config,
        type: annotationType,
        properties,
      };
    });

    // 2. All types in the custom configuration
    for (const entry of guidelinesData.annotations.types) {
      if (entry.role !== "structure") {
        continue;
      }

      const existing: AnnotationType | undefined = builtInDerived.find((c) => c.type === entry.type);

      if (existing) {
        existing.properties = mergeDomainProperties(existing.properties ?? [], entry.properties ?? []);
      } else {
        builtInDerived.push({
          ...entry,
          properties: [...(entry.properties ?? [])],
          contains: [...(entry.contains ?? [])],
        });
      }
    }

    return builtInDerived;
  }

  /**
   * Canonical behaviour of the built-in editor role that `type` maps to (via the mapping). Used to force
   * a type that maps to a built-in onto the built-in's behaviour (e.g. a `lb` mapped to `hardBreak` is
   * always zero-point).
   *
   * @param {string} type The project annotation type
   * @returns {AnnotationBehaviour} The built-in's canonical behaviour (defaults to `range`)
   */
  function getBuiltinBehaviour(type: string): AnnotationBehaviour {
    const editorRole: string = getEditorRole(type);
    const config: AnnotationType | undefined = BUILTIN_STRUCTURAL_CONFIGS.find((c) => c.type === editorRole);

    return config?.behaviour ?? "range";
  }

  /**
   * Returns the operational role of an annotation type (`structure`/`inline`/`semanticBlock`), computed on
   * demand from the config. A built-in mapping always wins (early return); otherwise the config's explicit
   * `role` wins, falling back to the legacy `isBlock` flag. Unknown/collection types degrade to `inline`.
   *
   * NOTE: this is the annotation's *classification*, distinct from {@linkcode getEditorRole}, which returns
   * the tiptap node name of a structural type.
   *
   * @param {string} type The project annotation type
   * @returns {AnnotationRole} The resolved role
   */
  function getAnnotationRole(type: string): AnnotationRole {
    if (isBuiltinStructuralType(type)) {
      return "structure";
    }

    const config: AnnotationType | undefined = getAnnotationConfig(type);

    if (!config?.role) {
      console.error('No role found for annotation type "' + type + '"');
    }

    return config?.role ?? "inline";
  }

  /**
   * Returns the behaviour of an annotation type (`zero-point`/`range`), computed on demand. A built-in mapping
   * uses the built-in's canonical behaviour; otherwise the config's explicit `behaviour` wins, falling back
   * to the legacy `isZeroPoint` flag. Unknown/collection types degrade to `range`.
   *
   * @param {string} type The project annotation type
   * @returns {AnnotationBehaviour} The resolved behaviour
   */
  function getAnnotationBehaviour(type: string): AnnotationBehaviour {
    if (isBuiltinStructuralType(type)) {
      return getBuiltinBehaviour(type);
    }

    const config: AnnotationType | undefined = getAnnotationConfig(type);

    if (!config?.behaviour) {
      console.error('No behaviour found for annotation type "' + type + '"');
    }

    return config?.behaviour ?? "range";
  }

  return {
    availableCollectionLabels,
    availableEntityLabels,
    availableTextLabels,
    error: readonly(error),
    groupedAndSortedAnnotationTypes,
    groupedAnnotationTypes,
    guidelines,
    isFetching: readonly(isFetching),
    isInitialized: readonly(isInitialized),
    getStructuralAnnotationConfigs: (): AnnotationType[] => mergedStructuralConfigs.value,
    getPriorityForType,
    getEditorOwnedProperties,
    annotationHasConstraints,
    getAllCollectionConfigFields,
    getAnnotationConfig,
    getAnnotationFields,
    getAvailableAnnotationResourceConfigs: getAvailableAnnotationEntityConfigs,
    getAvailableCollectionAnnotationConfigs,
    getAvailableCollectionLabels,
    getAvailableEntityLabels,
    getAvailableNodeLabels,
    getAvailableContentLabels,
    getCollectionAnnotationFields,
    getCollectionAnnotationConfig,
    getCollectionConfigFields,
    getStructuralAnnotationConfig,
    getEditorRole,
    getAnnotationType,
    getAnnotationRole,
    getAnnotationBehaviour,
    isBuiltinStructuralType,
    initializeGuidelines,
    setAnnotationMapping,
    isZeroPoint,
  };
}
