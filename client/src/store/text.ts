import { readonly, ref } from "vue";
import { useAppStore } from "./app";
import { ContentNode } from "../models/types";
import { cloneDeep } from "../utils/helper/helper";

const { api } = useAppStore();

// Data
const text = ref<ContentNode | null>(null);
const initialText = ref<ContentNode | null>(null);

// Fetch status
const isFetching = ref<boolean>(false);
const error = ref<Error | null>(null);

export function useTextStore() {
  async function fetchAndInitializeText(uuid: string): Promise<void> {
    isFetching.value = true;

    error.value = null;

    try {
      const content: ContentNode = await api.getContent(uuid);

      initializeText(content);
    } catch (e: unknown) {
      error.value = e as Error;
      console.error("Error fetching text:", e);
    } finally {
      isFetching.value = false;
    }
  }

  function initializeText(newText: ContentNode): void {
    text.value = newText;
    initialText.value = cloneDeep(newText);
  }

  return {
    error: readonly(error),
    initialText,
    isFetching: readonly(isFetching),
    text,
    fetchAndInitializeText,
  };
}
