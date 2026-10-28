import { Attribute, Extension, GlobalAttributes } from "@tiptap/core";
import { DocAnnotation } from "../models/types";
import { Annotation, AnnotationType, useGuidelinesStore } from "../external";
import { VALID_BLOCK_CLASSIFICATION_TARGETS } from "../config/editor";
import {
  createDefaultDocAnnotation,
  normalizeAnnotation,
  normalizeDocAnnotation,
  toDocAnnotation,
} from "../utils/helper/annotationHelper";

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
       * Replaces the `_annotation` attribute of a structural node.
       *
       * @param {string} uuid - The node's `uuid` attribute.
       * @param {Annotation} annotation - The updated annotation.
       */
      updateStructuralAnnotation: (uuid: string, annotation: Annotation) => ReturnType;
      /**
       * Brings the node attributes (`_annotation`, `_blockClassifications`) in line with the database after a save:
       * structural annotations and block classifications are replaced by their saved version, deleted/removed connectedNodes
       * are dropped and all statuses are set to "unchanged". Not added to the undo history.
       *
       * @param {Map<string, Annotation>} savedStructuralAnnotations - The saved structural annotations and block
       *   classifications, keyed by uuid.
       */
      applySavedDocAnnotations: (savedStructuralAnnotations: Map<string, Annotation>) => ReturnType;
    };
  }
}

const { getStructuralAnnotationConfigs, getEditorRole } = useGuidelinesStore();

/**
 * Creates the annotation attributes for a structural node type. Both hold {@link DocAnnotation} objects.
 *
 * - `_annotation`: the annotation of the node itself. Defaults to one that only carries the given type, so new nodes
 *   are usable before their first save.
 * - `_blockClassifications`: the block classifications covering the node (e.g. an `opener`), sorted outermost-first.
 *   Only created for {@link VALID_BLOCK_CLASSIFICATION_TARGETS}.
 *
 * Only properties and connected nodes are kept up to date during editing. Type, uuid, indices, text and editor-owned
 * properties come from the document on save and are stale until the saved version is written back
 * (command applySavedDocAnnotations).
 *
 * @param {string} defaultType - The configured annotation type of the node type, used in the default `_annotation`.
 * @param {boolean} isBlockClassificationTarget - Whether the node type can be wrapped by block classifications and therefore
 *   needs the `_blockClassifications` attribute.
 * @returns {Record<string, Attribute>} The attribute definitions, keyed by attribute name.
 */
function createDefaultAttrs(defaultType: string, isBlockClassificationTarget: boolean): Record<string, Attribute> {
  const attributes: Record<string, Attribute> = {
    _annotation: {
      default: createDefaultDocAnnotation(defaultType),
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
 * Adds `_annotation` to all structural node types and `_blockClassifications` to the block classification targets
 * (see {@linkcode createDefaultAttrs}).
 *
 * Built-in types (paragraph, heading, ...) are tiptap nodes with their annotation in `_annotation`. Block
 * classifications (address, closer, ...) are no nodes; they live in `_blockClassifications` of every node they cover.
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

            tr.setNodeAttribute(
              pos,
              "_blockClassifications",
              existing.filter((b) => b.node.data.uuid !== uuid),
            );
          });

          dispatch?.(tr);

          return true;
        },
      updateStructuralAnnotation:
        (uuid: string, annotation: Annotation) =>
        ({ tr, dispatch }) => {
          let isFound: boolean = false;

          tr.doc.descendants((node, pos) => {
            if (isFound) {
              return false;
            }

            if (node.attrs.uuid === uuid) {
              tr.setNodeAttribute(pos, "_annotation", toDocAnnotation(annotation));
              isFound = true;

              return false;
            }
          });

          dispatch?.(tr);

          return isFound;
        },
      applySavedDocAnnotations:
        (savedStructuralAnnotations: Map<string, Annotation>) =>
        ({ tr, dispatch }) => {
          // Saved version if there is one, else the stored one; normalized either way
          const toSaved = (docAnnotation: DocAnnotation, uuid: string): DocAnnotation => {
            const saved: Annotation | undefined = savedStructuralAnnotations.get(uuid);

            return normalizeDocAnnotation(saved ? toDocAnnotation(saved) : docAnnotation);
          };

          tr.doc.descendants((node, pos) => {
            if (node.type.isText) {
              return;
            }

            // Zero-point annotations carry their own status
            if (node.type.name === "zeroPointAnnotation") {
              const annotation: Annotation | null = node.attrs._annotation ?? null;

              if (annotation && (annotation.meta.status !== "unchanged" || annotation.connectedNodes.length > 0)) {
                tr.setNodeAttribute(pos, "_annotation", normalizeAnnotation(annotation));
              }

              return;
            }

            const docAnnotation: DocAnnotation | null = node.attrs._annotation ?? null;

            if (docAnnotation) {
              tr.setNodeAttribute(pos, "_annotation", toSaved(docAnnotation, node.attrs.uuid));
            }

            const blockClassifications: DocAnnotation[] = node.attrs._blockClassifications ?? [];

            if (blockClassifications.length > 0) {
              tr.setNodeAttribute(
                pos,
                "_blockClassifications",
                blockClassifications.map((b) => toSaved(b, b.node.data.uuid)),
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
