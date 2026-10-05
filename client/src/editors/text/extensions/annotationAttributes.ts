import { Attribute, Extension, GlobalAttributes } from "@tiptap/vue-3";
import { Annotation, AnnotationType } from "../../../models/types";
import { useGuidelinesStore } from "../../../store/guidelines";
import { VALID_SEMANTIC_BLOCK_TARGETS } from "../../../config/editor";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    annotationAttributes: {
      addSemanticBlock: (annotation: Annotation, from: number, to: number) => ReturnType;
      updateSemanticBlock: (annotation: Annotation) => ReturnType;
      removeSemanticBlock: (uuid: string) => ReturnType;
    };
  }
}

const { getStructuralAnnotationConfigs, getEditorRole } = useGuidelinesStore();

// Returns {_annotationData, _semanticBlocks } attributes.
// _annotationData: full neo4j round-trip payload; default = { type } for built-ins
// _semanticBlocks: custom structural annotations (closer, address, …) that wrap this node's range,
//  stored as an array of full annotation data objects sorted outermost-first. null when none.
function createDefaultAttrs(defaultType: string | null): Record<string, Attribute> {
  return {
    _annotationData: {
      default: defaultType !== null ? { type: defaultType } : null,
      rendered: false,
    },
    _semanticBlocks: {
      default: [],
      renderHTML: (attributes) => {
        return {
          "data-semantic-block-types": attributes._semanticBlocks.map((b: Annotation) => b.node.data.type).join(","),
        };
      },
    },
  };
}

/**
 * Adds `_annotationData`, `_semanticBlocks` and per-property attributes to all structural node types.
 *
 * Their per-property data lives in `_annotationData`;
 * Built-in types (paragraph, heading, ...) use their own tiptap node type name and get
 * per-property attributes from the guidelines config so freshly created nodes are usable without a neo4j round-trip.
 *
 * Custom block/structural types (address, addrLine, closer, ...) live in the structural annotations store whose
 * uuid and type properties are derived to the tiptap node here
 */
export const AnnotationAttributes = Extension.create({
  name: "annotationAttributes",

  // Disabled: type is now derived from the live node (node.type.name -> getAnnotationType)
  // wherever it's needed, so no per-transaction sync into `_annotationData.type` is required.
  // Kept (with `transferTiptapTypeToAnnotationType`) for easy reversal.
  // onUpdate({ editor }) {
  //   transferTiptapTypeToAnnotationType(editor.state.doc);
  // },
  addGlobalAttributes() {
    const builtinAttrs: GlobalAttributes = getStructuralAnnotationConfigs().map((config: AnnotationType) => {
      return {
        types: [getEditorRole(config.type)],
        attributes: createDefaultAttrs(config.type),
      };
    });
    console.log(builtinAttrs);

    return [...builtinAttrs];
  },

  addCommands() {
    return {
      addSemanticBlock:
        (newAnnotation: Annotation, from: number, to: number) =>
        ({ tr, dispatch }) => {
          tr.doc.nodesBetween(from, to, (node, pos) => {
            if (!VALID_SEMANTIC_BLOCK_TARGETS.includes(node.type.name) || node.isText) {
              return;
            }

            const existing: Annotation[] = node.attrs._semanticBlocks ?? [];
            const updated: Annotation[] = [...existing, newAnnotation];

            tr.setNodeAttribute(pos, "_semanticBlocks", updated);
          });

          dispatch?.(tr);

          return true;
        },
      updateSemanticBlock:
        (annotation: Annotation) =>
        ({ tr, dispatch }) => {
          tr.doc.descendants((node, pos) => {
            if (node.type.isText) {
              return;
            }

            const { uuid } = annotation.node.data;

            const existing: Annotation[] = node.attrs._semanticBlocks ?? [];

            if (!existing.some((b) => b.node.data.uuid === uuid)) {
              return;
            }

            const updated: Annotation[] = [...existing.filter((b) => b.node.data.uuid !== uuid), annotation];

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

            const existing: Annotation[] = node.attrs._semanticBlocks ?? [];

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
    };
  },
});
