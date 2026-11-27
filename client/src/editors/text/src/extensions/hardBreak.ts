import HardBreak, { type HardBreakOptions } from "@tiptap/extension-hard-break";
import { Node as PmNode } from "@tiptap/pm/model";
import { EditorState, Plugin, PluginKey, Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, EditorView } from "@tiptap/pm/view";
import { Annotation, ModelAnnotationShape, getShapeProperties, useConfigStore } from "../external";
import { isNativeType } from "../config/constants";
import { DocAnnotation } from "../models/types";
import { toDocAnnotation } from "../utils/helper/annotationHelper";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    annotatedHardBreak: {
      /**
       * Replaces the given range with a hard break that carries the given annotation in its `_annotation` attribute,
       * e.g. one whose required properties were filled in before inserting it.
       *
       * @param {Annotation} annotation - The annotation of the line break.
       * @param {{ from: number; to: number }} range - The range to replace, e.g. the selection when insertion was requested.
       */
      insertAnnotatedHardBreak: (annotation: Annotation, range: { from: number; to: number }) => ReturnType;
    };
  }
}

/** Inline styles of marker elements, keyed by their camelCase CSS property names. */
type MarkerElementStyles = Partial<CSSStyleDeclaration>;

/** The formatting mark of a hard break. */
const MARKER_CHARACTER = "¬" as const;

/**
 * Styles of every marker, taken over from the invisible characters extension so it looks like the other formatting
 * marks (`¶`). Its classes can't be used: they disable pointer events and fix the color of the mark.
 */
const BASE_MARKER_STYLES: MarkerElementStyles = {
  display: "inline-block",
  width: "0",
  color: "#aaa",
  fontStyle: "normal",
  fontWeight: "400",
  lineHeight: "1em",
  userSelect: "none",
};

/** Added to markers that open the edit modal on click. */
const CLICKABLE_MARKER_STYLES: MarkerElementStyles = { cursor: "pointer" };

/** Added to markers of hard breaks with set property values: an accent color instead of the grey of the other marks. */
const ATTRIBUTED_MARKER_STYLES: MarkerElementStyles = { color: "#2563eb" };

/** Data attribute holding the uuid of the hard break the marker belongs to. Only set on clickable markers. */
const UUID_ATTRIBUTE = "data-hard-break-uuid" as const;

const HARD_BREAK_MARKERS_KEY = new PluginKey<DecorationSet>("hardBreakMarkers");

const { getShapeOfNative, getEditorOwnedProperties } = useConfigStore();

interface AnnotatedHardBreakOptions extends HardBreakOptions {
  /** Called with the hard break's uuid when its `¬` is clicked, e.g. to edit its properties. */
  onMarkerClick?: (uuid: string) => void;
  /**
   * Called on the line break shortcuts (Shift+Enter, Mod+Enter) instead of inserting a hard break, so the host can ask
   * for required properties first (and insert with {@linkcode insertAnnotatedHardBreak}). Without it, the shortcuts
   * insert a hard break right away.
   */
  onInsert?: () => void;
}

/**
 * Returns the names of the line break properties that can be edited in a form: those of the annotation shape mapped to
 * line breaks without the editor-owned ones.
 *
 * @param {string} nodeName - The name of the hard break node type.
 * @returns {string[]} The property names, empty if the project gives line breaks no properties.
 */
function getEditableProperties(nodeName: string): string[] {
  if (!isNativeType(nodeName)) {
    return [];
  }

  const shape: ModelAnnotationShape | undefined = getShapeOfNative(nodeName);
  const editorOwned: string[] = getEditorOwnedProperties(nodeName).map((p) => p.property);

  return (shape ? getShapeProperties(shape) : [])
    .map((field) => field.attribute.name)
    .filter((name) => !editorOwned.includes(name));
}

/**
 * Returns the values of the given properties that are set on a hard break, from its `_annotation`.
 *
 * @param {PmNode} node - The hard break node.
 * @param {string[]} propertyNames - The properties to read, see {@linkcode getEditableProperties}.
 * @returns {[string, string][]} The property names and values, empty if none is set.
 */
function getSetPropertyValues(node: PmNode, propertyNames: string[]): [string, string][] {
  const properties: Record<string, unknown> =
    ((node.attrs._annotation as DocAnnotation | null)?.node.properties as Record<string, unknown> | undefined) ?? {};

  return propertyNames
    .filter((name) => properties[name] !== undefined && properties[name] !== null && properties[name] !== "")
    .map((name) => [name, String(properties[name])]);
}

/**
 * Creates the marker of a hard break. One with set property values is colored (see
 * {@linkcode ATTRIBUTED_MARKER_STYLES}) and lists the values in its tooltip.
 *
 * @param {string | null} uuid - The uuid of the hard break, `null` if the marker shouldn't be clickable.
 * @param {[string, string][]} values - The set property values.
 * @returns {HTMLSpanElement} The marker element.
 */
