import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, Transaction } from "@tiptap/pm/state";
import { Node } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { DocAnnotation, EditorSettings } from "../../../models/types";
import { useGuidelinesStore } from "../../../store/guidelines";

const { getAnnotationType } = useGuidelinesStore();

interface BlockDecorationState {
  decoSet: DecorationSet;
  settings: EditorSettings | null;
}

interface SettingsChangedMeta {
  type: "settingsChanged";
  settings: EditorSettings;
}

interface TagData {
  kind: "base" | "semantic";
  label: string;
  type: string;
  uuid: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    blockDecorations: {
      setBlockDecorationSettings: (settings: EditorSettings) => ReturnType;
    };
  }
}

export const BLOCK_DECORATION_KEY = new PluginKey<BlockDecorationState>("blockDecorations");

// Tiptap node-type names (editor roles) that receive an outline + tag bar.
const DECORATED_ROLES: ReadonlySet<string> = new Set(["paragraph", "heading", "bulletList", "table"]);

// Paragraphs nested directly inside these containers are skipped to avoid visual clutter
// (paragraphs inside cells e.g. do not have to be displayed)
const EXCLUDED_PARAGRAPH_PARENTS: ReadonlySet<string> = new Set(["tableCell", "tableHeader", "listItem"]);

/**
 * Build the decoration set, consisting of node decorations and widget decorations depending on the user settings.
 *
 * Called on editor creation, settings change and on document changes.
 *
 * @param {Node} doc The root doc node
 * @param {EditorSettings} settings The editor settings
 * @returns The built decoration set
 */
function buildDecorations(doc: Node, settings: EditorSettings | null): DecorationSet {
  if (!settings) {
    return DecorationSet.empty;
  }

  const { outline, baseType: base, semanticTypes: semantic } = settings.blockDecorations;

  if (!outline && !base && !semantic) {
    return DecorationSet.empty;
  }

  const decorations: Decoration[] = [];

  doc.descendants((node: Node, pos: number, parent: Node | null) => {
    if (!needsDecoration(node, parent)) {
      return;
    }

    if (outline) {
      decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: "block-deco-outline" }));
    }

    const tags: TagData[] = buildTags(node, base, semantic);

    // "pos + 1" since it should be placed inside the node's HTML container
    decorations.push(
      Decoration.widget(pos + 1, () => renderTagBar(tags), {
        side: -1,
        key: createTagKey(node, tags),
        ignoreSelection: true,
      }),
    );
  });

  return DecorationSet.create(doc, decorations);
}

/**
 * Builds and returns the data objects for the tags to be rendered as decorations.
 *
 * @param {Node} node - The current node.
 * @param {boolean} showBase - Whether to show the base block tag
 * @param {boolean} showSemantic - Whether to show the semantic block tags
 * @returns {TagData[]} An array of tag data objects
 */
function buildTags(node: Node, showBase: boolean, showSemantic: boolean): TagData[] {
  const tags: TagData[] = [];

  if (showBase) {
    tags.push({
      kind: "base",
      label: getBaseLabel(node),
      type: node.type.name,
      uuid: node.attrs.uuid,
    });
  }

  if (showSemantic) {
    const semanticBlocks: DocAnnotation[] = node.attrs._semanticBlocks ?? [];

    for (const block of semanticBlocks) {
      const { type, uuid } = block.node.data;

      tags.push({
        kind: "semantic",
        label: getSemanticLabel(type),
        type,
        uuid,
      });
    }
  }

  return tags;
}

// Stable widget key so ProseMirror reuses the DOM across edits (no flicker), yet
// rebuilds it whenever the tags' data change.
function createTagKey(node: Node, tags: TagData[]): string {
  const signature: string = tags.map((p) => `${p.kind}:${p.type}:${p.label}`).join("|");

  return `${node.attrs.uuid}#${signature}`;
}

/**
 * Get label for basic building block that should be displayed in a tag.
 *
 * Currently just returns built-in tiptap node names, but the configured name should be used.
 *
 * @param {Node} node - The current node
 * @returns {string} The label to be displayed
 */
