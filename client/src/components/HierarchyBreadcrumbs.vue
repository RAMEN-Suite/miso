<script setup lang="ts">
import { computed } from "vue";
import Breadcrumb from "primevue/breadcrumb";
import { HierarchyPath, IconSpec } from "../models/types";
import { MenuItem } from "primevue/menuitem";
import { ellipsize, getContentLabelText } from "../utils/helper/helper";
import { resolveNodeIcon } from "../config/icons";
import RAMENNodeIcon from "./RAMENNodeIcon.vue";

/**
 * Extends the PrimeVue `MenuItem` interface to allow for more flexible icon specifications.
 *
 * `icon` is either a plain icon class (`"icon-home"`) for icons chosen in code, or an {@link IconSpec}
 * for node icons, which can come from project configuration.
 */
interface BreadcrumbMenuItem extends Omit<MenuItem, "icon"> {
  icon?: string | IconSpec;
  color?: string;
}

const props = defineProps<{
  home?: BreadcrumbMenuItem;
  path: HierarchyPath;
}>();

const emit = defineEmits(["itemClicked", "homeClicked"]);

const LABEL_MAX_LENGTH: number = 30;

const home = computed<BreadcrumbMenuItem>(() => ({
  icon: "icon-home",
  ...(props.home && { ...props.home }),
  command: () => emit("homeClicked"),
}));

const breadcrumbItems = computed<BreadcrumbMenuItem[]>(() =>
  props.path.map((item, index) => {
    const isContent: boolean = item.node.nodeLabels.includes("Content");
    const itemLabel: string = isContent
      ? getContentLabelText(item.node.nodeLabels)
      : (item.node.data as { label?: string }).label ?? "";
    const shortened: string = ellipsize(itemLabel, LABEL_MAX_LENGTH);

    return {
      index,
      label: shortened,
      icon: resolveNodeIcon(item.node.nodeLabels),
      title: itemLabel,
      command: () => emit("itemClicked", { index, uuid: item.node.data.uuid }),
    };
  }),
);

/**
 * Whether a breadcrumb item keeps its full size instead of shrinking when space runs out.
 * This applies to the home item (the only item without an `index`) and the current (last) item (= the leaf).
 *
 * @param {MenuItem} item - The breadcrumb item to check.
 * @returns {boolean} `true` if the item must not shrink, `false` otherwise.
 */
function isFixedSizeItem(item: MenuItem): boolean {
  return item.index === undefined || item.index === props.path.length - 1;
}
</script>

<template>
  <div class="breadcrumbs-section p-1 min-w-0 max-w-full">
    <Breadcrumb
      :home="home as MenuItem"
      :model="breadcrumbItems as MenuItem[]"
      :pt="{
        root: {
          style: {
            padding: 0,
          },
        },
        item: ({ context }) => {
          return {
            title: context.item.title,
            class: isFixedSizeItem(context.item) ? 'shrink-0' : 'min-w-0',
          };
        },
        itemLink: ({ context }) => {
          return {
            class: ['gap-2', 'min-w-0', 'max-w-full'],
            style: context.item.color ? { color: context.item.color } : undefined,
          };
        },
        itemLabel: {
          class: 'truncate min-w-0',
        },
        separator: {
          class: 'shrink-0',
        },
      }"
    >
      <template #itemicon="{ item }">
        <i v-if="typeof item.icon === 'string'" class="shrink-0" :class="item.icon"></i>
        <RAMENNodeIcon v-else :spec="(item as BreadcrumbMenuItem).icon" />
      </template>
      <template #separator>
        <i class="icon-chevron-right" aria-hidden="true"></i>
      </template>
    </Breadcrumb>
  </div>
</template>

<style scoped></style>
