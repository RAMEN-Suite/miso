import { DeepReadonly, readonly, Ref } from "vue";
import { useStorage } from "@vueuse/core";
import type { FilterSpec, SmartView } from "../models/types";
import { cloneDeep } from "../utils/helper/helper";

interface SmartViewsStore {
  smartViews: DeepReadonly<Ref<SmartView[]>>;
  getSmartView: (uuid: string) => SmartView | null;
  getSmartViewFilters: (uuid: string) => FilterSpec | null;
  createSmartView: (params: {
    label: string;
    filters: FilterSpec;
    uuid?: string;
    appearance?: SmartView["appearance"];
  }) => SmartView;
  updateSmartView: (params: { uuid: string; label?: string; filters?: FilterSpec; appearance?: SmartView["appearance"] }) => void;
  deleteSmartView: (uuid: string) => void;
}

const storedSmartViews = useStorage<SmartView[]>("smartViews", [], undefined, {
  onError: (e) => console.error("The smartViews store failed to load: ", e),
});

if (!Array.isArray(storedSmartViews.value)) {
  storedSmartViews.value = [];
}

/** Public readonly ref of the store */
const smartViews: DeepReadonly<Ref<SmartView[]>> = readonly(storedSmartViews);

/**
 * Store for the user-defined views (named filter presets), currently persisted in the browser's local storage.
 *
 * Unlike a Tag, a view stores no node reference directly, only a filter preset that can be applied to node listings (Collection/Content).
 * Its membership is recomputed on every request from the filters it carries.
 *
 * @returns {SmartViewsStore} The views reactive ref, and the functions to manage them.
 */
export function useSmartViewsStore(): SmartViewsStore {
  /**
   * Deep-clones a filter object and detaches it from whatever reactive object it came from.
   *
   * Used to pass in a filter preset to a view or edit component.
   *
   * @param {FilterSpec} filters - The filters to copy.
   * @returns {FilterSpec} A detached deep copy.
   */
  function cloneFilters(filters: FilterSpec): FilterSpec {
    return cloneDeep(filters);
  }

  /**
   * Finds a view in the store.
   *
   * Internal function only — {@linkcode getSmartView} is the public, readonly view.
   *
   * @param {string} uuid - The view UUID.
   * @returns {SmartView | undefined} The view, or undefined if there is none.
   */
  function findSmartView(uuid: string): SmartView | undefined {
    return storedSmartViews.value.find((view: SmartView) => view.uuid === uuid);
  }

  /**
   * Returns a view for reading.
   *
   * Public function that is used to access the store from outside.
   *
   * @param {string} uuid - The view UUID.
   * @returns {DeepReadonly<SmartView> | null} The view, or null if there is none.
   */
  function getSmartView(uuid: string): SmartView | null {
    return findSmartView(uuid) ?? null;
  }

  /**
   * Returns a view's filter preset, detached from the store.
   *
   * @param {string} uuid - The view UUID.
   * @returns {FilterSpec | null} A deep copy of the preset, or null for an unknown view.
   */
  function getSmartViewFilters(uuid: string): FilterSpec | null {
    const view: SmartView | undefined = findSmartView(uuid);

    return view ? cloneFilters(view.config.filters) : null;
  }

  /**
   * Creates a view and appends it to the store.
   *
   * @param {Object} params - The label and filter preset, plus an optional UUID (generated when omitted) and appearance.
   * @returns {SmartView} The created view, so the caller can select it straight away.
   */
  function createSmartView(params: {
    label: string;
    filters: FilterSpec;
    uuid?: string;
    appearance?: SmartView["appearance"];
  }): SmartView {
    const { label, filters, uuid, appearance } = params;

    const newSmartView: SmartView = {
      uuid: uuid ?? crypto.randomUUID(),
      label,
      appearance,
      config: { filters: cloneFilters(filters) },
    };

    storedSmartViews.value.push(newSmartView);

    return newSmartView;
  }

  /**
   * Updates a view's label, filters and/or appearance. An omitted field is left alone, so renaming a
   * view does not drop its preset and re-filtering it does not drop its label.
   *
   * @param {Object} params - The view UUID, and the label, filters and/or appearance to apply.
   * @returns {void} This function does not return any value.
   */
  function updateSmartView(params: {
    uuid: string;
    label?: string;
    filters?: FilterSpec;
    appearance?: SmartView["appearance"];
  }): void {
    const { uuid, label, filters, appearance } = params;

    const view: SmartView | undefined = findSmartView(uuid);

    if (!view) {
      return;
    }

    if (label !== undefined) {
      view.label = label;
    }

    if (filters !== undefined) {
      view.config = { ...view.config, filters: cloneFilters(filters) };
    }

    if (appearance !== undefined) {
      view.appearance = appearance;
    }
  }

  /**
   * Deletes a view.
   *
   * @param {string} uuid - The view UUID.
   * @returns {void} This function does not return any value.
   */
  function deleteSmartView(uuid: string): void {
    storedSmartViews.value = storedSmartViews.value.filter((view: SmartView) => view.uuid !== uuid);
  }

  return {
    smartViews,
    getSmartView,
    getSmartViewFilters,
    createSmartView,
    updateSmartView,
    deleteSmartView,
  };
}
