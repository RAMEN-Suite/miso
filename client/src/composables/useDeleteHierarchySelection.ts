import { useDialog } from "primevue";
import { useAppStore } from "../store/app";
import { useHierarchyStore } from "../store/hierarchy";
import { useTagsStore } from "../store/tags";
import { BASE_MODAL_PROPS } from "../config/modals";
import { HierarchyNode, NodeDto } from "../models/types";
import NodeDeleteModal from "../components/NodeDeleteModal.vue";

/** The items to delete and the column they live in. */
interface DeletionTarget {
  depth: number;
  items: NodeDto<HierarchyNode>[];
}

/**
 * Deletion of the current selection (the multiselection, or else the focused item): opens the confirmation modal
 * and, after a successful deletion, removes the items from their column and from all tags, and focuses the parent.
 *
 * Must be called during component setup, since it relies on PrimeVue's dialog service.
 */
export function useDeleteHierarchySelection() {
  const dialog: ReturnType<typeof useDialog> = useDialog();

  const { addToastMessage, createModalInstance, destroyModalInstance } = useAppStore();
  const { asyncOperationRunning, multiSelection, path, removeEntriesFromLevel, updatePath } = useHierarchyStore();
  const { removeItemsFromAllTags } = useTagsStore();

  /**
   * Asks for confirmation and deletes the current selection. Does nothing without a selection or while a save is
   * still running.
   *
   * @returns {void} This function does not return a value.
   */
  function deleteSelection(): void {
    const target: DeletionTarget | null = getDeletionTarget();

    if (!target || asyncOperationRunning.value) {
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
          nodes: target.items.map((item: NodeDto<HierarchyNode>) => item.node),
        },
        emits: {
          onDeleted: (deletedUuids: string[]) => handleSuccessfulDeletion(target, deletedUuids),
        },
        onClose: destroyModalInstance,
      }),
    );
  }

  /**
   * The multiselection, or else the focused item (the last path item).
   *
   * @returns {DeletionTarget | null} What to delete, or null if nothing is selected.
   */
  function getDeletionTarget(): DeletionTarget | null {
    if (multiSelection.value) {
      return { depth: multiSelection.value.depth, items: multiSelection.value.items };
    }

    const focusedItem: NodeDto<HierarchyNode> | undefined = path.value[path.value.length - 1];

    if (!focusedItem) {
      return null;
    }

    return { depth: path.value.length - 1, items: [focusedItem] };
  }

  /**
   * Removes the deleted items from their column and from all tags, and focuses the parent. The path is cut at the
   * column, since its item there was part of the deleted selection.
   *
   * @param {DeletionTarget} target - What was deleted.
   * @param {string[]} deletedUuids - What the server deleted; may include Contents removed with their Collection.
   * @returns {void} This function does not return a value.
   */
  function handleSuccessfulDeletion(target: DeletionTarget, deletedUuids: string[]): void {
    const detail: string = target.items.length > 1 ? `${target.items.length} items` : "";

    addToastMessage({ severity: "success", summary: "Deleted", detail, life: 2000 });
    destroyModalInstance();

    removeEntriesFromLevel(target.depth, deletedUuids);
    removeItemsFromAllTags(deletedUuids);
    updatePath(path.value.slice(0, target.depth));
  }

  return { deleteSelection };
}
