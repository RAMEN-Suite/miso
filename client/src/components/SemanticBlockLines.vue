<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick, useTemplateRef } from "vue";
import { useEventListener } from "@vueuse/core";
import { useTiptapStore } from "../store/tiptap";
import type { Annotation, SemanticBlockRange } from "../models/types";
import { MenuItem } from "primevue/menuitem";
import { useAppStore } from "../store/app";
import { useDialog } from "primevue";
import AnnotationEditModal from "./AnnotationEditModal.vue";
import { Menu } from "primevue";
import { collectSemanticBlocks } from "../utils/helper/tiptapHelper";
import { Node } from "@tiptap/pm/model";
import { useEditorSettingsStore } from "../store/editorSettings.ts";

interface PositionedLine {
  uuid: string;
  type: string;
  top: number;
  height: number;
  left: number;
}

const { tiptap, semanticBlockRanges } = useTiptapStore();
const { createModalInstance, destroyModalInstance } = useAppStore();
const dialog = useDialog();
const { settings } = useEditorSettingsStore();
const menuItems = ref<MenuItem[]>([]);

const menu = useTemplateRef<InstanceType<typeof Menu>>("menu");

/** Width of a single vertical line in the gutter, in px. */
const LINE_WIDTH: number = 6;

/** Horizontal gap between two parallel lines, in px. */
const COLUMN_GAP: number = 2;

/** Horizontal stride from one column to the next ({@linkcode LINE_WIDTH} + {@linkcode COLUMN_GAP}), in px. */
const COLUMN_WIDTH: number = LINE_WIDTH + COLUMN_GAP;

/** Offset from the editor's left edge to the first (leftmost) column, in px. */
const GUTTER_START: number = 4;

/** Gap kept between the last line and the start of the text, in px. */
const GUTTER_END: number = 8;

const lines = ref<PositionedLine[]>([]);

/**
 * Indicates whether the Teleport target `#editor` - the `<editor-content>` wrapper that hosts tiptap's view -
 * is present in the DOM. Not guaranteed immediately: the editor instance can exist while it is not inserted into the DOM yet.
 * Updated by {@linkcode refreshTarget}.
 */
const isTargetReady = ref<boolean>(false);

// Track the last hovered line by uuid (not by object) so the label keeps the
// correct geometry after a recompute swaps the line objects.
const hoveredUuid = ref<string | null>(null);
const lastHovered = computed<PositionedLine | null>(() => lines.value.find((line) => line.uuid === hoveredUuid.value) ?? null);

/**
 * Calculates the left position in px of a column based on its index.
 * First column gets the {@linkcode GUTTER_START} offset, and each subsequent column is spaced by {@linkcode COLUMN_WIDTH}.
 *
 * @param {number} columnIndex - The index of the column for which to calculate the left position.
 * @returns {number} The left offset in pixels of the specified column.
 */
function columnLeft(columnIndex: number): number {
  return GUTTER_START + columnIndex * COLUMN_WIDTH;
}

/**
 * Inline style that pins the hover label directly above the top-left corner of the currently
 * hovered line. Empty object when nothing is hovered.
 * TODO: Can this be displayed directly on the mouse hover coords or in the viewport generally if scrolled further down?
 */
const labelStyle = computed(() => {
  if (!lastHovered.value) {
    return {};
  }

  return {
    top: `${lastHovered.value.top}px`,
    left: `${lastHovered.value.left}px`,
  };
});

/**
 * Checks if tiptap's HTML element exists. If it does, marks mount target as valid which allows the Teleport.
 *
 * Waits for the next tick to ensure that the DOM has been updated before checking for the element. This is currently not
 * necessary, but in a (potentially future) scenario where the function is called in the same update cycle as
 * the tiptap creation, this waits for the DOM flush and ensures the HTML reflects the changed state.
 *
 * @returns {Promise<void>} A promise that resolves once the readiness check has run.
 */
