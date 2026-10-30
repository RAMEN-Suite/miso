<script setup lang="ts">
import { computed, DeepReadonly, nextTick, ref, useTemplateRef } from "vue";
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import InputText from "primevue/inputtext";
import Popover from "primevue/popover";
import { HierarchyNode, Tag } from "../models/types";
import { useTagsStore } from "../store/tags";
import { NEW_TAG_COLOR, normalizeTagColor } from "../config/tags";

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

const { tags, getTagsForItem, createTag, addItemsToTag, removeItemsFromTag } = useTagsStore();

const popover = useTemplateRef<InstanceType<typeof Popover>>("popover");
const searchInputRef = useTemplateRef<InstanceType<typeof InputText> & { $el: HTMLInputElement }>("search-input");

const searchInput = ref<string>("");

const nodeUuids = computed<string[]>(() => props.nodes.map((node: HierarchyNode) => node.data.uuid));

const tagOptions = computed<TagOption[]>(() =>
  tags.value.map((tag: DeepReadonly<Tag>) => ({ tag, state: getAssignmentState(tag.uuid) })),
);

/** Tags carried by at least one of the nodes, in the order of the tag list. */
const assignedOptions = computed<TagOption[]>(() => tagOptions.value.filter((option: TagOption) => option.state !== "none"));

const normalizedSearchInput = computed<string>(() => searchInput.value.trim());

/** Tags whose label contains the search input (case-insensitive), or all tags without search input. */
const filteredOptions = computed<TagOption[]>(() => {
  const query: string = normalizedSearchInput.value.toLowerCase();

  if (!query) {
    return tagOptions.value;
  }

  return tagOptions.value.filter((option: TagOption) => option.tag.label.toLowerCase().includes(query));
});

/**
 * Creating a tag is offered if nothing matches the search, or every tag is already on all nodes
 * (which includes having no tags at all).
 */
const showCreateOption = computed<boolean>(
  () => filteredOptions.value.length === 0 || tagOptions.value.every((option: TagOption) => option.state === "all"),
);

const hasDuplicateLabel = computed<boolean>(() => {
  const query: string = normalizedSearchInput.value.toLowerCase();

  return query !== "" && tags.value.some((tag: DeepReadonly<Tag>) => tag.label.toLowerCase() === query);
});

const canCreate = computed<boolean>(() => normalizedSearchInput.value !== "" && !hasDuplicateLabel.value);

/**
 * Determines how many of the nodes carry a tag.
 *
 * @param {string} tagUuid - The tag UUID.
 * @returns {AssignmentState} `all`, `some` (shown as indeterminate checkbox / hollow dot) or `none`.
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

/**
 * Builds the title of an assigned tag's pill.
 *
 * @param {TagOption} option - The assigned tag option.
 * @returns {string} The label, with a hint if only some of the nodes carry the tag.
 */
function getAssignedTagTitle(option: TagOption): string {
  return option.state === "some" ? `${option.tag.label} (only on some of the selected items)` : option.tag.label;
}

function togglePopover(event: MouseEvent): void {
  popover.value?.toggle(event);
}

/**
 * Creates a tag from the search input with {@link NEW_TAG_COLOR}, assigns it to all nodes and closes the popover.
 *
 * @returns {void} This function does not return any value.
 */
function handleCreate(): void {
  if (!showCreateOption.value || !canCreate.value) {
    return;
  }

  const newTag: Tag = createTag({
    label: normalizedSearchInput.value,
    appearance: { color: NEW_TAG_COLOR },
  });

  addItemsToTag({ tagUuid: newTag.uuid, itemUuids: nodeUuids.value });

  popover.value?.hide();
}

/**
 * Toggles the first matching tag, or creates a new one if nothing matches. Does nothing without
 * search input, so a stray Enter never (un)assigns an arbitrary tag.
 *
 * @returns {void} This function does not return any value.
 */
function handleEnter(): void {
  if (!normalizedSearchInput.value) {
    return;
  }

  const firstOption: TagOption | undefined = filteredOptions.value[0];

  if (firstOption) {
    handleTagToggle(firstOption);
    searchInput.value = "";
  } else {
    handleCreate();
  }
}

function handleEscape(): void {
  popover.value?.hide();
}

function handleHide(): void {
  searchInput.value = "";
}

async function handleShow(): Promise<void> {
  await nextTick();

  searchInputRef.value?.$el?.focus();
}

function handleTagRemove(option: TagOption): void {
  removeItemsFromTag({ tagUuid: option.tag.uuid, itemUuids: nodeUuids.value });
}

/**
 * Removes the tag if all nodes carry it, otherwise adds it to all of them.
 *
 * @param {TagOption} option - The clicked tag option.
 * @returns {void} This function does not return any value.
 */
function handleTagToggle(option: TagOption): void {
  if (option.state === "all") {
    handleTagRemove(option);
  } else {
    addItemsToTag({ tagUuid: option.tag.uuid, itemUuids: nodeUuids.value });
  }
}
</script>

