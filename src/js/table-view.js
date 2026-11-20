/**
 * The table in the editor: the grid (grid.js) connected to the text, the filter with its
 * column list, the sort of the view and the buttons above the table. A selected cell marks its
 * field in the code; cells written in the table go into the text as one undo step.
 *
 * createTableView() runs these steps:
 *   1. set up the grid with the state and its callbacks;
 *   2. connect the filter, the sort buttons and "add row" / "add column".
 */

import { getTextWithCells } from './csv-edit.js?v=3';
import { escapeHtml } from './csv.js?v=4';
import { getColumnLetter } from './values.js?v=3';
import { startGrid } from './grid.js?v=7';
import { state, areas, ui, getElement, getWriteFormat, translate, showToast } from './state.js?v=2';
import { getAreaPosition } from './text-index.js?v=2';
import { updateView, getFieldSpan } from './table-model.js?v=3';
import { renderCode, showCodePosition } from './code-view.js?v=3';
import { renderPanel } from './panel.js?v=3';
import { updateTableNow } from './refresh.js?v=3';
import { editCode } from './history.js?v=3';
import { addRows, addColumn } from './edits.js?v=3';
import { setRowOrder } from './cleanup.js?v=3';

/** The filter waits this long after typing; longer for large tables. */
const FILTER_DELAY = 60;
const LARGE_FILTER_DELAY = 250;
const LARGE_TABLE = 20000;
/** Joins the header names into a key without mixing them up. */
const NAME_JOINER = '\u0001';

let filterTimer = 0;

/**
 * Sets up the table and the controls above it.
 * @returns {import('./grid.js').GridApi} the grid.
 */
export function createTableView() {
    const grid = startGrid(ui.grid, {
        S: state, t: translate, toast: showToast,
        write: writeCells,
        selected: showSelectedField,
        sortBy: setNextViewSort,
    });
    ui.filter.addEventListener('input', () => {
        clearTimeout(filterTimer);
        filterTimer = setTimeout(() => { state.filter.text = ui.filter.value; updateView(); areas.grid.update(); }, state.P.rows.length > LARGE_TABLE ? LARGE_FILTER_DELAY : FILTER_DELAY);
    });
    ui.filterCol.addEventListener('change', () => { state.filter.col = +ui.filterCol.value; updateView(); areas.grid.update(); });
    getElement('#sort-clear').addEventListener('click', () => { state.sort = null; updateView(); areas.grid.update(); });
    getElement('#sort-apply').addEventListener('click', () => { if (state.sort) setRowOrder(state.sort.col, state.sort.dir); });
    getElement('#add-row').addEventListener('click', () => addRows(1));
    getElement('#add-col').addEventListener('click', () => addColumn(state.P.width));
    return grid;
}

/**
 * Marks the field of a selected cell in the code and puts the code's cursor there, unless the
 * code has the focus.
 * @param {number} record - the cell's record, -1 for the empty row.
 * @param {number} column - the cell's column.
 * @returns {void}
 */
function showSelectedField(record, column) {
    renderPanel();
    if (document.activeElement === ui.ta) return;
    const span = record >= 0 ? getFieldSpan(record, column) : null;
    if (!span) { state.mark = null; renderCode(); return; }
    state.mark = [getAreaPosition(span[0]), getAreaPosition(span[1])];
    showCodePosition(span[0], false, span[0]);
}

/**
 * Turns the sort of the view by a column to ascending, descending and off in turn.
 * @param {number} column - the column.
 * @returns {void}
 */
function setNextViewSort(column) {
    const current = state.sort && state.sort.col === column ? state.sort.dir : 0;
    state.sort = current === 0 ? { col: column, dir: 1 } : current === 1 ? { col: column, dir: -1 } : null;
    updateView();
    areas.grid.update();
}

/**
 * Writes cells from the table into the text as one undo step; the edited record stays the
 * active one, also when the view is sorted.
 * @param {import('./grid-view.js').CellChange[]} cells - the cells.
 * @returns {void}
 */
export function writeCells(cells) {
    if (!cells.length) return;
    updateTableNow();
    const grid = areas.grid;
    const kept = grid.getActive();
    const code = getTextWithCells(state.code, state.P, cells.map(cell => ({ r: cell.rec, c: cell.c, v: cell.v })), getWriteFormat());
    if (code === state.code) return;
    editCode(code);
    const record = kept.rec >= 0 ? kept.rec : null;
    if (record != null && state.viewPos[record] >= 0 && kept.r >= 0) grid.setActive(state.viewPos[record], kept.c, { quiet: true, scroll: false });
}

/**
 * Fills the filter's column list when the columns or their names changed.
 * @returns {void}
 */
export function renderFilterColumns() {
    const width = state.P.width, names = state.header ? state.P.rows[0] || [] : [];
    const key = width + '|' + names.join(NAME_JOINER);
    if (state.filterColumnsKey === key) return;
    state.filterColumnsKey = key;
    const current = state.filter.col;
    ui.filterCol.innerHTML = `<option value="-1">${escapeHtml(translate('All columns'))}</option>` + Array.from({ length: width }, (_, column) => `<option value="${column}" data-no-i18n>${escapeHtml(getColumnLetter(column) + (names[column] ? ' · ' + names[column] : ''))}</option>`).join('');
    ui.filterCol.value = current < width ? String(current) : '-1';
}
