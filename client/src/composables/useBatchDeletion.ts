import { useDialog } from "primevue";
import { useAppStore } from "../store/app";
import { useHierarchyStore } from "../store/hierarchy";
import { BASE_MODAL_PROPS } from "../config/modals";
import { HierarchyNode, MultiSelection, NodeDto } from "../models/types";
import NodeDeleteModal from "../components/NodeDeleteModal.vue";

/**
 * Deletion of the current multiselection: opens the confirmation modal and, after a successful
 * deletion, removes the items from their column and focuses the parent.
 *
 * Must be called during component setup, since it relies on PrimeVue's dialog service.
 */
export function useBatchDeletion() {
  const dialog: ReturnType<typeof useDialog> = useDialog();

  const { addToastMessage, createModalInstance, destroyModalInstance } = useAppStore();
  const { multiSelection, path, removeEntriesFromLevel, updatePath } = useHierarchyStore();

  /**
   * Asks for confirmation and deletes all multiselected items. Does nothing without a multiselection.
   *
   * @returns {void} This function does not return a value.
   */
  function deleteMultiSelection(): void {
    const selection: MultiSelection | null = multiSelection.value;

    if (!selection) {
      return;
    }

    createModalInstance(
      dialog.open(NodeDeleteModal, {
        props: {
          ...BASE_MODAL_PROPS,
          showHeader: false,
          style: { width: "25rem" },
        },
        data: {
          nodes: selection.items.map((item: NodeDto<HierarchyNode>) => item.node),
        },
        emits: {
          onDeleted: (deletedUuids: string[]) => handleSuccessfulDeletion(selection, deletedUuids),
        },
        onClose: destroyModalInstance,
      }),
    );
  }

  /**
   * Removes the deleted items from their column and focuses the parent. The path is cut at the column, since its
   * item there was part of the deleted selection.
   *
   * @param {MultiSelection} selection - The selection that was deleted.
   * @param {string[]} deletedUuids - What the server deleted; may include Contents removed with their Collection.
   * @returns {void} This function does not return a value.
   */
  function handleSuccessfulDeletion(selection: MultiSelection, deletedUuids: string[]): void {
    addToastMessage({ severity: "success", summary: "Deleted", detail: `${selection.items.length} items`, life: 2000 });
    destroyModalInstance();

    removeEntriesFromLevel(selection.depth, deletedUuids);
    updatePath(path.value.slice(0, selection.depth));
  }

  return { deleteMultiSelection };
}
