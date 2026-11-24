import { computed, markRaw, readonly, ref, shallowRef, toRaw, watch, type ComputedRef } from "vue";
import { useDebounceFn } from "@vueuse/core";
import { RamenModel, type RamenFile } from "@ramen-suite/core";
import {
  CONFIG_SCHEMA_URL,
  checkConfig,
  collectConfigWarnings,
  createModelContext,
  formatFinding,
  type ConfigFinding,
  type MisoConfig,
  type ModelContext,
} from "../external";
import { diffModels, type ElementChange } from "../utils/modelDiff";
import {
  pruneGoneEntries,
  putStyles,
  refreshNameHints,
  serializeConfig,
  takeStyles,
  withKey,
  withModel,
  type AnnotationEntry,
  type StyleKind,
  type TakenStyles,
} from "../utils/configUpdate";

/**
 * What the configurator shows in its form. `focus` is what the form scrolls to: of an element, the finding whose
 * controls are flashed; of the text editor, the shape ref whose mapping is flashed.
 */
export type Selection =
  | { kind: "classifier" | "annotation"; ref: string; focus?: ConfigFinding }
  | { kind: "textEditor"; focus?: string }
  | { kind: "general" };

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

/**
 * Styles that don't apply to the current extent of their shape, set aside instead of being deleted: switching the
 * extent back brings them back. Keyed by `<shapeRef>|<kind>`. Not exported; lost when another config is opened.
 */
const setAsideStyles = new Map<string, TakenStyles>();

/** The settings of a shape its native type decides while it is mapped */
interface MappedSettings {
  group?: AnnotationEntry["group"];
  icon?: NonNullable<AnnotationEntry["appearance"]>["icon"];
}

/**
 * Settings of mapped shapes, set aside like the styles: the native type decides a mapped shape's group and icon, and
 * removing the mapping brings them back. Keyed by shape ref, with the name hint in case the entry is gone meanwhile.
 */
const setAsideMappedSettings = new Map<string, MappedSettings & { name: string }>();

/**
 * Sets the group and icon of mapped shapes aside and brings back the ones of shapes that aren't mapped anymore. Changes
 * the config in place.
 *
 * @param {MisoConfig} config - The config.
 */
function syncMappedSettings(config: MisoConfig): void {
  const mappedRefs = new Set<string>(config.editors.text.mappings.map((mapping) => mapping.annotation));

  for (const [ref, entry] of Object.entries(config.elements.annotations)) {
    const group: MappedSettings["group"] = entry.group;
    const icon: MappedSettings["icon"] = entry.appearance?.icon;

    if (mappedRefs.has(ref) && (group !== undefined || icon !== undefined)) {
      const earlier = setAsideMappedSettings.get(ref);

      setAsideMappedSettings.set(ref, { name: entry.name, group: group ?? earlier?.group, icon: icon ?? earlier?.icon });
      delete entry.group;
      entry.appearance = withKey(entry.appearance, "icon", undefined);
    }
  }

  for (const [ref, { name, group, icon }] of setAsideMappedSettings) {
    if (!mappedRefs.has(ref)) {
      const entry: AnnotationEntry = (config.elements.annotations[ref] ??= { name });

      entry.group ??= group;

      if (icon !== undefined && entry.appearance?.icon === undefined) {
        entry.appearance = withKey(entry.appearance, "icon", icon);
      }

      setAsideMappedSettings.delete(ref);
    }
  }
}

/** The model of the draft, imported by RAMEN core. Recomputed only when the model is replaced. */
const model: ComputedRef<RamenModel | undefined> = computed(() => {
  const file: RamenFile | undefined = draft.value?.model;

  return file ? RamenModel.import(structuredClone(file)) : undefined;
});

/** The context the model accessors work on; its config is the reactive draft */
const context: ComputedRef<ModelContext | undefined> = computed(() =>
  draft.value && model.value ? createModelContext(draft.value, model.value) : undefined,
);

/** The context for components that are only shown while a config is open */
const requiredContext: ComputedRef<ModelContext> = computed(() => {
  if (!context.value) {
    throw new Error("No config is open");
  }

  return context.value;
});

const scheduleChecks = useDebounceFn(() => {
  findings.value = draft.value ? checkAll(toRaw(draft.value)) : [];
}, CHECK_DELAY_MS);

// Replacing the draft (open, apply) is not an edit; changing it in place is
watch(
  draft,
  (current, previous) => {
    if (current && current === previous) {
      isDirty.value = true;
    }

    void scheduleChecks();
  },
  { deep: true },
);

