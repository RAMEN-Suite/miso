<script setup lang="ts">
import { ComponentPublicInstance, computed, useTemplateRef } from "vue";
import EntityCard from "./EntityCard.vue";
import CollectionCard from "./CollectionCard.vue";
import TextCard from "./TextCard.vue";
import {
  AnnotationNode,
  CollectionNode,
  EntityNode,
  IconSpec,
  NodeStatusObject,
  NodeTypeOption,
  ReferenceNodeLabel,
  TextNode,
} from "../models/types";
import { BASE_NODE_REF } from "../config/ramen";
import { getClassifierRef, getNodeTypeOption, isCollectionNode, isContentNode, isEntityNode } from "../utils/helper/modelHelper";
import Button from "primevue/button";
import FilterableMenu from "./FilterableMenu.vue";
import { MenuItem } from "primevue/menuitem";
import AddNodeModal from "./AddNodeModal.vue";
import { useAppStore } from "../store/app";
import { useConfigStore } from "../store/config";
import { useDialog } from "primevue/usedialog";
import { resolveNodeIcon } from "../config/icons.ts";
import RAMENNodeIcon from "./RAMENNodeIcon.vue";
import { BASE_MODAL_PROPS } from "../config/modals.ts";

/**
 * Extends the PrimeVue `MenuItem` interface to allow for more flexible icon specifications.
 */
interface NodeMenuItem extends Omit<MenuItem, "icon" | "items"> {
  icon?: IconSpec;
  items?: NodeMenuItem[];
}

const nodes = defineModel<NodeStatusObject[]>({ required: true });

const props = defineProps<{
  /** The annotation whose references these are. Its annotation type decides which node types can be added. */
  annotation: AnnotationNode;
  mode: "edit" | "view";
}>();

const { createModalInstance, destroyModalInstance } = useAppStore();
const { getReferenceTypeOptions, getMissingAnnotationReferences, getModelContext } = useConfigStore();
const dialog: ReturnType<typeof useDialog> = useDialog();

const menu = useTemplateRef<InstanceType<typeof FilterableMenu>>("menu");
const addButton = useTemplateRef<ComponentPublicInstance>("addButton");

defineExpose({ addButton });

/**
 * Builds one menu group per base node, listing the node types that refine it.
 *
 * @param {ReferenceNodeLabel} baseNodeLabel - The base node label of the group.
 * @param {NodeTypeOption[]} nodeTypes - The node types of that base node.
 * @returns {NodeMenuItem} The menu group for the given base node.
 */
function createAddMenuGroup(baseNodeLabel: ReferenceNodeLabel, nodeTypes: NodeTypeOption[]): NodeMenuItem {
  return {
    label: baseNodeLabel,
    items: nodeTypes.map((nodeType: NodeTypeOption) => ({
      label: nodeType.name,
      icon: resolveNodeIcon(nodeType),
      command: () => startAddingNode(baseNodeLabel, nodeType),
    })),
  };
}

/** Classifier refs of the current (not removed) references, one per reference; unresolvable nodes are left out */
const referencedRefs = computed<string[]>(() =>
  nodes.value
    .filter((node) => isNotDeleted(node) && isReference(node))
    .flatMap((node) => getClassifierRef(getModelContext(), node.node) ?? []),
);

/**
 * The node types the annotation may still refer to (from the `REFERS_TO` rules of its annotation type and their upper
 * bounds), grouped by base node. Groups without allowed types are left out.
 */
const addMenuItems = computed<NodeMenuItem[]>(() =>
  [
    createAddMenuGroup("Collection", getReferenceTypeOptions(BASE_NODE_REF.Collection, props.annotation, referencedRefs.value)),
    createAddMenuGroup("Content", getReferenceTypeOptions(BASE_NODE_REF.Content, props.annotation, referencedRefs.value)),
    createAddMenuGroup("Entity", getReferenceTypeOptions(BASE_NODE_REF.Entity, props.annotation, referencedRefs.value)),
  ].filter((group) => (group.items?.length ?? 0) > 0),
);

/**
 * The required references that are still missing, as text per unfulfilled rule, e.g. "1 more Person required". The
 * modals don't let the annotation through while any are missing.
 */
const missingReferenceHints = computed<string[]>(() =>
  getMissingAnnotationReferences(props.annotation, nodes.value).map(({ targetRefs, missing }) => {
    const names: string = targetRefs.map((ref) => getNodeTypeOption(getModelContext(), ref).name).join(" or ");

    return `${missing} more ${names} required`;
  }),
);

