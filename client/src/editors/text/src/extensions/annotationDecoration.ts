import { Plugin, PluginKey, Transaction, EditorState } from "@tiptap/pm/state";
import { Mapping } from "@tiptap/pm/transform";
import { Extension } from "@tiptap/core";
import { Node } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { AddAnnotationStep } from "../steps/addAnnotationStep";
import {
  Annotation,
  AnnotationAppearance,
  AppearanceOverride,
  HighlightTextStyle,
  IAnnotation,
  cloneDeep,
  useGuidelinesStore,
} from "../external";
import { RemoveAnnotationStep } from "../steps/removeAnnotationStep";
import { UpdateAnnotationStep } from "../steps/updateAnnotationStep";
import { indexToPosition } from "../utils/helper/positionHelper";

const { isZeroPoint } = useGuidelinesStore();

export const ANNOTATION_DECORATION_KEY = new PluginKey<AnnotationDecorationState>("annotationDecoration");

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    annotationDecoration: {
      /**
       * Adds a range annotation between the given positions. The annotation is cloned and stored in the decoration.
       *
       * @param {Annotation} annotation - The annotation to add.
       * @param {number} from - The document position where the annotation starts.
       * @param {number} to - The document position where the annotation ends.
       */
      addAnnotationDecoration: (annotation: Annotation, from: number, to: number) => ReturnType;
      /**
       * Replaces the data of an existing range annotation, matched by its uuid. Its range is not changed.
       *
       * @param {Annotation} annotation - The updated annotation.
       */
      updateAnnotationDecoration: (annotation: Annotation) => ReturnType;
      /**
       * Removes a range annotation, matched by its uuid.
       *
       * @param {Annotation} annotation - The annotation to remove.
       */
      removeAnnotationDecoration: (annotation: Annotation) => ReturnType;
      /**
       * Creates the decorations of all given range annotations (zero-point annotations are skipped) and replaces
       * the existing ones. The given annotation objects are stored as they are and must not be mutated afterwards.
       */
      initializeDecorations: (
        annotations: Map<string, Annotation>,
        selectedTypes: string[],
        visibleFrom: number,
        visibleTo: number,
      ) => ReturnType;
      /**
       * Replaces the stored annotations with their saved state after a successful save. Ranges are not changed.
       *
       * Not added to the undo history, since it does not reflect a user action.
       *
       * @param {Map<string, Annotation>} annotations - The saved annotations, keyed by uuid. Annotations without
       *   a decoration (e.g. zero-point annotations) are ignored.
       */
      applySavedAnnotations: (annotations: Map<string, Annotation>) => ReturnType;
      applyFilterUpdates: (selectedTypes: string[]) => ReturnType;
      applyViewportUpdates: (docRange: { from: number; to: number }) => ReturnType;
    };
  }
}

interface AnnotationDecorationState {
  all: DecorationSet;
  filtered: DecorationSet;
  visibleFrom: number;
  visibleTo: number;
  selectedTypes: string[];
  /** Counter that increases whenever an annotation is added, removed or its data replaced. Not affected by text edits. */
  revision: number;
}

type TransactionMeta = InitMeta | FilterUpdateMeta | ViewportMeta | SavedMeta | undefined;

interface InitMeta {
  type: "initialize";
  annotations: Map<string, Annotation>;
  visibleFrom: number;
  visibleTo: number;
  selectedTypes: string[];
}

interface SavedMeta {
  type: "annotationsSaved";
  annotations: Map<string, Annotation>;
}

interface FilterUpdateMeta {
  type: "filterUpdated";
  selectedTypes: string[];
}

interface ViewportMeta {
  type: "viewportChanged";
  visibleFrom: number;
  visibleTo: number;
}

export interface AnnotationDecorationSpec {
  _type: string;
  _uuid: string;
  /**
   * The annotation itself (data, status and connected nodes). The decoration is its source of truth while it
   * is in the editor. Must be treated as immutable; changes replace the whole decoration.
   */
  _annotation: Annotation;
}

