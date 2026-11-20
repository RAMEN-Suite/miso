import { useDialog } from "primevue";
import { Annotation, ModelAnnotationShape } from "../models/types";
import { useTiptapStore } from "../store/tiptap";
import { useConfigStore } from "../store/config";
import { useAppStore } from "../store/app";
import { useCreateAnnotation } from "./useCreateAnnotation";
import { ANNOTATION_MODAL_PROPS } from "../config/modals";
import AnnotationDetailsModal from "../components/AnnotationDetailsModal.vue";

/**
 * Inserts line breaks (button and Shift/Mod+Enter). Needs to be called in a component's setup, since it opens a dialog.
 *
 * @returns The function to insert a line break.
 */
export function useInsertLineBreak() {
  const { tiptap } = useTiptapStore();
  const { getAnnotationType, getTextAnnotationShape, annotationHasConstraints } = useConfigStore();
  const { createModalInstance, destroyModalInstance } = useAppStore();
  const { createTextAnnotation } = useCreateAnnotation("Content");

  const dialog: ReturnType<typeof useDialog> = useDialog();

  /**
   * Inserts a line break at the selection. If the line break type has constraints (required properties or
   * references), the {@linkcode AnnotationDetailsModal} opens first and the line break is only inserted on submit, so no
   * line break without its required data exists. Otherwise it's inserted right away.
   *
   * @returns {void} This function does not return any value.
   */
  function insertLineBreak(): void {
    if (!tiptap.value) {
      return;
    }

    const type: string = getAnnotationType("hardBreak");
    const shape: ModelAnnotationShape | undefined = getTextAnnotationShape(type);

    if (!shape || !annotationHasConstraints(shape)) {
      tiptap.value.chain().focus().setHardBreak().run();
      return;
    }

    // Needs to be captured since modal opening collapses editor selection
    const { from, to } = tiptap.value.state.selection;

    createModalInstance(
      dialog.open(AnnotationDetailsModal, {
        props: {
          ...ANNOTATION_MODAL_PROPS,
          header: `Add new ${type} annotation`,
        },
        data: {
          annotation: createTextAnnotation({ type, selectedText: "" }),
          mode: "create",
        },
        emits: {
          onSubmit: (annotation: Annotation) => {
            tiptap.value?.chain().focus().insertAnnotatedHardBreak(annotation, { from, to }).run();
            destroyModalInstance();
          },
        },
        onClose: destroyModalInstance,
      }),
    );
  }

  return { insertLineBreak };
}
