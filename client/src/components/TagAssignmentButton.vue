<script setup lang="ts">
import { computed, DeepReadonly, useTemplateRef } from "vue";
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import Popover from "primevue/popover";
import { HierarchyNode, Tag } from "../models/types";
import { useTagsStore } from "../store/tags";
import { normalizeTagColor } from "../config/tags";

/** How many of the nodes carry a tag. */
type AssignmentState = "all" | "some" | "none";

interface TagOption {
  tag: DeepReadonly<Tag>;
  state: AssignmentState;
}

const props = defineProps<{
  /** The nodes to tag. Several nodes are tagged and untagged together. */
  nodes: HierarchyNode[];
}>();

const { tags, getTagsForItem, addItemsToTag, removeItemsFromTag } = useTagsStore();

const popover = useTemplateRef<InstanceType<typeof Popover>>("popover");

const nodeUuids = computed<string[]>(() => props.nodes.map((node: HierarchyNode) => node.data.uuid));

const tagOptions = computed<TagOption[]>(() =>
  tags.value.map((tag: DeepReadonly<Tag>) => ({ tag, state: getAssignmentState(tag.uuid) })),
);

const assignedTagCount = computed<number>(() => tagOptions.value.filter((option: TagOption) => option.state !== "none").length);

/**
 * Determines how many of the nodes carry a tag.
 *
 * @param {string} tagUuid - The tag UUID.
 * @returns {AssignmentState} `all`, `some` (shown as indeterminate checkbox) or `none`.
 */
function getAssignmentState(tagUuid: string): AssignmentState {
  const taggedCount: number = nodeUuids.value.filter((uuid: string) => getTagsForItem(uuid).includes(tagUuid)).length;

  if (taggedCount === 0) {
    return "none";
  } else if (taggedCount === nodeUuids.value.length) {
    return "all";
  } else {
    return "some";
  }
}

function handleButtonClick(event: MouseEvent): void {
  popover.value?.toggle(event);
}

/**
 * Removes the tag if all nodes carry it, otherwise adds it to all of them.
 *
 * @param {TagOption} option - The clicked tag option.
 * @returns {void} This function does not return any value.
 */
function handleTagToggle(option: TagOption): void {
  if (option.state === "all") {
    removeItemsFromTag({ tagUuid: option.tag.uuid, itemUuids: nodeUuids.value });
  } else {
    addItemsToTag({ tagUuid: option.tag.uuid, itemUuids: nodeUuids.value });
  }
}
</script>

<template>
  <Button
    type="button"
    severity="secondary"
    size="small"
    class="w-8! h-8!"
    :title="assignedTagCount > 0 ? `Tagged with ${assignedTagCount} tag(s)` : 'Add a tag'"
    @click="handleButtonClick"
  >
    <i class="icon-tag"></i>
  </Button>

  <Popover
    ref="popover"
    :auto-z-index="false"
    :pt="{
      root: {
        class: 'w-72',
        style: {
          zIndex: 'var(--z-index-max)',
        },
      },
    }"
  >
    <div v-if="tags.length === 0" class="text-sm italic text-center">No tags yet. Create one in the sidebar.</div>

    <ul v-else class="tag-list flex flex-col gap-1 list-none p-0 m-0">
      <li v-for="option in tagOptions" :key="option.tag.uuid">
        <!-- eslint-disable vuejs-accessibility/label-has-for -- Eslint config does not recognize PrimeVue's component -->
        <label :for="`tag-${option.tag.uuid}`" class="tag-item flex items-center gap-2 p-2 rounded-md cursor-pointer">
          <Checkbox
            :model-value="option.state === 'all'"
            :indeterminate="option.state === 'some'"
            binary
            :input-id="`tag-${option.tag.uuid}`"
            @update:model-value="handleTagToggle(option)"
          />
          <span class="tag-dot shrink-0" :style="{ backgroundColor: normalizeTagColor(option.tag.appearance?.color) }" />
          <span class="text-sm grow min-w-0 text-ellipsis overflow-hidden whitespace-nowrap">
            {{ option.tag.label }}
          </span>
        </label>
        <!-- eslint-enable vuejs-accessibility/label-has-for -->
      </li>
    </ul>

    <div class="disclaimer mt-4 text-xs italic flex items-center gap-2">
      <i class="icon-hard-drive"></i>
      <span>Tags are stored in your browser. If you change your device, they won't be available there.</span>
    </div>
  </Popover>
</template>

<style scoped>
.tag-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.tag-list .tag-item {
  transition: background-color 0.1s;

  &:hover {
    background-color: hsl(0, 0%, 90%);
  }
}
</style>
