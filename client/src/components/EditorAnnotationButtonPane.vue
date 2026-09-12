<script setup lang="ts">
import { useTemplateRef, computed, ref, watchEffect } from "vue";
import { useGuidelinesStore } from "../store/guidelines";
import { capitalize } from "../utils/helper/helper";
import AnnotationButton from "./AnnotationButton.vue";
import { AnnotationType, NodeStatusObject, AnnotationNode, Annotation } from "../models/types";
import { useCreateAnnotation } from "../composables/useCreateAnnotation";
import { useFilterStore } from "../store/filter";
import ShortcutError from "../utils/errors/shortcut.error";
import AnnotationRangeError from "../utils/errors/annotationRange.error";
import { useAppStore } from "../store/app";
import { useDialog } from "primevue";
import AnnotationCreateModal from "./AnnotationCreateModal.vue";
import { useTiptapStore } from "../store/tiptap";
import { useValidateTextSelection } from "../composables/useValidateTextSelection";
import { Selection } from "@tiptap/pm/state";
import Button from "primevue/button";
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
import { HEADING_LEVELS } from "../config/editor.ts";

/** A block is either a paragraph or one of the existing heading levels. */
type BlockTypeValue = "paragraph" | (typeof HEADING_LEVELS)[number];

const { isValid: isSelectionValid } = useValidateTextSelection();
const { groupedAnnotationTypes, annotationHasConstraints, getAnnotationConfig, getAnnotationRole, isZeroPoint } =
  useGuidelinesStore();
const { addToastMessage, createModalInstance, destroyModalInstance } = useAppStore();
const { selectedOptions } = useFilterStore();
const { tiptap, annotations } = useTiptapStore();
const { createTextAnnotation: createAnnotation } = useCreateAnnotation("Content");

const selectedTab = ref<"annotations" | "structure">("structure");

const annotationCategories = computed(() =>
  Object.entries(groupedAnnotationTypes.value ?? {}).filter(([category]) => category !== "structure"),
);

const selectedCategory = ref<string>("");

const semanticBlockTypes = computed<AnnotationType[]>(() =>
  (groupedAnnotationTypes.value?.structure ?? []).filter((t) => getAnnotationRole(t.type) === "semanticBlock"),
);

