import { ref, shallowRef, watch } from "vue";
import { NodeDto, Annotation, AnnotationAppearance } from "../models/types";
import { Editor } from "@tiptap/vue-3";
import { Editor as TiptapEditor } from "@tiptap/core";
import { Node, Schema } from "@tiptap/pm/model";
import { cloneDeep } from "../utils/helper/helper";
import { useFilterStore } from "./filter";
import { useEventListener } from "@vueuse/core";
import { history } from "prosemirror-history";
import { type Extensions, getSchema } from "@tiptap/core";
import { useEditorSettingsStore } from "./editorSettings";
import { Slice } from "@tiptap/pm/model";
import { EditorView } from "@tiptap/pm/view";
import {
  type BlockClassificationRange,
  type StandoffParseIssue,
  type ToCItem,
  StandoffConverter,
  buildDocStructure,
  collectInlineAnnotations,
  createExtensions,
  getBlockClassificationRanges,
  getVisibleDocRange,
  pastedSliceToRawText,
} from "../editors/text/src";
import { useGuidelinesStore } from "./guidelines";

const { selectedOptions } = useFilterStore();
const { settings } = useEditorSettingsStore();
const { getAnnotationConfig } = useGuidelinesStore();

const tiptap = shallowRef<Editor | null>(null);

const initialStructuralAnnotations = ref<Map<string, Annotation>>();
const initialAnnotations = ref<Map<string, Annotation>>();
let initialDoc: ReturnType<Editor["getJSON"]> | null = null;
let initialPlainText: string | null = null;
let resizeObserver: ResizeObserver | null = null;

// Shallow: items are frozen and reused across transactions, so only the array reference needs to be reactive
const tableOfContent = shallowRef<ToCItem[]>([]);
// Recreated per editor, so a newly loaded text (or changed guidelines) never reuses stale items
let tocItemCache = new WeakMap<Node, ToCItem>();
const blockClassificationRanges = ref<BlockClassificationRange[]>([]);
// Built on first use by `getEditorSchema`. The node types don't depend on the guidelines, so it never goes stale.
let editorSchema: Schema | null = null;

/**
 * Returns the configured appearance of an annotation type. Passed to the editor extensions, which render
 * markers and highlights from it.
 *
 * @param {string} type The annotation type
 * @returns {AnnotationAppearance | undefined} The configured appearance, if any
 */
function getAppearance(type: string): AnnotationAppearance | undefined {
  return getAnnotationConfig(type)?.miso?.appearance;
}

/**
 * Returns the ProseMirror schema of the text editor, e.g. to parse a document without creating an editor.
 *
 * @returns {Schema} The schema, built once and reused.
 */
function getEditorSchema(): Schema {
  editorSchema ??= getSchema(createExtensions({ getAppearance }));

  return editorSchema;
}

function handleScroll() {
  if (!tiptap.value) {
    return;
  }

  const { from, to } = getVisibleDocRange(tiptap.value.view);

  tiptap.value?.commands.applyViewportUpdates({ from, to });
}

/**
 * Checks whether the editor state has diverged from its last saved snapshot.
 *
 * Compares, in order: plain text content (fast path), the full JSON document
 * structure, the number of annotations, and whether any annotation has been
 * modified. Returns `true` as soon as any difference is detected.
 *
 * @returns {boolean} `true` if there are unsaved changes, `false` otherwise.
 */
function hasUnsavedChanges(): boolean {
  // Compare text labels
  // TODO: This needs to be adjusted as soon as labels can be edited
  // if (!areSetsEqual(new Set(initialText.value.nodeLabels), new Set(text.value.nodeLabels))) {
  //   return true;
  // }

  // TODO: Check if any modal/annotation form is openend or in edit mode. Do later

  // Compare plain text
  if (tiptap.value?.state.doc.textContent !== initialPlainText) {
    console.log("Text has changed.");
    return true;
  }

  // Compare docs. Maybe a bit slow on longer texts, but most cases are probably catched by plain text comparison
  if (JSON.stringify(tiptap.value?.getJSON()) !== JSON.stringify(initialDoc)) {
    console.log("Doc has changed.");
    return true;
  }

  const annotations: Map<string, Annotation> = tiptap.value ? collectInlineAnnotations(tiptap.value.state) : new Map();

  // Compare annotations size
  if (initialAnnotations.value?.size !== annotations.size) {
    console.log("Annotation size has changed.");
    return true;
  }

  // Compare annotations status (modified -> something has been changed, not need to deep compare)
  if (annotations.values().some((a) => a.meta.status !== "unchanged")) {
    console.log("Some annotations were modified");
    return true;
  }

  return false;
}

/**
 * Parses the given standoff document and creates the tiptap editor from it.
 *
 * @param {{ text: string; annotations: NodeDto[] }} standoffObject - The text and its annotations as fetched from the API.
 * @returns {StandoffParseIssue[]} The problems found while parsing. Empty when the document was parsed cleanly.
 */
