<script setup lang="ts">
import { ref, useTemplateRef } from "vue";
import { useTiptapStore } from "../store/tiptap";
import Panel from "primevue/panel";
import Menu from "primevue/menu";
import { MenuItem } from "primevue/menuitem";
import { useDialog } from "primevue";
import { Annotation, AnnotationType, NodeStatus, PropertyConfig, ToCItem } from "../models/types.ts";
import { findNodePosByUuid } from "../utils/helper/helper.ts";
import { toAnnotation } from "../utils/helper/tiptapHelper.ts";
import { useGuidelinesStore } from "../store/guidelines.ts";
import { useAppStore } from "../store/app.ts";
import { ANNOTATION_MODAL_PROPS } from "../config/modals.ts";
import EditorToCItem from "./EditorToCItem.vue";
import AnnotationDetailsModal from "./AnnotationDetailsModal.vue";

const { tiptap, tableOfContent, initialStructuralAnnotations } = useTiptapStore();
const { getAnnotationFields, getEditorOwnedProperties, getStructuralAnnotationConfig } = useGuidelinesStore();
const { createModalInstance, destroyModalInstance } = useAppStore();
const dialog: ReturnType<typeof useDialog> = useDialog();

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
    { label: "Edit", icon: "icon-pencil", title: "Show and edit details", command: () => handleEditClick(item) },
  ];

  menu.value?.toggle(event);
}

/**
 * Opens the {@linkcode AnnotationDetailsModal} for the annotation of the given item's node. On submit, the edited
 * annotation is stored in the node's `_annotation` attribute, so the change is part of the document (and undoable).
 *
 * Editor-owned properties (e.g. heading level, cell spans) are left out of the form, since they are edited in the
 * editor itself and taken from the node on save.
 *
 * @param {ToCItem} item - The item whose annotation should be shown and edited
 * @returns {void} This function does not return any value.
 */
function handleEditClick(item: ToCItem): void {
  const type: string = item.data.type;
  const config: AnnotationType | undefined = getStructuralAnnotationConfig(type);

  if (!config) {
    console.error(`No annotation config found for type "${type}.`);
    return;
  }

  // The key is the node's position for nodes without uuid (see ToCItem type). Such a node can't be matched when the
  // edited annotation is written back, so the edit would be lost. Unlikely though
  if (!tiptap.value || findNodePosByUuid(tiptap.value.state.doc, item.key) === null) {
    console.warn(`The annotation of "${type}" can't be edited, since its node has no uuid yet`);
    return;
  }

  const editorOwned: string[] = getEditorOwnedProperties(type).map((p) => p.property);
  const isEditableInForm = (field: PropertyConfig): boolean => !editorOwned.includes(field.name);

  const status: NodeStatus = initialStructuralAnnotations.value?.has(item.key) ? "unchanged" : "created";
  const annotation: Annotation = toAnnotation(item.data._annotation, status);

  createModalInstance(
    dialog.open(AnnotationDetailsModal, {
      props: {
        ...ANNOTATION_MODAL_PROPS,
        header: `Edit ${type} annotation`,
      },
      data: {
        annotation,
        config: { ...config, properties: (config.properties ?? []).filter(isEditableInForm) },
        propertyFields: getAnnotationFields(type).filter(isEditableInForm),
        mode: "edit",
      },
      emits: {
        onSubmit: (updated: Annotation) => {
          tiptap.value?.commands.updateStructuralAnnotation(item.key, updated);
          destroyModalInstance();
        },
      },
      onClose: destroyModalInstance,
    }),
  );
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
