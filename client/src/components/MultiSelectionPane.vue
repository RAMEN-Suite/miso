<script setup lang="ts">
import { computed } from "vue";
import Button from "primevue/button";
import { HierarchyNode, MultiSelection, NodeDto } from "../models/types";
import { useHierarchyStore } from "../store/hierarchy";
import { useBatchDeletion } from "../composables/useBatchDeletion";
import TagAssignmentButton from "./TagAssignmentButton.vue";

const props = defineProps<{
  selection: MultiSelection;
}>();

const { asyncOperationRunning } = useHierarchyStore();
const { deleteMultiSelection } = useBatchDeletion();

const nodes = computed<HierarchyNode[]>(() => props.selection.items.map((item: NodeDto<HierarchyNode>) => item.node));

function handleDeleteClick(): void {
  if (asyncOperationRunning.value) {
    return;
  }

  deleteMultiSelection();
}
</script>

<template>
  <div class="multi-selection-pane h-full flex flex-col p-2">
    <div class="buttons flex justify-start gap-1">
      <TagAssignmentButton :nodes="nodes" />
    </div>

    <div class="grow flex flex-col items-center justify-center gap-2 text-center">
      <i class="icon-layers text-3xl" />
      <h3 class="m-0">{{ props.selection.items.length }} items selected</h3>
    </div>

    <div class="buttons flex justify-center gap-2 pt-2">
      <Button
        :disabled="asyncOperationRunning"
        icon="icon-trash"
        size="small"
        :label="`Delete ${props.selection.items.length} items`"
        :title="`Delete ${props.selection.items.length} items`"
        severity="danger"
        text
        @click="handleDeleteClick"
      ></Button>
    </div>
  </div>
</template>

<style scoped>
.multi-selection-pane {
  outline: 1px solid grey;
}
</style>
