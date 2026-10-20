import { Attribute, Extension, GlobalAttributes } from "@tiptap/vue-3";
import { Annotation, AnnotationType, DocAnnotation } from "../../../models/types";
import { useGuidelinesStore } from "../../../store/guidelines";
import { VALID_BLOCK_CLASSIFICATION_TARGETS } from "../../../config/editor";
import { normalizeAnnotation, normalizeDocAnnotation, toDocAnnotation } from "../../../utils/helper/tiptapHelper";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    annotationAttributes: {
      /**
       * Attaches a block classification annotation to every valid block classification target between the given positions
       * by adding it to their `_blockClassifications` attribute.
       *
       * @param {Annotation} annotation - The block classification annotation to add.
       * @param {number} from - The document position where the block starts.
       * @param {number} to - The document position where the block ends.
       */
      addBlockClassification: (annotation: Annotation, from: number, to: number) => ReturnType;
      /**
       * Updates a block classification annotation, matched by its uuid, in the `_blockClassifications` attribute of every node
       * that carries it.
       *
       * @param {Annotation} annotation - The updated block classification annotation.
       */
      updateBlockClassification: (annotation: Annotation) => ReturnType;
      /**
       * Removes a block classification annotation from the `_blockClassifications` attribute of every node that carries it.
       *
       * @param {string} uuid - The uuid of the block classification annotation to remove.
       */
      removeBlockClassification: (uuid: string) => ReturnType;
      /**
       * Brings the annotations in the node attributes (`_annotation`, `_blockClassifications`) in line with the
       * database state after a successful save: connected nodes that were deleted or removed are dropped,
       * the remaining ones are set to "unchanged". Zero-point annotations are set to "unchanged" themselves, too.
       *
       * Not added to the undo history, since it does not reflect a user action.
       */
      resetDocAnnotationStatuses: () => ReturnType;
    };
  }
}

const { getStructuralAnnotationConfigs, getEditorRole } = useGuidelinesStore();

/**
 * Creates the annotation attributes for a structural node type. Both attributes hold {@link DocAnnotation} objects.
 *
 * - `_annotation`: the annotation of the node itself (e.g. the paragraph or table annotation). Defaults to an
 *   annotation that only carries the given type, so nodes created in the editor are usable before their first save which
 *   then adds uuid, indices etc.
 * - `_blockClassifications`: the block classification annotations that cover the node's range (e.g. an `opener` on the first
 *   paragraphs of a letter), sorted outermost-first. Empty when none. Only created for valid block classification targets {@link VALID_BLOCK_CLASSIFICATION_TARGETS}.
 *
 * @param {string} defaultType - The configured annotation type of the node type, used in the default `_annotation`.
 * @param {boolean} isBlockClassificationTarget - Whether the node type can be wrapped by block classifications and therefore
 *   needs the `_blockClassifications` attribute.
 * @returns {Record<string, Attribute>} The attribute definitions, keyed by attribute name.
 */
function createDefaultAttrs(defaultType: string, isBlockClassificationTarget: boolean): Record<string, Attribute> {
  const defaultAnnotation: DocAnnotation = {
    node: { data: { type: defaultType }, nodeLabels: ["Annotation"] } as DocAnnotation["node"],
    connectedNodes: [],
  };

  const attributes: Record<string, Attribute> = {
    _annotation: {
      default: defaultAnnotation,
      rendered: false,
    },
  };

  if (isBlockClassificationTarget) {
    attributes._blockClassifications = {
      default: [],
      renderHTML: (attrs) => {
        return {
          "data-block-classification-types": attrs._blockClassifications.map((b: DocAnnotation) => b.node.data.type).join(","),
        };
      },
    };
  }

  return attributes;
}

/**
 * Adds the `_annotation` attribute to all structural node types and the `_blockClassifications` attribute
 * to those that can be wrapped by block classifications. Both hold {@link DocAnnotation} objects.
 *
 * Built-in types (paragraph, heading, ...) use their own tiptap node type name; their annotation
 * lives in `_annotation`, which defaults to the configured type so freshly created nodes are usable
 * without a neo4j round-trip.
 *
 * Custom block/structural types (address, addrLine, closer, ...) are no tiptap nodes. Their annotations
 * live in the `_blockClassifications` attribute of every built-in block node they wrap.
 */
