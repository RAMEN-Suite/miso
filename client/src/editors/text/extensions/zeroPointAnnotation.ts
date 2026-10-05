import { Node, NodeViewRendererProps } from "@tiptap/core";
import { Annotation, DocAnnotation } from "../../../models/types";
import { toDocAnnotation } from "../../../utils/helper/tiptapHelper";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    zeroPointAnnotation: {
      addZeroPointAnnotation: (annotation: Annotation, position?: number) => ReturnType;
    };
  }
}

interface ZeroPointAttributes {
  uuid: string;
  _annotation: DocAnnotation | null;
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
      // Same object as on structural nodes and in `_semanticBlocks`. Snapshot of the annotation at creation/parse
      // time: the annotation store stays the source of truth for zero-point annotations (edits, save).
      _annotation: {
        default: null,
        rendered: false,
      },
      // Identifies the annotation in the annotation store. Separate attribute since it is managed by the
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
      const docAnnotation: DocAnnotation | null = nodeProps.node.attrs._annotation;
      const annotationType: string = docAnnotation?.node.data.type ?? "";
      const annotationSubType: string | number | undefined = docAnnotation?.node.data.subType;

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
            attrs: { _annotation: toDocAnnotation(annotation), uuid: annotation.node.data.uuid },
          });
        },
    };
  },
});
