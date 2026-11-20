<script setup lang="ts">
import { useTemplateRef, computed, ref, watchEffect, type CSSProperties } from "vue";
import { useConfigStore } from "../store/config";
import { capitalize } from "../utils/helper/helper";
import AnnotationButton from "./AnnotationButton.vue";
import { ModelAnnotationShape } from "../models/types";
import { useAnnotateSelection } from "../composables/useAnnotateSelection";
import { useInsertLineBreak } from "../composables/useInsertLineBreak";
import { useFilterStore } from "../store/filter";
import { useTiptapStore } from "../store/tiptap";
import { HEADING_LEVELS } from "../editors/text/src/config/editor";
import Button from "primevue/button";
import Divider from "primevue/divider";
import Select from "primevue/select";
import TableInsertPopover from "./TableInsertPopover.vue";
import TieredMenu from "primevue/tieredmenu";
import { MenuItem, MenuItemCommandEvent } from "primevue/menuitem";
import type { ChainedCommands } from "@tiptap/core";
import Tabs from "primevue/tabs";
import TabList from "primevue/tablist";
import Tab from "primevue/tab";
import TabPanels from "primevue/tabpanels";
import TabPanel from "primevue/tabpanel";
import { STRUCTURE_ANNOTATION_GROUP } from "../config/annotations";

/** A block is either a paragraph or one of the existing heading levels. */
type BlockTypeValue = "paragraph" | (typeof HEADING_LEVELS)[number];

const { groupedAndSortedAnnotationTypes, getAnnotationRepresentation } = useConfigStore();
const { selectedOptions } = useFilterStore();
const { tiptap } = useTiptapStore();
const { annotateBlock, annotateInline } = useAnnotateSelection();
const { insertLineBreak } = useInsertLineBreak();

const selectedTab = ref<"annotations" | "structure">("structure");

const tabProps = {
  pt: { root: { class: "px-3! py-2!" } },
} as const;

/** Matches the look of {@linkcode AnnotationButton} so structure and annotation buttons line up. */
const structureButtonProps = {
  severity: "secondary",
  outlined: true,
  raised: true,
  style: { height: "35px", width: "35px" },
} as const;

const annotationCategories = computed(() =>
  Object.entries(groupedAndSortedAnnotationTypes.value ?? {}).filter(([category]) => category !== STRUCTURE_ANNOTATION_GROUP),
);

const selectedCategory = ref<string>("");

const blockClassificationTypes = computed<ModelAnnotationShape[]>(() =>
  (groupedAndSortedAnnotationTypes.value?.[STRUCTURE_ANNOTATION_GROUP] ?? []).filter(
    (t) => getAnnotationRepresentation(t.type) === "blockClassification",
  ),
);

/** Font size per heading level in the block type dropdown, so options preview their size like in a word processor. */
const HEADING_OPTION_FONT_SIZES = {
  1: "1.5rem",
  2: "1.3rem",
  3: "1.15rem",
  4: "1rem",
  5: "0.9rem",
  6: "0.8rem",
} as const satisfies Record<(typeof HEADING_LEVELS)[number], string>;

const blockTypeOptions: { label: string; value: BlockTypeValue; style: CSSProperties }[] = [
  { label: "Paragraph", value: "paragraph", style: {} },
  ...HEADING_LEVELS.map((level: (typeof HEADING_LEVELS)[number]) => ({
    label: `Heading ${level}`,
    value: level,
    style: { fontSize: HEADING_OPTION_FONT_SIZES[level], fontWeight: 600, lineHeight: 1.2 },
  })),
];

/**
 * Block type at the editor caret position.
 *
 * Used to drive the block type Select. `null` when the caret sits in neither a paragraph nor a heading.
 */
const currentBlockType = computed<BlockTypeValue | null>({
  get: () => {
    const activeLevel: (typeof HEADING_LEVELS)[number] | undefined = HEADING_LEVELS.find((level) =>
      tiptap.value?.isActive("heading", { level }),
    );

    if (activeLevel) {
      return activeLevel;
    }

    if (tiptap.value?.isActive("paragraph")) {
      return "paragraph";
    }

    return null;
  },
  set: (value: BlockTypeValue | null) => {
    if (value === null) {
      return;
    }

    if (value === "paragraph") {
      tiptap.value?.chain().focus().setNode("paragraph").run();
    } else {
      tiptap.value?.chain().focus().setNode("heading", { level: value }).run();
    }
  },
});