export const AnnotationAttributes = Extension.create({
  name: "annotationAttributes",

  addGlobalAttributes() {
    const builtinAttrs: GlobalAttributes = getStructuralAnnotationConfigs().map((config: AnnotationType) => {
      const editorRole: string = getEditorRole(config.type);

      return {
        types: [editorRole],
        attributes: createDefaultAttrs(config.type, VALID_BLOCK_CLASSIFICATION_TARGETS.includes(editorRole)),
      };
    });

    return [...builtinAttrs];
  },

  addCommands() {
    return {
      addBlockClassification:
        (annotation: Annotation, from: number, to: number) =>
        ({ tr, dispatch }) => {
          const newAnnotation: DocAnnotation = toDocAnnotation(annotation);

          tr.doc.nodesBetween(from, to, (node, pos) => {
            if (!VALID_BLOCK_CLASSIFICATION_TARGETS.includes(node.type.name) || node.isText) {
              return;
            }

            const existing: DocAnnotation[] = node.attrs._blockClassifications ?? [];
            const updated: DocAnnotation[] = [...existing, newAnnotation];

            tr.setNodeAttribute(pos, "_blockClassifications", updated);
          });

          dispatch?.(tr);

          return true;
        },
      updateBlockClassification:
        (annotation: Annotation) =>
        ({ tr, dispatch }) => {
          const updatedAnnotation: DocAnnotation = toDocAnnotation(annotation);
          const { uuid } = updatedAnnotation.node.data;

          tr.doc.descendants((node, pos) => {
            if (node.type.isText) {
              return;
            }

            const existing: DocAnnotation[] = node.attrs._blockClassifications ?? [];

            if (!existing.some((b) => b.node.data.uuid === uuid)) {
              return;
            }

            const updated: DocAnnotation[] = existing.map((b) => (b.node.data.uuid === uuid ? updatedAnnotation : b));

            tr.setNodeAttribute(pos, "_blockClassifications", updated);
          });

          dispatch?.(tr);

          return true;
        },
      removeBlockClassification:
        (uuid: string) =>
        ({ tr, dispatch }) => {
          tr.doc.descendants((node, pos) => {
            if (node.type.isText) {
              return;
            }

            const existing: DocAnnotation[] = node.attrs._blockClassifications ?? [];

            if (!existing.some((b) => b.node.data.uuid === uuid)) {
              return;
            }

            // Do NOT set status to 'deleted' - this is determined during save preprocessing
            // when checked what annotations are in the document

            // Remove block classification from node's `_blockClassifications` array
            tr.setNodeAttribute(
              pos,
              "_blockClassifications",
              existing.filter((b) => b.node.data.uuid !== uuid),
            );
          });

          dispatch?.(tr);

          return true;
        },
      resetDocAnnotationStatuses:
        () =>
        ({ tr, dispatch }) => {
          tr.doc.descendants((node, pos) => {
            if (node.type.isText) {
              return;
            }

            // Zero-point annotations carry their own status, which needs to be reset as well
            if (node.type.name === "zeroPointAnnotation") {
              const annotation: Annotation | null = node.attrs._annotation ?? null;

              if (annotation && (annotation.meta.status !== "unchanged" || annotation.connectedNodes.length > 0)) {
                tr.setNodeAttribute(pos, "_annotation", normalizeAnnotation(annotation));
              }

              return;
            }

            const docAnnotation: DocAnnotation | null = node.attrs._annotation ?? null;

            if (docAnnotation && docAnnotation.connectedNodes.length > 0) {
              tr.setNodeAttribute(pos, "_annotation", normalizeDocAnnotation(docAnnotation));
            }

            const blockClassifications: DocAnnotation[] = node.attrs._blockClassifications ?? [];

            if (blockClassifications.some((b) => b.connectedNodes.length > 0)) {
              tr.setNodeAttribute(
                pos,
                "_blockClassifications",
                blockClassifications.map((b) => normalizeDocAnnotation(b)),
              );
            }
          });

          tr.setMeta("addToHistory", false);

          dispatch?.(tr);

          return true;
        },
    };
  },
});
