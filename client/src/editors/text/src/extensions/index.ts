import { type Extensions } from "@tiptap/core";
import Heading from "@tiptap/extension-heading";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { BulletList, ListItem } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Gapcursor, UndoRedo } from "@tiptap/extensions";
import InvisibleCharacters, { ParagraphNode, SpaceCharacter } from "@tiptap/extension-invisible-characters";
import { AnnotationAppearance } from "../external";
import { AnnotationAttributes } from "./annotationAttributes";
import { AnnotationDecoration } from "./annotationDecoration";
import { AnnotationHighlight } from "./annotationHighlight";
import { AnnotationShortcuts } from "./annotationShortcuts";
import { BlockDecorations } from "./blockDecorations";
import { AnnotatedHardBreak } from "./hardBreak";
import { SpecialCharacters } from "./specialCharacters";
import { TableRowWithoutHeader } from "./tableRow";
import { UniqueIDWithDuplicateCheck } from "./uniqueId";
import { ZeroPointAnnotation } from "./zeroPointAnnotation";

/** What the host provides to configure the editor's extensions. */
export interface ExtensionOptions {
  /** Returns the configured appearance of an annotation type, used to render markers and highlights. */
  getAppearance: (type: string) => AnnotationAppearance | undefined;
  /** Called with the uuid of a line break whose `¬` formatting mark was clicked, e.g. to edit its properties. */
  onHardBreakMarkerClick?: (uuid: string) => void;
  /**
   * Called on the line break shortcuts (Shift+Enter, Mod+Enter) instead of inserting a line break, so the host can ask
   * for required properties first (and insert with `insertAnnotatedHardBreak`). Without it, the shortcuts insert right away.
   */
  onHardBreakShortcut?: () => void;
  /** Annotation type per shortcut in keymap notation, e.g. `{ "Mod-Shift-e": "Person" }`. */
  annotationShortcuts?: Record<string, string>;
  /** Called with the annotation type of a pressed annotation shortcut, so the host can annotate the selection. */
  onAnnotationShortcut?: (type: string) => void;
}

/**
 * Creates the full list of tiptap extensions the text editor is built from.
 *
 * @param {ExtensionOptions} options - The host-provided configuration.
 * @returns {Extensions} The configured extensions.
 */
export function createExtensions(options: ExtensionOptions): Extensions {
  const { getAppearance, onHardBreakMarkerClick, onHardBreakShortcut, annotationShortcuts, onAnnotationShortcut } = options;

  return [
    Document,
    Paragraph,
    Text,
    Heading,
    TableKit.configure({
      table: { resizable: true },
      tableRow: false,
      tableHeader: false,
    }),
    TableRowWithoutHeader,
    BulletList,
    ListItem,
    Gapcursor,
    AnnotatedHardBreak.configure({ onMarkerClick: onHardBreakMarkerClick, onInsert: onHardBreakShortcut }),
    UndoRedo,
    ZeroPointAnnotation.configure({ getAppearance }),
    InvisibleCharacters.configure({
      visible: false,
      builders: [new ParagraphNode(), new SpaceCharacter()],
    }),
    AnnotationDecoration.configure({ getAppearance }),
    BlockDecorations,
    UniqueIDWithDuplicateCheck.configure({
      types: "all",
      attributeName: "uuid",
      generateID: () => crypto.randomUUID(),
    }),
    AnnotationAttributes,
    AnnotationHighlight,
    AnnotationShortcuts.configure({ shortcuts: annotationShortcuts ?? {}, onShortcut: onAnnotationShortcut }),
    SpecialCharacters,
  ];
}