<template>
  <div class="tag-assignment flex flex-wrap items-center gap-1 min-w-0">
    <span
      v-for="option in assignedOptions"
      :key="option.tag.uuid"
      class="tag-pill"
      :class="{ partial: option.state === 'some' }"
      :style="{ '--tag-color': normalizeTagColor(option.tag.appearance?.color) }"
    >
      <span class="tag-dot shrink-0" />
      <span class="tag-pill-label" :title="getAssignedTagTitle(option)">{{ option.tag.label }}</span>
      <button
        type="button"
        class="tag-pill-remove"
        :title="`Remove tag '${option.tag.label}'`"
        :aria-label="`Remove tag '${option.tag.label}'`"
        @click="handleTagRemove(option)"
      >
        <i class="icon-x"></i>
      </button>
    </span>

    <Button
      type="button"
      severity="secondary"
      size="small"
      text
      class="w-6! h-6! p-0!"
      title="Add tag"
      aria-label="Add tag"
      @click="togglePopover"
    >
      <i class="icon-tag-plus text-xs"></i>
    </Button>
  </div>

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
    @show="handleShow"
    @hide="handleHide"
  >
    <InputText
      ref="search-input"
      v-model="searchInput"
      size="small"
      class="w-full mb-2"
      spellcheck="false"
      autocomplete="off"
      placeholder="Search or create tag..."
      aria-label="Search or create tag"
      :style="{
        borderTop: 'none',
        borderLeft: 'none',
        borderRadius: 0,
        borderRight: 'none',
        backgroundColor: 'inherit',
        boxShadow: 'none',
      }"
      @keydown.enter.prevent="handleEnter"
      @keydown.escape="handleEscape"
    />

    <ul
      v-if="filteredOptions.length > 0"
      class="tag-list flex flex-col gap-1 list-none p-0 m-0 max-h-[min(16rem,40vh)] overflow-y-auto"
      style="scrollbar-width: thin"
    >
      <li v-for="option in filteredOptions" :key="option.tag.uuid">
        <!-- eslint-disable vuejs-accessibility/label-has-for -- Eslint config does not recognize PrimeVue's component -->
        <label :for="`tag-${option.tag.uuid}`" class="tag-item flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer">
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

    <form
      v-if="showCreateOption && normalizedSearchInput !== ''"
      class="create-tag flex flex-col gap-2"
      :class="{ 'with-separator': filteredOptions.length > 0 }"
      @submit.prevent="handleCreate"
    >
      <small v-if="hasDuplicateLabel" class="duplicate-hint flex items-center gap-1">
        <i class="icon-alert-circle" />
        <span>A tag with this label already exists.</span>
      </small>

      <Button v-else-if="canCreate" type="submit" size="small" severity="secondary" class="justify-start!">
        <i class="icon-plus"></i>
        <span class="tag-dot shrink-0" :style="{ backgroundColor: NEW_TAG_COLOR }" />
        <span class="min-w-0 text-ellipsis overflow-hidden whitespace-nowrap">Create "{{ normalizedSearchInput }}"</span>
      </Button>
    </form>

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

.tag-pill {
  --pill-bg: color-mix(in srgb, var(--tag-color) 18%, white);

  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  height: 1.5rem;
  max-width: 100%;
  padding: 0 0.5rem;
  border: 1px solid transparent;
  border-radius: 999px;
  background-color: var(--pill-bg);
  color: color-mix(in srgb, var(--tag-color) 65%, black);
  font-size: 0.75rem;
  font-weight: 500;

  .tag-dot {
    width: 7px;
    height: 7px;
    background-color: var(--tag-color);
  }

  &.partial {
    border-style: dashed;
    border-color: color-mix(in srgb, var(--tag-color) 50%, white);
  }
}

.tag-pill-label {
  line-height: calc(1.5rem - 2px);
  max-width: 8rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Nested under .tag-pill to beat CollectionFocusPane's `position: relative` on all descendants */
.tag-pill .tag-pill-remove {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  padding: 0 0.375rem 0 0.25rem;
  border: none;
  border-radius: 0 999px 999px 0;
  background: linear-gradient(to right, transparent, var(--pill-bg) 0.3rem);
  color: inherit;
  font-size: 0.8125rem;
  line-height: 1;
  opacity: 0;
  cursor: pointer;
  transition: opacity 0.1s;

  i {
    display: block;
  }
}

.tag-pill:hover .tag-pill-remove,
.tag-pill-remove:focus-visible {
  opacity: 1;
}

.partial .tag-dot {
  background-color: transparent;
  box-shadow: inset 0 0 0 1.5px var(--tag-color);
}

.create-tag.with-separator {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid hsl(0, 0%, 90%);
}

.duplicate-hint {
  color: var(--p-orange-600, darkorange);
}

.tag-list .tag-item {
  transition: background-color 0.1s;

  &:hover {
    background-color: hsl(0, 0%, 90%);
  }
}
</style>
