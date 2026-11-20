<script setup lang="ts">
import { ref, useTemplateRef } from "vue";
import { useTiptapStore } from "../store/tiptap";
import Panel from "primevue/panel";
import Menu from "primevue/menu";
import { MenuItem } from "primevue/menuitem";
import { type ToCItem, findNodePosByUuid } from "../editors/text/src";
import { useEditStructuralAnnotation } from "../composables/useEditStructuralAnnotation.ts";
import EditorToCItem from "./EditorToCItem.vue";

const { tiptap, tableOfContent } = useTiptapStore();
const { openStructuralAnnotationEditor } = useEditStructuralAnnotation();

const expandedKeys = ref<Set<string>>(new Set());

const menu = useTemplateRef<InstanceType<typeof Menu>>("menu");
const menuItems = ref<MenuItem[]>([]);

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

/**
 * Builds the menu for the given item and toggles it open, anchored at the triggering event.
 *
 * @param {Event} event - The click event of the item's menu button, used to position the menu
 * @param {ToCItem} item - The item the menu actions should target
 * @returns {void} This function does not return any value.
 */
function handleOpenMenu(event: Event, item: ToCItem): void {
  menuItems.value = [
    {
      label: "Edit",
      icon: "icon-pencil",
      title: "Show and edit details",
      command: () => openStructuralAnnotationEditor(item.key),
    },
  ];

  menu.value?.toggle(event);
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
              @open-menu="handleOpenMenu"
            />
          </ul>
        </template>
      </template>
    </div>
  </Panel>
  <Menu
    ref="menu"
    :model="menuItems"
    popup
    dismissable
    close-on-escape
    :pt="{ item: ({ context }) => ({ title: context.item.title }) }"
  />
</template>

<style scoped>
.toc-container {
  outline: 1px solid var(--p-primary-color);
}
</style>
