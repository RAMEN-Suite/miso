<script setup lang="ts">
import { computed } from "vue";
import { useBookmarks } from "../composables/useBookmarks";
import { Bookmark, CollectionNode, TextNode } from "../models/types";
import router from "../router";
import NodeTag from "./NodeTag.vue";
import Button from "primevue/button";
import Card from "primevue/card";
import { resolveNodeIcon } from "../config/icons.ts";

const props = defineProps<{
  bookmarkData: Bookmark;
}>();

const { removeBookmark } = useBookmarks();

const uuid: string = props.bookmarkData.data.data.uuid;
const isCollection: boolean = props.bookmarkData.data.nodeLabels.includes("Collection");

async function handleItemSelect(): Promise<void> {
  const urlParam: "collections" | "contents" = isCollection ? "collections" : "contents";

  await router.push(`/${urlParam}/${uuid}`);
}

const htmlTitle = computed<string>(
  () =>
    `Go go ${props.bookmarkData} ${isCollection ? (props.bookmarkData.data as CollectionNode).data.label : "with UUID " + props.bookmarkData.data.data.uuid}`,
);

// TODO: This should be in a helper function
const PREVIEW_LENGTH: number = 120;

const icon = computed<string>(() => resolveNodeIcon(props.bookmarkData.data.nodeLabels));

const displayedText = computed<string>(() => {
  const text: string | undefined = (props.bookmarkData.data as TextNode).data.text;

  if (!text) {
    return "";
  } else {
    return text.slice(0, PREVIEW_LENGTH) + (text.length > PREVIEW_LENGTH ? "..." : "");
  }
});
</script>

<template>
  <Card :title="htmlTitle" class="container" :pt="{ body: { class: 'p-1' } }">
    <template #content>
      <div
        class="flex align-items-center p-1 gap-2"
        role="link"
        tabindex="0"
        @keydown.enter="handleItemSelect"
        @keydown.space.prevent="handleItemSelect"
        @click="handleItemSelect"
      >
        <div class="flex gap-2 align-items-center flex-grow-1">
          <i :class="icon" class="node-icon flex-shrink-0" />
          <template v-if="isCollection">
            <div class="label font-bold">
              {{ (props.bookmarkData.data as CollectionNode).data.label }}
            </div>
          </template>
          <template v-else>
            <div class="text text-sm">
              {{ displayedText }}
            </div>
          </template>
        </div>
        <Button
          title="Remove bookmark"
          severity="primary"
          icon="pi pi-bookmark-fill"
          size="small"
          outlined
          class="w-2rem h-2rem"
          @click.stop="removeBookmark(uuid)"
        />
      </div>
    </template>
  </Card>
</template>

<style scoped>
.container {
  cursor: pointer;
  margin-bottom: 5px;
  box-shadow:
    rgba(0, 0, 0, 0.02) 0px 1px 3px 0px,
    rgba(27, 31, 35, 0.15) 0px 0px 0px 1px;
  transition: background-color 0.1s;

  &:hover {
    background-color: hsl(0, 0%, 90%);
  }

  .label {
    height: 1.5rem;
    font-size: 0.9rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .active {
    background-color: hsl(0, 0%, 75%);
  }
}
</style>
