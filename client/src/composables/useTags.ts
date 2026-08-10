import { computed, ComputedRef, DeepReadonly, readonly, Ref } from "vue";
import { useStorage } from "@vueuse/core";
import type { Tag, TagEntry } from "../models/types";

interface UseTagsReturnType {
  tags: DeepReadonly<Ref<Tag[]>>;
  entryIndex: ComputedRef<Map<string, string[]>>;
  getTag: (uuid: string) => DeepReadonly<Tag> | null;
  getTagEntryUuids: (uuid: string) => string[];
  getTagsForItem: (itemUuid: string) => string[];
  createTag: (params: { label: string; uuid?: string; appearance?: Tag["appearance"] }) => Tag;
  renameTag: (params: { tagUuid: string; label: string }) => void;
  deleteTag: (uuid: string) => void;
  addItemsToTag: (params: { tagUuid: string; itemUuids: string[] }) => void;
  removeItemsFromTag: (params: { tagUuid: string; itemUuids: string[] }) => void;
  toggleItemInTag: (params: { tagUuid: string; itemUuid: string }) => void;
}

/**
 * A composable function that manages tags in the browser's local storage.
 *
 * A tag stores **references only** (`{ uuid, createdAt }`), never node snapshots: the nodes are
 * resolved server-side on read via `POST /api/hierarchy/query`, so a renamed or re-parented node
 * never goes stale here.
 *
 * @returns {UseTagsReturnType} The tags reactive ref, and the functions to manage them.
 */
export function useTags(): UseTagsReturnType {
  const storedTags = useStorage<Tag[]>("tags", []);

  if (!Array.isArray(storedTags.value)) {
    storedTags.value = [];
  }

  /** Node UUID -> UUIDs of the tags carrying it. */
  const entryIndex: ComputedRef<Map<string, string[]>> = computed(() => {
    const index = new Map<string, string[]>();

    for (const tag of storedTags.value) {
      for (const entry of tag.entries) {
        const existing: string[] | undefined = index.get(entry.uuid);

        if (existing) {
          existing.push(tag.uuid);
        } else {
          index.set(entry.uuid, [tag.uuid]);
        }
      }
    }

    return index;
  });

  /**
   * Finds a tag in the store.
   *
   * Internal function only — {@linkcode getTag} is the public, readonly view.
   *
   * @param {string} uuid - The tag UUID.
   * @returns {Tag | undefined} The tag, or undefined if there is none.
   */
  function findTag(uuid: string): Tag | undefined {
    return storedTags.value.find((tag: Tag) => tag.uuid === uuid);
  }

  /**
   * Returns a tag for reading.
   *
   * @param {string} uuid - The tag UUID.
   * @returns {DeepReadonly<Tag> | null} The tag, or null if there is none.
   */
  function getTag(uuid: string): DeepReadonly<Tag> | null {
    return findTag(uuid) ?? null;
  }

  /**
   * Returns the UUIDs of the nodes carrying a tag.
   *
   * Used to build the scope that fetches nodes tagged with this uuid.
   *
   * @param {string} uuid - The tag UUID.
   * @returns {string[]} The tagged node UUIDs, empty for an unknown or empty tag.
   */
  function getTagEntryUuids(uuid: string): string[] {
    return findTag(uuid)?.entries?.map((entry: TagEntry) => entry.uuid) ?? [];
  }

  /**
   * Returns the UUIDs of the tags a node carries.
   *
   * @param {string} itemUuid - The node UUID.
   * @returns {string[]} The UUIDs of the tags on that node.
   */
  function getTagsForItem(itemUuid: string): string[] {
    return entryIndex.value.get(itemUuid) ?? [];
  }

  /**
   * Creates an empty tag and appends it to the store.
   *
   * @param {Object} params - The label, an optional UUID (generated when omitted) and an optional appearance.
   * @returns {Tag} The created tag, so the caller can select it straight away.
   */
  function createTag(params: { label: string; uuid?: string; appearance?: Tag["appearance"] }): Tag {
    const { label, uuid, appearance } = params;

    const newTag: Tag = {
      uuid: uuid ?? crypto.randomUUID(),
      label,
      appearance,
      entries: [],
    };

    storedTags.value.push(newTag);

    return newTag;
  }

  /**
   * Renames a tag. A no-op if the tag does not exist.
   *
   * @param {Object} params - The tag UUID and its new label.
   * @returns {void} This function does not return any value.
   */
  function renameTag(params: { tagUuid: string; label: string }): void {
    const { tagUuid, label } = params;

    const tag: Tag | undefined = findTag(tagUuid);

    if (!tag) {
      return;
    }

    tag.label = label;
  }

  /**
   * Deletes a tag and all its entries. The nodes themselves are untouched — a tag only ever held
   * references to them.
   *
   * @param {string} uuid - The tag UUID.
   * @returns {void} This function does not return any value.
   */
  function deleteTag(uuid: string): void {
    storedTags.value = storedTags.value.filter((tag: Tag) => tag.uuid !== uuid);
  }

  /**
   * Tags nodes, skipping any that already carry the tag. Uniqueness matters beyond tidiness: the
   * UUID set becomes a Cypher scope, where a duplicate is wasted work.
   *
   * @param {Object} params - The target tag UUID and the node UUIDs to tag.
   * @returns {void} This function does not return any value.
   */
  function addItemsToTag(params: { tagUuid: string; itemUuids: string[] }): void {
    const { tagUuid, itemUuids } = params;

    const tag: Tag | undefined = findTag(tagUuid);

    if (!tag) {
      console.error(`Tag with UUID ${tagUuid} not found.`);
      return;
    }

    const existingUuids = new Set<string>(tag.entries.map((entry: TagEntry) => entry.uuid));
    const createdAt: string = new Date().toISOString();

    const newEntries: TagEntry[] = [...new Set(itemUuids)]
      .filter((itemUuid: string) => !existingUuids.has(itemUuid))
      .map((itemUuid: string) => ({ uuid: itemUuid, createdAt }));

    tag.entries.push(...newEntries);
  }

  /**
   * Removes a tag from nodes.
   *
   * This will also be the pruning path for entries whose node no longer exists in the database (future work).
   *
   * @param {Object} params - The target tag UUID and the node UUIDs to untag.
   * @returns {void} This function does not return any value.
   */
  function removeItemsFromTag(params: { tagUuid: string; itemUuids: string[] }): void {
    const { tagUuid, itemUuids } = params;

    const tag: Tag | undefined = findTag(tagUuid);

    if (!tag) {
      return;
    }

    const removable = new Set<string>(itemUuids);

    tag.entries = tag.entries.filter((entry: TagEntry) => !removable.has(entry.uuid));
  }

  /**
   * Adds a tag to a node, or removes it if the node already carries it. Used by interfaces which
   * don't know the node's tag state.
   *
   * @param {Object} params - The target tag UUID and the node UUID.
   * @returns {void} This function does not return any value.
   */
  function toggleItemInTag(params: { tagUuid: string; itemUuid: string }): void {
    const { tagUuid, itemUuid } = params;

    if (getTagsForItem(itemUuid).includes(tagUuid)) {
      removeItemsFromTag({ tagUuid, itemUuids: [itemUuid] });
    } else {
      addItemsToTag({ tagUuid, itemUuids: [itemUuid] });
    }
  }

  return {
    tags: readonly(storedTags),
    entryIndex,
    getTag,
    getTagEntryUuids,
    getTagsForItem,
    createTag,
    renameTag,
    deleteTag,
    addItemsToTag,
    removeItemsFromTag,
    toggleItemInTag,
  };
}