watchEffect(() => {
  if (!selectedCategory.value && annotationCategories.value.length > 0) {
    selectedCategory.value = annotationCategories.value[0][0];
  }
});

const tablePopover = useTemplateRef<InstanceType<typeof TableInsertPopover>>("table-popover");
const tableMenu = useTemplateRef<InstanceType<typeof TieredMenu>>("table-menu");
const tableMenuItems = ref<MenuItem[]>([]);

/**
 * Wrapper for running TipTap table chain commands on the focused editor (e.g., `mergeCells`)
 *
 * @param {(chain: ChainedCommands) => ChainedCommands} fn - Callback that receives the focused command chain
 * and returns the modified chain to be executed.
 * @example runTableCommand((c) => c.mergeCells())
 */
function runTableCommand(fn: (chain: ChainedCommands) => ChainedCommands): void {
  if (!tiptap.value) {
    return;
  }

  const chain: ChainedCommands = tiptap.value.chain().focus();

  fn(chain).run();
}

/**
 * Builds the table menu model. Rebuilt on each open (see `openTableMenu`) so that `disabled` reflects the
 * current caret position — TipTap's `isActive` is not Vue-reactive, so a static/computed model would go stale.
 *
 * @returns {MenuItem[]} The tiered menu items
 */
function buildTableMenuItems(): MenuItem[] {
  const inTable: boolean = tiptap.value?.isActive("table") ?? false;

  return [
    {
      label: "Insert table",
      title: "Insert table",
      icon: "icon-table",
      command: (e: MenuItemCommandEvent) => tablePopover.value?.toggle(e.originalEvent),
    },
    { label: "Delete table", icon: "icon-trash-2", command: () => runTableCommand((c) => c.deleteTable()) },

    { separator: true },
    {
      label: "Add",
      title: "Add row or column",
      icon: "icon-plus",
      disabled: !inTable,
      items: [
        { label: "Row above", title: "Add row above", command: () => runTableCommand((c) => c.addRowBefore()) },
        { label: "Row below", title: "Add row below", command: () => runTableCommand((c) => c.addRowAfter()) },
        { label: "Column left", title: "Add column left", command: () => runTableCommand((c) => c.addColumnBefore()) },
        { label: "Column right", title: "Add column right", command: () => runTableCommand((c) => c.addColumnAfter()) },
      ],
    },
    {
      label: "Remove",
      title: "Remove row or column",
      icon: "icon-minus",
      disabled: !inTable,
      items: [
        { label: "Delete row", title: "Delete row", command: () => runTableCommand((c) => c.deleteRow()) },
        { label: "Delete column", title: "Delete column", command: () => runTableCommand((c) => c.deleteColumn()) },
      ],
    },
    {
      label: "Merge / Split",
      title: "Merge or split cells",
      icon: "icon-move-horizontal",
      disabled: !inTable,
      items: [
        { label: "Merge cells", title: "Merge cells", command: () => runTableCommand((c) => c.mergeCells()) },
        { label: "Split cell", title: "Split cell", command: () => runTableCommand((c) => c.splitCell()) },
        { label: "Merge or split", title: "Merge or split cell", command: () => runTableCommand((c) => c.mergeOrSplit()) },
      ],
    },
    {
      label: "Header",
      title: "Toggle header cells, row or column",
      icon: "icon-list",
      disabled: !inTable,
      items: [
        {
          label: "Toggle header cell",
          title: "Toggle header for the selected cells",
          command: () => {
            const isHeader: boolean = tiptap.value?.isActive("tableCell", { role: "label" }) ?? false;

            runTableCommand((c) => c.setCellAttribute("role", isHeader ? null : "label"));
          },
        },
        {
          label: "Toggle header row",
          title: "Toggle header for the first row",
          command: () => runTableCommand((c) => c.toggleLabelRow()),
        },
        {
          label: "Toggle header column",
          title: "Toggle header for the first column",
          command: () => runTableCommand((c) => c.toggleLabelColumn()),
        },
      ],
    },
  ];
}

/**
 * Opens the TieredMenu for table commands.
 *
 * @param {PointerEvent} event - The click event
 * @returns {void} This function does not return any value
 */