const blockTypeOptions: { label: string; value: BlockTypeValue }[] = [
  { label: "Paragraph", value: "paragraph" },
  ...HEADING_LEVELS.map((level: (typeof HEADING_LEVELS)[number]) => ({ label: `Heading ${level}`, value: level })),
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
const dialog: ReturnType<typeof useDialog> = useDialog();

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
      icon: "pi pi-table",
      command: (e: MenuItemCommandEvent) => tablePopover.value?.toggle(e.originalEvent),
    },
    { label: "Delete table", icon: "pi pi-trash", command: () => runTableCommand((c) => c.deleteTable()) },

    { separator: true },
    {
      label: "Add",
      title: "Add row or column",
      icon: "pi pi-plus",
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
      icon: "pi pi-minus",
      disabled: !inTable,
      items: [
        { label: "Delete row", title: "Delete row", command: () => runTableCommand((c) => c.deleteRow()) },
        { label: "Delete column", title: "Delete column", command: () => runTableCommand((c) => c.deleteColumn()) },
      ],
    },
    {
      label: "Merge / Split",
      title: "Merge or split cells",
      icon: "pi pi-arrows-h",
      disabled: !inTable,
      items: [
        { label: "Merge cells", title: "Merge cells", command: () => runTableCommand((c) => c.mergeCells()) },
        { label: "Split cell", title: "Split cell", command: () => runTableCommand((c) => c.splitCell()) },
        { label: "Merge or split", title: "Merge or split cell", command: () => runTableCommand((c) => c.mergeOrSplit()) },
      ],
    },
    {
      label: "Header",
      title: "Toggle header row or column",
      icon: "pi pi-list",
      disabled: !inTable,
      items: [
        { label: "Toggle header row", title: "Toggle header row", command: () => runTableCommand((c) => c.toggleHeaderRow()) },
        {
          label: "Toggle header column",
          title: "Toggle header column",
          command: () => runTableCommand((c) => c.toggleHeaderColumn()),
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

/**
 * Checks if the annotation type is enabled by verifying if it is included in the selected options. If not, an `ShortcutError` is thrown.
 *
 * @throws {ShortcutError} If the annotation type is not enabled in the current filter settings.
 * @returns {boolean} True if the annotation type is enabled.
 */
function isAnnotationTypeEnabled(type: string): boolean {
  if (!selectedOptions.value.includes(type)) {
    throw new ShortcutError(
      `Annotations of type "${type}" are not enabled currently. Use the Filter component to enable the type.`,
    );
  }

  return true;
}

function handleInlineAnnotationButtonClick(data: { type: string; subType?: string | number }) {
  const selection: Selection | undefined = tiptap.value?.state.selection;

  if (!selection) {
    return;
  }

  try {
    const config: AnnotationType = getAnnotationConfig(data.type);

    isAnnotationTypeEnabled(data.type);
    isSelectionValid(selection, config);

    // Needs to be captured since modal opening collapses editor selection
    const capturedSelection = { from: selection.from, to: selection.to };

    const textInSelection: string = tiptap.value?.state.doc.textBetween(selection.from, selection.to) ?? "";

    const newAnnotationTemplate: NodeStatusObject<AnnotationNode> = createAnnotation({
      ...data,
      selectedText: textInSelection,
    });

    if (annotationHasConstraints(config)) {
      createModalInstance(
        dialog.open(AnnotationCreateModal, {
          props: {
            modal: true,
            closable: false,
            closeOnEscape: true,
            dismissableMask: true,
            style: { width: "25rem", height: "35rem" },
          },
          data: {
            annotation: newAnnotationTemplate,
          },
          emits: {
            onSubmit: (editedAnnotationData: Annotation) => {
              addAnnotation(editedAnnotationData, capturedSelection);
              destroyModalInstance();
            },
          },
          onClose: destroyModalInstance,
        }),
      );
    } else {
      addAnnotation(newAnnotationTemplate, capturedSelection);
    }
  } catch (error: unknown) {
    if (error instanceof AnnotationRangeError) {
      addToastMessage({
        severity: "warn",
        summary: "Invalid selection",
        detail: error.message,
        life: 3000,
      });
    } else if (error instanceof ShortcutError) {
      addToastMessage({
        severity: "warn",
        summary: "Annotation type not enabled",
        detail: error.message,
        life: 3000,
      });
    } else {
      console.error("Unexpected error:", error);
    }
  } finally {
    tiptap.value
      ?.chain()
      .focus()
      .setTextSelection(selection.to ?? 0)
      .run();
  }
}

/**
 * Adds a new annotation to the store by executing the `createAnnotation` command.
 *
 * @param {Annotation} annotation - The annotation to add to the store.
 * @param {Object} selection - The selection object with `from` and `to` properties.
 * @returns {void} This function does not return any value.
 */
function addAnnotation(annotation: Annotation, selection: { from: number; to: number }): void {
  const { from, to } = selection;
  const isAnnoZeroPoint: boolean = isZeroPoint(annotation.node);

  // Add decoration or inline block, depeding on config
  if (isAnnoZeroPoint) {
    // TODO: Cursor is set before the inserted element, not after. Fix later
    tiptap.value?.commands.addZeroPointAnnotation(annotation.node, from);
  } else {
    tiptap.value?.commands.addAnnotationDecoration(annotation.node, from, to);
  }
  // Add to store
  annotations.value?.set(annotation.node.data.uuid, annotation);
}

function handleBlockAnnotationClick(data: { type: string; subType?: string | number }): void {
  const selection: Selection | undefined = tiptap.value?.state.selection;

  if (!selection) {
    return;
  }

  try {
    const config: AnnotationType = getAnnotationConfig(data.type);

    isAnnotationTypeEnabled(data.type);
    isSelectionValid(selection, config);

    // Needs to be captured since modal opening collapses editor selection
    const capturedSelection = { from: selection.from, to: selection.to };

    const textInSelection: string = tiptap.value?.state.doc.textBetween(capturedSelection.from, capturedSelection.to) ?? "";

    const newAnnotationTemplate: NodeStatusObject<AnnotationNode> = createAnnotation({
      ...data,
      selectedText: textInSelection,
    });

    tiptap.value?.commands.addSemanticBlock(newAnnotationTemplate, capturedSelection.from, capturedSelection.to);
  } catch (error: unknown) {
    if (error instanceof AnnotationRangeError) {
      addToastMessage({
        severity: "warn",
        summary: "Invalid selection",
        detail: error.message,
        life: 3000,
      });
    } else if (error instanceof ShortcutError) {
      addToastMessage({
        severity: "warn",
        summary: "Annotation type not enabled",
        detail: error.message,
        life: 3000,
      });
    } else {
      console.error("Unexpected error:", error);
    }
  }
}
</script>

<template>
  <Tabs v-model:value="selectedTab">
    <TabList>
      <Tab value="structure" title="Structure elements (paragraphs, lists, tables etc.)">Document</Tab>
      <Tab value="semanticBlocks" title="Labels for structure elements (opener, closer, salute etc.)">Block labels</Tab>
      <Tab value="annotations" title="Annotations (persons, places, transcriptions)">Annotations</Tab>
    </TabList>
    <TabPanels
      :pt="{
        root: {
          style: {
            paddingTop: 0,
            paddingLeft: 0,
            paddingRight: 0,
          },
        },
      }"
    >
      <TabPanel value="structure">
        <div class="buttons flex flex-wrap align-items-center gap-1">
          <Select
            v-model="currentBlockType"
            class="block-type-select"
            :options="blockTypeOptions"
            option-label="label"
            option-value="value"
            placeholder="Block type"
          />
          <Button
            v-tooltip.hover.top="{ value: 'list', showDelay: 50 }"
            severity="secondary"
            icon="pi pi-list"
            :class="{ 'is-active': tiptap?.isActive('bulletList') }"
            @click="tiptap?.chain().focus().toggleBulletList().run()"
          ></Button>
          <Button
            v-tooltip.hover.top="{ value: 'table', showDelay: 50 }"
            severity="secondary"
            icon="pi pi-table"
            aria-haspopup="true"
            :class="{ 'is-active': tiptap?.isActive('table') }"
            @click="openTableMenu($event)"
          >
          </Button>
          <Button
            v-tooltip.hover.top="{ value: 'line break', showDelay: 50 }"
            severity="secondary"
            @click="tiptap?.chain().focus().setHardBreak().run()"
          >
            <template #icon>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                width="1em"
                height="1em"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M20 5v6a2 2 0 0 1-2 2H6" />
                <path d="M10 9l-4 4 4 4" />
              </svg>
            </template>
          </Button>
        </div>
      </TabPanel>
      <TabPanel value="semanticBlocks">
        <div class="buttons">
          <AnnotationButton
            v-for="blockType in semanticBlockTypes"
            :key="blockType.type"
            v-tooltip.hover.top="{ value: blockType.type, showDelay: 50 }"
            severity="secondary"
            :type="blockType.type"
            :disabled="!selectedOptions.includes(blockType.type)"
            :class="{ 'is-active': true }"
            :config="getAnnotationConfig(blockType.type)!"
            @click="handleBlockAnnotationClick({ type: blockType.type })"
          >
            {{ blockType.type }}
          </AnnotationButton>
        </div>
      </TabPanel>
      <TabPanel value="annotations">
        <Tabs v-model:value="selectedCategory">
          <TabList>
            <Tab v-for="[category, types] in annotationCategories" :key="category" :value="category">
              {{ capitalize(category) }} ({{ types.length }})
            </Tab>
          </TabList>
          <TabPanels>
            <TabPanel v-for="[category, types] in annotationCategories" :key="category" :value="category">
              <div class="buttons">
                <AnnotationButton
                  v-for="type in types"
                  :key="type.type"
                  :type="type.type"
                  :disabled="!selectedOptions.includes(type.type)"
                  :config="getAnnotationConfig(type.type)"
                  @clicked="handleInlineAnnotationButtonClick($event)"
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
  gap: 2px;
  padding-top: 5px;
}

.block-type-select {
  min-width: 9rem;
}
</style>
