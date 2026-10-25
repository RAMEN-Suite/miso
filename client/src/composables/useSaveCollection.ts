import { ref, Ref } from "vue";
import { useEventListener } from "@vueuse/core";
import { CollectionNode, NodeDto, NodeStatusObject } from "../models/types";
import { useAppStore } from "../store/app";

export interface FieldSaveState {
  state: "saving" | "error";
  /** Why the field could not be saved (validation or request error). */
  message?: string;
}

export interface SaveJobMeta {
  /** The property name. */
  target: string;
  collectionUuid: string;
}

export interface SaveJob extends SaveJobMeta {
  /** Builds the request payload when the job starts, so it includes the results of earlier jobs. */
  buildPayload: () => NodeStatusObject;
  /** Called with the server response after a successful save. */
  onSuccess: (result: NodeDto<CollectionNode>) => void;
}

/** A request that takes longer than this is aborted, so a hanging request can't block the queue. */
const REQUEST_TIMEOUT_MS: number = 15_000;

/**
 * Queue for the direct saves of a Collection's properties. Runs them one after another and tracks the state of each
 * field.
 *
 * @returns The queue functions, the number of pending saves and the field state getter.
 */
export function useSaveCollection() {
  const { api, addToastMessage } = useAppStore();

  const pendingCount = ref<number>(0);

  // Keyed by Collection and field, so a late result never marks a field of another Collection
  const fieldStates: Ref<Record<string, FieldSaveState>> = ref({});

  let queue: Promise<unknown> = Promise.resolve();

  // Warn before closing the tab while requests are still running
  useEventListener(window, "beforeunload", (event: BeforeUnloadEvent) => {
    if (pendingCount.value > 0) {
      event.preventDefault();
    }
  });

  function fieldKey(meta: Pick<SaveJobMeta, "collectionUuid" | "target">): string {
    return `${meta.collectionUuid}/${meta.target}`;
  }

  /**
   * Returns the save state of a field.
   *
   * @param {string} collectionUuid - UUID of the Collection.
   * @param {string} target - The property name.
   * @returns {FieldSaveState | undefined} The state, or `undefined` if the field is idle.
   */
  function getFieldState(collectionUuid: string, target: string): FieldSaveState | undefined {
    return fieldStates.value[fieldKey({ collectionUuid, target })];
  }

  /**
   * Sets or clears the save state of a field.
   *
   * @param {SaveJobMeta} meta - The field.
   * @param {FieldSaveState | null} state - The new state, `null` to clear it.
   * @returns {void} This function does not return any value.
   */
  function setFieldState(meta: SaveJobMeta, state: FieldSaveState | null): void {
    if (state) {
      fieldStates.value[fieldKey(meta)] = state;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- Safe to delete
      delete fieldStates.value[fieldKey(meta)];
    }
  }

  /**
   * Marks a field as invalid, e.g. when its value was not sent.
   *
   * @param {SaveJobMeta} meta - The field.
   * @param {string} message - The validation message, shown at the field.
   * @returns {void} This function does not return any value.
   */
  function setFieldError(meta: SaveJobMeta, message: string): void {
    setFieldState(meta, { state: "error", message });
  }

  /**
   * Clears a field's error, e.g. after its value was reverted.
   *
   * @param {SaveJobMeta} meta - The field.
   * @returns {void} This function does not return any value.
   */
  function clearFieldState(meta: SaveJobMeta): void {
    setFieldState(meta, null);
  }

  /**
   * Returns a readable message for a request error.
   *
   * @param {unknown} error - The caught error.
   * @returns {string} The message.
   */
  function getErrorMessage(error: unknown): string {
    const err: Error = error as Error;

    if (err?.name === "TimeoutError") {
      return `No response after ${REQUEST_TIMEOUT_MS / 1000} seconds.`;
    }

    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- An empty message must fall back too
    return err?.message || "Unknown error";
  }

  /**
   * Sends a queued save and updates the field state. Failures are shown at the field and as a toast.
   *
   * @param {SaveJob} job - The save to run.
   * @returns {Promise<boolean>} Whether the save succeeded.
   */
  async function run(job: SaveJob): Promise<boolean> {
    const meta: SaveJobMeta = { target: job.target, collectionUuid: job.collectionUuid };

    try {
      const result: NodeDto<CollectionNode> = await api.updateCollection(
        job.collectionUuid,
        job.buildPayload(),
        AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      );

      job.onSuccess(result);
      setFieldState(meta, null);

      return true;
    } catch (error: unknown) {
      const message: string = getErrorMessage(error);

      setFieldState(meta, { state: "error", message });

      addToastMessage({ severity: "error", summary: "Not saved", detail: message, life: 4000 });

      return false;
    }
  }

  /**
   * Adds a save to the queue. Saves run one after another in the order they were queued.
   *
   * @param {SaveJob} job - The save to run.
   * @returns {Promise<boolean>} Whether the save succeeded.
   */
  function enqueue(job: SaveJob): Promise<boolean> {
    const meta: SaveJobMeta = { target: job.target, collectionUuid: job.collectionUuid };

    pendingCount.value++;
    setFieldState(meta, { state: "saving" });

    const result: Promise<boolean> = queue.then(async () => {
      try {
        return await run(job);
      } finally {
        pendingCount.value--;
      }
    });

    queue = result.catch(() => undefined);

    return result;
  }

  return { pendingCount, enqueue, setFieldError, clearFieldState, getFieldState };
}