async function refreshTarget(): Promise<void> {
  await nextTick();

  isTargetReady.value = document.getElementById("editor") !== null;
}

/**
 * Assign each range a column index so that two ranges which overlap in document
 * positions never share the same column (greedy interval colouring).
 *
 * @param {SemanticBlockRange[]} ranges - The ranges which need to be assigned to columns
 * @returns {Map<string, number>} A map where each range's uuid is mapped to its assigned column index
 */
function assignColumns(ranges: SemanticBlockRange[]): Map<string, number> {
  const columns = new Map<string, number>();
  const columnEnds: number[] = [];

  const sorted: SemanticBlockRange[] = ranges.toSorted((a, b) => a.startPos - b.startPos);

  // TODO: This leads to a visual when multiple table cells in the same row should have different
  // semantic Blocks. The sorted ranges are cell1 -> cell2, in the same column because nothing overlaps.
  // But since these ranges are displayed horizontally in the editor they share the same vertical coordinates
  // and get assigned the same `left` offset and are stacked on top of each other. Overhaul, but this might
  // not be the case very often anyway.

  for (const range of sorted) {
    let column: number = columnEnds.findIndex((end: number) => end <= range.startPos);

    if (column === -1) {
      column = columnEnds.length;
    }

    columnEnds[column] = range.endPos;
    columns.set(range.uuid, column);
  }

  return columns;
}

/**
 * Calculates the required gutter width from the highest column index and applies it as the
 * editor element's left padding, so the lines never overlap the text.
 *
 * Returns `true` when the padding actually changed, signalling that the text may reflow and the
 * pixel geometry has to be re-measured afterwards.
 *
 * @param {HTMLElement} editorEl - The editor's HTML element (`#editor`)
 * @param {number} maxColumn - The highest column index in use (`-1` when there are no lines)
 * @returns {boolean} Whether the gutter width (left padding) changed
 */
function applyGutter(editorEl: HTMLElement, maxColumn: number): boolean {
  const width: number = maxColumn < 0 ? 0 : columnLeft(maxColumn) + LINE_WIDTH + GUTTER_END;
  const cssValue: `${number}px` = `${width}px`;

  if (editorEl.style.getPropertyValue("padding-left") === cssValue) {
    return false;
  }

  editorEl.style.setProperty("padding-left", cssValue);

  return true;
}

/**
 * Creates line objects to display with measured height of them.
 *
 * Calculates only the vertical geometry attributes (height, top). The horizontal spacing
 * is handled by {@linkcode applyGutter} (total gutter width) and {@linkcode columnLeft} (column's left offset).
 *
 * @param {HTMLElement} editorEl - The editor's HTML element (`#editor`)
 * @param {Map<string, number>} columns - A map where each range's uuid is mapped to its assigned column index
 * @returns {void} - This function does not return any value.
 */
function measureVerticalDimensions(editorEl: HTMLElement, columns: Map<string, number>): void {
  if (!tiptap.value) {
    lines.value = [];
    return;
  }

  const editorTop: number = editorEl.getBoundingClientRect().top;
  const scrollTop: number = editorEl.scrollTop;

  const next: PositionedLine[] = [];

  for (const range of semanticBlockRanges.value) {
    try {
      const startCoords = tiptap.value.view.coordsAtPos(range.startPos);
      const endCoords = tiptap.value.view.coordsAtPos(Math.max(range.startPos, range.endPos));

      next.push({
        uuid: range.uuid,
        type: range.type,
        top: startCoords.top - editorTop + scrollTop,
        height: endCoords.bottom - startCoords.top,
        left: columnLeft(columns.get(range.uuid) ?? 0),
      });
    } catch (e: unknown) {
      // If any error occurs because of invalid positions, view/state interferences or similar
      // log the error as warning but continue processing. Errors here will only affect
      // the visual representation of the lines, not the underlying data.
      console.warn("Line could not be drawn: ", e);
    }
  }

  lines.value = next;
}

