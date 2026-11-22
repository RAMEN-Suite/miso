<script setup lang="ts">
import { type CSSProperties, computed, ref, useTemplateRef, watch } from "vue";
import Popover from "primevue/popover";
import Select from "primevue/select";
import InputText from "primevue/inputtext";
import VirtualScroller from "primevue/virtualscroller";
import { type SpecialCharacter, type SpecialCharacterGroup } from "../editors/text/src";
import { useTiptapStore } from "../store/tiptap";

/** How many recently inserted characters are offered above the groups */
const RECENT_LIMIT = 16 as const;

/** Cells per row of the character grid */
const COLUMNS = 10 as const;

/** Height of a cell and gap between cells. The virtual scroller needs a fixed row height, so they are in pixels. */
const CELL_HEIGHT_PX = 32 as const;
const CELL_GAP_PX = 2 as const;
const ROW_HEIGHT_PX: number = CELL_HEIGHT_PX + CELL_GAP_PX;

/**
 * Inline styles of the grid rows and cells. Not set with `v-bind()` in CSS: the popover is teleported to the body, so its
 * content doesn't inherit the CSS variables of the component's root.
 */
const GRID_STYLE: CSSProperties = {
  gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))`,
  gap: `${CELL_GAP_PX}px`,
};
const CELL_STYLE: CSSProperties = { height: `${CELL_HEIGHT_PX}px` };

/** Rows shown at once, the others are scrolled to */
const VISIBLE_ROWS = 8 as const;

/** Id of the "All" option of the group select, which shows the characters of all groups */
const ALL_GROUPS_ID = "__all__" as const;

const { tiptap, specialCharacterGroups: groups } = useTiptapStore();

const popover = useTemplateRef<InstanceType<typeof Popover>>("popover");

const selectedGroupId = ref<string>(ALL_GROUPS_ID);
const searchTerm = ref<string>("");
const recentCharacters = ref<SpecialCharacter[]>([]);
/** The character shown in the footer: the last one pointed at or focused. Kept on leave, so the footer doesn't flicker. */
const previewedCharacter = ref<SpecialCharacter | null>(null);

/** The options of the group select: "All" first, then the groups */
const groupOptions = computed<Pick<SpecialCharacterGroup, "id" | "label">[]>(() => [
  { id: ALL_GROUPS_ID, label: "All" },
  ...groups.value,
]);

/** The characters of all groups, each once (a character may be in several groups) */
const allCharacters = computed<SpecialCharacter[]>(() => {
  const byCharacter = new Map<string, SpecialCharacter>();

  for (const item of groups.value.flatMap((group) => group.characters)) {
    if (!byCharacter.has(item.character)) {
      byCharacter.set(item.character, item);
    }
  }

  return [...byCharacter.values()];
});

// The groups are rebuilt with every editor, so the selection falls back to "All" if its group is gone
watch(groups, (newGroups) => {
  if (selectedGroupId.value !== ALL_GROUPS_ID && !newGroups.some((group) => group.id === selectedGroupId.value)) {
    selectedGroupId.value = ALL_GROUPS_ID;
  }
});

/**
 * The characters of the grid: the search results across all groups while searching, else those of the selected group
 * (all of them for "All")
 */
const shownCharacters = computed<SpecialCharacter[]>(() => {
  const term: string = searchTerm.value.trim().toLowerCase();

  if (term) {
    return allCharacters.value.filter((item) => item.character === term || item.name.toLowerCase().includes(term));
  } else if (selectedGroupId.value === ALL_GROUPS_ID) {
    return allCharacters.value;
  } else {
    return groups.value.find((group) => group.id === selectedGroupId.value)?.characters ?? [];
  }
});

/** The shown characters split into rows, so the virtual scroller only renders the visible rows */
const characterRows = computed<SpecialCharacter[][]>(() => {
  const rows: SpecialCharacter[][] = [];

  for (let index = 0; index < shownCharacters.value.length; index += COLUMNS) {
    rows.push(shownCharacters.value.slice(index, index + COLUMNS));
  }

  return rows;
});

function toggle(event: Event): void {
  popover.value?.toggle(event);
}

/**
 * Returns the code points of a character in Unicode notation, e.g. `U+017F`. Several for a sequence.
 *
 * @param {SpecialCharacter} item - The character.
 * @returns {string} The code points, separated by spaces.
 */
function getCodePoints(item: SpecialCharacter): string {
  const codePoints: string[] = [];

  // Iterates by code point on purpose (not by visible character), so a sequence shows each of its code points
  for (const char of item.character) {
    codePoints.push(`U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}`);
  }

  return codePoints.join(" ");
}

/**
 * Inserts the character at the editor's selection and puts it first in the recently used characters. The popover stays
 * open, so several characters can be inserted in a row.
 *
 * @param {SpecialCharacter} item - The character.
 * @returns {void} This function does not return anything.
 */
function insert(item: SpecialCharacter): void {
  const isInserted: boolean = tiptap.value?.chain().focus().insertSpecialCharacter(item.character).run() ?? false;

  if (!isInserted) {
    return;
  }

  recentCharacters.value = [item, ...recentCharacters.value.filter((recent) => recent.character !== item.character)].slice(
    0,
    RECENT_LIMIT,
  );
}

defineExpose({ toggle });
</script>

<template>
  <Popover ref="popover">
    <div class="flex flex-col gap-3 p-2 picker">
      <div class="flex gap-2">
        <Select
          v-model="selectedGroupId"
          :options="groupOptions"
          option-label="label"
          option-value="id"
          aria-label="Group"
          size="small"
          append-to="self"
          class="flex-1"
          :disabled="searchTerm.trim().length > 0"
        />
        <InputText v-model="searchTerm" size="small" placeholder="Search" aria-label="Search special characters" class="flex-1" />
      </div>

      <div v-if="recentCharacters.length > 0" class="flex flex-col gap-1">
        <span class="text-sm font-bold">Recently used</span>
        <div class="grid" :style="GRID_STYLE">
          <button
            v-for="item in recentCharacters"
            :key="item.character"
            type="button"
            class="cell"
            :style="CELL_STYLE"
            :aria-label="item.name"
            @click="insert(item)"
            @mouseenter="previewedCharacter = item"
            @focus="previewedCharacter = item"
          >
            {{ item.character }}
          </button>
        </div>
      </div>

      <VirtualScroller
        v-if="characterRows.length > 0"
        :items="characterRows"
        :item-size="ROW_HEIGHT_PX"
        :style="{ height: `${VISIBLE_ROWS * ROW_HEIGHT_PX}px` }"
      >
        <template #item="{ item: row }">
          <div class="grid" :style="{ ...GRID_STYLE, height: `${ROW_HEIGHT_PX}px`, paddingBottom: `${CELL_GAP_PX}px` }">
            <button
              v-for="item in row"
              :key="item.character"
              type="button"
              class="cell"
              :style="CELL_STYLE"
              :aria-label="item.name"
              @click="insert(item)"
              @mouseenter="previewedCharacter = item"
              @focus="previewedCharacter = item"
            >
              {{ item.character }}
            </button>
          </div>
        </template>
      </VirtualScroller>
      <span v-else class="text-sm">No characters found</span>

      <div class="flex justify-end gap-2 text-xs preview">
        <template v-if="previewedCharacter">
          <span class="truncate" :title="previewedCharacter.name">{{ previewedCharacter.name }}</span>
          <span class="shrink-0 muted">{{ getCodePoints(previewedCharacter) }}</span>
        </template>
      </div>
    </div>
  </Popover>
</template>

<style scoped>
.picker {
  width: 24rem;
}

.grid {
  display: grid;
}

.cell {
  font-size: 1.15rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: 4px;
  background: var(--p-content-background);
  cursor: pointer;
}

.cell:hover,
.cell:focus-visible {
  background: var(--p-content-hover-background);
}

/* Fixed height, so the popover doesn't jump when the first character is pointed at */
.preview {
  height: 1rem;
  line-height: 1rem;
}

.muted {
  color: var(--p-text-muted-color);
}
</style>
