<script setup lang="ts">
import { computed } from "vue";
import Breadcrumb from "primevue/breadcrumb";
import { HierarchyPath, IconSpec } from "../models/types";
import { MenuItem } from "primevue/menuitem";
import { ellipsize } from "../utils/helper/helper";
import { resolveNodeIcon } from "../config/icons";
import RAMENIcon from "./RAMENNodeIconIcon.vue";

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
          };
        },
        itemLink: ({ context }) => {
          return {
            class: ['gap-2'],
            style: context.item.color ? { color: context.item.color } : undefined,
          };
        },
      }"
    >
      <template #itemicon="{ item }">
        <i v-if="typeof item.icon === 'string'" :class="item.icon"></i>
        <RAMENIcon v-else :spec="(item as BreadcrumbMenuItem).icon" />
      </template>
      <template #separator>
        <i class="icon-chevron-right" aria-hidden="true"></i>
      </template>
    </Breadcrumb>
  </div>
</template>

<style scoped></style>