function getBaseLabel(node: Node): string {
  // TODO: Use the configured names instead (projects might use list instead of bulletList e.g.)
  const role: string = node.type.name;

  if (role === "paragraph") {
    return "p";
  }

  if (role === "heading") {
    return `h#-${node.attrs.level ?? 1}`;
  }

  if (role === "bulletList") {
    return "list";
  }

  if (role === "table") {
    return "table";
  }

  // Return the canonical configured type as fallback, derived from the live node's editor role.
  return getAnnotationType(role);
}

/**
 * Get label of block type that should be displayed in a semantic block tag.
 * Currently just returns the type, but might be extende later.
 *
 * @param {string} type - The annotation type
 * @returns {string} The label to be displayed
 */
function getSemanticLabel(type: string): string {
  return type;
}

/**
 * Check if the current node needs to be decorated as configured in the constants.
 *
 * Paragraphs inside tableCells e.g. do not need to be rendered since this would be more confusing than helpful
 *
 * @param {Node} node The current document node.
 * @param  {Node | null} parent he current document node's parent
 * @returns {boolean} `true` if the node needs to be decorated, `false` otherwise
 */
function needsDecoration(node: Node, parent: Node | null): boolean {
  const role: string = node.type.name;

  if (!DECORATED_ROLES.has(role)) {
    return false;
  }

  if (role === "paragraph" && parent && EXCLUDED_PARAGRAPH_PARENTS.has(parent.type.name)) {
    return false;
  }

  return true;
}

/**
 * Creates and returns the HTML Element which holds the block tags and is attached to the block node's HTML container.
 *
 * @param {TagData[]} tags - The data object of the tags to be rendered
 * @returns {HTMLElement} The HTML Element that holds all tag HTML elements.
 */
function renderTagBar(tags: TagData[]): HTMLElement {
  const bar: HTMLElement = document.createElement("div");

  bar.className = "block-deco-tags";
  bar.contentEditable = "false";

  for (const tag of tags) {
    const el: HTMLElement = document.createElement("span");

    el.className = `block-deco-tag block-deco-tag-${tag.kind}`;
    el.textContent = tag.label;
    el.dataset.uuid = tag.uuid ?? "";
    el.dataset.type = tag.type;

    el.title = `Block type: ${tag.label}`;

    if (tag.kind === "semantic") {
      el.title = `Semantic block type: ${tag.label}`;
      // Carried for future interactivity (click-to-select / remove); unused today.
    }

    bar.appendChild(el);
  }

  return bar;
}

export const BlockDecorations = Extension.create({
  name: "blockDecorations",

  addCommands() {
    return {
      setBlockDecorationSettings:
        (settings: EditorSettings) =>
        ({ tr, dispatch }) => {
          const meta: SettingsChangedMeta = { type: "settingsChanged", settings };

          tr.setMeta(BLOCK_DECORATION_KEY, meta);

          dispatch?.(tr);

          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<BlockDecorationState>({
        key: BLOCK_DECORATION_KEY,
        state: {
          init(): BlockDecorationState {
            // Settings are injected after editor creation via the `setBlockDecorationSettings` command,
            return { decoSet: DecorationSet.empty, settings: null };
          },
          apply(tr: Transaction, oldState: BlockDecorationState): BlockDecorationState {
            const meta: SettingsChangedMeta | undefined = tr.getMeta(BLOCK_DECORATION_KEY);

            if (meta?.type === "settingsChanged") {
              return {
                decoSet: buildDecorations(tr.doc, meta.settings),
                settings: meta.settings,
              };
            }

            if (tr.docChanged) {
              // Cheap to rebuild — there are that many blocks, tags/outlines depend on live node attrs (e.g. _semanticBlocks)
              // and existing decorations are cached with a key anyway.
              return {
                decoSet: buildDecorations(tr.doc, oldState.settings),
                settings: oldState.settings,
              };
            }

            return oldState;
          },
        },
        props: {
          decorations(state): DecorationSet {
            return this.getState(state)?.decoSet ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});
