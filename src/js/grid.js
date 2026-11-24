/**
 * The table: a spreadsheet-like view of the records, drawn from the parsed text (only the
 * rows in sight are in the page, so 100 000 rows stay quick). Cells are edited in place
 * (Enter, F2, a double press or typing); every change goes to the editor's write() as one
 * list of cells, which changes the CSV text.
 *
 * The parts: grid-view.js (view state and queries), grid-render.js (drawing),
 * grid-select.js (selection), grid-edit.js (editing in place), grid-input.js (pointer and
 * keys), grid-clipboard.js (copy, cut, paste, clear).
 *
 * startGrid() runs these steps:
 *   1. create the view state and the table's elements;
 *   2. draw again when the table scrolls or changes its size;
 *   3. connect the edit field, the pointer, the keys and the clipboard;
 *   4. return the API the editor uses.
 */

import { createGridView, getSelectionRange, getDataCount, getRecordOf, getActiveRecord } from './grid-view.js?v=3';
import { renderGrid, startGridRender } from './grid-render.js?v=4';
import { setActiveCell, updateSelection } from './grid-select.js?v=4';
import { connectEditField, stopEdit } from './grid-edit.js?v=4';
import { connectPointer, connectKeys } from './grid-input.js?v=4';
import { connectClipboard } from './grid-clipboard.js?v=3';

/**
 * The active cell for the editor.
 * @typedef {object} ActiveCell
 * @property {number} r - the view row (-1 the header row).
 * @property {number} c - the column.
 * @property {number} rec - the record, -1 for the empty row.
 */

/**
 * The selected range for the editor.
 * @typedef {object} SelectedRange
 * @property {number} r1 - the first view row.
 * @property {number} r2 - the last view row.
 * @property {number} c1 - the first column.
 * @property {number} c2 - the last column.
 * @property {number[]} recs - the records of the selected data rows, in view order.
 */

/**
 * What startGrid() returns.
 * @typedef {object} GridApi
 * @property {function(): void} render - draws the table.
 * @property {function(): void} update - keeps the selection inside the changed table and draws it.
 * @property {function(number, number, object=): void} setActive - makes a cell of the view active (see setActiveCell).
 * @property {function(): ActiveCell} getActive - the active cell.
 * @property {function(): SelectedRange} getRange - the selected range.
 * @property {function(): boolean} isEditing - true while a cell is edited.
 * @property {function(boolean): void} stopEdit - ends an edit; true writes the value.
 * @property {function(): void} setFocus - puts the focus on the table.
 */

/**
 * Sets up the table (an initializeX: it returns the table's API).
 * @param {HTMLElement} element - the table element.
 * @param {import('./grid-view.js').GridContext} context - the editor state and callbacks.
 * @returns {GridApi} the API the editor uses.
 */
export function startGrid(element, context) {
    const view = createGridView(element, context);
    element.addEventListener('scroll', () => { startGridRender(view); }, { passive: true });
    new ResizeObserver(() => startGridRender(view)).observe(element);
    connectEditField(view);
    connectPointer(view);
    connectKeys(view);
    connectClipboard(view);
    return createGridApi(view);
}

/**
 * Creates the API of the table over its view state.
 * @param {import('./grid-view.js').GridView} view - the view state.
 * @returns {GridApi} the API.
 */
function createGridApi(view) {
    return {
        render: () => renderGrid(view),
        update: () => updateSelection(view),
        setActive: (row, column, options) => setActiveCell(view, row, column, options),
        getActive: () => ({ ...view.active, rec: getActiveRecord(view) }),
        getRange: () => getSelectedRange(view),
        isEditing: () => !!view.edit,
        stopEdit: keep => stopEdit(view, keep),
        setFocus: () => view.element.focus({ preventScroll: true }),
    };
}

/**
 * Returns the selected range with the records of its data rows.
 * @param {import('./grid-view.js').GridView} view - the view state.
 * @returns {SelectedRange} the range and its records.
 */
function getSelectedRange(view) {
    const range = getSelectionRange(view);
    const count = Math.max(0, Math.min(range.r2, getDataCount(view) - 1) - range.r1 + 1);
    return { ...range, recs: Array.from({ length: count }, (_, i) => getRecordOf(view, range.r1 + i)) };
}
