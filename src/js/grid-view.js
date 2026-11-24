/**
 * The table's view state and its queries: which record a view row shows, the value of a cell,
 * column widths and the selected range.
 *
 * Rows of the view: -1 is the header row (when the table has one), 0 … n-1 the data rows in
 * the order of the view (sort and filter), n an empty row to type new data into. Columns:
 * 0 … w-1, and w, an empty column.
 */

import { escapeHtml } from './csv.js?v=4';

export const ROW_HEIGHT = 26;
export const HEAD_HEIGHT = 30;
export const NUMBER_WIDTH = 58;
/** The width of the empty column at the end and of a column without a measured width. */
export const NEW_COLUMN_WIDTH = 90;

/**
 * A cell of the view.
 * @typedef {object} ViewCell
 * @property {number} r - the view row (-1 the header row).
 * @property {number} c - the column.
 */

/**
 * The selected range of the view.
 * @typedef {object} ViewRange
 * @property {number} r1 - the first view row.
 * @property {number} r2 - the last view row.
 * @property {number} c1 - the first column.
 * @property {number} c2 - the last column.
 */

/**
 * A cell value the table writes into the text.
 * @typedef {object} CellChange
 * @property {number} rec - the record (past the last one: a new record).
 * @property {number} c - the column.
 * @property {string} v - the new value.
 */

/**
 * What the editor hands to startGrid().
 * @typedef {object} GridContext
 * @property {object} S - the editor state: P, view, header, colW, colType, sort.
 * @property {function(CellChange[]): void} write - writes cells into the text as one undo step.
 * @property {function(number, number): void} selected - a cell was selected: its record (-1 for the empty row) and column.
 * @property {function(number): void} sortBy - the sort arrow of a column was clicked.
 * @property {function(string): void} toast - shows a short message.
 * @property {function(string): string} t - translates an interface text (the table is marked data-no-i18n).
 * @property {function(number, number): ?string} [getEditRefusal] - why a cell (its record and column) cannot be
 *   edited, or null when it can.
 */

/**
 * The table's elements and view state, shared by the grid modules.
 * @typedef {object} GridView
 * @property {HTMLElement} element - the scrolling table element.
 * @property {GridContext} context - what the editor handed over.
 * @property {object} S - the editor state.
 * @property {HTMLElement} area - the surface with the height and width of the whole table.
 * @property {HTMLElement} head - the header row.
 * @property {HTMLElement} body - the rows in sight.
 * @property {HTMLTextAreaElement} field - the field for editing a cell in place.
 * @property {ViewCell} active - the active cell.
 * @property {ViewCell} anchor - the other corner of the selected range.
 * @property {{r: number, c: number, before: string}|null} edit - the cell being edited and its value before.
 * @property {number[]} lefts - the left edge of each column.
 * @property {number} renderFrame - the animation frame of a requested drawing, 0 for none.
 * @property {boolean} dragging - true while the pointer selects a range.
 * @property {{t: number, key: string}} lastDown - the time and target of the last press.
 */

/**
 * Sets up the table's elements inside the table element and returns its view state (an
 * initializeX).
 * @param {HTMLElement} element - the table element.
 * @param {GridContext} context - what the editor hands over.
 * @returns {GridView} the view state.
 */
export function createGridView(element, context) {
    element.innerHTML = `<div class="grid-surface"><div class="grid-header"></div><div class="grid-rows"></div><textarea class="cell-field" spellcheck="false" hidden aria-label="${escapeHtml(context.t('Cell'))}"></textarea></div>`;
    const area = element.firstElementChild;
    const active = { r: 0, c: 0 };
    return {
        element, context, S: context.S, area,
        head: area.children[0], body: area.children[1], field: area.children[2],
        active, anchor: { ...active }, edit: null, lefts: [0], renderFrame: 0, dragging: false, lastDown: { t: 0, key: '' },
    };
}

/**
 * Returns the number of data rows in the view.
 * @param {GridView} view - the view state.
 * @returns {number} the rows that pass the filter.
 */
export function getDataCount(view) {
    return view.S.view.length;
}

/**
 * Returns the number of columns of the table.
 * @param {GridView} view - the view state.
 * @returns {number} the most fields in a record.
 */
export function getTableWidth(view) {
    return view.S.P.width;
}

/**
 * Returns the first view row.
 * @param {GridView} view - the view state.
 * @returns {number} -1 with a header row, else 0.
 */
export function getTopRow(view) {
    return view.S.header ? -1 : 0;
}

/**
 * Returns the record shown in a view row; the empty row (and rows below it) stand for new records.
 * @param {GridView} view - the view state.
 * @param {number} row - the view row.
 * @returns {number} the record index.
 */
export function getRecordOf(view, row) {
    const count = getDataCount(view);
    if (row === -1) return 0;
    if (row < count) return view.S.view[row];
    return Math.max(view.S.P.rows.length, view.S.header ? 1 : 0) + (row - count);
}

/**
 * Returns the value of a cell of the view.
 * @param {GridView} view - the view state.
 * @param {number} row - the view row.
 * @param {number} column - the column.
 * @returns {string} the value, "" for a missing field.
 */
export function getValueAt(view, row, column) {
    const values = view.S.P.rows[getRecordOf(view, row)];
    return values && column < values.length ? values[column] : '';
}

/**
 * Returns the width of a column.
 * @param {GridView} view - the view state.
 * @param {number} column - the column.
 * @returns {number} the width in pixels.
 */
export function getColumnWidth(view, column) {
    return view.S.colW[column] ?? NEW_COLUMN_WIDTH;
}

/**
 * Returns the selected range: from the anchor to the active cell.
 * @param {GridView} view - the view state.
 * @returns {ViewRange} the first and last row and column.
 */
export function getSelectionRange(view) {
    const { active, anchor } = view;
    return { r1: Math.min(active.r, anchor.r), r2: Math.max(active.r, anchor.r), c1: Math.min(active.c, anchor.c), c2: Math.max(active.c, anchor.c) };
}

/**
 * Returns a view row kept inside the table (the header row up to the empty row).
 * @param {GridView} view - the view state.
 * @param {number} row - the view row.
 * @returns {number} the row inside the table.
 */
export function getClampedRow(view, row) {
    return Math.max(getTopRow(view), Math.min(getDataCount(view), row));
}

/**
 * Returns a column kept inside the table (up to the empty column).
 * @param {GridView} view - the view state.
 * @param {number} column - the column.
 * @returns {number} the column inside the table.
 */
export function getClampedColumn(view, column) {
    return Math.max(0, Math.min(getTableWidth(view), column));
}

/**
 * Returns how many rows Page Up and Page Down move.
 * @param {GridView} view - the view state.
 * @returns {number} the rows in sight less one, at least 1.
 */
export function getPageRowCount(view) {
    return Math.max(1, Math.floor((view.element.clientHeight - HEAD_HEIGHT) / ROW_HEIGHT) - 1);
}

/**
 * Returns the record of the active row.
 * @param {GridView} view - the view state.
 * @returns {number} the record of the active row, -1 for the empty row.
 */
export function getActiveRecord(view) {
    return view.active.r < getDataCount(view) ? getRecordOf(view, view.active.r) : -1;
}
