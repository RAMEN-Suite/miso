<script setup lang="ts">
import { computed, ComputedRef, useTemplateRef } from "vue";
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import Popover from "primevue/popover";
import { useTagsStore } from "../store/tags";
import { normalizeTagColor } from "../config/tags";

const props = defineProps<{
  nodeUuid: string;
}>();

const { tags, getTagsForItem, toggleItemInTag } = useTagsStore();

const popover = useTemplateRef<InstanceType<typeof Popover>>("popover");

const assignedTags: ComputedRef<string[]> = computed(() => getTagsForItem(props.nodeUuid));

const isTagged = computed<boolean>(() => assignedTags.value.length > 0);

function handleButtonClick(event: MouseEvent): void {
  popover.value?.toggle(event);
}

function handleTagToggle(tagUuid: string): void {
  toggleItemInTag({ tagUuid, itemUuid: props.nodeUuid });
}
</script>

<template>
  <Button
    type="button"
    severity="secondary"
    icon="pi pi-tags"
    size="small"
    :title="isTagged ? `Tagged with ${assignedTags.length} tag(s)` : 'Add a tag'"
    :pt="{ icon: { style: isTagged ? { color: 'var(--p-primary-color)' } : {} } }"
    @click="handleButtonClick"
  />

  <Popover
    ref="popover"
    :auto-z-index="false"
    :pt="{
      root: {
        class: 'w-18rem',
        style: {
          zIndex: 'var(--z-index-max)',
        },
      },
    }"
  >
    <div v-if="tags.length === 0" class="text-sm font-italic text-center">No tags yet. Create one in the sidebar.</div>

    <ul v-else class="tag-list flex flex-column gap-1 list-none p-0 m-0">
      <li v-for="tag in tags" :key="tag.uuid">
        <label class="tag-item flex align-items-center gap-2 p-2 border-round cursor-pointer">
          <Checkbox
            :model-value="assignedTags.includes(tag.uuid)"
            binary
            :input-id="`tag-${tag.uuid}`"
            @update:model-value="handleTagToggle(tag.uuid)"
          />
          <span class="tag-dot flex-shrink-0" :style="{ backgroundColor: normalizeTagColor(tag.appearance?.color) }" />
          <span class="text-sm flex-grow-1 min-w-0 text-overflow-ellipsis overflow-hidden white-space-nowrap">
            {{ tag.label }}
          </span>
        </label>
      </li>
    </ul>

    <div class="disclaimer mt-3 text-xs font-italic flex align-items-center gap-2">
      <i class="pi pi-exclamation-circle"></i>
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