/**
 * Updates the semantic block annotation data coming from the edit modal.
 *
 * @param {Annotation} updated - The updated annotation data
 * @returns {void} This function does not return any value
 */
function updateAnnotation(updated: Annotation): void {
  tiptap.value?.commands.updateSemanticBlock(updated);
}

/**
 * Opens the {@linkcode AnnotationEditModal} for the given line's semantic block. The
 * annotation is assembled from the doc attrs (the source of truth); on submit the edited data is
 * written back into the doc via the `updateSemanticBlockData` command (undoable, save reads it).
 *
 * @param {PositionedLine} line - The line whose annotation should be shown and edited
 * @returns {void} This function does not return any value.
 */
function handleDetailsClick(line: PositionedLine): void {
  const doc: Node | undefined = tiptap.value?.state.doc;

  if (!doc) {
    return;
  }

  const annotation: Annotation | undefined = collectSemanticBlocks(doc).get(line.uuid);

  if (!annotation) {
    return;
  }

  createModalInstance(
    dialog.open(AnnotationEditModal, {
      props: {
        modal: true,
        closable: true,
        closeOnEscape: true,
        header: `Edit ${annotation.node.data.subType ?? annotation.node.data.type} annotation`,
        style: { width: "28rem" },
        pt: {
          pcCloseButton: { root: { title: "Close" } },
        },
      },

      data: { annotation },
      emits: {
        onSubmit: (updated: Annotation) => {
          updateAnnotation(updated);
          destroyModalInstance();
        },
      },
      onClose: destroyModalInstance,
    }),
  );
}

/**
 * Removes the semantic-block annotation of the given line from the document.
 *
 * @param {PositionedLine} line - The line whose annotation should be removed
 * @returns {void} This function does not return any value.
 */
function handleDeleteClick(line: PositionedLine): void {
  tiptap.value?.commands.removeSemanticBlock(line.uuid);
}

/**
 * (Re)builds the popup-menu model (Edit / Delete) so its commands operate on the given line.
 *
 * @param {PositionedLine} line - The line the menu actions should target
 * @returns {void} This function does not return any value.
 */
function buildMenuItems(line: PositionedLine): void {
  menuItems.value = [
    {
      items: [
        {
          label: "Edit",
          icon: "pi pi-pencil",
          title: "Show and edit details",
          command: () => handleDetailsClick(line),
        },
        {
          label: "Delete",
          icon: "pi pi-trash",
          title: "Delete annotation",
          command: () => handleDeleteClick(line),
        },
      ],
    },
  ];
}

/**
 * Rebuilds every line from the current document ranges and the live editor layout.
 *
 * @returns {void} This function does not return any value.
 */
function recompute(): void {
  const editorEl: HTMLElement | null = document.getElementById("editor");

  if (!tiptap.value || !editorEl) {
    lines.value = [];

    return;
  }

  const columns: Map<string, number> = assignColumns(semanticBlockRanges.value);
  const maxColumn: number = Math.max(-1, ...columns.values());

  const gutterWidthChanged: boolean = applyGutter(editorEl, maxColumn);

  if (gutterWidthChanged) {
    // Padding change shifts/wraps the text which changes
    // geometry -> measure on the next frame when all the layout is set
    requestAnimationFrame(() => measureVerticalDimensions(editorEl, columns));
  } else {
    measureVerticalDimensions(editorEl, columns);
  }
}

/**
 * Schedules a {@linkcode recompute} once the DOM and its layout have settled.
 * Serves as the single entry point for every recompute trigger (initial mount, semantic-block-range changes and window resize).
 *
 * Uses two delay concepts: `nextTick` waits for Vue to flush pending reactive updates into the DOM,
 * then `requestAnimationFrame` waits for the browser to lay them out - so the measurements taken
 * in `recompute` read final geometry.
 *
 * @returns {Promise<void>} A promise that resolves after the recompute has been scheduled.
 */
async function schedule(): Promise<void> {
  await nextTick();

  requestAnimationFrame(recompute);
}

