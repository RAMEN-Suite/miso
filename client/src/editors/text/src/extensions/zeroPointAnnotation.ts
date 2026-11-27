import { Node, NodeViewRendererProps } from "@tiptap/core";
import { Annotation, AnnotationAppearance, cloneDeep } from "../external";
import { Range } from "../models/types";
import { renderMarker } from "../rendering/marker";
import { findNodeBoundariesByUuid } from "../utils/helper/positionHelper";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    zeroPointAnnotation: {
      /**
       * Inserts a zero-point annotation at the given position (defaults to the selection start). The annotation
       * is cloned and stored in the node's `_annotation` attribute.
       *
       * @param {Annotation} annotation - The annotation to add.
       * @param {number} position - The document position to insert the annotation at.
       */
      addZeroPointAnnotation: (annotation: Annotation, position?: number) => ReturnType;
      /**
       * Replaces the data of an existing zero-point annotation, matched by its uuid.
       *
       * @param {Annotation} annotation - The updated annotation.
       */
      updateZeroPointAnnotation: (annotation: Annotation) => ReturnType;
      /**
       * Removes a zero-point annotation, matched by its uuid, from the document.
       *
       * @param {Annotation} annotation - The annotation to remove.
       */
      removeZeroPointAnnotation: (annotation: Annotation) => ReturnType;
    };
  }
}

interface ZeroPointAttributes {
  uuid: string;
  _annotation: Annotation | null;
}

interface ZeroPointOptions {
  /** Returns the configured appearance of the given annotation type, used to render its marker. */
  getAppearance: (type: string) => AnnotationAppearance | undefined;
}

export const ZeroPointAnnotation = Node.create<ZeroPointOptions>({
  name: "zeroPointAnnotation",
  group: "inline",
  inline: true,
  atom: true,

  addOptions() {
    return {
      getAppearance: () => undefined,
    };
  },

  addAttributes() {
    return {
      // The annotation itself (data, status, nodes and relations). The attribute is its source of truth while it
      // is in the editor. Unlike on structural nodes and in `_blockClassifications`, the status is included, since
      // zero-point annotations are only saved when they were created or changed.
      _annotation: {
        default: null,
        rendered: false,
      },
      // Identifies the annotation. Separate attribute since it is managed by the
      // UniqueID extension (e.g. regenerated for duplicated nodes).
      uuid: {
        default: null,
        isRequired: true,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-annotation-uuid"),
        renderHTML: (attributes: ZeroPointAttributes) => {
          return {
            "data-annotation-uuid": attributes.uuid,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-annotation-uuid]",
      },
    ];
  },

  addNodeView() {
    return (nodeProps: NodeViewRendererProps) => {
      const elm: HTMLElement = document.createElement("span");
      const annotation: Annotation | null = nodeProps.node.attrs._annotation;
      const annotationType: string = annotation?.node.properties.type ?? "";

      elm.setAttribute("data-annotation-type", annotationType);

      renderMarker(elm, this.options.getAppearance(annotationType), annotation?.node.properties);

      return { dom: elm };
    };
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", { ...HTMLAttributes }];
  },

  addCommands() {
    return {
      addZeroPointAnnotation:
        (annotation: Annotation, position?: number) =>
        ({ commands }) => {
          const pos: number = position ?? this.editor.state.selection.from;

          return commands.insertContentAt(pos, {
            type: this.name,
            attrs: { _annotation: cloneDeep(annotation), uuid: annotation.node.properties.uuid },
          });
        },

      updateZeroPointAnnotation:
        (annotation: Annotation) =>
        ({ tr, dispatch }) => {
          const range: Range | null = findNodeBoundariesByUuid(tr.doc, annotation.node.properties.uuid);

          if (!range) {
            return false;
          }

          // Cloned since the annotation is stored in the document and must not share references
          // with the caller (e.g. reactive form data)
          tr.setNodeAttribute(range.from, "_annotation", cloneDeep(annotation));

          dispatch?.(tr);

          return true;
        },

      removeZeroPointAnnotation:
        (annotation: Annotation) =>
        ({ tr, dispatch }) => {
          const range: Range | null = findNodeBoundariesByUuid(tr.doc, annotation.node.properties.uuid);

          if (!range) {
            return false;
          }

          // Do NOT set status to 'deleted' - this is determined during save preprocessing
          // when checked what annotations are in the document
          tr.delete(range.from, range.to);

          dispatch?.(tr);

          return true;
        },
    };
  },
});
