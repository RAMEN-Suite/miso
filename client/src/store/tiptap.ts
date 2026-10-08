import { ref, shallowRef, watch } from "vue";
import {
  NodeDto,
  Annotation,
  NodeStatusObject,
  AnnotationNode,
  ToCItem,
  SemanticBlockRange,
  DocAnnotation,
  StandoffParseIssue,
} from "../models/types";
import { Editor } from "@tiptap/vue-3";
import { Editor as TiptapEditor } from "@tiptap/core";
import { Node } from "@tiptap/pm/model";
import Heading from "@tiptap/extension-heading";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { BulletList, ListItem } from "@tiptap/extension-list";
import UniqueID from "@tiptap/extension-unique-id";
import HardBreak from "@tiptap/extension-hard-break";
import { TableKit } from "@tiptap/extension-table";
import { UndoRedo } from "@tiptap/extensions";
import { Gapcursor } from "@tiptap/extensions";
import InvisibleCharacters, { HardBreakNode, ParagraphNode } from "@tiptap/extension-invisible-characters";
import { ZeroPointAnnotation } from "../editors/text/extensions/zeroPointAnnotation";
import StandoffConverter from "../services/standoffConverter";
import { buildDocStructure, cloneDeep, getVisibleDocRange } from "../utils/helper/helper";
import { AnnotationDecoration } from "../editors/text/extensions/annotationDecoration";
import { useFilterStore } from "./filter";
import { useEventListener } from "@vueuse/core";
import { AnnotationAttributes } from "../editors/text/extensions/annotationAttributes";
import { BlockDecorations } from "../editors/text/extensions/blockDecorations";
import { history } from "prosemirror-history";
import { type Extensions, getSchema } from "@tiptap/core";
import { useEditorSettingsStore } from "./editorSettings";
import { AnnotationHighlight } from "../editors/text/extensions/annotationHighlight";
import { Slice } from "@tiptap/pm/model";
import { EditorView } from "@tiptap/pm/view";
import { pastedSliceToRawText } from "../utils/helper/tiptapHelper";

const { selectedOptions } = useFilterStore();
const { settings } = useEditorSettingsStore();

const tiptap = shallowRef<Editor | null>(null);

const structuralAnnotations = ref<Map<string, Annotation>>();
const annotations = ref<Map<string, Annotation>>();

const initialStructuralAnnotations = ref<Map<string, Annotation>>();
const initialAnnotations = ref<Map<string, Annotation>>();
let initialDoc: ReturnType<Editor["getJSON"]> | null = null;
let initialPlainText: string | null = null;
let resizeObserver: ResizeObserver | null = null;

const tableOfContent = ref<ToCItem[]>([]);
const semanticBlockRanges = ref<SemanticBlockRange[]>([]);

function getConfiguredExtensions(): Extensions {
  return [
    Document,
    Paragraph,
    Text,
    Heading,
    TableKit.configure({
      table: { resizable: true },
    }),
    BulletList,
    ListItem,
    Gapcursor,
    HardBreak,
    UndoRedo,
    ZeroPointAnnotation,
    InvisibleCharacters.configure({
      visible: false,
      builders: [new ParagraphNode(), new HardBreakNode()],
    }),
    AnnotationDecoration.configure({
      getAnnotationByUuid: (uuid: string) => annotations.value?.get(uuid)?.node ?? structuralAnnotations.value?.get(uuid)?.node,
    }),
    BlockDecorations,
    UniqueID.configure({
      types: "all",
      attributeName: "uuid",
      generateID: () => crypto.randomUUID(),
    }),
    AnnotationAttributes,
    AnnotationHighlight,
  ];
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

  // Compare annotations size
  if (initialAnnotations.value?.size !== annotations.value?.size) {
    console.log("Annotation size has changed.");
    return true;
  }

  // Compare annotations status (modified -> something has been changed, not need to deep compare)
  if (annotations.value?.values().some((a) => a.meta.status !== "unchanged")) {
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
  const extensions: Extensions = getConfiguredExtensions();

  const converter: StandoffConverter = new StandoffConverter(standoffObject, getSchema(extensions));
  const { tipTapJson, annotations, structuralAnnotations, issues } = converter.getData();

  setAnnotations({ annotations, structuralAnnotations });

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
      computeSemanticBlockRanges(tiptap.value);
    },
    onUpdate: ({ transaction }) => {
      updateTableOfContent(transaction.doc);
      computeSemanticBlockRanges(tiptap.value);
    },
    onDestroy: () => {
      resizeObserver?.disconnect();
      resizeObserver = null;
    },
  });

  return issues;
}