function initializeTiptap(standoffObject: { text: string; annotations: NodeDto[] }): StandoffParseIssue[] {
  const extensions: Extensions = createExtensions({ getAppearance });

  const converter: StandoffConverter = new StandoffConverter(standoffObject, getSchema(extensions));
  const { tipTapJson, annotations, structuralAnnotations, issues } = converter.getData();

  setAnnotations({ annotations, structuralAnnotations });

  tocItemCache = new WeakMap();

  tiptap.value = new Editor({
    content: tipTapJson,
    extensions,
    autofocus: "start",
    editorProps: {
      attributes: {
        class: "tiptap-editor-pane",
      },
      transformPasted: (slice: Slice, view: EditorView): Slice => pastedSliceToRawText(slice, view.state.schema),
    },
    onCreate: ({ editor }) => {
      // Needs to be initialized after creation since full text is needed to calculate visible range
      initializeDecorationView(annotations);

      // Push initial block-decoration settings now that the full doc exists.
      editor.commands.setBlockDecorationSettings(settings.value);

      // This is done in the hook since it has more context than just the raw JSON from the converter.
      // TODO: Might be worth to refactor later, keep in mind
      initialDoc = editor.getJSON();

      // console.log('initial tiptap json: ', initialDoc);
      initialPlainText = editor.state.doc.textContent;

      initializeEventListeners(editor);

      updateTableOfContent(editor.state.doc);
      computeBlockClassificationRanges(tiptap.value);
    },
    onUpdate: ({ transaction }) => {
      updateTableOfContent(transaction.doc);
      computeBlockClassificationRanges(tiptap.value);
    },
    onDestroy: () => {
      resizeObserver?.disconnect();
      resizeObserver = null;
    },
  });

  return issues;
}

function computeBlockClassificationRanges(editor: TiptapEditor | null): void {
  blockClassificationRanges.value = editor ? getBlockClassificationRanges(editor.state.doc) : [];
}

function initializeEventListeners(editor: TiptapEditor): void {
  const scrollContainer: HTMLElement | null | undefined = editor.view.dom.parentElement;

  // TODO: Should this maybe moved directly to the plugin?
  useEventListener(scrollContainer, "scroll", handleScroll);

  resizeObserver = new ResizeObserver(() => computeBlockClassificationRanges(editor));
  resizeObserver.observe(editor.view.dom);
}

function initializeDecorationView(annotations: Map<string, Annotation>): void {
  if (!tiptap.value) {
    console.error("Could not initialize decorations since no tiptap instance was found");
    return;
  }
  const { from, to } = getVisibleDocRange(tiptap.value.view);

  tiptap.value?.commands.initializeDecorations(annotations, selectedOptions.value, from, to);
}

// TODO: Shouldn't this be in the filter? Circular depenency though :/ fix on architecure rewrite
// (or not at all)
watch(selectedOptions, (newVal) => {
  if (!tiptap.value) {
    return;
  }

  tiptap.value.commands.applyFilterUpdates(newVal);
});

// Re-apply outline/pill decorations whenever the user toggles a view setting.
watch(
  settings,
  (newVal) => {
    if (!tiptap.value) {
      return;
    }

    tiptap.value.commands.setBlockDecorationSettings(newVal);

    if (newVal.documentStructures) {
      tiptap.value.commands.showInvisibleCharacters();
    } else {
      tiptap.value.commands.hideInvisibleCharacters();
    }
  },
  { deep: true },
);

function resetToInitialState(): void {
  if (!tiptap.value || !initialDoc || !initialPlainText || !initialAnnotations.value || !initialStructuralAnnotations.value) {
    return;
  }

  // setContent goes through TipTap's dispatchTransaction, keeping internal state in sync.
  tiptap.value.commands.setContent(initialDoc);

  initializeDecorationView(cloneDeep(initialAnnotations.value));

  resetHistory();
}

function setNewInitialDocState() {
  if (!tiptap.value) {
    return;
  }

  // Annotations and structural annotations are already reset in the editor's cleanup function
  initialDoc = tiptap.value.getJSON();
  initialPlainText = tiptap.value.state.doc.textContent;

  // Currently important because undo could silently revert status attributes of connected nodes e.g.
  // which would invalidate the doc state vs db state comparison. Not very user-friendly, might be updated in the future.
  resetHistory();
}

/**
 * Reset editor history by unregistering and registering the history plugin. This was the easiest option since
 * recreating editor state/instance is too expensive and directly accessing the history state is neither type-safe
 * nor reliable. Might be updated in the future.
 *
 * Called when the editor is reset to initial state and after a successful save, which makes the saved
 * state the new initial state.
 *
 * @returns {void} This function does not return any value.
 */
function resetHistory(): void {
  tiptap.value?.unregisterPlugin("history");
  tiptap.value?.registerPlugin(history());
}

function destroyTiptap(): void {
  tiptap.value?.destroy();
  tiptap.value = null;
}

/**
 * Stores the given annotations as the last saved state. Cloned, since the editor handles the annotation
 * objects themselves.
 *
 * @param {{ structuralAnnotations?: Map<string, Annotation>; annotations?: Map<string, Annotation> }} data - The
 *   inline and structural annotations as parsed from the saved document.
 * @returns {void} This function does not return any value.
 */
function setAnnotations(data: { structuralAnnotations?: Map<string, Annotation>; annotations?: Map<string, Annotation> }): void {
  initialAnnotations.value = cloneDeep(data.annotations);
  initialStructuralAnnotations.value = cloneDeep(data.structuralAnnotations);
}

function updateTableOfContent(doc: Node): void {
  tableOfContent.value = buildDocStructure(doc, tocItemCache);
}

export function useTiptapStore() {
  return {
    initialAnnotations,
    initialStructuralAnnotations,
    blockClassificationRanges,
    tiptap,
    tableOfContent,
    destroyTiptap,
    getEditorSchema,
    hasUnsavedChanges,
    initializeTiptap,
    resetToInitialState,
    setAnnotations,
    setNewInitialState: setNewInitialDocState,
  };
}
