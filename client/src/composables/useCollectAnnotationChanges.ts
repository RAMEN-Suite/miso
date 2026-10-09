import { Node as DocNode } from "@tiptap/pm/model";
import { IAnnotation } from "../models/IAnnotation";
import { Annotation, BuiltinStructuralType, DocAnnotation, IndexMap, NodeStatus, PropertyConfig } from "../models/types";
import { useGuidelinesStore } from "../store/guidelines";
import { useTiptapStore } from "../store/tiptap";
import { INTRINSIC_ANNOTATION_PROPERTIES, PRUNE_UNCONFIGURED_ANNOTATION_TYPES } from "../config/editor";
import { cloneDeep, pruneUnconfiguredProperties } from "../utils/helper/helper";
import { collectSemanticBlocks, toAnnotation } from "../utils/helper/tiptapHelper";
import { useCreateIndexMaps } from "./useCreateIndexMaps";

/**
 * Composable that collects all annotations that need to be sent to the backend on save.
 *
 * Annotations live in three places, each handled by its own collector:
 * - inline annotations (range decorations and zero-points) in the annotation store,
 * - structural nodes (blocks and hardBreaks) in the document, with their data in the `_annotation` attribute,
 * - semantic blocks in the `_semanticBlocks` attribute of the block nodes they wrap.
 *
 * Every collector works the same way: each annotation that is currently in the editor gets its live
 * indices, text and status and is reduced to the properties configured in the guidelines, and every annotation that was part of the last saved state but is gone
 * from the editor is added as "deleted". Only clones are returned, so a failed save leaves the editor untouched.
 *
 * Requires an initialised tiptap editor when `collectAnnotationChanges` is called.
 */
export function useCollectAnnotationChanges() {
  const { annotations, initialAnnotations, initialStructuralAnnotations, tiptap } = useTiptapStore();

  const {
    getAnnotationBehaviour,
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

    // 2. Editor-owned properties: read the live native node's attribute (level/colspan/rowspan) and store it
    // under its configured project property name (e.g. native `level` -> project `n`).
    for (const { property, attribute } of editorOwned) {
      if (node.attrs[attribute] !== undefined) {
        neo4jProperties[property] = node.attrs[attribute];
      }
    }

    // 3. Authorative properties: type and uuid non-configurable, must always exist
    neo4jProperties.uuid = node.attrs.uuid;
    neo4jProperties.type = annotationType;

    if (getAnnotationBehaviour(annotationType) === "zeroPoint") {
      neo4jProperties.isZeroPoint = true;
    }

    return neo4jProperties;
  }

  /**
   * Returns all annotations of the last saved state that are no longer in the editor, as clones with status "deleted".
   *
   * @param {Map<string, Annotation> | undefined} initial - The annotations of the last saved state.
   * @param {Set<string>} liveUuids - The uuids of the annotations currently in the editor.
   * @param {(annotation: Annotation) => boolean} belongs - Optional filter to only consider a part of the initial annotations.
   * @returns {Annotation[]} The deleted annotations.
   */
  function collectDeleted(
    initial: Map<string, Annotation> | undefined,
    liveUuids: Set<string>,
    belongs: (annotation: Annotation) => boolean = () => true,
  ): Annotation[] {
    const deleted: Annotation[] = [];

    initial?.forEach((annotation: Annotation, uuid: string) => {
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
   *   and the affected structural annotations (structural nodes and semantic blocks).
   */
  function collectAnnotationChanges(): { annotations: Annotation[]; structureElements: Annotation[] } {
    const plainText: string = tiptap.value?.state.doc.textContent ?? "";

    const { inlineIndexMap, structureIndexMap, semanticBlockIndexMap } = useCreateIndexMaps().buildIndexMaps();

    return {
      annotations: collectInlineChanges(inlineIndexMap, plainText),
      structureElements: [
        ...collectStructureChanges(structureIndexMap, plainText),
        ...collectSemanticBlockChanges(semanticBlockIndexMap, plainText),
      ],
    };
  }

  /**
   * Collects the changed inline annotations (range decorations and zero-points) from the annotation store.
   *
   * An annotation is affected if its range or text differs from the last saved state or if it was
   * created/modified externally in the editor.
   *
   * @param {IndexMap} indexMap - The live ranges of all inline annotations in the editor.
   * @param {string} plainText - The plain text of the whole document.
   * @returns {Annotation[]} The affected annotations, including the deleted ones.
   */
  function collectInlineChanges(indexMap: IndexMap, plainText: string): Annotation[] {
    const affected: Annotation[] = [];

    indexMap.forEach((range, uuid) => {
      const currentEntry: Annotation | undefined = annotations.value?.get(uuid);
      const initialEntry: Annotation | undefined = initialAnnotations.value?.get(uuid);

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

    return [...affected, ...collectDeleted(initialAnnotations.value, new Set<string>(indexMap.keys()))];
  }

  /**
   * Collects the semantic blocks from the `_semanticBlocks` attributes in the document (the source of truth).
   *
   * @param {IndexMap} indexMap - The live ranges of all semantic blocks in the editor.
   * @param {string} plainText - The plain text of the whole document.
   * @returns {Annotation[]} The semantic block annotations in the editor and the deleted ones.
   */
  function collectSemanticBlockChanges(indexMap: IndexMap, plainText: string): Annotation[] {
    const affected: Annotation[] = [];

    const semanticBlocks: Map<string, DocAnnotation> = tiptap.value ? collectSemanticBlocks(tiptap.value.state.doc) : new Map();

    indexMap.forEach((range, uuid) => {
      const entry: DocAnnotation | undefined = semanticBlocks.get(uuid);

      if (!entry) {
        return;
      }

      const status: NodeStatus = initialStructuralAnnotations.value?.has(uuid) ? "modified" : "created";
      const annotation: Annotation = toAnnotation(entry, status);

      stampRange(annotation, range, plainText);
      pruneAnnotationData(annotation);

      affected.push(annotation);
    });

    const deleted: Annotation[] = collectDeleted(
      initialStructuralAnnotations.value,
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

    tiptap.value?.state.doc.descendants((node: DocNode) => {
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
      const status: NodeStatus = initialStructuralAnnotations.value?.has(uuid) ? "modified" : "created";

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
      initialStructuralAnnotations.value,
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
   * Used for inline annotations and semantic blocks, whose data are sent as they are stored in the editor.
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