function computeSemanticBlockRanges(editor: TiptapEditor | null): void {
  if (!editor) {
    semanticBlockRanges.value = [];
    return;
  }

  const uuidMap = new Map<string, SemanticBlockRange>();

  editor.state.doc.descendants((node, pos) => {
    const semanticBlocks: DocAnnotation[] = node.attrs._semanticBlocks ?? [];

    semanticBlocks.forEach((block) => {
      const { type, uuid } = block.node.data;

      const existing: SemanticBlockRange | undefined = uuidMap.get(uuid);

      if (existing) {
        existing.endPos = pos + (node.nodeSize - 1);
      } else {
        uuidMap.set(uuid, { startPos: pos, endPos: pos + (node.nodeSize - 1), type, uuid });
      }
    });
  });

  semanticBlockRanges.value = [...uuidMap.values()];
}

function initializeEventListeners(editor: TiptapEditor): void {
  const scrollContainer: HTMLElement | null | undefined = editor.view.dom.parentElement;

  // TODO: Should this maybe moved directly to the plugin?
  useEventListener(scrollContainer, "scroll", handleScroll);

  resizeObserver = new ResizeObserver(() => computeSemanticBlockRanges(editor));
  resizeObserver.observe(editor.view.dom);
}

function initializeDecorationView(annotations: Map<string, NodeStatusObject<AnnotationNode>>): void {
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

  // Reset annotation maps
  annotations.value = cloneDeep(initialAnnotations.value);
  structuralAnnotations.value = cloneDeep(initialStructuralAnnotations.value);

  // setContent goes through TipTap's dispatchTransaction, keeping internal state in sync.
  tiptap.value.commands.setContent(initialDoc);

  initializeDecorationView(annotations.value);

  resetHistory();
}

function setNewInitialDocState() {
  if (!tiptap.value) {
    return;
  }

  // Annotations and structural annotations are already reset in the editor's cleanup function
  initialDoc = tiptap.value.getJSON();
  initialPlainText = tiptap.value.state.doc.textContent;
}

/**
 * Reset editor history by unregistering and registering the history plugin. This was the easiest option since
 * recreating editor state/instance is too expensive and directly accessing the history state is neither type-safe
 * nor reliable. Might be updated in the future.
 *
 * Called when the editor is reset to initial state.
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

function setAnnotations(data: { structuralAnnotations?: Map<string, Annotation>; annotations?: Map<string, Annotation> }): void {
  structuralAnnotations.value = data.structuralAnnotations;
  annotations.value = data.annotations;

  initialAnnotations.value = cloneDeep(data.annotations);
  initialStructuralAnnotations.value = cloneDeep(data.structuralAnnotations);
}

function updateTableOfContent(doc: Node): void {
  tableOfContent.value = buildDocStructure(doc);
}

export function useTiptapStore() {
  return {
    annotations,
    initialAnnotations,
    initialStructuralAnnotations,
    semanticBlockRanges,
    structuralAnnotations,
    tiptap,
    tableOfContent,
    destroyTiptap,
    hasUnsavedChanges,
    initializeTiptap,
    resetToInitialState,
    setAnnotations,
    setNewInitialState: setNewInitialDocState,
  };
}
