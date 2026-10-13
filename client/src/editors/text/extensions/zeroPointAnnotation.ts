import { Node, NodeViewRendererProps } from "@tiptap/core";
import { Annotation, Range } from "../../../models/types";
import { cloneDeep } from "../../../utils/helper/helper";
import { findNodeBoundariesByUuid } from "../../../utils/helper/tiptapHelper";

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

export const ZeroPointAnnotation = Node.create({
  name: "zeroPointAnnotation",
  group: "inline",
  inline: true,
  atom: true,

  addOptions() {
    return {};
  },

  addAttributes() {
    return {
      // The annotation itself (data, status and connected nodes). The attribute is its source of truth while it
      // is in the editor. Unlike on structural nodes and in `_semanticBlocks`, the status is included, since
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
    // TODO: This can be more elegant
    return (nodeProps: NodeViewRendererProps) => {
      const elm: HTMLElement = document.createElement("span");
      const annotation: Annotation | null = nodeProps.node.attrs._annotation;
      const annotationType: string = annotation?.node.data.type ?? "";
      const annotationSubType: string | number | undefined = annotation?.node.data.subType;

      elm.setAttribute("data-annotation-type", annotationType);
      elm.setAttribute("data-annotation-subtype", annotationSubType?.toString() ?? "");

      elm.classList.add(`annotation-type-marker-${annotationType}`);

      elm.style.display = "inline-block";

      elm.style.backgroundSize = "contain";
      elm.style.backgroundRepeat = "no-repeat";
      elm.style.backgroundPosition = "center";
      elm.style.width = "16px";
      elm.style.height = "16px";

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
            attrs: { _annotation: cloneDeep(annotation), uuid: annotation.node.data.uuid },
          });
        },

      updateZeroPointAnnotation:
        (annotation: Annotation) =>
        ({ tr, dispatch }) => {
          const range: Range | null = findNodeBoundariesByUuid(tr.doc, annotation.node.data.uuid);

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
          const range: Range | null = findNodeBoundariesByUuid(tr.doc, annotation.node.data.uuid);

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
