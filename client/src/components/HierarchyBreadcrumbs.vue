<script setup lang="ts">
import { computed } from "vue";
import Breadcrumb from "primevue/breadcrumb";
import { HierarchyPath } from "../models/types";
import { MenuItem } from "primevue/menuitem";
import { ellipsize } from "../utils/helper/helper";
import { resolveNodeIcon } from "../config/icons";

const props = defineProps<{
  home?: MenuItem;
  path: HierarchyPath;
}>();

const emit = defineEmits(["itemClicked", "homeClicked"]);

const LABEL_MAX_LENGTH: number = 30;

interface BreadcrumbMenuItem extends MenuItem {
  color?: string;
}

const home = computed<BreadcrumbMenuItem>(() => ({
  icon: "pi pi-home",
  ...(props.home && { ...props.home }),
  command: () => emit("homeClicked"),
}));

const breadcrumbItems = computed<BreadcrumbMenuItem[]>(() =>
  props.path.map((item, index) => {
    const data = item.node.data as { label?: string; text?: string };
    const itemLabel: string = data.label ?? data.text ?? "";
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
</script>

<template>
  <div class="breadcrumbs-section p-1">
    <Breadcrumb
      :home="home"
      :model="breadcrumbItems"
      :pt="{
        root: {
          style: {
            padding: 0,
          },
        },
        item: ({ context }) => {
          return {
            title: context.item.title,
          };
        },
        itemLink: ({ context }) => {
          return {
            class: ['gap-2'],
            style: context.item.color ? { color: context.item.color } : undefined,
          };
        },
        itemIcon: ({ context }) => {
          return {
            style: context.item.color ? { color: context.item.color } : undefined,
          };
        },
      }"
    >
    </Breadcrumb>
  </div>
</template>

<style scoped></style>
