<script setup lang="ts">
import { ComponentPublicInstance, nextTick, ref, useTemplateRef } from "vue";
import AutoComplete from "primevue/autocomplete";
import InputGroup from "primevue/inputgroup";
import Button from "primevue/button";
import { useTiptapStore } from "../store/tiptap";

/**
 *  Enriches Search with an html key that contains the formatted search result
 */
interface SearchResult {
  index: number;
  match: string;
  startIndex: number;
  endIndex: number;
  html: string;
}

/**
 * Interface for relevant state information about the text search
 */
interface TextSearchObject {
  fetchedItems: SearchResult[];
  searchStr: string | null;
  mode: "edit" | "view";
  elm: ReturnType<typeof useTemplateRef<ComponentPublicInstance>>;
}

const { hasUnsavedChanges } = useTiptapStore();

const isSearchActive = ref<boolean>(false);

const textSearchObject = ref<TextSearchObject>({
  fetchedItems: [],
  searchStr: "",
  mode: "view",
  elm: useTemplateRef<ComponentPublicInstance>("searchbar"),
});

function resetSearch(): void {
  textSearchObject.value.searchStr = "";
  textSearchObject.value.fetchedItems = [];

  setIsSearchActive(false);
}

function setIsSearchActive(mode: boolean): void {
  isSearchActive.value = mode;

  if (!mode) {
    return;
  }

  void nextTick(() => {
    const inputElm: HTMLInputElement = textSearchObject.value.elm?.$el?.querySelector("input");

    inputElm?.focus();
  });
}

function handleResultItemSelect(item: SearchResult): void {
  if (hasUnsavedChanges()) {
    const answer: boolean = window.confirm(
      "Save your changes before jumping to a new snippet. Be aware that if you have unsaved changes and still decide to jump to the snippet, the result might not be correct",
    );

    if (!answer) {
      // Next tick necessary to prevent race conditions between state updates of this component and
      // PrimeVue's component
      void nextTick(() => {
        textSearchObject.value.searchStr = item.match;
      });
      return;
    }
  }

  resetSearch();

  // Necessary since caret placement in EditorText.vue's onUpdated hook is overriden afterwards
  // by PrimeVue's focus and selection management. The emitted event is registered by an event listener
  // in EditorText.vue. Bit hacky, but it works. 100ms is currently enough, but might be adapted later...
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent("forceCaretPlacement"));
  }, 100);
}
</script>

<template>
  <InputGroup class="mr-1" :pt="{ root: { style: { width: 'auto' } } }">
    <AutoComplete
      v-if="isSearchActive"
      ref="searchbar"
      v-model="textSearchObject.searchStr"
      :class="isSearchActive ? 'active' : 'inactive'"
      :placeholder="`Search for text`"
      :suggestions="textSearchObject.fetchedItems"
      class="searchbar h-8"
      variant="filled"
      title="Enter search term"
      @complete="searchTextMatches($event.query)"
      @option-select="handleResultItemSelect($event.value)"
      @blur="isSearchActive = textSearchObject.searchStr === '' ? false : true"
    >
      <template v-if="textSearchObject.fetchedItems.length > 0" #header>
        <div class="font-medium px-4 py-2">{{ textSearchObject.fetchedItems.length }} Results</div>
      </template>
      <template #option="slotProps">
        <span :title="slotProps.option.match" v-html="slotProps.option.html"></span>
      </template>
    </AutoComplete>
    <Button
      v-if="!isSearchActive"
      severity="secondary"
      size="small"
      icon="pi pi-search"
      title="Open search bar"
      @click="setIsSearchActive(true)"
    />
    <Button
      v-if="isSearchActive"
      severity="secondary"
      size="small"
      icon="pi pi-times"
      title="Reset search"
      @click="resetSearch"
    />
  </InputGroup>
</template>

<style scoped></style>
