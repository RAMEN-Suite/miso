import { ref, Ref } from "vue";
import { useEventListener, useTimeoutFn } from "@vueuse/core";
import { CollectionNode, NodeDto, NodeStatusObject } from "../models/types";
import { useAppStore } from "../store/app";
import { createLogger, Logger } from "../utils/logger";
import ApiError from "../utils/errors/api.error";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface FieldSaveState {
  state: "saving" | "error";
  /** Why the field could not be saved (validation or request error). */
  message?: string;
}

export interface SaveJobMeta {
  kind: "field" | "annotation";
  /** Property name (field) or UUID (annotation). */
  target: string;
  collectionUuid: string;
}

export interface SaveJob extends SaveJobMeta {
  /** Builds the request payload. Runs when the job starts (not when it's queued), so it sees the results of earlier jobs. */
  buildPayload: () => NodeStatusObject;
  /** Called with the server response after a successful save. */
  onSuccess: (result: NodeDto<CollectionNode>) => void;
}

/** A request that takes longer than this is aborted, so a hanging request can't block the queue. */
const REQUEST_TIMEOUT_MS: number = 15_000;

/** How long the "saved" status is shown before it falls back to "idle". */
const SAVED_STATUS_DURATION_MS: number = 2000;

const logger: Logger = createLogger("collection-save");

/**
 * Queue for the direct saves of a Collection (its properties and annotations). Runs the requests one after another,
 * tracks their status for the UI and logs enqueueing, waiting time, duration and failures.
 *
 * @returns The queue functions and its reactive status.
 */
export function useCollectionSave() {
  const { api, addToastMessage } = useAppStore();

  const status = ref<SaveStatus>("idle");
  const lastError = ref<string | null>(null);
  const pendingCount = ref<number>(0);

  // Keyed by `${collectionUuid}/${target}`, so a late result for another Collection never marks a field of the current one
  const fieldStates: Ref<Record<string, FieldSaveState>> = ref({});

  let queue: Promise<unknown> = Promise.resolve();
  let batchFailed: boolean = false;

  const { start: startSavedTimeout, stop: stopSavedTimeout } = useTimeoutFn(
    () => {
      if (status.value === "saved") {
        status.value = "idle";
      }
    },
    SAVED_STATUS_DURATION_MS,
    { immediate: false },
  );

  // Warn before closing the tab while requests are still running
  useEventListener(window, "beforeunload", (event: BeforeUnloadEvent) => {
    if (pendingCount.value > 0) {
      event.preventDefault();
    }
  });

  function fieldKey(meta: Pick<SaveJobMeta, "collectionUuid" | "target">): string {
    return `${meta.collectionUuid}/${meta.target}`;
  }

  function getFieldState(collectionUuid: string, target: string): FieldSaveState | undefined {
    return fieldStates.value[fieldKey({ collectionUuid, target })];
  }

  function setFieldState(meta: SaveJobMeta, state: FieldSaveState | null): void {
    if (meta.kind !== "field") {
      return;
    }

    if (state) {
      fieldStates.value[fieldKey(meta)] = state;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- Safe to delete
      delete fieldStates.value[fieldKey(meta)];
    }
  }

  /**
   * Records that a change was not sent, either because nothing changed or because the value is invalid.
   *
   * @param {SaveJobMeta} meta - What would have been saved.
   * @param {"unchanged" | "invalid"} reason - Why it was skipped.
   * @param {string} [message] - Validation message, shown at the field.
   * @returns {void} This function does not return any value.
   */
  function skip(meta: SaveJobMeta, reason: "unchanged" | "invalid", message?: string): void {
    logger.debug("Skipped", { ...meta, reason, message });

    setFieldState(meta, reason === "invalid" ? { state: "error", message } : null);
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

  function describeError(error: unknown): { name: string; message: string; statusCode?: number } {
    const err: Error = error as Error;

    if (err?.name === "TimeoutError") {
      return { name: err.name, message: `No response after ${REQUEST_TIMEOUT_MS / 1000} seconds.` };
    }

    return {
      name: err?.name ?? "UnknownError",
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- An empty message must fall back too
      message: err?.message || "Unknown error",
      statusCode: error instanceof ApiError ? error.statusCode : undefined,
    };
  }

  async function run(job: SaveJob, enqueuedAt: number): Promise<boolean> {
    const meta: SaveJobMeta = { kind: job.kind, target: job.target, collectionUuid: job.collectionUuid };
    const payload: NodeStatusObject = job.buildPayload();

    logger.debug("Started", {
      ...meta,
      queueWaitMs: Math.round(performance.now() - enqueuedAt),
      payloadBytes: new TextEncoder().encode(JSON.stringify(payload)).length,
    });

    const stopTimer = logger.time();

    try {
      const result: NodeDto<CollectionNode> = await api.updateCollection(
        job.collectionUuid,
        payload,
        AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      );

      stopTimer("Saved", { ...meta });
      job.onSuccess(result);
      setFieldState(meta, null);

      return true;
    } catch (error: unknown) {
      const { name, message, statusCode } = describeError(error);

      stopTimer("Failed", { ...meta, errorName: name, statusCode, message }, "error");
      setFieldState(meta, { state: "error", message });

      batchFailed = true;
      lastError.value = message;

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
    const meta: SaveJobMeta = { kind: job.kind, target: job.target, collectionUuid: job.collectionUuid };
    const enqueuedAt: number = performance.now();

    if (pendingCount.value === 0) {
      batchFailed = false;
    }

    pendingCount.value++;
    status.value = "saving";
    stopSavedTimeout();
    setFieldState(meta, { state: "saving" });

    logger.debug("Enqueued", { ...meta, queueLength: pendingCount.value });

    const result: Promise<boolean> = queue.then(async () => {
      try {
        return await run(job, enqueuedAt);
      } finally {
        pendingCount.value--;

        if (pendingCount.value === 0) {
          status.value = batchFailed ? "error" : "saved";

          if (!batchFailed) {
            lastError.value = null;
            startSavedTimeout();
          }
        }
      }
    });

    queue = result.catch(() => undefined);

    return result;
  }

  return { status, lastError, pendingCount, enqueue, skip, clearFieldState, getFieldState };
}
