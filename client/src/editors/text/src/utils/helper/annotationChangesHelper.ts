import { Node as DocNode } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { DocAnnotation, IndexMap } from "../../models/types";
import {
  Annotation,
  BuiltinStructuralType,
  IAnnotation,
  INTRINSIC_ANNOTATION_PROPERTIES,
  NodeStatus,
  PropertyConfig,
  PRUNE_UNCONFIGURED_ANNOTATION_TYPES,
  cloneDeep,
  pruneUnconfiguredProperties,
  useGuidelinesStore,
} from "../../external";
import { collectInlineAnnotations, collectBlockClassifications, toAnnotation } from "./annotationHelper";
import { createIndexMapBuilder } from "./indexMapHelper";

/** The annotations of the last saved state, keyed by uuid. */
interface InitialAnnotations {
  annotations: Map<string, Annotation> | undefined;
  structuralAnnotations: Map<string, Annotation> | undefined;
}

/**
 * Creates a collector for all annotations that need to be sent to the backend on save.
 *
 * Annotations live in three places, each handled by its own collector:
 * - inline annotations in the editor state: range annotations in their decoration, zero-points in the `_annotation`
 *   attribute of their node,
 * - structural nodes (blocks and hardBreaks) in the document, with their data in the `_annotation` attribute,
 * - block classifications in the `_blockClassifications` attribute of the block nodes they wrap.
 *
 * Every collector works the same way: each annotation that is currently in the editor gets its live
 * indices, text and status and is reduced to the properties configured in the guidelines, and every annotation that was part of the last saved state but is gone
 * from the editor is added as "deleted". Only clones are returned, so a failed save leaves the editor untouched.
 *
 * @param {EditorState} state - The current editor state.
 * @param {InitialAnnotations} initial - The inline and structural annotations of the last saved state.
 */
