import { type Extensions } from "@tiptap/core";
import Heading from "@tiptap/extension-heading";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { BulletList, ListItem } from "@tiptap/extension-list";
import HardBreak from "@tiptap/extension-hard-break";
import { TableKit } from "@tiptap/extension-table";
import { Gapcursor, UndoRedo } from "@tiptap/extensions";
import InvisibleCharacters, { HardBreakNode, ParagraphNode, SpaceCharacter } from "@tiptap/extension-invisible-characters";
import { AnnotationAppearance } from "../external";
import { AnnotationAttributes } from "./annotationAttributes";
import { AnnotationDecoration } from "./annotationDecoration";
import { AnnotationHighlight } from "./annotationHighlight";
import { BlockDecorations } from "./blockDecorations";
import { TableRowWithoutHeader } from "./tableRow";
import { UniqueIDWithDuplicateCheck } from "./uniqueId";
import { ZeroPointAnnotation } from "./zeroPointAnnotation";

/** What the host provides to configure the editor's extensions. */
export interface ExtensionOptions {
  /** Returns the configured appearance of an annotation type, used to render markers and highlights. */
  getAppearance: (type: string) => AnnotationAppearance | undefined;
}

/**
 * Creates the full list of tiptap extensions the text editor is built from.
 *
 * @param {ExtensionOptions} options - The host-provided configuration.
 * @returns {Extensions} The configured extensions.
 */
export function createExtensions(options: ExtensionOptions): Extensions {
  const { getAppearance } = options;

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
    HardBreak,
    UndoRedo,
    ZeroPointAnnotation.configure({ getAppearance }),
    InvisibleCharacters.configure({
      visible: false,
      builders: [new ParagraphNode(), new HardBreakNode(), new SpaceCharacter()],
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
  ];
}
