<script setup lang="ts">
import { ComponentPublicInstance, computed, useTemplateRef } from "vue";
import EntityCard from "./EntityCard.vue";
import CollectionCard from "./CollectionCard.vue";
import TextCard from "./TextCard.vue";
import {
  AnnotationNode,
  BaseNodeLabel,
  CollectionNode,
  ContentNode,
  EditGraph,
  EditNode,
  EditRelation,
  EntityNode,
  ElementStatus,
  IconSpec,
  NodeTypeOption,
  ReferenceNodeLabel,
} from "../models/types";
import { BASE_NODE_REF } from "../config/ramen";
import { getBaseNodeLabel, getClassifierRef, getNodeTypeOption } from "../utils/helper/modelHelper";
import {
  addExistingNode,
  addRelation,
  createNode,
  deleteNode,
  EditNodeData,
  findNode,
  findRelationBetween,
  referencesOf,
  removeRelation,
  toGraphNode,
} from "../utils/helper/editGraph";
import { relationRefOf } from "../utils/helper/writePayload";
import { PickedNode } from "../composables/useAddNode";
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

/** The graph that contains the annotation; adding and removing references changes it in place */
const graph = defineModel<EditGraph>({ required: true });

const props = defineProps<{
  /** The annotation whose references these are. Its annotation type decides which node types can be added. */
  annotationUuid: string;
  mode: "edit" | "view";
  /** Locks adding and removing references temporarily, e.g. while a request is pending */
  disabled?: boolean;
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

/** The annotation node in the graph */
const annotation = computed<AnnotationNode>(() => {
  const node: EditNode | undefined = findNode(graph.value, props.annotationUuid);

  if (!node) {
    throw new Error(`The graph has no annotation ${props.annotationUuid}`);
  }

  return node as unknown as AnnotationNode;
});

/** The current references of the annotation */
const references = computed<EditNode[]>(() => referencesOf(graph.value, props.annotationUuid));

/** Classifier refs of the current references, one per reference; unresolvable nodes are left out */
const referencedRefs = computed<string[]>(() =>
  references.value.flatMap((node) => getClassifierRef(getModelContext(), node) ?? []),
);

/**
 * The node types the annotation may still refer to (from the `REFERS_TO` rules of its annotation type and their upper
 * bounds), grouped by base node. Groups without allowed types are left out.
 */
const addMenuItems = computed<NodeMenuItem[]>(() =>
  [
    createAddMenuGroup("Collection", getReferenceTypeOptions(BASE_NODE_REF.Collection, annotation.value, referencedRefs.value)),
    createAddMenuGroup("Content", getReferenceTypeOptions(BASE_NODE_REF.Content, annotation.value, referencedRefs.value)),
    createAddMenuGroup("Entity", getReferenceTypeOptions(BASE_NODE_REF.Entity, annotation.value, referencedRefs.value)),
  ].filter((group) => (group.items?.length ?? 0) > 0),
);

/**
 * The required references that are still missing, as text per unfulfilled rule, e.g. "1 more Person required". The
 * modals don't let the annotation through while any are missing.
 */
const missingReferenceHints = computed<string[]>(() =>
  getMissingAnnotationReferences(annotation.value, references.value).map(({ targetRefs, missing }) => {
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
    (baseNodeRef) => getReferenceTypeOptions(baseNodeRef, annotation.value).length > 0,
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
        onSubmit: (picked: PickedNode) => {
          addReference(picked, baseNodeLabel);
          destroyModalInstance();
        },
      },
      onClose: destroyModalInstance,
    }),
  );
}

/**
 * Adds a picked node to the graph (as new or existing node) and links the annotation to it.
 *
 * @param {PickedNode} picked - The node picked in the {@linkcode AddNodeModal}.
 * @param {ReferenceNodeLabel} baseNodeLabel - The base node of the picked node, used if its classifier is unknown.
 * @returns {void} This function does not return any value.
 */
function addReference(picked: PickedNode, baseNodeLabel: ReferenceNodeLabel): void {
  const node: EditNodeData = toGraphNode(getModelContext(), picked.node);
  const annotationRef: string = annotation.value.classifierRef ?? BASE_NODE_REF.Annotation;
  const nodeRef: string = node.classifierRef ?? BASE_NODE_REF[baseNodeLabel];

  if (picked.isNew) {
    createNode(graph.value, node);
  } else {
    addExistingNode(graph.value, node);
  }

  addRelation(graph.value, {
    from: props.annotationUuid,
    relationRef: relationRefOf(getModelContext(), annotationRef, "REFERS_TO", nodeRef),
    type: "REFERS_TO",
    to: node.properties.uuid,
  });
}

/**
 * Unlinks a referenced node. A node created for this annotation and linked nowhere else is dropped.
 *
 * @param {EditNode} node - The referenced node.
 * @returns {void} This function does not return any value.
 */
function removeReference(node: EditNode): void {
  const uuid: string = node.properties.uuid;
  const relation: EditRelation | undefined = findRelationBetween(graph.value, props.annotationUuid, uuid);

  if (relation) {
    removeRelation(graph.value, relation);
  }

  const isLinkedElsewhere: boolean = graph.value.relations.some((candidate) => candidate.from === uuid || candidate.to === uuid);

  if (node.status === "created" && !isLinkedElsewhere) {
    deleteNode(graph.value, uuid);
  }
}

/**
 * The badge status of a reference: the node's own change (e.g. `created`) before the change of its link (`added`).
 *
 * @param {EditNode} node - The referenced node.
 * @returns {ElementStatus} The status.
 */
function referenceStatusOf(node: EditNode): ElementStatus {
  if (node.status !== "unchanged") {
    return node.status;
  } else {
    return findRelationBetween(graph.value, props.annotationUuid, node.properties.uuid)?.status ?? "unchanged";
  }
}

/** The base node of a reference, which decides its card */
function baseLabelOf(node: EditNode): BaseNodeLabel | undefined {
  return getBaseNodeLabel(getModelContext(), node);
}

/**
 * Opens the add menu, or the add modal directly if only one node type can be added.
 *
 * @param {PointerEvent} event - The click that triggered it, used by the menu to position itself.
 * @returns {void} This function does not return any value.
 */
function handleAddNodeClick(event: PointerEvent): void {
  const options: NodeMenuItem[] = addMenuItems.value.flatMap((group) => group.items ?? []);

  if (options.length === 1) {
    options[0].command?.({ originalEvent: event, item: options[0] as MenuItem });
  } else {
    menu.value?.toggle(event);
  }
}
</script>

<template>
  <template v-for="node in references" :key="node.properties.uuid">
    <EntityCard
      v-if="baseLabelOf(node) === 'Entity'"
      :node="node as unknown as EntityNode"
      :status="referenceStatusOf(node)"
      :mode="props.mode"
      :disabled="props.disabled"
      @remove-node="removeReference(node)"
    />
    <TextCard
      v-else-if="baseLabelOf(node) === 'Content'"
      :node="node as unknown as ContentNode"
      :status="referenceStatusOf(node)"
      :mode="props.mode"
      :disabled="props.disabled"
      @remove-node="removeReference(node)"
    />
    <CollectionCard
      v-else-if="baseLabelOf(node) === 'Collection'"
      :node="node as unknown as CollectionNode"
      :status="referenceStatusOf(node)"
      :mode="props.mode"
      :disabled="props.disabled"
      @remove-node="removeReference(node)"
    />
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
    :disabled="props.disabled || addMenuItems.length === 0"
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
