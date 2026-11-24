import { computed, markRaw, readonly, ref, shallowRef, toRaw, watch, type ComputedRef, type Ref } from "vue";
import { useDebounceFn } from "@vueuse/core";
import { RamenModel, type RamenFile } from "@ramen-suite/core";
import {
  checkConfig,
  collectConfigWarnings,
  createModelContext,
  formatFinding,
  type ConfigFinding,
  type MisoConfig,
  type ModelContext,
} from "../external";
import { diffModels, type ElementChange } from "../utils/modelDiff";
import { pruneGoneEntries, refreshNameHints, serializeConfig, withModel } from "../utils/configUpdate";

/** What the configurator shows in its form */
export type Selection = { kind: "classifier" | "annotation"; ref: string } | { kind: "mappings" } | { kind: "general" };

/** A new model, checked and compared with the current one, before it is applied */
export interface PendingModel {
  fileName: string;
  model: RamenFile;
  changes: ElementChange[];
  /** The findings of the config with the new model */
  findings: ConfigFinding[];
}

/** The last applied model update, shown until another config is opened */
export interface AppliedModelUpdate {
  fileName: string;
  changes: ElementChange[];
}

/** How the settings are adjusted when a new model is applied */
export interface ApplyModelOptions {
  /** Set the name hints of the entries and mappings from the new model */
  refreshNameHints: boolean;
  /** Remove the entries of elements and attributes the new model doesn't have */
  pruneGoneEntries: boolean;
}

/** Delay of the checks after the last edit; they import the whole model */
const CHECK_DELAY_MS = 300;

/**
 * The config being edited. In memory only: it is opened from a file and leaves the configurator only as a download. The
 * raw model is never proxied (`markRaw`): it is large and only replaced as a whole.
 */
const draft = ref<MisoConfig>();
const fileName = ref<string>("");
const isDirty = ref<boolean>(false);
const selection = ref<Selection>({ kind: "general" });
const lastUpdate = shallowRef<AppliedModelUpdate>();
const findings = shallowRef<ConfigFinding[]>([]);

/** The model of the draft, imported by RAMEN core. Recomputed only when the model is replaced. */
const model: ComputedRef<RamenModel | undefined> = computed(() => {
  const file: RamenFile | undefined = draft.value?.model;

  return file ? RamenModel.import(structuredClone(file)) : undefined;
});

/** The context the model accessors work on; its config is the reactive draft */
const context: ComputedRef<ModelContext | undefined> = computed(() =>
  draft.value && model.value ? createModelContext(draft.value, model.value) : undefined,
);

const scheduleChecks: () => void = useDebounceFn(() => {
  findings.value = draft.value ? checkAll(toRaw(draft.value)) : [];
}, CHECK_DELAY_MS);

// Replacing the draft (open, apply) is not an edit; changing it in place is
watch(
  draft,
  (current, previous) => {
    if (current && current === previous) {
      isDirty.value = true;
    }

    scheduleChecks();
  },
  { deep: true },
);

/**
 * All checks of a config: the ref checks of `checkConfig` and the warnings that need the model.
 *
 * @param {unknown} data - The config.
 * @returns {ConfigFinding[]} The findings.
 */
function checkAll(data: unknown): ConfigFinding[] {
  const result = checkConfig(data);

  if (!result.config || !result.model) {
    return result.findings;
  }

  return [...result.findings, ...collectConfigWarnings(createModelContext(result.config, result.model))];
}

/**
 * Reads a JSON file.
 *
 * @param {File} file - The file.
 * @returns {Promise<unknown>} The parsed JSON.
 * @throws {Error} If the file is no valid JSON.
 */
async function readJson(file: File): Promise<unknown> {
  try {
    return JSON.parse(await file.text());
  } catch (error: unknown) {
    throw new Error(`${file.name} is no valid JSON: ${(error as Error).message}`);
  }
}

/**
 * The draft of the configurator and its actions: open a config, compare and apply a new model, export.
 */
export function useConfigDraft() {
  /**
   * Opens a config file. A config with problems (e.g. a broken ref) opens, so they can be fixed; one that doesn't
   * match the format or has an invalid model doesn't.
   *
   * @param {File} file - The config file.
   * @throws {Error} If the file is no JSON, doesn't match the format or its model is invalid.
   */
  async function openConfig(file: File): Promise<void> {
    const result = checkConfig(await readJson(file));

    if (!result.config) {
      throw new Error(result.findings.map(formatFinding).join("\n"));
    }

    draft.value = { ...result.config, model: markRaw(result.config.model) };
    fileName.value = file.name;
    isDirty.value = false;
    lastUpdate.value = undefined;
    selection.value = { kind: "general" };
  }

  /**
   * Reads a new model and compares it with the current one, without applying it.
   *
   * @param {File} file - The RamenFile, e.g. a new Nori export.
   * @returns {Promise<PendingModel>} The model, its changes and the findings of the config with it.
   * @throws {Error} If no config is open, the file is no JSON or RAMEN core rejects the model.
   */
  async function readModel(file: File): Promise<PendingModel> {
    if (!draft.value || !context.value) {
      throw new Error("Open a config first");
    }

    const next = (await readJson(file)) as RamenFile;
    let nextModel: RamenModel;

    try {
      nextModel = RamenModel.import(structuredClone(next));
    } catch (error: unknown) {
      throw new Error(`${file.name} is no valid model: ${(error as Error).message}`);
    }

    const nextConfig: MisoConfig = withModel(toRaw(draft.value), next);

    return {
      fileName: file.name,
      model: next,
      changes: diffModels(context.value, createModelContext(nextConfig, nextModel)),
      findings: checkAll(nextConfig),
    };
  }

  /**
   * Replaces the model of the draft.
   *
   * @param {PendingModel} pending - The new model, see {@linkcode readModel}.
   * @param {ApplyModelOptions} options - How the settings are adjusted.
   */
  function applyModel(pending: PendingModel, options: ApplyModelOptions): void {
    if (!draft.value) {
      return;
    }

    let next: MisoConfig = withModel(toRaw(draft.value), pending.model);

    if (options.refreshNameHints) {
      next = refreshNameHints(next);
    }

    if (options.pruneGoneEntries) {
      next = pruneGoneEntries(next);
    }

    draft.value = { ...next, model: markRaw(pending.model) };
    isDirty.value = true;
    lastUpdate.value = { fileName: pending.fileName, changes: pending.changes };
  }

  /**
   * Downloads the draft as JSON (see `serializeConfig`), if it has no problems.
   *
   * @throws {Error} If no config is open or it has problems.
   */
  function exportConfig(): void {
    if (!draft.value) {
      throw new Error("Open a config first");
    }

    const json: string = serializeConfig(toRaw(draft.value));
    const problems: ConfigFinding[] = checkAll(JSON.parse(json)).filter((finding) => finding.severity === "problem");

    if (problems.length > 0) {
      throw new Error(problems.map(formatFinding).join("\n"));
    }

    const link: HTMLAnchorElement = document.createElement("a");
    const url: string = URL.createObjectURL(new Blob([json], { type: "application/json" }));

    link.href = url;
    link.download = `${draft.value.id}.${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    isDirty.value = false;
  }

  return {
    draft: draft as Ref<MisoConfig | undefined>,
    context,
    fileName: readonly(fileName),
    findings: computed<ConfigFinding[]>(() => findings.value),
    isDirty: readonly(isDirty),
    lastUpdate: computed<AppliedModelUpdate | undefined>(() => lastUpdate.value),
    selection,
    openConfig,
    readModel,
    applyModel,
    exportConfig,
  };
}
