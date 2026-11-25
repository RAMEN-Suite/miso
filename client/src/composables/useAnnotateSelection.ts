import { useDialog } from "primevue";
import { Selection } from "@tiptap/pm/state";
import { Annotation, ModelAnnotationShape } from "../models/types";
import { useTiptapStore } from "../store/tiptap";
import { useConfigStore } from "../store/config";
import { useAppStore } from "../store/app";
import { useFilterStore } from "../store/filter";
import { useCreateAnnotation } from "./useCreateAnnotation";
import { AnnotationRangeError, validateSelection } from "../editors/text/src";
import ShortcutError from "../utils/errors/shortcut.error";
import { ANNOTATION_MODAL_PROPS } from "../config/modals";
import AnnotationDetailsModal from "../components/AnnotationDetailsModal.vue";

/**
 * Annotates the editor selection (annotation buttons and configured shortcuts). Needs to be called in a component's
 * setup, since it opens a dialog.
 *
 * @returns The functions to annotate the selection with an inline or block classification type, or by type alone.
 */
export function useAnnotateSelection() {
  const { tiptap } = useTiptapStore();
  const { annotationHasConstraints, getTextAnnotationShape, getAnnotationRepresentation, isZeroPoint } = useConfigStore();
  const { addToastMessage, createModalInstance, destroyModalInstance } = useAppStore();
  const { selectedOptions } = useFilterStore();
  const { createTextAnnotation: createAnnotation } = useCreateAnnotation("Content");

  const dialog: ReturnType<typeof useDialog> = useDialog();

  /**
   * Checks if the annotation type is enabled by verifying if it is included in the selected options. If not, an `ShortcutError` is thrown.
   *
   * @throws {ShortcutError} If the annotation type is not enabled in the current filter settings.
   * @returns {boolean} True if the annotation type is enabled.
   */
  function isAnnotationTypeEnabled(type: string): boolean {
    if (!selectedOptions.value.includes(type)) {
      throw new ShortcutError(
        `Annotations of type "${type}" are not enabled currently. Use the Filter component to enable the type.`,
      );
    }

    return true;
  }

  /**
   * Shows the expected errors of an annotation attempt as a toast, and logs unexpected ones.
   *
   * @param {unknown} error - The caught error.
   * @returns {void} This function does not return any value.
   */
  function showAnnotationError(error: unknown): void {
    if (error instanceof AnnotationRangeError) {
      addToastMessage({
        severity: "warn",
        summary: "Invalid selection",
        detail: error.message,
        life: 3000,
      });
    } else if (error instanceof ShortcutError) {
      addToastMessage({
        severity: "warn",
        summary: "Annotation type not enabled",
        detail: error.message,
        life: 3000,
      });
    } else {
      console.error("Unexpected error:", error);
    }
  }

  /**
   * Annotates the selection with an inline (range or zero point) annotation. Opens the
   * {@linkcode AnnotationDetailsModal} first if the type has constraints.
   *
   * @param {{ type: string; subType?: string | number }} data - The annotation type and optional subtype.
   * @returns {void} This function does not return any value.
   */
  function annotateInline(data: { type: string; subType?: string | number }): void {
    const selection: Selection | undefined = tiptap.value?.state.selection;

    if (!selection) {
      return;
    }

    try {
      const shape: ModelAnnotationShape | undefined = getTextAnnotationShape(data.type);

      if (!shape) {
        console.error(`No annotation shape found for type "${data.type}"`);
        return;
      }

      isAnnotationTypeEnabled(data.type);
      validateSelection(selection, data.type);

      // Needs to be captured since modal opening collapses editor selection
      const capturedSelection = { from: selection.from, to: selection.to };

      const textInSelection: string = tiptap.value?.state.doc.textBetween(selection.from, selection.to) ?? "";

      const newAnnotationTemplate: Annotation = createAnnotation({
        ...data,
        selectedText: textInSelection,
      });

      if (annotationHasConstraints(shape)) {
        createModalInstance(
          dialog.open(AnnotationDetailsModal, {
            props: {
              ...ANNOTATION_MODAL_PROPS,
              header: `Add new ${newAnnotationTemplate.node.properties.subType ?? newAnnotationTemplate.node.properties.type} annotation`,
            },
            data: {
              annotation: newAnnotationTemplate,
              mode: "create",
            },
            emits: {
              onSubmit: (editedAnnotationData: Annotation) => {
                addAnnotation(editedAnnotationData, capturedSelection);
                destroyModalInstance();
              },
            },
            onClose: destroyModalInstance,
          }),
        );
      } else {
        addAnnotation(newAnnotationTemplate, capturedSelection);
      }
    } catch (error: unknown) {
      showAnnotationError(error);
    } finally {
      tiptap.value
        ?.chain()
        .focus()
        .setTextSelection(selection.to ?? 0)
        .run();
    }
  }

  /**
   * Adds a new annotation to the editor.
   *
   * @param {Annotation} annotation - The annotation to add.
   * @param {Object} selection - The selection object with `from` and `to` properties.
   * @returns {void} This function does not return any value.
   */
  function addAnnotation(annotation: Annotation, selection: { from: number; to: number }): void {
    const { from, to } = selection;
    const isAnnoZeroPoint: boolean = isZeroPoint(annotation.node);

    // Add decoration or inline block, depeding on config
    if (isAnnoZeroPoint) {
      // TODO: Cursor is set before the inserted element, not after. Fix later
      tiptap.value?.commands.addZeroPointAnnotation(annotation, from);
    } else {
      tiptap.value?.commands.addAnnotationDecoration(annotation, from, to);
    }
  }

  /**
   * Classifies the blocks in the selection with a block classification type. Opens the
   * {@linkcode AnnotationDetailsModal} first if the type has constraints.
   *
   * @param {{ type: string; subType?: string | number }} data - The annotation type and optional subtype.
   * @returns {void} This function does not return any value.
   */
  function annotateBlock(data: { type: string; subType?: string | number }): void {
    const selection: Selection | undefined = tiptap.value?.state.selection;

    if (!selection) {
      return;
    }

    try {
      const shape: ModelAnnotationShape | undefined = getTextAnnotationShape(data.type);

      if (!shape) {
        console.error(`No annotation shape found for type "${data.type}"`);
        return;
      }

      isAnnotationTypeEnabled(data.type);
      validateSelection(selection, data.type);

      // Needs to be captured since modal opening collapses editor selection
      const capturedSelection = { from: selection.from, to: selection.to };

      const textInSelection: string = tiptap.value?.state.doc.textBetween(capturedSelection.from, capturedSelection.to) ?? "";

      const newAnnotationTemplate: Annotation = createAnnotation({
        ...data,
        selectedText: textInSelection,
      });

      // Like inline annotations: with required properties or references, the modal only lets a complete one through
      if (annotationHasConstraints(shape)) {
        createModalInstance(
          dialog.open(AnnotationDetailsModal, {
            props: {
              ...ANNOTATION_MODAL_PROPS,
              header: `Add new ${newAnnotationTemplate.node.properties.subType ?? newAnnotationTemplate.node.properties.type} annotation`,
            },
            data: {
              annotation: newAnnotationTemplate,
              mode: "create",
            },
            emits: {
              onSubmit: (editedAnnotationData: Annotation) => {
                tiptap.value?.commands.addBlockClassification(editedAnnotationData, capturedSelection.from, capturedSelection.to);
                destroyModalInstance();
              },
            },
            onClose: destroyModalInstance,
          }),
        );
      } else {
        tiptap.value?.commands.addBlockClassification(newAnnotationTemplate, capturedSelection.from, capturedSelection.to);
      }
    } catch (error: unknown) {
      showAnnotationError(error);
    }
  }

  /**
   * Annotates the selection with the given type, as block classification or inline annotation depending on its
   * representation. Used for the configured annotation shortcuts.
   *
   * @param {string} type - The annotation type.
   * @returns {void} This function does not return any value.
   */
  function annotateByType(type: string): void {
    if (getAnnotationRepresentation(type) === "blockClassification") {
      annotateBlock({ type });
    } else {
      annotateInline({ type });
    }
  }

  return { annotateBlock, annotateByType, annotateInline };
}