interface AnnotationDecorationOptions {
  /**
   * Returns the configured appearance of the given annotation type, used for the inline style of its decorations.
   *
   * @param {string} type The annotation type
   * @returns {AnnotationAppearance | undefined} The configured appearance or undefined if not found
   */
  getAppearance: (type: string) => AnnotationAppearance | undefined;
}

function findDecorationsByUuid(decorationSet: DecorationSet, uuid: string): Decoration[] {
  return decorationSet.find(undefined, undefined, (spec: AnnotationDecorationSpec) => spec._uuid === uuid);
}

function createFilteredDecorations(
  decorationSet: DecorationSet,
  filters: {
    selectedTypes: string[];
    visibleFrom: number;
    visibleTo: number;
  },
  tr: Transaction,
): DecorationSet {
  const { doc } = tr;
  const { selectedTypes, visibleFrom, visibleTo } = filters;

  const filteredDecorations: Decoration[] = decorationSet.find(visibleFrom, visibleTo, (spec: AnnotationDecorationSpec) =>
    selectedTypes.includes(spec._type),
  );

  return DecorationSet.create(doc, filteredDecorations);
}

/**
 * Returns the inline style of a range annotation's decoration. The highlights of all variants matching the
 * annotation's property values are merged onto the highlight of the annotation type, in config order.
 *
 * @param {AnnotationAppearance | undefined} appearance The configured appearance of the annotation type.
 * @param {IAnnotation} data The annotation's data.
 * @returns {string} The inline style, or an empty string if no highlight is configured.
 *
 * @example
 * const appearance = {
 *   highlight: { kind: "properties", fontWeight: "bold" },
 *   variants: [
 *     {
 *       property: "subType",
 *       values: { i: { highlight: { kind: "properties", fontStyle: "italic" } } },
 *     },
 *   ],
 * };
 *
 * getHighlightStyle(appearance, { subType: "i", ... });
 *
 * // Returns
 *
 * "font-weight: bold; font-style: italic"
 */
function getHighlightStyle(appearance: AnnotationAppearance | undefined, data: IAnnotation): string {
  let merged: HighlightTextStyle | undefined = appearance?.highlight;

  for (const variant of appearance?.variants ?? []) {
    const value: unknown = data[variant.property];
    const override: AppearanceOverride | undefined =
      typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? variant.values[String(value)]
        : undefined;

    if (override?.highlight) {
      merged = { ...merged, ...override.highlight };
    }
  }

  return highlightToDeclarations(merged);
}

/**
 * Converts a highlight into CSS declarations. Values are not validated, since the configuration is trusted;
 * invalid values are simply ignored by the browser.
 *
 * @param {HighlightTextStyle | undefined} style The highlight to convert.
 * @returns {string} The CSS declarations, or an empty string if there is no highlight.
 *
 * @example
 * highlightToDeclarations({ kind: "properties", fontWeight: "bold", fontStyle: "italic" });
 *
 * // Returns
 *
 * "font-weight: bold; font-style: italic"
 */
function highlightToDeclarations(style: HighlightTextStyle | undefined): string {
  if (!style) {
    return "";
  }

  return Object.entries(style)
    .filter(([key, value]) => key !== "kind" && typeof value === "string")
    .map(([key, value]) => `${toKebabCase(key)}: ${value}`)
    .join("; ");
}

/**
 * Converts a camelCase style key into its CSS property name, e.g. `textDecorationColor` -> `text-decoration-color`.
 *
 * @param {string} key The camelCase style key.
 * @returns {string} The CSS property name in kebab-case.
 */
function toKebabCase(key: string): string {
  return key.replace(/[A-Z]/g, (char: string) => `-${char.toLowerCase()}`);
}

