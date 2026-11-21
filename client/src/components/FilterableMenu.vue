<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from "vue";
import Menu from "primevue/menu";
import InputText from "primevue/inputtext";
import { MenuItem } from "primevue/menuitem";

const props = withDefaults(
  defineProps<{
    model: MenuItem[];
    searchMode?: "fuzzy" | "strict";
  }>(),
  { searchMode: "fuzzy" },
);

defineExpose({ toggle });

const menu = useTemplateRef<InstanceType<typeof Menu>>("menu");
const inputRef = useTemplateRef<InstanceType<typeof InputText> & { $el: HTMLInputElement }>("filter-input");

const searchInput = ref<string>("");

/**
 * Regex search pattern, built from the search input or `null` if there is nothing to filter by.
 *
 * In fuzzy mode every character is joined with `.*` (whitespace is ignored), otherwise the input has to appear as a whole.
 */
const searchPattern = computed<RegExp | null>(() => {
  const normalizedSearchInput: string = searchInput.value.trim();

  if (!normalizedSearchInput) {
    return null;
  }

  /* eslint-disable @typescript-eslint/no-misused-spread -- Spread is needed, and input will be simple */
  const pattern: string =
    props.searchMode === "fuzzy"
      ? [...normalizedSearchInput.replace(/\s+/g, "")].map(escapeRegExp).join(".*")
      : escapeRegExp(normalizedSearchInput);

  return new RegExp(pattern, "i");
});

const filteredGroups = computed<MenuItem[][]>(() =>
  props.model
    .map((group: MenuItem) => (group.items ?? []).filter((item: MenuItem) => matches(item, searchPattern.value)))
    .filter((items: MenuItem[]) => items.length > 0),
);

const filteredModel = computed<MenuItem[]>(() => {
  const flattened: MenuItem[] = filteredGroups.value.flatMap((items: MenuItem[], index: number) =>
    index === 0 ? items : [{ separator: true }, ...items],
  );

  const [firstItem, ...rest] = flattened;

  if (!firstItem) {
    return [];
  }

  return [{ ...firstItem, class: [firstItem.class, "p-focus"] }, ...rest];
});

/**
 * Escapes characters with a special meaning in regular expressions, so user input is matched literally.
 *
 * @param {string} value - The raw search input
 * @returns {string} The escaped string, ready to be used in a regular expression
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function handleEnter(event: KeyboardEvent): void {
  const firstItem: MenuItem | undefined = filteredGroups.value[0]?.[0];

  if (!firstItem) {
    return;
  }

  firstItem.command?.({ originalEvent: event, item: firstItem });

  menu.value?.hide();
}

function handleEscape(): void {
  menu.value?.hide();
}

function handleHide(): void {
  searchInput.value = "";
}

async function handleShow(): Promise<void> {
  await nextTick();

  inputRef.value?.$el?.focus();
}

function matches(item: MenuItem, pattern: RegExp | null): boolean {
  if (!pattern) {
    return true;
  }

  return typeof item.label === "string" && pattern.test(item.label);
}

function toggle(event: Event): void {
  menu.value?.toggle(event);
}
</script>

<template>
  <Menu
    ref="menu"
    :model="filteredModel"
    :popup="true"
    :pt="{
      list: {
        class: 'max-h-[min(24rem,40vh)] overflow-y-auto' + ' ' + (filteredModel.length === 0 ? 'hidden!' : ''),
        style: 'scrollbar-width: thin',
      },
    }"
    @show="handleShow"
    @hide="handleHide"
  >
    <template #start>
      <div class="p-1">
        <InputText
          ref="filter-input"
          v-model="searchInput"
          size="small"
          class="w-full"
          spellcheck="false"
          placeholder="Search..."
          :style="{
            borderTop: 'none',
            borderLeft: 'none',
            borderRadius: 0,
            borderRight: 'none',
            backgroundColor: 'inherit',
            boxShadow: 'none',
          }"
          @keydown.enter.prevent="handleEnter"
          @keydown.escape="handleEscape"
        />
      </div>
    </template>
    <template #itemicon="slotProps">
      <slot name="itemicon" v-bind="slotProps" />
    </template>
    <template #end>
      <div v-if="filteredModel.length === 0" class="px-3 pb-2 pt-1 text-xs opacity-60 text-center">No matches</div>
    </template>
  </Menu>
</template>
