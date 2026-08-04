<script setup lang="ts">
import { ref, useTemplateRef } from "vue";
import Fieldset from "primevue/fieldset";
import EntityCard from "./EntityCard.vue";
import CollectionCard from "./CollectionCard.vue";
import TextCard from "./TextCard.vue";
import { CollectionNode, EntityNode, NodeStatusObject, ReferenceNodeLabel, TextNode } from "../models/types";
import { isCollectionNode, isContentNode, isEntityNode } from "../utils/helper/helper";
import Button from "primevue/button";
import Menu from "primevue/menu";
import { MenuItem } from "primevue/menuitem";
import AddNodeModal from "./AddNodeModal.vue";
import { useAppStore } from "../store/app";
import { useGuidelinesStore } from "../store/guidelines";
import { useDialog } from "primevue/usedialog";
import { resolveNodeIcon } from "../config/icons.ts";

const nodes = defineModel<NodeStatusObject[]>({ required: true });

const props = defineProps<{
  mode: "edit" | "view";
}>();

const { createModalInstance, destroyModalInstance } = useAppStore();
const { getAvailableCollectionLabels, getAvailableContentLabels, getAvailableEntityLabels } = useGuidelinesStore();
const dialog: ReturnType<typeof useDialog> = useDialog();

const menu = useTemplateRef<InstanceType<typeof Menu>>("menu");

const collectionLabels: string[] = getAvailableCollectionLabels().toSorted();
const contentLabels: string[] = getAvailableContentLabels().toSorted();
const entityLabels: string[] = [...new Set(getAvailableEntityLabels())].toSorted();

/**
 * Builds one menu group per base node label, listing the domain labels configured for it.
 *
 * @param {ReferenceNodeLabel} baseNodeLabel - The base node label of the group.
 * @param {string[]} additionalNodeLabels - The domain labels available for that base node label.
 * @returns {MenuItem} The menu group for the given base node label.
 */
function createAddMenuGroup(baseNodeLabel: ReferenceNodeLabel, additionalNodeLabels: string[]): MenuItem {
  return {
    label: baseNodeLabel,
    items: additionalNodeLabels
      .map((additionalNodeLabel: string) => ({
        label: additionalNodeLabel,
        icon: resolveNodeIcon([baseNodeLabel]),
        command: () => startAddingNode(baseNodeLabel, { additionalNodeLabel }),
      }))
      .toSorted(),
  };
}

const addMenuItems: MenuItem[] = [
  createAddMenuGroup("Collection", collectionLabels),
  createAddMenuGroup("Content", contentLabels),
  createAddMenuGroup("Entity", entityLabels),
];

/**
 * Opens the modal for adding a reference of the given base node label, fixed to one domain label.
 *
 * @param {ReferenceNodeLabel} baseNodeLabel - The base node label of the reference to add.
 * @param {{ additionalNodeLabel: string }} params - The domain label chosen in the menu.
 * @returns {void} This function does not return any value.
 */
function startAddingNode(baseNodeLabel: ReferenceNodeLabel, params: { additionalNodeLabel: string }): void {
  createModalInstance(
    dialog.open(AddNodeModal, {
      props: {
        modal: true,
        closable: true,
        closeOnEscape: true,
        style: { width: "40rem", height: "30rem" },
        closeButtonProps: {
          severity: "secondary",
          title: "Cancel",
          style: { width: "30px", height: "30px" },
          rounded: true,
        },
        header: `Add ${params.additionalNodeLabel}`,
        pt: {
          headerActions: { style: "margin-left: auto" },
        },
      },
      data: {
        baseNodeLabel,
        additionalNodeLabel: params.additionalNodeLabel,
      },
      emits: {
        onSubmit: (node: NodeStatusObject) => {
          addNode(node);
          destroyModalInstance();
        },
      },
      onClose: destroyModalInstance,
    }),
  );
}

function addNode(node: NodeStatusObject): void {
  nodes.value.push(node);
}

function handleRemoveNode(node: NodeStatusObject<CollectionNode | EntityNode | TextNode>): void {
  nodes.value = nodes.value.filter((n) => n.node.data.uuid !== node.node.data.uuid);
}

/**
 * Checks if the passed node is a reference node (Entity/Collection/Content) and not an Annotation node
 * (Annotations) are handled by {@link AnnotationAnnotationsSection}.
 *
 * @param node - The node to check.
 * @returns `True` if the node is a reference node, `false` otherwise.
 */
function isReference(node: NodeStatusObject): boolean {
  return isEntityNode(node) || isCollectionNode(node) || isContentNode(node);
}

function isNotDeleted(node: NodeStatusObject): boolean {
  return node.meta.status !== "deleted" && node.meta.status !== "removed";
}

function handleAddNodeClick(event: PointerEvent): void {
  menu.value?.toggle(event);
}
</script>

<template>
  <Fieldset legend="References">
    <template v-for="(node, index) in nodes" :key="node.node.data.uuid">
      <template v-if="isNotDeleted(node) && isReference(node)">
        <EntityCard
          v-if="isEntityNode(node)"
          v-model="nodes![index] as NodeStatusObject<EntityNode>"
          :mode="props.mode"
          @remove-node="handleRemoveNode(node)"
        />
        <TextCard
          v-else-if="isContentNode(node)"
          v-model="nodes![index] as NodeStatusObject<TextNode>"
          :mode="props.mode"
          @remove-node="handleRemoveNode(node)"
        />
        <CollectionCard
          v-else-if="isCollectionNode(node)"
          v-model="nodes![index] as NodeStatusObject<CollectionNode>"
          :mode="props.mode"
          @remove-node="handleRemoveNode(node)"
        />
      </template>
    </template>

    <Button
      v-if="props.mode === 'edit'"
      type="button"
      label="Add Reference"
      icon="pi pi-plus"
      class="w-full"
      severity="secondary"
      aria-haspopup="true"
      aria-controls="references_overlay_menu"
      title="Add new reference"
      @click="handleAddNodeClick"
    />
    <Menu id="references_overlay_menu" ref="menu" :model="addMenuItems" :popup="true" />
  </Fieldset>
</template>

<style scoped></style>