function createMarkerElement(uuid: string | null, values: [string, string][]): HTMLSpanElement {
  const element: HTMLSpanElement = document.createElement("span");

  element.textContent = MARKER_CHARACTER;
  Object.assign(element.style, BASE_MARKER_STYLES);

  if (uuid) {
    element.setAttribute(UUID_ATTRIBUTE, uuid);
    Object.assign(element.style, CLICKABLE_MARKER_STYLES);
  }

  if (values.length === 0) {
    return element;
  }

  element.title = values.map(([name, value]) => `${name}: ${value}`).join(", ");
  Object.assign(element.style, ATTRIBUTED_MARKER_STYLES);

  return element;
}

/**
 * Builds the markers of all hard breaks in the document. They are only clickable if line breaks have properties to
 * edit, so projects without any never get an empty modal.
 *
 * @param {PmNode} doc - The document.
 * @param {string} nodeName - The name of the hard break node type.
 * @returns {DecorationSet} One widget per hard break.
 */
function buildMarkers(doc: PmNode, nodeName: string): DecorationSet {
  const decorations: Decoration[] = [];
  const editableProperties: string[] = getEditableProperties(nodeName);
  const isClickable: boolean = editableProperties.length > 0;

  doc.descendants((node, pos) => {
    if (node.type.name !== nodeName) {
      return;
    }

    const uuid: string | null = isClickable ? node.attrs.uuid ?? null : null;
    const values: [string, string][] = getSetPropertyValues(node, editableProperties);

    decorations.push(
      Decoration.widget(pos, () => createMarkerElement(uuid, values), {
        // Includes the values, so the marker is redrawn when they change
        key: `hard-break:${uuid ?? pos}:${JSON.stringify(values)}`,
        marks: [],
        side: 1000,
      }),
    );
  });

  return DecorationSet.create(doc, decorations);
}

/**
 * The hard break (line break) with properties, e.g. TEI `rend`, `n`, `break`:
 * - Shows a `¬` at every hard break while the formatting marks of the invisible characters extension are visible
 *   (replaces that extension's own hard break marker). Hard breaks with set property values are colored, and clicking
 *   a `¬` calls `onMarkerClick`.
 * - The line break shortcuts call `onInsert` if given, and {@linkcode insertAnnotatedHardBreak} inserts a hard break
 *   with its annotation.
 */
export const AnnotatedHardBreak = HardBreak.extend<AnnotatedHardBreakOptions>({
  addOptions() {
    return {
      // The fallback is tiptap's default, the parent's options always exist though
      ...(this.parent?.() ?? { keepMarks: true, HTMLAttributes: {} }),
      onMarkerClick: undefined,
      onInsert: undefined,
    };
  },

  addCommands() {
    return {
      ...this.parent?.(),
      insertAnnotatedHardBreak:
        (annotation: Annotation, range: { from: number; to: number }) =>
        ({ commands }) =>
          commands.insertContentAt(range, { type: this.name, attrs: { _annotation: toDocAnnotation(annotation) } }),
    };
  },

  addKeyboardShortcuts() {
    const insert = (): boolean => {
      if (!this.options.onInsert) {
        return this.editor.commands.setHardBreak();
      }

      this.options.onInsert();

      return true;
    };

    return {
      "Mod-Enter": insert,
      "Shift-Enter": insert,
    };
  },

  addProseMirrorPlugins() {
    const nodeName: string = this.name;
    const isVisible = (): boolean => this.editor.storage.invisibleCharacters?.visibility() ?? false;
    const onMarkerClick = (uuid: string): void => this.options.onMarkerClick?.(uuid);

    return [
      new Plugin<DecorationSet>({
        key: HARD_BREAK_MARKERS_KEY,
        state: {
          init: (_, state: EditorState) => buildMarkers(state.doc, nodeName),
          apply: (tr: Transaction, markers: DecorationSet) => (tr.docChanged ? buildMarkers(tr.doc, nodeName) : markers),
        },
        props: {
          decorations(state: EditorState) {
            return isVisible() ? HARD_BREAK_MARKERS_KEY.getState(state) : DecorationSet.empty;
          },
          handleDOMEvents: {
            mousedown(_view: EditorView, event: MouseEvent) {
              // Only the primary (left) button opens the modal, so the context menu still works on the marker
              if (event.button !== 0) {
                return false;
              }

              const marker: Element | null = event.target instanceof Element ? event.target.closest(`[${UUID_ATTRIBUTE}]`) : null;
              const uuid: string | null | undefined = marker?.getAttribute(UUID_ATTRIBUTE);

              if (!uuid) {
                return false;
              }

              // Keeps the caret where it is
              event.preventDefault();
              onMarkerClick(uuid);

              return true;
            },
          },
        },
      }),
    ];
  },
});
