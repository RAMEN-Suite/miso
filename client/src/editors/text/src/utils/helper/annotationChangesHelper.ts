import { Node as DocNode } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { DocAnnotation, IndexMap, NativeShape, TextRange } from "../../models/types";
import { isNativeType } from "../../config/constants";
import {
  Annotation,
  ElementNodeStatus,
  IAnnotation,
  ModelAnnotationShape,
  cloneDeep,
  createTextPositionSelector,
  familyRefOf,
  getShapeProperties,
  pruneUnconfiguredProperties,
  shapeRefOf,
  useConfigStore,
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
 * indices, text and status and is reduced to the properties in the config, and every annotation that was part of the
 * last saved state but is gone from the editor is added as "deleted". Only clones are returned, so a failed save leaves the editor untouched.
 *
 * @param {EditorState} state - The current editor state.
 * @param {InitialAnnotations} initial - The inline and structural annotations of the last saved state.
 */
export function createAnnotationChangeCollector(state: EditorState, initial: InitialAnnotations) {
  const {
    getAnnotationExtent,
    getAnnotationNodeProperties,
    getAnnotationShape,
    getEditorOwnedProperties,
    getNativeType,
    getShapeOfNative,
    isZeroPoint,
  } = useConfigStore();

  /**
   * Collects and returns the properties a structural annotation node is saved with.
   *
   * Single assembly point for a structural node's data which merges the different sources of truth:
   * - Domain props from the tiptap node's `_annotation` attribute (as declared in the config),
   * - Editor-owned props from the live tiptap-native attrs (e.g. `level` for headings),
   * - uuid from the UniqueID extension
   * - The annotation type itself from the shape mapped to the node's native type
   *
   * @param {DocNode} node The Tiptap node from where the data should be collected.
   * @param {NativeShape} nativeShape The node's native type and the annotation shape mapped to it.
   * @returns {Record<string, unknown>} The collected properties
   */
  function assembleStructuralAnnotationData(node: DocNode, { native, shape }: NativeShape): Record<string, unknown> {
    const savedProperties: Record<string, unknown> = {};

    const annotationData: Record<string, unknown> = (node.attrs._annotation as DocAnnotation | null)?.node.properties ?? {};

    const editorOwned = getEditorOwnedProperties(native);

    // 1. Domain properties: read from `_annotation`, skipping the editor-owned ones. Only the properties of the
    // annotation shape in the model are taken.
    const names: string[] = getShapeProperties(shape).map((field) => field.attribute.name);

    names.forEach((name: string) => {
      if (editorOwned.some((map) => map.property === name)) {
        return;
      }

      if (name in annotationData) {
        savedProperties[name] = annotationData[name];
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

      savedProperties[property] = value;
    }

    // 3. Authorative properties: type and uuid non-configurable, must always exist
    savedProperties.uuid = node.attrs.uuid;
    savedProperties.type = shape.type;

    if (getAnnotationExtent(shape) === "zeroPoint") {
      savedProperties.isZeroPoint = true;
    }

    return savedProperties;
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
        deleted.push({ ...cloneDeep(annotation), status: "deleted" });
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
   * An annotation is affected if its range or text differs from the last saved state, if it was created/modified
   * intentionally by the user, or if a node or relation below it changed (e.g. a reference). The status stored in the
   * editor only reflects the user's changes: range and text changes are detected here and only set on the returned clones.
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

      const { start, end } = range;
      const isZeroPointAnno: boolean = isZeroPoint(currentEntry.node);

      const hasNewRange: boolean =
        initialEntry?.node.properties.selector?.start !== start || initialEntry?.node.properties.selector?.end !== end;
      const hasChangedText: boolean = !isZeroPointAnno && initialEntry?.node.properties.text !== plainText.slice(start, end + 1);
      const isEdited: boolean =
        currentEntry.status !== "unchanged" ||
        currentEntry.nodes.some((node) => node.status !== "unchanged") ||
        currentEntry.relations.some((relation) => relation.status !== "unchanged");

      if (!hasNewRange && !hasChangedText && !isEdited) {
        return;
      }

      const cloned: Annotation = cloneDeep(currentEntry);

      stampSelector(cloned, range, plainText, isZeroPointAnno);

      if (isZeroPointAnno) {
        cloned.node.properties.isZeroPoint = true;
      } else {
        delete cloned.node.properties.isZeroPoint;
      }

      pruneAnnotationData(cloned);

      if (cloned.status !== "created" && (hasNewRange || hasChangedText)) {
        cloned.status = "modified";
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

      const status: ElementNodeStatus = initial.structuralAnnotations?.has(uuid) ? "modified" : "created";
      const annotation: Annotation = toAnnotation(entry, status);

      stampSelector(annotation, range, plainText);
      pruneAnnotationData(annotation);

      affected.push(annotation);
    });

    const deleted: Annotation[] = collectDeleted(
      initial.structuralAnnotations,
      new Set<string>(indexMap.keys()),
      (annotation: Annotation) => !isMappedToNativeType(annotation),
    );

    return [...affected, ...deleted];
  }

  /**
   * Collects the structural nodes (blocks and hardBreaks) from the document.
   *
   * @param {IndexMap} indexMap - The live ranges of all structural nodes in the editor.
   * @param {string} plainText - The plain text of the whole document.
   * @returns {Annotation[]} The structural annotations in the editor and the deleted ones.
   * @throws {Error} If a node's native type has no annotation shape mapped to it (the config check prevents it).
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
      // The native type decides, so a paragraph turned into a heading gets the heading's shape
      const native: string = docNode.type.name;
      const shape: ModelAnnotationShape | undefined = isNativeType(native) ? getShapeOfNative(native) : undefined;

      if (!isNativeType(native) || !shape) {
        throw new Error(`No annotation shape is mapped to "${native}".`);
      }

      // Always "modified" (not worth to fine-tune an it is likely anyway (text changes all the time))
      const status: ElementNodeStatus = initial.structuralAnnotations?.has(uuid) ? "modified" : "created";

      const annotation: Annotation = {
        node: {
          properties: assembleStructuralAnnotationData(docNode, { native, shape }) as IAnnotation,
          nodeLabels: [...(docAnnotation?.node.nodeLabels ?? ["Annotation"])],
          shapeRef: shapeRefOf(shape),
          classifierRef: familyRefOf(shape),
        },
        status,
        nodes: cloneDeep(docAnnotation?.nodes ?? []),
        relations: cloneDeep(docAnnotation?.relations ?? []),
      };

      // Structural zero-points (hardBreaks) are treated like any other zero-point annotation
      stampSelector(annotation, range, plainText, isZeroPoint(annotation.node));

      affected.push(annotation);
    });

    const deleted: Annotation[] = collectDeleted(
      initial.structuralAnnotations,
      new Set<string>(indexMap.keys()),
      (annotation: Annotation) => isMappedToNativeType(annotation),
    );

    return [...affected, ...deleted];
  }

  /**
   * Checks if an annotation's shape is mapped to a native type, i.e. whether the editor keeps it as a node.
   *
   * @param {Annotation} annotation - The annotation.
   * @returns {boolean} `true` if its shape is mapped, `false` otherwise (also without a shape).
   */
  function isMappedToNativeType(annotation: Annotation): boolean {
    const shape: ModelAnnotationShape | undefined = getAnnotationShape(annotation.node);

    return shape !== undefined && getNativeType(shape) !== undefined;
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
   * Removes all properties from the given annotation that are not in the config, in place.
   * Used for inline annotations and block classifications, whose data are sent as they are stored in the editor.
   *
   * Annotations of an unconfigured type keep only their node and editor properties.
   *
   * @param {Annotation} annotation - The (cloned) annotation to prune.
   * @returns {void} This function does not return any value.
   */
  function pruneAnnotationData(annotation: Annotation): void {
    const shape: ModelAnnotationShape | undefined = getAnnotationShape(annotation.node);

    pruneUnconfiguredProperties(
      annotation.node.properties,
      shape ? getShapeProperties(shape).map((field) => field.attribute.name) : [],
      getAnnotationNodeProperties(annotation.node),
    );
  }

  /**
   * Writes the live selector and the text it covers onto the annotation.
   *
   * @param {Annotation} annotation - The (cloned) annotation to update.
   * @param {TextRange} range - The live range from the index map.
   * @param {string} plainText - The plain text of the whole document.
   * @param {boolean} hasNoText - Whether the annotation covers no text (zero points).
   */
  function stampSelector(annotation: Annotation, range: TextRange, plainText: string, hasNoText: boolean = false): void {
    const { start, end } = range;

    annotation.node.properties.selector = createTextPositionSelector(start, end);
    annotation.node.properties.text = hasNoText ? "" : plainText.slice(start, end + 1);
  }

  return {
    collectAnnotationChanges,
  };
}
