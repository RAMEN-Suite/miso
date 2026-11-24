<script setup lang="ts">
import { computed, ref, useTemplateRef, type CSSProperties } from "vue";
import { useElementSize } from "@vueuse/core";
import InputText from "primevue/inputtext";
import Menu from "primevue/menu";
import VirtualScroller from "primevue/virtualscroller";
import lucideTags from "lucide-static/tags.json";

defineProps<{
  modelValue: string;
  placeholder?: string;
}>();

const emit = defineEmits<{ "update:modelValue": [value: string] }>();

/** Size a cell is aimed at; the real size fills the grid's width with whole, square cells */
const TARGET_CELL_PX = 36 as const;
const CELL_GAP_PX = 4 as const;

/** Rows shown at once, the others are scrolled to */
const VISIBLE_ROWS = 7 as const;

/** Small tooltips (the tooltip is teleported, so it is styled by its own classes) */
const TOOLTIP_CLASS = "[&_.p-tooltip-text]:text-xs [&_.p-tooltip-text]:px-1.5 [&_.p-tooltip-text]:py-0.5";

/** The scroller's content width; a ResizeObserver's content box leaves out the scrollbar */
const scroller = useTemplateRef<InstanceType<typeof VirtualScroller>>("scroller");
const { width: gridWidth } = useElementSize(scroller);

/** As many columns of about the target size as fit */
const columns = computed<number>(() => Math.max(1, Math.floor((gridWidth.value + CELL_GAP_PX) / (TARGET_CELL_PX + CELL_GAP_PX))));

/** The square cells' size, so the columns fill the width exactly; the target size until the grid is measured */
const cellSize = computed<number>(() =>
  gridWidth.value > 0 ? (gridWidth.value - CELL_GAP_PX * (columns.value - 1)) / columns.value : TARGET_CELL_PX,
);

/** The virtual scroller needs a fixed row height, so cell and gap are in pixels */
const rowHeight = computed<number>(() => cellSize.value + CELL_GAP_PX);

/** Inline grid styles: the menu is teleported to the body, so scoped CSS variables don't reach it */
const gridStyle = computed<CSSProperties>(() => ({
  gridTemplateColumns: `repeat(${columns.value}, ${cellSize.value}px)`,
  gap: `${CELL_GAP_PX}px`,
  height: `${rowHeight.value}px`,
  paddingBottom: `${CELL_GAP_PX}px`,
}));

/** The menu's own list stays empty and hidden (important: the theme's styles would win), the grid is in its `start` slot */
const MENU_PT = { list: { class: "hidden!" } } as const;

const LUCIDE_ICONS_URL = "https://lucide.dev/icons/";

/** The search tags by icon name, from the installed Lucide version */
const TAGS_BY_NAME = lucideTags as Record<string, string[]>;

const ICON_NAMES: string[] = Object.keys(TAGS_BY_NAME).sort();

const menu = useTemplateRef<InstanceType<typeof Menu>>("menu");

/** What the grid is filtered by: the typed text, empty after a click (all icons) */
const query = ref<string>("");
const isOpen = ref<boolean>(false);

/** The input the grid is open for */
let input: HTMLInputElement | undefined;

/** Icons whose name contains the query first, then icons with a tag containing it; all without a query */
const shownNames = computed<string[]>(() => {
  const term: string = query.value.trim().toLowerCase();

  if (term === "") {
    return ICON_NAMES;
  }

  const byName: string[] = ICON_NAMES.filter((name) => name.includes(term));
  const byNameSet = new Set<string>(byName);
  const byTag: string[] = ICON_NAMES.filter(
    (name) => !byNameSet.has(name) && TAGS_BY_NAME[name].some((tag) => tag.toLowerCase().includes(term)),
  );

  return [...byName, ...byTag];
});

/** The shown icons split into rows, so the virtual scroller only renders the visible rows */
const rows = computed<string[][]>(() => {
  const result: string[][] = [];

  for (let index = 0; index < shownNames.value.length; index += columns.value) {
    result.push(shownNames.value.slice(index, index + columns.value));
  }

  return result;
});

/** Opens the grid under the input, if it isn't open */
function open(event: Event): void {
  if (!isOpen.value) {
    input = event.currentTarget as HTMLInputElement;
    menu.value?.show(event, input);
  }
}

/** The menu focuses its list when it opens; the focus goes back to the input, so typing goes on */
function onShow(): void {
  isOpen.value = true;
  input?.focus();
}

/** A click shows all icons */
function onClick(event: MouseEvent): void {
  query.value = "";
  open(event);
}

/** Typing filters the grid by the text */
function onInput(event: Event): void {
  const text: string = (event.target as HTMLInputElement).value;

  query.value = text;
  emit("update:modelValue", text);
  open(event);
}

function choose(name: string): void {
  emit("update:modelValue", name);
  menu.value?.hide();
}
</script>

<template>
  <InputText
    :model-value="modelValue"
    size="small"
    class="flex-1"
    :placeholder="placeholder"
    aria-haspopup="menu"
    :aria-expanded="isOpen"
    @click="onClick"
    @input="onInput"
    @keydown.escape="menu?.hide()"
  />

  <Menu ref="menu" :model="[]" popup :pt="MENU_PT" @show="onShow" @hide="isOpen = false">
    <template #start>
      <!-- At least 20rem; as wide as the input (the menu's min width) when that is wider. The cells fill the width. -->
      <div class="flex flex-col gap-2 p-2 min-w-80">
        <VirtualScroller
          v-if="rows.length > 0"
          ref="scroller"
          :items="rows"
          :item-size="rowHeight"
          :style="{ height: `${Math.min(rows.length, VISIBLE_ROWS) * rowHeight}px` }"
        >
          <template #item="{ item: row }">
            <div class="grid" :style="gridStyle">
              <button
                v-for="name in row"
                :key="name"
                v-tooltip.top="{ value: name, class: TOOLTIP_CLASS }"
                type="button"
                class="flex items-center justify-center rounded border cursor-pointer text-lg"
                :class="name === modelValue ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:bg-slate-100'"
                :style="{ width: `${cellSize}px`, height: `${cellSize}px` }"
                :aria-label="name"
                @click="choose(name)"
              >
                <i :class="`icon-${name}`" />
              </button>
            </div>
          </template>
        </VirtualScroller>
        <span v-else class="text-sm text-slate-500">No icons found</span>

        <div class="flex items-center justify-between gap-2 text-xs text-slate-500">
          <span>{{ shownNames.length }} icons</span>
          <a :href="LUCIDE_ICONS_URL" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-emerald-700 hover:underline">
            Browse all on lucide.dev <i class="icon-external-link" />
          </a>
        </div>
        <p class="text-xs text-slate-400">On lucide.dev, copy an icon's name into the field. Icons newer than the installed version don't show.</p>
      </div>
    </template>
  </Menu>
</template>
