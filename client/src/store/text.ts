import { readonly, ref } from "vue";
import { useAppStore } from "./app";
import { NodeDto, TextNode } from "../models/types";
import { cloneDeep } from "../utils/helper/helper";

const { api } = useAppStore();

// Data
const text = ref<TextNode | null>(null);
const initialText = ref<TextNode | null>(null);

// Fetch status
const isFetching = ref<boolean>(false);
const error = ref<Error | null>(null);

export function useTextStore() {
  async function fetchAndInitializeText(uuid: string): Promise<void> {
    isFetching.value = true;

    error.value = null;

    try {
      const content: NodeDto<TextNode> = await api.getContent(uuid);

      initializeText(content.node);
    } catch (e: unknown) {
      error.value = e as Error;
      console.error("Error fetching text:", e);
    } finally {
      isFetching.value = false;
    }
  }

  function initializeText(newText: TextNode): void {
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
