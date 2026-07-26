<script setup lang="ts">
import { computed, ref } from "vue";
import Breadcrumb from "primevue/breadcrumb";
import { HierarchyPath } from "../models/types";
import { MenuItem } from "primevue/menuitem";
import { ellipsize } from "../utils/helper/helper";
import { resolveNodeIcon } from "../config/icons";

const props = defineProps<{
  path: HierarchyPath;
}>();

const emit = defineEmits(["itemClicked", "homeClicked"]);

const LABEL_LENGTH: number = 30;

const home = ref<MenuItem>({
  icon: "pi pi-home",
  command: () => emit("homeClicked"),
});

const breadcrumbItems = computed<MenuItem[]>(() =>
  props.path.map((item, index) => {
    const data = item.node.data as { label?: string; text?: string };
    const itemLabel: string = data.label ?? data.text ?? "";
    const shortened: string = ellipsize(itemLabel, LABEL_LENGTH);

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
      }"
    >
    </Breadcrumb>
  </div>
</template>

<style scoped></style>
