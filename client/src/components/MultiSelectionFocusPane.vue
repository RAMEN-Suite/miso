<script setup lang="ts">
import { computed } from "vue";
import Button from "primevue/button";
import { HierarchyNode, MultiSelection, NodeDto } from "../models/types";
import { useHierarchyStore } from "../store/hierarchy";
import { useDeleteHierarchySelection } from "../composables/useDeleteHierarchySelection";
import TagAssignment from "./TagAssignment.vue";

const props = defineProps<{
  selection: MultiSelection;
}>();

const { hasPendingUpdates } = useHierarchyStore();
const { deleteSelection } = useDeleteHierarchySelection();

const nodes = computed<HierarchyNode[]>(() => props.selection.items.map((item: NodeDto<HierarchyNode>) => item.node));
</script>

<template>
  <div class="multi-selection-focus-pane h-full flex flex-col p-2">
    <div class="buttons flex flex-wrap justify-start gap-1 min-w-0">
      <TagAssignment :nodes="nodes" />
    </div>

    <div class="grow flex flex-col items-center justify-center gap-2 text-center">
      <i class="icon-layers text-3xl" />
      <h3 class="m-0">{{ props.selection.items.length }} items selected</h3>
    </div>

    <div class="buttons flex justify-center gap-2 pt-2">
      <Button
        :disabled="hasPendingUpdates"
        icon="icon-trash"
        size="small"
        :label="`Delete ${props.selection.items.length} items`"
        :title="`Delete ${props.selection.items.length} items`"
        severity="danger"
        text
        @click="deleteSelection"
      ></Button>
    </div>
  </div>
</template>

<style scoped>
.multi-selection-focus-pane {
  outline: 1px solid grey;
}
</style>