/**
 * Records the currently hovered line by uuid (or clears it) so {@linkcode lastHovered} and the
 * label follow the pointer.
 *
 * @param {PositionedLine | null} line - The hovered line, or `null` on mouse-leave
 * @returns {void} This function does not return any value.
 */
function handleLineHover(line: PositionedLine | null): void {
  hoveredUuid.value = line?.uuid ?? null;
}

/**
 * Builds the menu for the clicked line and toggles it open, anchored at the click or space/enter key event.
 *
 * @param {MouseEvent | KeyboardEvent} event - The click or enter/space key event, used to position the menu
 * @param {PositionedLine} line - The clicked line
 * @returns {void} This function does not return any value.
 */
function handleLineClick(event: MouseEvent | KeyboardEvent, line: PositionedLine): void {
  buildMenuItems(line);

  menu.value?.toggle(event);
}

function highlightSemanticBlock(uuid: string): void {
  tiptap.value?.commands.toggleAnnotationHighlight("on", uuid, { renderType: "semanticBlock" });
}

function removeHighlight(uuid: string): void {
  tiptap.value?.commands.toggleAnnotationHighlight("off", uuid, { renderType: "semanticBlock" });
}

watch(semanticBlockRanges, async () => await schedule());

watch(
  () => settings.value.blockDecorations,
  async () => await schedule(),
  { deep: true },
);

watch(hoveredUuid, (newUuid, oldUuid) => {
  if (!newUuid && oldUuid) {
    removeHighlight(oldUuid);

    return;
  }

  if (newUuid) {
    highlightSemanticBlock(newUuid);
  }
});

onMounted(async () => {
  await refreshTarget();
  await schedule();
});

// TODO: This should not be scoped on the window resize, but tiptap dom resize
useEventListener(window, "resize", () => void schedule());
</script>

<template>
  <Teleport v-if="isTargetReady" to="#editor">
    <div class="semantic-block-lines-layer">
      <!-- Type of the last hovered line, shown directly above its top edge. -->
      <div v-if="lastHovered" class="semantic-block-line__label" :style="labelStyle">
        {{ lastHovered.type }}
      </div>

      <div
        v-for="line in lines"
        :key="line.uuid"
        tabindex="0"
        class="semantic-block-line"
        :style="{
          top: `${line.top}px`,
          height: `${line.height}px`,
          left: `${line.left}px`,
          width: `${LINE_WIDTH}px`,
        }"
        role="button"
        @mouseenter="handleLineHover(line)"
        @keydown.enter.prevent="handleLineClick($event, line)"
        @keydown.space.prevent="handleLineClick($event, line)"
        @focus="handleLineHover(line)"
        @blur="handleLineHover(null)"
        @mouseleave="handleLineHover(null)"
        @click="handleLineClick($event, line)"
      ></div>
    </div>
  </Teleport>
  <Menu
    ref="menu"
    :model="menuItems"
    :popup="true"
    dismissable
    close-on-escape
    :pt="{
      submenuLabel: { style: { display: 'none' } },
      item: ({ context }) => ({ title: context.item.title }),
    }"
  />
</template>

<style scoped>
.semantic-block-lines-layer {
  position: absolute;
  top: 0;
  left: 0;
  /* Important so text below stays selectable if the element might overflow over the text */
  pointer-events: none;
}

.semantic-block-line {
  position: absolute;
  border-radius: 2px;
  background-color: #c2c2c2;
  cursor: pointer;
  pointer-events: auto;
  transition: background-color 0.12s ease;
}

.semantic-block-line:hover {
  background-color: #5f5f5f;
}

.semantic-block-line__label {
  position: absolute;
  transform: translateY(-100%);
  padding: 1px 4px;
  border-radius: 0.25rem;
  background-color: #5f5f5f;
  color: white;
  font-size: 0.8rem;
  line-height: 1.2;
  white-space: nowrap;
  z-index: 1;
}
</style>
