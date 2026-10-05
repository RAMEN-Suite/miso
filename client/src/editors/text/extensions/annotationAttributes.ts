import { Attribute, Extension, GlobalAttributes } from "@tiptap/vue-3";
import { Annotation, AnnotationType, DocAnnotation } from "../../../models/types";
import { useGuidelinesStore } from "../../../store/guidelines";
import { VALID_SEMANTIC_BLOCK_TARGETS } from "../../../config/editor";
import { normalizeDocAnnotation, toDocAnnotation } from "../../../utils/helper/tiptapHelper";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    annotationAttributes: {
      /**
       * Attaches a semantic block annotation to every valid semantic block target between the given positions
       * by adding it to their `_semanticBlocks` attribute.
       *
       * @param {Annotation} annotation - The semantic block annotation to add.
       * @param {number} from - The document position where the block starts.
       * @param {number} to - The document position where the block ends.
       */
      addSemanticBlock: (annotation: Annotation, from: number, to: number) => ReturnType;
      /**
       * Updates a semantic block annotation, matched by its uuid, in the `_semanticBlocks` attribute of every node
       * that carries it.
       *
       * @param {Annotation} annotation - The updated semantic block annotation.
       */
      updateSemanticBlock: (annotation: Annotation) => ReturnType;
      /**
       * Removes a semantic block annotation from the `_semanticBlocks` attribute of every node that carries it.
       *
       * @param {string} uuid - The uuid of the semantic block annotation to remove.
       */
      removeSemanticBlock: (uuid: string) => ReturnType;
      /**
       * Brings the annotations in the node attributes (`_annotation`, `_semanticBlocks`) in line with the
       * database state after a successful save: connected nodes that were deleted or removed are dropped,
       * the remaining ones are set to "unchanged".
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
 * - `_semanticBlocks`: the semantic block annotations that cover the node's range (e.g. an `opener` on the first
 *   paragraphs of a letter), sorted outermost-first. Empty when none. Only created for valid semantic block targets {@link VALID_SEMANTIC_BLOCK_TARGETS}.
 *
 * @param {string} defaultType - The configured annotation type of the node type, used in the default `_annotation`.
 * @param {boolean} isSemanticBlockTarget - Whether the node type can be wrapped by semantic blocks and therefore
 *   needs the `_semanticBlocks` attribute.
 * @returns {Record<string, Attribute>} The attribute definitions, keyed by attribute name.
 */
function createDefaultAttrs(defaultType: string, isSemanticBlockTarget: boolean): Record<string, Attribute> {
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

  if (isSemanticBlockTarget) {
    attributes._semanticBlocks = {
      default: [],
      renderHTML: (attrs) => {
        return {
          "data-semantic-block-types": attrs._semanticBlocks.map((b: DocAnnotation) => b.node.data.type).join(","),
        };
      },
    };
  }

  return attributes;
}

/**
 * Adds the `_annotation` attribute to all structural node types and the `_semanticBlocks` attribute
 * to those that can be wrapped by semantic blocks. Both hold {@link DocAnnotation} objects.
 *
 * Built-in types (paragraph, heading, ...) use their own tiptap node type name; their annotation
 * lives in `_annotation`, which defaults to the configured type so freshly created nodes are usable
 * without a neo4j round-trip.
 *
 * Custom block/structural types (address, addrLine, closer, ...) are no tiptap nodes. Their annotations
 * live in the `_semanticBlocks` attribute of every built-in block node they wrap.
 */
export const AnnotationAttributes = Extension.create({
  name: "annotationAttributes",

  addGlobalAttributes() {
    const builtinAttrs: GlobalAttributes = getStructuralAnnotationConfigs().map((config: AnnotationType) => {
      const editorRole: string = getEditorRole(config.type);

      return {
        types: [editorRole],
        attributes: createDefaultAttrs(config.type, VALID_SEMANTIC_BLOCK_TARGETS.includes(editorRole)),
      };
    });

    return [...builtinAttrs];
  },

  addCommands() {
    return {
      addSemanticBlock:
        (annotation: Annotation, from: number, to: number) =>
        ({ tr, dispatch }) => {
          const newAnnotation: DocAnnotation = toDocAnnotation(annotation);

          tr.doc.nodesBetween(from, to, (node, pos) => {
            if (!VALID_SEMANTIC_BLOCK_TARGETS.includes(node.type.name) || node.isText) {
              return;
            }

            const existing: DocAnnotation[] = node.attrs._semanticBlocks ?? [];
            const updated: DocAnnotation[] = [...existing, newAnnotation];

            tr.setNodeAttribute(pos, "_semanticBlocks", updated);
          });

          dispatch?.(tr);

          return true;
        },
      updateSemanticBlock:
        (annotation: Annotation) =>
        ({ tr, dispatch }) => {
          const updatedAnnotation: DocAnnotation = toDocAnnotation(annotation);
          const { uuid } = updatedAnnotation.node.data;

          tr.doc.descendants((node, pos) => {
            if (node.type.isText) {
              return;
            }

            const existing: DocAnnotation[] = node.attrs._semanticBlocks ?? [];

            if (!existing.some((b) => b.node.data.uuid === uuid)) {
              return;
            }

            const updated: DocAnnotation[] = existing.map((b) => (b.node.data.uuid === uuid ? updatedAnnotation : b));

            tr.setNodeAttribute(pos, "_semanticBlocks", updated);
          });

          dispatch?.(tr);

          return true;
        },
      removeSemanticBlock:
        (uuid: string) =>
        ({ tr, dispatch }) => {
          tr.doc.descendants((node, pos) => {
            if (node.type.isText) {
              return;
            }

            const existing: DocAnnotation[] = node.attrs._semanticBlocks ?? [];

            if (!existing.some((b) => b.node.data.uuid === uuid)) {
              return;
            }

            // Do NOT set status to 'deleted' - this is determined during save preprocessing
            // when checked what annotations are in the document

            // Remove semantic block from node's `_semanticBlocks` array
            tr.setNodeAttribute(
              pos,
              "_semanticBlocks",
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
            // Zero-point annotations are saved from the annotation store
            if (node.type.isText || node.type.name === "zeroPointAnnotation") {
              return;
            }

            const docAnnotation: DocAnnotation | null = node.attrs._annotation ?? null;

            if (docAnnotation && docAnnotation.connectedNodes.length > 0) {
              tr.setNodeAttribute(pos, "_annotation", normalizeDocAnnotation(docAnnotation));
            }

            const semanticBlocks: DocAnnotation[] = node.attrs._semanticBlocks ?? [];

            if (semanticBlocks.some((b) => b.connectedNodes.length > 0)) {
              tr.setNodeAttribute(
                pos,
                "_semanticBlocks",
                semanticBlocks.map((b) => normalizeDocAnnotation(b)),
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
