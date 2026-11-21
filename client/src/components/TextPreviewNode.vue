<script setup lang="ts">
import { computed } from "vue";
import { HEADING_LEVELS } from "../editors/text/src/config/editor";
import type { TiptapNode } from "../editors/text/src";

/**
 * Renders one node of a tiptap document (and, recursively, its children) as plain, non-interactive HTML.
 * Only knows the built-in structural types; any other node type renders just its children.
 */
defineOptions({ name: "TextPreviewNode" });

const props = defineProps<{
  node: TiptapNode;
}>();

const children = computed<TiptapNode[]>(() => props.node.content ?? []);

const headingTag = computed<string>(() => {
  const level: number = Number(props.node.attrs?.level);

  return `h${(HEADING_LEVELS as readonly number[]).includes(level) ? level : HEADING_LEVELS[0]}`;
});
</script>

<template>
  <template v-if="node.type === 'text'">{{ node.text }}</template>
  <br v-else-if="node.type === 'hardBreak'" />
  <p v-else-if="node.type === 'paragraph'">
    <TextPreviewNode v-for="(child, index) in children" :key="index" :node="child" />
  </p>
  <component :is="headingTag" v-else-if="node.type === 'heading'">
    <TextPreviewNode v-for="(child, index) in children" :key="index" :node="child" />
  </component>
  <ul v-else-if="node.type === 'bulletList'">
    <TextPreviewNode v-for="(child, index) in children" :key="index" :node="child" />
  </ul>
  <li v-else-if="node.type === 'listItem'">
    <TextPreviewNode v-for="(child, index) in children" :key="index" :node="child" />
  </li>
  <div v-else-if="node.type === 'table'" class="tableWrapper">
    <table>
      <tbody>
        <TextPreviewNode v-for="(child, index) in children" :key="index" :node="child" />
      </tbody>
    </table>
  </div>
  <tr v-else-if="node.type === 'tableRow'">
    <TextPreviewNode v-for="(child, index) in children" :key="index" :node="child" />
  </tr>
  <td
    v-else-if="node.type === 'tableCell'"
    :colspan="Number(node.attrs?.colspan ?? 1)"
    :rowspan="Number(node.attrs?.rowspan ?? 1)"
    :data-role="node.attrs?.role ? String(node.attrs.role) : undefined"
  >
    <TextPreviewNode v-for="(child, index) in children" :key="index" :node="child" />
  </td>
  <template v-else>
    <TextPreviewNode v-for="(child, index) in children" :key="index" :node="child" />
  </template>
</template>
