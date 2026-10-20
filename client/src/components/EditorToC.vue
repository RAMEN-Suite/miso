<script setup lang="ts">
import { ref } from "vue";
import { useTiptapStore } from "../store/tiptap";
import Panel from "primevue/panel";
import { ToCItem } from "../models/types.ts";
import { findNodePosByUuid } from "../utils/helper/helper.ts";
import EditorToCItem from "./EditorToCItem.vue";

const { tiptap, tableOfContent } = useTiptapStore();

const expandedKeys = ref<Set<string>>(new Set());

function handleToggle(key: string): void {
  if (expandedKeys.value.has(key)) {
    expandedKeys.value.delete(key);
  } else {
    expandedKeys.value.add(key);
  }
}

function handleNodeClick(node: ToCItem) {
  if (!tiptap.value) {
    return;
  }

  // Resolved on click since items carry no positions (they would shift with every edit)
  const pos: number | null = findNodePosByUuid(tiptap.value.state.doc, node.key);

  if (pos === null) {
    return;
  }

  tiptap.value.chain().setTextSelection(pos).focus().run();

  const domNode = tiptap.value.view.nodeDOM(pos);

  // This does not work reliably, maybe CSS attributes on scroll containers need to be more strict...
  if (domNode instanceof Element) {
    domNode.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}
</script>

<template>
  <Panel
    class="toc-container mb-4"
    toggleable
    :toggle-button-props="{
      severity: 'secondary',
      title: 'Toggle full view',
      rounded: true,
      text: true,
    }"
  >
    <template #header>
      <div class="header font-bold">Table of Contents</div>
    </template>
    <template #toggleicon="{ collapsed }">
      <i :class="`icon-chevron-${collapsed ? 'down' : 'up'}`"></i>
    </template>
    <div class="table-of-contents">
      <template v-if="tiptap">
        <template v-if="tableOfContent.length === 0">
          <div class="empty-state">
            <p>Start editing your document to see the outline.</p>
          </div>
        </template>
        <template v-else>
          <ul role="tree" aria-label="Table of Contents" class="w-full">
            <EditorToCItem
              v-for="item in tableOfContent"
              :key="item.key"
              :item="item"
              :expanded-keys="expandedKeys"
              :level="1"
              @item-click="handleNodeClick"
              @toggle="handleToggle"
            />
          </ul>
        </template>
      </template>
    </div>
  </Panel>
</template>

<style scoped>
.toc-container {
  outline: 1px solid var(--p-primary-color);
}
</style>