function openTableMenu(event: Event): void {
  tableMenuItems.value = buildTableMenuItems();
  tableMenu.value?.toggle(event);
}
</script>

<template>
  <Tabs v-model:value="selectedTab">
    <TabList>
      <Tab
        value="structure"
        title="Structure elements (paragraphs, lists, tables etc.) and their labels (opener, closer, salute etc.)"
        v-bind="tabProps"
      >
        <span class="flex items-center gap-1.5"><i class="icon-file-text" />Document</span>
      </Tab>
      <Tab value="annotations" title="Annotations (persons, places, transcriptions)" v-bind="tabProps">
        <span class="flex items-center gap-1.5"><i class="icon-highlighter" />Annotations</span>
      </Tab>
    </TabList>
    <TabPanels :pt="{ root: { style: { padding: 0 } } }">
      <TabPanel value="structure">
        <div class="buttons flex flex-wrap items-center gap-1">
          <!-- eslint-disable vuejs-accessibility/form-control-has-label -- Eslint config does not recognize PrimeVue's component -->
          <Select
            v-model="currentBlockType"
            class="block-type-select"
            :options="blockTypeOptions"
            option-label="label"
            option-value="value"
            placeholder="Block type"
          >
            <template #option="{ option }">
              <span :style="option.style">{{ option.label }}</span>
            </template>
          </Select>
          <Button
            v-tooltip.hover.top="{ value: 'list', showDelay: 50 }"
            v-bind="structureButtonProps"
            icon="icon-list"
            :class="{ 'is-active': tiptap?.isActive('bulletList') }"
            @click="tiptap?.chain().focus().toggleBulletList().run()"
          ></Button>
          <Button
            v-tooltip.hover.top="{ value: 'table', showDelay: 50 }"
            v-bind="structureButtonProps"
            icon="icon-table"
            aria-haspopup="true"
            :class="{ 'is-active': tiptap?.isActive('table') }"
            @click="openTableMenu($event)"
          >
          </Button>
          <Button
            v-tooltip.hover.top="{ value: 'line break', showDelay: 50 }"
            v-bind="structureButtonProps"
            icon="icon-text-wrap"
            @click="insertLineBreak()"
          >
          </Button>
          <template v-if="blockClassificationTypes.length > 0">
            <Divider layout="vertical" class="mx-3! self-stretch" />
            <AnnotationButton
              v-for="blockType in blockClassificationTypes"
              :key="blockType.type"
              v-tooltip.hover.top="{ value: blockType.type, showDelay: 50 }"
              severity="secondary"
              :type="blockType.type"
              :disabled="!selectedOptions.includes(blockType.type)"
              :class="{ 'is-active': true }"
              :shape="blockType"
              @clicked="annotateBlock($event)"
            >
              {{ blockType.type }}
            </AnnotationButton>
          </template>
        </div>
      </TabPanel>
      <TabPanel value="annotations">
        <Tabs v-model:value="selectedCategory">
          <TabList>
            <Tab v-for="[category, types] in annotationCategories" :key="category" :value="category" v-bind="tabProps">
              {{ capitalize(category) }} ({{ types.length }})
            </Tab>
          </TabList>
          <TabPanels :pt="{ root: { style: { padding: 0 } } }">
            <TabPanel v-for="[category, types] in annotationCategories" :key="category" :value="category">
              <div class="buttons">
                <AnnotationButton
                  v-for="type in types"
                  :key="type.type"
                  :type="type.type"
                  :disabled="!selectedOptions.includes(type.type)"
                  :shape="type"
                  @clicked="annotateInline($event)"
                />
              </div>
            </TabPanel>
          </TabPanels>
        </Tabs>
      </TabPanel>
    </TabPanels>
  </Tabs>

  <TieredMenu
    ref="table-menu"
    :model="tableMenuItems"
    popup
    :pt="{
      submenuLabel: { style: { display: 'none' } },
      item: ({ context }) => ({ title: context.item.title }),
    }"
  />
  <TableInsertPopover ref="table-popover" />
</template>

<style scoped>
.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 2px;
  padding-top: 8px;
}

.block-type-select {
  min-width: 9rem;
  height: 35px;
  align-items: center;
}
</style>
