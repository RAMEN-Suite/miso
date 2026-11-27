import { useDialog } from "primevue";
import { Node as PmNode } from "@tiptap/pm/model";
import { Annotation, BuiltinStructuralType, ElementNodeStatus, ModelAnnotationShape, ModelAttribute } from "../models/types";
import { getShapeProperties } from "../utils/helper/modelHelper";
import { type DocAnnotation, findNodePosByUuid, toAnnotation } from "../editors/text/src";
import { useTiptapStore } from "../store/tiptap";
import { useConfigStore } from "../store/config";
import { useAppStore } from "../store/app";
import { ANNOTATION_MODAL_PROPS } from "../config/modals";
import AnnotationDetailsModal from "../components/AnnotationDetailsModal.vue";

/**
 * Edits the annotation of a structural node (paragraph, heading, line break, ...) in the
 * {@linkcode AnnotationDetailsModal}. Needs to be called in a component's setup, since it opens a dialog.
 *
 * @returns The function to open the modal.
 */
export function useEditStructuralAnnotation() {
  const { tiptap, initialStructuralAnnotations } = useTiptapStore();
  const { getShapeOfRole, getEditorOwnedProperties } = useConfigStore();
  const { createModalInstance, destroyModalInstance } = useAppStore();
  const dialog: ReturnType<typeof useDialog> = useDialog();

  /**
   * Opens the modal for the annotation of the structural node with the given uuid. On submit, the edited annotation
   * is stored in the node's `_annotation` attribute, so the change is part of the document (and undoable).
   *
   * Editor-owned properties (e.g. heading level, cell spans) are left out of the form, since they are edited in the
   * editor itself and taken from the node on save.
   *
   * @param {string} uuid - The node's `uuid` attribute.
   * @returns {void} This function does not return any value.
   */
  function openStructuralAnnotationEditor(uuid: string): void {
    if (!tiptap.value) {
      return;
    }

    const pos: number | null = findNodePosByUuid(tiptap.value.state.doc, uuid);

    // A node without uuid can't be matched when the edited annotation is written back, so the edit would be lost
    if (pos === null) {
      console.warn(`The annotation of node "${uuid}" can't be edited, since the node can't be found by its uuid`);
      return;
    }

    const node: PmNode | null = tiptap.value.state.doc.nodeAt(pos);

    if (!node) {
      return;
    }

    const shape: ModelAnnotationShape | undefined = getShapeOfRole(node.type.name);

    if (!shape) {
      console.error(`"${node.type.name}" has no structural annotation shape.`);
      return;
    }

    const editorOwned: string[] = getEditorOwnedProperties(node.type.name as BuiltinStructuralType).map((p) => p.property);
    const isEditableInForm = (field: ModelAttribute): boolean => !editorOwned.includes(field.attribute.name);

    const status: ElementNodeStatus = initialStructuralAnnotations.value?.has(uuid) ? "unchanged" : "created";
    const annotation: Annotation = toAnnotation(node.attrs._annotation as DocAnnotation, status);

    createModalInstance(
      dialog.open(AnnotationDetailsModal, {
        props: {
          ...ANNOTATION_MODAL_PROPS,
          header: `Edit ${shape.type} annotation`,
        },
        data: {
          annotation,
          propertyFields: getShapeProperties(shape).filter(isEditableInForm),
          mode: "edit",
        },
        emits: {
          onSubmit: (updated: Annotation) => {
            tiptap.value?.commands.updateStructuralAnnotation(uuid, updated);
            destroyModalInstance();
          },
        },
        onClose: destroyModalInstance,
      }),
    );
  }

  return { openStructuralAnnotationEditor };
}