export function createAnnotationChangeCollector(state: EditorState, initial: InitialAnnotations) {
  const {
    getAnnotationExtent,
    getAnnotationFields,
    getAnnotationType,
    getEditorOwnedProperties,
    getStructuralAnnotationConfig,
    isBuiltinStructuralType,
    isConfiguredAnnotationType,
    isZeroPoint,
  } = useGuidelinesStore();

  /**
   * Collects and returns all properties for the neo4j payload of a structural annotation node.
   *
   * Single assembly point for a structural node's data which merges the different sources of truth:
   * - Domain props from the tiptap node's `_annotation` attribute (as configured in the guidelines),
   * - Editor-owned props from the live tiptap-native attrs (e.g. `level` for headings),
   * - uuid from the UniqueID extension
   * - The annotation type itself from the node's editor role (if a mapping between built-in and custom name was configured)
   *
   * @param {DocNode} node The Tiptap node from where the data should be collected.
   * @returns {Record<string, unknown>} The collected properties
   */
  function assembleStructuralAnnotationData(node: DocNode): Record<string, unknown> {
    const neo4jProperties: Record<string, unknown> = {};

    const editorRole: BuiltinStructuralType = node.type.name as BuiltinStructuralType;
    const annotationType: string = getAnnotationType(editorRole);
    const annotationData: Record<string, unknown> = (node.attrs._annotation as DocAnnotation | null)?.node.data ?? {};

    const editorOwned = getEditorOwnedProperties(annotationType);

    // 1. Domain properties: read from `_annotation`, skipping the editor-owned ones. Only configured properties
    // are taken: the ones of the structural type itself and the `system` and `base` ones every annotation has.
    const fields: PropertyConfig[] = [
      ...(getStructuralAnnotationConfig(annotationType)?.properties ?? []),
      ...getAnnotationFields(annotationType),
    ];

    fields.forEach((field: PropertyConfig) => {
      if (editorOwned.some((map) => map.property === field.name)) {
        return;
      }

      if (field.name in annotationData) {
        neo4jProperties[field.name] = annotationData[field.name];
      }
    });

    // 2. Editor-owned properties: read the live native node's attribute (level/colspan/rowspan/role) and store it
    // under its configured project property name (e.g. native `level` -> project `n`). Left out (which removes the
    // property from the saved node) are unset attributes (e.g. a cell without role) and, like in TEI, optional ones
    // with the node's default value (e.g. colspan 1), unless they were stored before.
    for (const { property, attribute, required } of editorOwned) {
      const value: unknown = node.attrs[attribute];

      if (value === undefined || value === null) {
        continue;
      }

      const isDefault: boolean = value === node.type.spec.attrs?.[attribute]?.default;

      if (!required && isDefault && !(property in annotationData)) {
        continue;
      }

      neo4jProperties[property] = value;
    }

    // 3. Authorative properties: type and uuid non-configurable, must always exist
    neo4jProperties.uuid = node.attrs.uuid;
    neo4jProperties.type = annotationType;

    if (getAnnotationExtent(annotationType) === "zeroPoint") {
      neo4jProperties.isZeroPoint = true;
    }

    return neo4jProperties;
  }

  /**
   * Returns all annotations of the last saved state that are no longer in the editor, as clones with status "deleted".
   *
   * @param {Map<string, Annotation> | undefined} initialMap - The annotations of the last saved state.
   * @param {Set<string>} liveUuids - The uuids of the annotations currently in the editor.
   * @param {(annotation: Annotation) => boolean} belongs - Optional filter to only consider a part of the initial annotations.
   * @returns {Annotation[]} The deleted annotations.
   */
  function collectDeleted(
    initialMap: Map<string, Annotation> | undefined,
    liveUuids: Set<string>,
    belongs: (annotation: Annotation) => boolean = () => true,
  ): Annotation[] {
    const deleted: Annotation[] = [];

    initialMap?.forEach((annotation: Annotation, uuid: string) => {
      if (!liveUuids.has(uuid) && belongs(annotation)) {
        deleted.push({ ...cloneDeep(annotation), meta: { status: "deleted" } });
      }
    });

    return deleted;
  }

  /**
   * Collects all annotations that need to be sent to the backend, based on the current state of the editor.
   *
   * @returns {{ annotations: Annotation[]; structureElements: Annotation[] }} The affected inline annotations
   *   and the affected structural annotations (structural nodes and block classifications).
   */
  function collectAnnotationChanges(): { annotations: Annotation[]; structureElements: Annotation[] } {
    const plainText: string = state.doc.textContent;

    const { inlineIndexMap, structureIndexMap, blockClassificationIndexMap } = createIndexMapBuilder(state).buildIndexMaps();

    return {
      annotations: collectInlineChanges(inlineIndexMap, plainText),
      structureElements: [
        ...collectStructureChanges(structureIndexMap, plainText),
        ...collectBlockClassificationChanges(blockClassificationIndexMap, plainText),
      ],
    };
  }

  /**
   * Collects the changed inline annotations (range decorations and zero-points) from the editor state.
   *
   * An annotation is affected if its range or text differs from the last saved state or if it was
   * created/modified intentionally by the user. The status stored in the editor only reflects the latter: range and text
   * changes are detected here and only set on the returned clones.
   *
   * @param {IndexMap} indexMap - The live ranges of all inline annotations in the editor.
   * @param {string} plainText - The plain text of the whole document.
   * @returns {Annotation[]} The affected annotations, including the deleted ones.
   */
  function collectInlineChanges(indexMap: IndexMap, plainText: string): Annotation[] {
    const affected: Annotation[] = [];

    const annotations: Map<string, Annotation> = collectInlineAnnotations(state);

    indexMap.forEach((range, uuid) => {
      const currentEntry: Annotation | undefined = annotations.get(uuid);
      const initialEntry: Annotation | undefined = initial.annotations?.get(uuid);

      if (!currentEntry) {
        console.error(`The annotation with uuid ${uuid} could not be found`);
        return;
      }

      const { startIndex, endIndex } = range;
      const isZeroPointAnno: boolean = isZeroPoint(currentEntry.node);

      const hasNewRange: boolean =
        initialEntry?.node.data.startIndex !== startIndex || initialEntry?.node.data.endIndex !== endIndex;
      const hasChangedText: boolean =
        !isZeroPointAnno && initialEntry?.node.data.text !== plainText.slice(startIndex, endIndex + 1);
      const isEditedOrDeleted: boolean = ["created", "deleted", "modified"].includes(currentEntry.meta.status);

      if (!hasNewRange && !hasChangedText && !isEditedOrDeleted) {
        return;
      }

      const cloned: Annotation = cloneDeep(currentEntry);

      stampRange(cloned, range, plainText, isZeroPointAnno);

      if (isZeroPointAnno) {
        cloned.node.data.isZeroPoint = true;
      } else {
        delete cloned.node.data.isZeroPoint;
      }

      pruneAnnotationData(cloned);

      if (cloned.meta.status !== "created" && (hasNewRange || hasChangedText)) {
        cloned.meta.status = "modified";
      }

      affected.push(cloned);
    });

    return [...affected, ...collectDeleted(initial.annotations, new Set<string>(indexMap.keys()))];
  }

  /**
   * Collects the block classifications from the `_blockClassifications` attributes in the document (the source of truth).
   *
   * @param {IndexMap} indexMap - The live ranges of all block classifications in the editor.
   * @param {string} plainText - The plain text of the whole document.
   * @returns {Annotation[]} The block classification annotations in the editor and the deleted ones.
   */
  function collectBlockClassificationChanges(indexMap: IndexMap, plainText: string): Annotation[] {
    const affected: Annotation[] = [];

    const blockClassifications: Map<string, DocAnnotation> = collectBlockClassifications(state.doc);

    indexMap.forEach((range, uuid) => {
      const entry: DocAnnotation | undefined = blockClassifications.get(uuid);

      if (!entry) {
        return;
      }

      const status: NodeStatus = initial.structuralAnnotations?.has(uuid) ? "modified" : "created";
      const annotation: Annotation = toAnnotation(entry, status);

      stampRange(annotation, range, plainText);
      pruneAnnotationData(annotation);

      affected.push(annotation);
    });

    const deleted: Annotation[] = collectDeleted(
      initial.structuralAnnotations,
      new Set<string>(indexMap.keys()),
      (annotation: Annotation) => !isBuiltinStructuralType(annotation.node.data.type),
    );

    return [...affected, ...deleted];
  }

  /**
   * Collects the structural nodes (blocks and hardBreaks) from the document.
   *
   * @param {IndexMap} indexMap - The live ranges of all structural nodes in the editor.
   * @param {string} plainText - The plain text of the whole document.
   * @returns {Annotation[]} The structural annotations in the editor and the deleted ones.
   */
  function collectStructureChanges(indexMap: IndexMap, plainText: string): Annotation[] {
    const affected: Annotation[] = [];
    const docNodes = new Map<string, DocNode>();

    state.doc.descendants((node: DocNode) => {
      if (isStructureElement(node)) {
        docNodes.set(node.attrs.uuid, node);
      }
    });

    indexMap.forEach((range, uuid) => {
      const docNode: DocNode | undefined = docNodes.get(uuid);

      if (!docNode) {
        console.error(`The annotation with uuid ${uuid} could not be found`);
        return;
      }

      const docAnnotation: DocAnnotation | null | undefined = docNode.attrs._annotation;

      // Always "modified" (not worth to fine-tune an it is likely anyway (text changes all the time))
      const status: NodeStatus = initial.structuralAnnotations?.has(uuid) ? "modified" : "created";

      const annotation: Annotation = {
        node: {
          data: assembleStructuralAnnotationData(docNode) as IAnnotation,
          nodeLabels: [...(docAnnotation?.node.nodeLabels ?? ["Annotation"])],
        },
        connectedNodes: cloneDeep(docAnnotation?.connectedNodes ?? []),
        meta: { status },
      };

      // Structural zero-points (hardBreaks) are treated like any other zero-point annotation
      stampRange(annotation, range, plainText, isZeroPoint(annotation.node));

      affected.push(annotation);
    });

    const deleted: Annotation[] = collectDeleted(
      initial.structuralAnnotations,
      new Set<string>(indexMap.keys()),
      (annotation: Annotation) => isBuiltinStructuralType(annotation.node.data.type),
    );

    return [...affected, ...deleted];
  }

  /**
   * Checks if a node is a structure element editor-wise, meaning that it is either a block element that contains text (like a `paragraph`) or a `hardBreak`.
   *
   * @param {DocNode} node - Tiptap node to be checked
   * @returns {boolean} `true` if the node is a structure element, `false` otherwise
   */
  function isStructureElement(node: DocNode): boolean {
    return node.type.isBlock || node.type.name === "hardBreak";
  }

  /**
   * Removes all properties from the given annotation that are not configured in the guidelines, in place.
   * Used for inline annotations and block classifications, whose data are sent as they are stored in the editor.
   *
   * Annotations of an unconfigured type are left untouched unless {@link PRUNE_UNCONFIGURED_ANNOTATION_TYPES} is set.
   *
   * @param {Annotation} annotation - The (cloned) annotation to prune.
   * @returns {void} This function does not return any value.
   */
  function pruneAnnotationData(annotation: Annotation): void {
    const type: string = annotation.node.data.type;

    if (!isConfiguredAnnotationType(type) && !PRUNE_UNCONFIGURED_ANNOTATION_TYPES) {
      return;
    }

    pruneUnconfiguredProperties(annotation.node.data, getAnnotationFields(type), INTRINSIC_ANNOTATION_PROPERTIES);
  }

  /**
   * Writes the live standoff range and the text it covers onto the given annotation.
   *
   * @param {Annotation} annotation - The (cloned) annotation to update.
   * @param {{ startIndex: number; endIndex: number }} range - The live range from the index map.
   * @param {string} plainText - The plain text of the whole document.
   * @param {boolean} hasNoText - Whether the annotation covers no text (zero-point annotations occupy an
   *   offset between characters, not a range).
   * @returns {void} This function does not return any value.
   */
  function stampRange(
    annotation: Annotation,
    range: { startIndex: number; endIndex: number },
    plainText: string,
    hasNoText: boolean = false,
  ): void {
    const { startIndex, endIndex } = range;

    annotation.node.data.startIndex = startIndex;
    annotation.node.data.endIndex = endIndex;
    annotation.node.data.text = hasNoText ? "" : plainText.slice(startIndex, endIndex + 1);
  }

  return {
    collectAnnotationChanges,
  };
}