/**
 * Whether the annotation type may refer to anything at all, regardless of the existing references. Decides whether
 * the add button is shown; {@linkcode addMenuItems} decides whether it is enabled.
 */
const canHaveReferences = computed<boolean>(() =>
  [BASE_NODE_REF.Collection, BASE_NODE_REF.Content, BASE_NODE_REF.Entity].some(
    (baseNodeRef) => getReferenceTypeOptions(baseNodeRef, props.annotation).length > 0,
  ),
);

/**
 * Opens the modal for adding a reference of the given base node, fixed to one node type.
 *
 * @param {ReferenceNodeLabel} baseNodeLabel - The base node label of the reference to add.
 * @param {NodeTypeOption} nodeType - The node type chosen in the menu.
 * @returns {void} This function does not return any value.
 */
function startAddingNode(baseNodeLabel: ReferenceNodeLabel, nodeType: NodeTypeOption): void {
  createModalInstance(
    dialog.open(AddNodeModal, {
      props: {
        ...BASE_MODAL_PROPS,
        style: { width: "40rem", height: "30rem" },
        closeButtonProps: {
          severity: "secondary",
          title: "Cancel",
          style: { width: "30px", height: "30px" },
          rounded: true,
        },
        header: `Add ${nodeType.name}`,
        pt: {
          ...BASE_MODAL_PROPS.pt,
          headerActions: { style: "margin-left: auto" },
        },
      },
      data: {
        baseNodeLabel,
        nodeType,
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
  return isEntity(node) || isCollection(node) || isContent(node);
}

/** Whether a reference is an Entity, from its node type */
function isEntity(node: NodeStatusObject): node is NodeStatusObject<EntityNode> {
  return isEntityNode(getModelContext(), node);
}

/** Whether a reference is a Content, from its node type */
function isContent(node: NodeStatusObject): node is NodeStatusObject<TextNode> {
  return isContentNode(getModelContext(), node);
}

/** Whether a reference is a Collection, from its node type */
function isCollection(node: NodeStatusObject): node is NodeStatusObject<CollectionNode> {
  return isCollectionNode(getModelContext(), node);
}

function isNotDeleted(node: NodeStatusObject): boolean {
  return node.meta.status !== "deleted" && node.meta.status !== "removed";
}

function handleAddNodeClick(event: PointerEvent): void {
  menu.value?.toggle(event);
}
</script>

<template>
  <template v-for="(node, index) in nodes" :key="node.node.data.uuid">
    <template v-if="isNotDeleted(node) && isReference(node)">
      <EntityCard
        v-if="isEntity(node)"
        v-model="nodes![index] as NodeStatusObject<EntityNode>"
        :mode="props.mode"
        @remove-node="handleRemoveNode(node)"
      />
      <TextCard
        v-else-if="isContent(node)"
        v-model="nodes![index] as NodeStatusObject<TextNode>"
        :mode="props.mode"
        @remove-node="handleRemoveNode(node)"
      />
      <CollectionCard
        v-else-if="isCollection(node)"
        v-model="nodes![index] as NodeStatusObject<CollectionNode>"
        :mode="props.mode"
        @remove-node="handleRemoveNode(node)"
      />
    </template>
  </template>

  <Button
    v-if="props.mode === 'edit' && canHaveReferences"
    ref="addButton"
    type="button"
    label="Add Reference"
    icon="icon-plus"
    class="w-full"
    severity="secondary"
    aria-haspopup="true"
    aria-controls="references_overlay_menu"
    :disabled="addMenuItems.length === 0"
    :title="addMenuItems.length > 0 ? 'Add new reference' : 'No more references allowed for this annotation type'"
    @click="handleAddNodeClick"
  />
  <ul v-if="props.mode === 'edit' && missingReferenceHints.length > 0" class="missing-references mt-1 text-sm">
    <li v-for="hint in missingReferenceHints" :key="hint">{{ hint }}</li>
  </ul>
  <FilterableMenu id="references_overlay_menu" ref="menu" :model="addMenuItems as MenuItem[]">
    <template #itemicon="{ item }">
      <RAMENNodeIcon :spec="(item as NodeMenuItem).icon" />
    </template>
  </FilterableMenu>
</template>

<style scoped>
.missing-references {
  color: var(--p-red-500);
}
</style>
