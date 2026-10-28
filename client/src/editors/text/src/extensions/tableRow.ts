import { type CommandProps } from "@tiptap/core";
import { TableRow } from "@tiptap/extension-table";
import { isInTable, selectedRect, type Rect } from "@tiptap/pm/tables";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    tableRowWithoutHeader: {
      /**
       * Shorthand for marking the first row of the table at the selection as header: sets `role="label"` on all its
       * cells, or removes the role if all of them already are labels.
       */
      toggleLabelRow: () => ReturnType;
      /**
       * Shorthand for marking the first column of the table at the selection as header: sets `role="label"` on all
       * its cells, or removes the role if all of them already are labels.
       */
      toggleLabelColumn: () => ReturnType;
    };
  }
}

/**
 * Creates a command that toggles `role="label"` on all cells of the first row or first column of the table at the
 * selection. If all of them are labels, the role is removed; otherwise it is set on all of them.
 *
 * @param {"row" | "column"} line - Whether to toggle the first row or the first column.
 * @returns {(props: CommandProps) => boolean} The command.
 */
function toggleLabelLine(line: "row" | "column"): (props: CommandProps) => boolean {
  return ({ state, tr, dispatch }: CommandProps): boolean => {
    if (!isInTable(state)) {
      return false;
    }

    if (dispatch) {
      const { map, tableStart } = selectedRect(state);
      const area: Rect =
        line === "row" ? { left: 0, right: map.width, top: 0, bottom: 1 } : { left: 0, right: 1, top: 0, bottom: map.height };
      const positions: number[] = map.cellsInRect(area).map((pos: number) => tableStart + pos);
      const isLabel: boolean = positions.every((pos: number) => tr.doc.nodeAt(pos)?.attrs.role === "label");

      positions.forEach((pos: number) => tr.setNodeAttribute(pos, "role", isLabel ? null : "label"));
    }

    return true;
  };
}

/**
 * Table row that only contains `tableCell` nodes. Replaces the default row, whose content expression also allows
 * `tableHeader`, which is not allowed/supported.
 *
 * Also adds the attributes of TEI's [`att.tableDecoration`](https://www.tei-c.org/release/doc/tei-p5-doc/en/html/ref-att.tableDecoration.html)
 * that the default nodes lack, so they are kept when loaded:
 * - `colspan`/`rowspan` on rows (cells have them already). Only stored, the editor doesn't change them.
 * - `role` on rows and cells. Header cells have `role="label"` and are styled like `th`. The editor only sets it on
 *   cells.
 */
export const TableRowWithoutHeader = TableRow.extend({
  content: "tableCell*",

  addGlobalAttributes() {
    return [
      {
        types: ["tableRow"],
        attributes: {
          colspan: { default: null, rendered: false },
          rowspan: { default: null, rendered: false },
        },
      },
      {
        types: ["tableRow", "tableCell"],
        attributes: {
          role: {
            default: null,
            parseHTML: (element: HTMLElement) => (element.tagName === "TH" ? "label" : null),
            renderHTML: (attributes: Record<string, unknown>) => (attributes.role ? { "data-role": attributes.role } : {}),
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      ...this.parent?.(),
      toggleLabelRow: () => toggleLabelLine("row"),
      toggleLabelColumn: () => toggleLabelLine("column"),
    };
  },
});
