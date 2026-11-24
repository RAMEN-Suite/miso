<script setup lang="ts">
import { IconView, type IconSpecInput } from "../external";
import { TREE_LINE_HEIGHT_REM, type RowStatus, type TreeRow } from "../utils/elementTree";

defineProps<{
  rows: TreeRow[];
  /** Where the sticky lines of depth 0 stick, in rem from the top of the scroll container */
  stickyTop: number;
  isCollapsed: (key: string) => boolean;
  isSelected: (row: TreeRow) => boolean;
  statusOf: (row: TreeRow) => RowStatus;
  /** The icon left of an element's name; elements without one keep the space, so the names line up */
  iconOf: (row: TreeRow) => IconSpecInput | undefined;
}>();

const emit = defineEmits<{
  select: [row: TreeRow];
  toggle: [key: string];
}>();
</script>

<template>
  <!-- Nested, so a sticky line is released when its refinements are scrolled past -->
  <ul>
    <li v-for="row in rows" :key="row.key">
      <div
        class="flex items-center rounded"
        :class="[
          isSelected(row) ? 'bg-emerald-50 hover:bg-emerald-100 font-medium' : 'bg-white hover:bg-slate-100',
          { sticky: row.children.length > 0 },
        ]"
        :style="{
          height: `${TREE_LINE_HEIGHT_REM}rem`,
          paddingLeft: `${row.depth * 0.875}rem`,
          top: `${stickyTop + row.depth * TREE_LINE_HEIGHT_REM}rem`,
          // Scrolled to below the sticky lines above it
          scrollMarginTop: `${stickyTop + row.depth * TREE_LINE_HEIGHT_REM}rem`,
          zIndex: Math.max(10 - row.depth, 1),
        }"
        :data-selected="isSelected(row) || undefined"
        :title="row.ref"
      >
        <button
          v-if="row.children.length > 0"
          type="button"
          class="w-5 h-5 shrink-0 flex items-center justify-center rounded cursor-pointer text-slate-500 hover:bg-slate-200"
          :aria-label="isCollapsed(row.key) ? `Expand ${row.label}` : `Collapse ${row.label}`"
          :aria-expanded="!isCollapsed(row.key)"
          @click="emit('toggle', row.key)"
        >
          <i :class="isCollapsed(row.key) ? 'icon-chevron-right' : 'icon-chevron-down'" class="text-[11px]" />
        </button>
        <button
          type="button"
          class="flex-1 min-w-0 h-full flex items-center text-left cursor-pointer"
          @click="emit('select', row)"
        >
          <span v-if="row.children.length === 0" class="w-5 shrink-0" />
          <template v-if="row.ref">
            <IconView v-if="iconOf(row)" :spec="iconOf(row)" :size="14" class="mr-1.5 text-slate-500" />
            <span v-else class="w-3.5 mr-1.5 shrink-0" />
          </template>
          <span class="truncate" :class="{ 'text-slate-400': !statusOf(row).configured }">{{ row.label }}</span>
          <span class="ml-auto flex items-center gap-1 shrink-0 pr-1.5">
            <!-- The native type of a mapped shape, blue like the mapping info box of the annotation form -->
            <span
              v-if="statusOf(row).native"
              class="text-[10px] px-1 rounded bg-blue-100 text-blue-800"
              :title="`Mapped to the native type ${statusOf(row).native}`"
            >
              {{ statusOf(row).native }}
            </span>
            <span v-if="statusOf(row).change === 'added'" class="text-[10px] px-1 rounded bg-green-100 text-green-800">new</span>
            <span v-else-if="statusOf(row).change === 'changed'" class="text-[10px] px-1 rounded bg-blue-100 text-blue-800"
              >changed</span
            >
            <span v-if="statusOf(row).problems" class="text-[10px] px-1 rounded bg-red-500 text-white">{{
              statusOf(row).problems
            }}</span>
            <span v-if="statusOf(row).warnings" class="text-[10px] px-1 rounded bg-amber-400 text-amber-950">{{
              statusOf(row).warnings
            }}</span>
          </span>
        </button>
      </div>
      <ElementTreeRows
        v-if="row.children.length > 0 && !isCollapsed(row.key)"
        :rows="row.children"
        :sticky-top="stickyTop"
        :is-collapsed="isCollapsed"
        :is-selected="isSelected"
        :status-of="statusOf"
        :icon-of="iconOf"
        @select="emit('select', $event)"
        @toggle="emit('toggle', $event)"
      />
    </li>
  </ul>
</template>