export const AnnotationDecoration = Extension.create<AnnotationDecorationOptions>({
  name: "annotationDecoration",

  addOptions() {
    return {
      getAppearance: () => undefined,
    };
  },

  addCommands() {
    return {
      addAnnotationDecoration:
        (annotation: Annotation, from: number, to: number) =>
        ({ tr, dispatch }) => {
          // Add placeholder step that signals plugin what to execute. Cloned since the annotation is stored
          // in the decoration and must not share references with the caller (e.g. reactive form data).
          tr.step(new AddAnnotationStep(cloneDeep(annotation), from, to));

          dispatch?.(tr);

          return true;
        },

      updateAnnotationDecoration:
        (annotation: Annotation) =>
        ({ tr, dispatch, state }) => {
          const pluginState: AnnotationDecorationState | undefined = ANNOTATION_DECORATION_KEY.getState(state);

          if (!pluginState) {
            return false;
          }

          const decos: Decoration[] = findDecorationsByUuid(pluginState.all, annotation.node.data.uuid);

          if (!decos.length) {
            return false;
          }

          const { _annotation: oldAnnotation } = decos[0].spec as AnnotationDecorationSpec;

          tr.step(new UpdateAnnotationStep(oldAnnotation, cloneDeep(annotation)));

          dispatch?.(tr);

          return true;
        },

      removeAnnotationDecoration:
        (annotation: Annotation) =>
        ({ tr, dispatch, state }) => {
          const pluginState: AnnotationDecorationState | undefined = ANNOTATION_DECORATION_KEY.getState(state);

          if (!pluginState) {
            return false;
          }

          // Annotation must be found to be included in the step, since undo and redo need to know
          // what annotation object to (re)create
          const decos: Decoration[] = findDecorationsByUuid(pluginState.all, annotation.node.data.uuid);

          if (!decos.length) {
            return false;
          }

          const deco: Decoration = decos[0];
          const { _annotation: storedAnnotation } = deco.spec as AnnotationDecorationSpec;

          tr.step(new RemoveAnnotationStep(storedAnnotation, deco.from, deco.to));

          dispatch?.(tr);

          return true;
        },

      initializeDecorations:
        (annotations: Map<string, Annotation>, selectedTypes: string[], visibleFrom: number, visibleTo: number) =>
        ({ tr, dispatch }) => {
          // TODO: Or should this be filtered outside the plugin?
          const filtered = new Map<string, Annotation>();

          for (const [uuid, annotation] of annotations) {
            if (!isZeroPoint(annotation.node)) {
              filtered.set(uuid, annotation);
            }
          }

          const meta: InitMeta = {
            type: "initialize",
            annotations: filtered,
            selectedTypes,
            visibleFrom,
            visibleTo,
          };

          tr.setMeta(ANNOTATION_DECORATION_KEY, meta);

          dispatch?.(tr);

          return true;
        },

      applySavedAnnotations:
        (annotations: Map<string, Annotation>) =>
        ({ tr, dispatch }) => {
          const meta: SavedMeta = {
            type: "annotationsSaved",
            annotations,
          };

          tr.setMeta(ANNOTATION_DECORATION_KEY, meta);
          tr.setMeta("addToHistory", false);

          dispatch?.(tr);

          return true;
        },

      applyFilterUpdates:
        (selectedTypes: string[]) =>
        ({ tr, dispatch }) => {
          const meta: FilterUpdateMeta = {
            type: "filterUpdated",
            selectedTypes,
          };

          tr.setMeta(ANNOTATION_DECORATION_KEY, meta);

          dispatch?.(tr);

          return true;
        },

      applyViewportUpdates:
        (docRange: { from: number; to: number }) =>
        ({ tr, dispatch }) => {
          const { from, to } = docRange;

          const meta: ViewportMeta = {
            type: "viewportChanged",
            visibleFrom: from,
            visibleTo: to,
          };

          tr.setMeta(ANNOTATION_DECORATION_KEY, meta);

          dispatch?.(tr);

          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const { getAppearance } = this.options;

    function createDecoration(from: number, to: number, annotation: Annotation): Decoration {
      const { type, uuid, subType } = annotation.node.data;

      const spec: AnnotationDecorationSpec = { _type: type, _uuid: uuid, _annotation: annotation };

      return Decoration.inline(
        from,
        to,
        {
          nodeName: "span",
          "data-annotation-type": type,
          "data-annotation-uuid": uuid,
          "data-annotation-subtype": subType?.toString() ?? "",
          style: getHighlightStyle(getAppearance(type), annotation.node.data),
        },
        { inclusiveEnd: true, ...spec },
      );
    }

    function createInitialDecorations(doc: Node, annotations: Map<string, Annotation>): Decoration[] {
      const decos: Decoration[] = [];

      for (const annotation of [...annotations.values()].toSorted((a, b) => a.node.data.startIndex - b.node.data.startIndex)) {
        const { startIndex, endIndex } = annotation.node.data;

        const start: number = indexToPosition(doc, startIndex);
        const end: number = indexToPosition(doc, endIndex + 1);

        decos.push(createDecoration(start, end, annotation));
      }

      return decos;
    }

    return [
      new Plugin({
        key: ANNOTATION_DECORATION_KEY,
        state: {
          init(): AnnotationDecorationState {
            // Return empty state object at plugin initialization. Initial data are inserted with a custom 'initialization'
            // transaction. The reason for this is that during setup phase there are multiple transactions running
            // in the editor which might override the initial state.
            return {
              all: DecorationSet.empty,
              filtered: DecorationSet.empty,
              selectedTypes: [],
              visibleFrom: 0,
              visibleTo: 0,
              revision: 0,
            };
          },

          apply(tr, oldDecorations): AnnotationDecorationState {
            const doc: Node = tr.doc;
            const meta: TransactionMeta = tr.getMeta(ANNOTATION_DECORATION_KEY);

            // On initialization, all decorations need to be created at first
            if (meta?.type === "initialize") {
              const decos: Decoration[] = createInitialDecorations(doc, meta.annotations);

              const newAll: DecorationSet = DecorationSet.create(doc, decos);
              const newFiltered: DecorationSet = createFilteredDecorations(
                newAll,
                {
                  selectedTypes: meta.selectedTypes,
                  visibleFrom: meta.visibleFrom,
                  visibleTo: meta.visibleTo,
                },
                tr,
              );

              return {
                all: newAll,
                filtered: newFiltered,
                selectedTypes: meta.selectedTypes,
                visibleFrom: meta.visibleFrom,
                visibleTo: meta.visibleTo,
                revision: oldDecorations.revision + 1,
              };
            } else if (meta?.type === "annotationsSaved") {
              // Swap the stored annotations in a single pass, since a save can affect all of them at once
              // (e.g. when text was inserted at the start of the document). Ranges stay as they are.
              const decos: Decoration[] = oldDecorations.all
                .map(tr.mapping, doc)
                .find()
                .map((deco: Decoration) => {
                  const saved: Annotation | undefined = meta.annotations.get((deco.spec as AnnotationDecorationSpec)._uuid);

                  return saved ? createDecoration(deco.from, deco.to, saved) : deco;
                });

              const newAll: DecorationSet = DecorationSet.create(doc, decos);
              const newFiltered: DecorationSet = createFilteredDecorations(newAll, oldDecorations, tr);

              return {
                ...oldDecorations,
                all: newAll,
                filtered: newFiltered,
                revision: oldDecorations.revision + 1,
              };
            } else if (meta?.type === "filterUpdated") {
              const newAll: DecorationSet = oldDecorations.all.map(tr.mapping, tr.doc);

              // Set of to-be-rendered decorations (viewport, annotation type filter etc.)
              const newFiltered: DecorationSet = createFilteredDecorations(
                newAll,
                {
                  ...oldDecorations,
                  selectedTypes: meta.selectedTypes,
                },
                tr,
              );

              return {
                ...oldDecorations,
                selectedTypes: meta.selectedTypes,
                all: newAll,
                filtered: newFiltered,
              };
            } else if (meta?.type === "viewportChanged") {
              const newAll: DecorationSet = oldDecorations.all.map(tr.mapping, tr.doc);

              // Set of to-be-rendered decorations (viewport, annotation type filter etc.)
              const newFiltered: DecorationSet = createFilteredDecorations(
                newAll,
                {
                  selectedTypes: oldDecorations.selectedTypes,
                  visibleFrom: meta.visibleFrom,
                  visibleTo: meta.visibleTo,
                },
                tr,
              );

              return {
                ...oldDecorations,
                visibleFrom: meta.visibleFrom,
                visibleTo: meta.visibleTo,
                all: newAll,
                filtered: newFiltered,
              };
            }

            // Handle AddAnnotationStep / RemoveAnnotationStep / UpdateAnnotationStep (and their undo/redo inverses).
            // Because these are actual Steps, the history plugin records and inverts them
            // automatically — no special undo handling needed here.
            let newAll: DecorationSet = oldDecorations.all;
            let decorationsChanged: boolean = false;

            // Map first so existing decorations move into post-transaction coordinate space.
            // AddAnnotationStep positions (including those from undo of eviction) are in
            // post-transaction space and must be added after this remap, not before.
            newAll = newAll.map(tr.mapping, doc);

            // Loop over transaction steps to discover if any of them are annotation steps.
            for (const step of tr.steps) {
              if (step instanceof AddAnnotationStep) {
                const { annotationFrom, annotationTo, annotation } = step;

                const newDeco: Decoration = createDecoration(annotationFrom, annotationTo, annotation);

                newAll = newAll.add(doc, [newDeco]);
                decorationsChanged = true;
              } else if (step instanceof RemoveAnnotationStep) {
                const { annotation } = step;

                const toRemove: Decoration[] = findDecorationsByUuid(newAll, annotation.node.data.uuid);
                newAll = newAll.remove(toRemove);
                decorationsChanged = true;
              } else if (step instanceof UpdateAnnotationStep) {
                const { newAnnotation } = step;

                const toReplace: Decoration[] = findDecorationsByUuid(newAll, newAnnotation.node.data.uuid);

                // The decoration can be gone when the step is replayed by undo/redo (e.g. its text was deleted)
                if (toReplace.length === 0) {
                  continue;
                }

                const { from, to } = toReplace[0];

                newAll = newAll.remove(toReplace).add(doc, [createDecoration(from, to, newAnnotation)]);
                decorationsChanged = true;
              }
            }

            // Remap stored viewport bounds so the filter window stays accurate after
            // insertions/deletions that shift document positions.
            const newVisibleFrom: number = tr.docChanged
              ? tr.mapping.map(oldDecorations.visibleFrom)
              : oldDecorations.visibleFrom;
            const newVisibleTo: number = tr.docChanged ? tr.mapping.map(oldDecorations.visibleTo) : oldDecorations.visibleTo;

            let newFiltered: DecorationSet = oldDecorations.filtered;

            if (decorationsChanged || tr.docChanged) {
              /*
              TODO: Recreation of the "filtered" set might be an overkill, but it works currently. Before, the "filtered" set did not change since
              the drawn HTML would not change completely. However, when a lot of text is removed an new text comes into
              the viewport, it does not have decorations yet - they are only added when a viewportChanged transaction
              was dispatched during scroll. Keep in mind
              */
              newFiltered = createFilteredDecorations(
                newAll,
                { ...oldDecorations, visibleFrom: newVisibleFrom, visibleTo: newVisibleTo },
                tr,
              );
            }

            return {
              ...oldDecorations,
              all: newAll,
              filtered: newFiltered,
              visibleFrom: newVisibleFrom,
              visibleTo: newVisibleTo,
              revision: decorationsChanged ? oldDecorations.revision + 1 : oldDecorations.revision,
            };
          },
        },
        props: {
          decorations(state) {
            // Only the filtered annotations should be rendered
            return this.getState(state)?.filtered ?? DecorationSet.empty;
          },
        },

        appendTransaction(
          transactions: readonly Transaction[],
          oldState: EditorState,
          newState: EditorState,
        ): Transaction | null {
          // Undo/redo transactions are handled by history replaying the steps we
          // already emitted — re-running detection here would misread those
          // corrections as new changes and emit spurious counter-steps.
          if (transactions.some((tr) => tr.getMeta("uiEvent") === "undo" || tr.getMeta("uiEvent") === "redo")) {
            console.log("undo/redo detected...");
            return null;
          }

          // Only perform calculations when the document actually changed
          if (!transactions.some((tr) => tr.docChanged)) {
            return null;
          }

          const oldPluginState = ANNOTATION_DECORATION_KEY.getState(oldState);
          const newPluginState = ANNOTATION_DECORATION_KEY.getState(newState);

          if (!oldPluginState || !newPluginState) {
            console.error("Old or new plugin state not found");

            return null;
          }

          // UUIDS by annotations that were explicitly removed and are already handled in the apply() section —
          // These are intentional user removals, no partial/complete deletions by text operations.
          const explicitlyRemovedUuids = new Set<string>(
            transactions
              .flatMap((tr) => tr.steps)
              .filter((step): step is RemoveAnnotationStep => step instanceof RemoveAnnotationStep)
              .map((step) => step.annotation.node.data.uuid),
          );

          // Create maps (faster/easier to compare)
          const oldDecoMap = new Map<string, Decoration>(
            oldPluginState.all.find().map((d) => [(d.spec as AnnotationDecorationSpec)._uuid, d]),
          );
          const newDecoMap = new Map<string, Decoration>(
            newPluginState.all.find().map((d) => [(d.spec as AnnotationDecorationSpec)._uuid, d]),
          );

          // Compose all mappings that happened in the transactions so far so we can test whether individual
          // decoration boundaries landed inside a deleted range.
          const composedMapping: Mapping = new Mapping();

          for (const t of transactions) {
            composedMapping.appendMapping(t.mapping);
          }

          // Create new Transaction object
          const tr: Transaction = newState.tr;

          for (const [uuid, oldDeco] of oldDecoMap) {
            // Skip explicitly removed UUIDs, they are handled in the apply() section
            if (explicitlyRemovedUuids.has(uuid)) {
              continue;
            }

            // The annotation is carried by the steps so that undo can restore the decoration together with its data
            const { _annotation: annotation } = oldDeco.spec as AnnotationDecorationSpec;

            const newDeco: Decoration | undefined = newDecoMap.get(uuid);

            if (!newDeco) {
              // Completely removed by a delete operations — add Remove step so history can
              // invert it to Add on undo, restoring the decoration with the text.
              tr.step(new RemoveAnnotationStep(annotation, oldDeco.from, oldDeco.to));
            } else if (composedMapping.mapResult(oldDeco.from, 1).deleted || composedMapping.mapResult(oldDeco.to, -1).deleted) {
              // A boundary was clipped (landed inside a deleted range and snapped
              // to the deletion start). Pure shifts — deletions entirely before the
              // decoration — have deleted=false for both endpoints and are skipped.
              // Add Remove(old) + Add(new) steps so history records the exact range
              // change. On undo, the inverse steps Remove(new) + Add(old) run
              // inside apply() (map-first order): the wrong-mapped decoration is
              // removed by UUID, then the original range is re-added at positions
              // that are valid again in the restored doc.
              tr.step(new RemoveAnnotationStep(annotation, oldDeco.from, oldDeco.to));
              tr.step(new AddAnnotationStep(annotation, newDeco.from, newDeco.to));
            }
          }

          return tr.steps.length > 0 ? tr : null;
        },
      }),
    ];
  },
});
