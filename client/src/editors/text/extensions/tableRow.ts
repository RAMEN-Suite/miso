import { TableRow } from "@tiptap/extension-table";

/**
 * Table row that only contains `tableCell` nodes. Replaces the default row, whose content expression also allows
 * `tableHeader`, which is not allowed/supported.
 */
export const TableRowWithoutHeader = TableRow.extend({
  content: "tableCell*",
});
