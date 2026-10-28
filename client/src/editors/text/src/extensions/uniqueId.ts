import { UniqueID, type UniqueIDOptions } from "@tiptap/extension-unique-id";
import { EditorState, Plugin, PluginKey, Transaction } from "@tiptap/pm/state";
import { Node } from "@tiptap/pm/model";
import { useGuidelinesStore } from "../external";
import { createDefaultDocAnnotation } from "../utils/helper/annotationHelper";

const { getAnnotationType, isBuiltinStructuralType } = useGuidelinesStore();

/**
 * Gives every node whose id already occurs earlier in the document a new id and, if it is a structural node, a new
 * `_annotation`. Such duplicates are copies of a node with all its attributes (e.g. a split table cell); with the same
 * id, only one of them would be saved. The first occurrence keeps id and annotation.
 *
 * @param {readonly Transaction[]} transactions - The transactions that were just applied.
 * @param {EditorState} newState - The state after the transactions.
 * @param {UniqueIDOptions} options - The options of the UniqueID extension (id attribute and generator).
 * @returns {Transaction | null} A transaction fixing the duplicates, or `null` if there are none.
 */
function fixDuplicateIds(
  transactions: readonly Transaction[],
  newState: EditorState,
  options: UniqueIDOptions,
): Transaction | null {
  if (!transactions.some((transaction) => transaction.docChanged)) {
    return null;
  }

  const { attributeName, generateID } = options;
  const { tr } = newState;
  const seen = new Set<unknown>();

  newState.doc.descendants((node: Node, pos: number) => {
    const id: unknown = node.attrs[attributeName] ?? null;

    if (id === null) {
      return;
    }

    if (!seen.has(id)) {
      seen.add(id);
      return;
    }

    // The copied annotation belongs to the original, so a structural copy gets a new one
    const annotationType: string = getAnnotationType(node.type.name);
    const newAnnotation = isBuiltinStructuralType(annotationType)
      ? { _annotation: createDefaultDocAnnotation(annotationType) }
      : {};

    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      [attributeName]: generateID({ node, pos }),
      ...newAnnotation,
    });
  });

  return tr.docChanged ? tr : null;
}

/**
 * Tiptap's UniqueID extension with an additional duplicate check, see {@linkcode fixDuplicateIds}. UniqueID only
 * renames duplicates in some cases, so copies of nodes can keep the id of the original, e.g. table cells created by
 * `splitCell` (prosemirror-tables copies all attributes of the original cell). Can be removed when UniqueID handles
 * this itself.
 */
export const UniqueIDWithDuplicateCheck = UniqueID.extend({
  addProseMirrorPlugins() {
    const options: UniqueIDOptions = this.options;

    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        key: new PluginKey("uniqueIdDuplicateCheck"),
        appendTransaction: (transactions, _oldState, newState) => fixDuplicateIds(transactions, newState, options),
      }),
    ];
  },
});