// Mapping or unmapping a shape sets its group and icon aside or brings them back (an edit, unlike the sync on open)
watch(
  () => draft.value?.editors.text.mappings.map((mapping) => mapping.annotation).join("\n"),
  () => {
    if (draft.value) {
      syncMappedSettings(draft.value);
    }
  },
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
    throw new Error(`${file.name} is no valid JSON: ${(error as Error).message}`, { cause: error });
  }
}

/**
 * The draft of the configurator and its actions: open a config or start one for a model, compare and apply a new
 * model, export.
 */
export function useConfigDraft() {
  /**
   * Opens a config file. A config with problems (e.g. a broken ref) opens, so they can be fixed; one that doesn't
   * match the format or has an invalid model doesn't. Groups and icons of mapped shapes are set aside (see
   * `syncMappedSettings`).
   *
   * @param {File} file - The config file.
   * @throws {Error} If the file is no JSON, doesn't match the format or its model is invalid.
   */
  async function openConfig(file: File): Promise<void> {
    const result = checkConfig(await readJson(file));

    if (!result.config) {
      throw new Error(result.findings.map(formatFinding).join("\n"));
    }

    setAsideStyles.clear();
    setAsideMappedSettings.clear();
    syncMappedSettings(result.config);
    draft.value = { ...result.config, model: markRaw(result.config.model) };
    fileName.value = file.name;
    isDirty.value = false;
    lastUpdate.value = undefined;
    selection.value = { kind: "general" };
  }

  /**
   * Starts a new config for a model: no settings yet, the ID from the file name (e.g. `hildegard` from
   * `hildegard.ramen.json`). Unexported until the first export.
   *
   * @param {File} file - The RamenFile, e.g. a Nori export.
   * @throws {Error} If the file is no JSON or the model is invalid.
   */
  async function newConfig(file: File): Promise<void> {
    const id: string = file.name.replace(/(\.ramen)?\.json$/i, "") || "config";
    const result = checkConfig({
      $schema: CONFIG_SCHEMA_URL,
      id,
      model: await readJson(file),
      general: { templates: [] },
      elements: { classifiers: {}, annotations: {} },
      editors: { text: { mappings: [] } },
    });

    if (!result.config) {
      throw new Error(result.findings.map(formatFinding).join("\n"));
    }

    setAsideStyles.clear();
    setAsideMappedSettings.clear();
    draft.value = { ...result.config, model: markRaw(result.config.model) };
    fileName.value = `${id}.miso.json (new)`;
    isDirty.value = true;
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
      throw new Error(`${file.name} is no valid model: ${(error as Error).message}`, { cause: error });
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
   * Sets the styles of a kind aside: takes them out of the entry, so they don't warn, and keeps them for
   * {@linkcode bringBackStyles}. Changes the entry in place.
   *
   * @param {string} shapeRef - The shape of the entry.
   * @param {AnnotationEntry} entry - The entry.
   * @param {StyleKind} kind - The kind that doesn't apply.
   */
  function setStylesAside(shapeRef: string, entry: AnnotationEntry, kind: StyleKind): void {
    const taken: TakenStyles | undefined = takeStyles(entry, kind);

    if (taken) {
      setAsideStyles.set(`${shapeRef}|${kind}`, taken);
    }
  }

  /**
   * Puts styles set aside with {@linkcode setStylesAside} back into the entry. Changes the entry in place.
   *
   * @param {string} shapeRef - The shape of the entry.
   * @param {AnnotationEntry} entry - The entry.
   * @param {StyleKind} kind - The kind that applies again.
   */
  function bringBackStyles(shapeRef: string, entry: AnnotationEntry, kind: StyleKind): void {
    const key: string = `${shapeRef}|${kind}`;
    const taken: TakenStyles | undefined = setAsideStyles.get(key);

    if (taken) {
      putStyles(entry, kind, taken);
      setAsideStyles.delete(key);
    }
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
    draft: draft,
    context,
    requiredContext,
    fileName: readonly(fileName),
    findings: computed<ConfigFinding[]>(() => findings.value),
    isDirty: readonly(isDirty),
    lastUpdate: computed<AppliedModelUpdate | undefined>(() => lastUpdate.value),
    selection,
    openConfig,
    newConfig,
    readModel,
    applyModel,
    exportConfig,
    setStylesAside,
    bringBackStyles,
  };
}
