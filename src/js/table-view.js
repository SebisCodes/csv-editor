/**
 * The table in the editor: the grid (grid.js) connected to the text, the filter with its
 * column list, the sort of the view and the buttons above the table. A selected cell marks its
 * field in the code; cells written in the table go into the text as one undo step.
 * In the example view of a template (table-views.js) the table shows the filled rows: a cell
 * leads to its field (or its tag) in the code, a change goes to the template's cell, and the
 * records the editor gets from the table are the template's.
 *
 * createTableView() runs these steps:
 *   1. set up the grid with the rows of the view shown and the callbacks;
 *   2. connect the filter, the sort buttons and "add row" / "add column";
 *   3. return the grid with its records led back to the template's.
 */

import { getTextWithCells } from './csv-edit.js?v=3';
import { escapeHtml } from './csv.js?v=4';
import { getColumnLetter } from './values.js?v=3';
import { startGrid } from './grid.js?v=8';
import { state, areas, ui, getElement, getWriteFormat, translate, showToast } from './state.js?v=3';
import { getAreaPosition } from './text-index.js?v=3';
import { updateView, getFieldSpan, getFieldSpanAt } from './table-model.js?v=4';
import { renderCode, showCodePosition } from './code-view.js?v=4';
import { renderPanel } from './panel.js?v=4';
import { updateTableNow } from './refresh.js?v=4';
import { editCode } from './history.js?v=4';
import { addRows, addColumn } from './edits.js?v=4';
import { setRowOrder } from './cleanup.js?v=4';
import {
    tableSource, getTemplateRecordOf, getTemplateCellOf, getShownViewRow, getCellEditRefusal, getExampleCellOffset, getExampleTable, EXAMPLE_EDIT_MESSAGE,
} from './table-views.js?v=1';

/** The filter waits this long after typing; longer for large tables. */
const FILTER_DELAY = 60;
const LARGE_FILTER_DELAY = 250;
const LARGE_TABLE = 20000;
/** Joins the header names into a key without mixing them up. */
const NAME_JOINER = '\u0001';

let filterTimer = 0;

/** The grid as it reads the rows of the view shown. */
let shownGrid = null;

/**
 * Sets up the table and the controls above it.
 * @returns {import('./grid.js').GridApi} the grid, with the template's records.
 */
export function createTableView() {
    shownGrid = startGrid(ui.grid, {
        S: tableSource, t: translate, toast: showToast,
        write: writeShownCells,
        selected: showSelectedField,
        sortBy: setNextViewSort,
        getEditRefusal: getCellEditRefusal,
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
    return createTemplateGridApi(shownGrid);
}

/**
 * Creates the grid's API as the editor uses it: the active cell's record and the selected
 * records are the template's, also in the example view.
 * @param {import('./grid.js').GridApi} grid - the grid over the rows of the view shown.
 * @returns {import('./grid.js').GridApi} the API with the template's records.
 */
function createTemplateGridApi(grid) {
    return {
        ...grid,
        getActive: () => { const active = grid.getActive(); return { ...active, rec: getTemplateRecordOf(active.rec) }; },
        getRange: () => { const range = grid.getRange(); return { ...range, recs: [...new Set(range.recs.map(getTemplateRecordOf))] }; },
    };
}

/**
 * Marks the field of a selected cell in the code and puts the code's cursor there, unless the
 * code has the focus.
 * @param {number} record - the cell's record in the rows shown, -1 for the empty row.
 * @param {number} column - the cell's column.
 * @returns {void}
 */
function showSelectedField(record, column) {
    renderPanel();
    if (document.activeElement === ui.ta) return;
    const span = record >= 0 ? getCodeSpanOfCell(record, column) : null;
    if (!span) { state.mark = null; renderCode(); return; }
    state.mark = [getAreaPosition(span[0]), getAreaPosition(span[1])];
    showCodePosition(span[0], false, span[0]);
}

/**
 * Returns the place in the code of a cell of the table: its field, in the example view the field
 * of the template it comes from (for a cell that shows an example, the field of its tag).
 * @param {number} record - the cell's record in the rows shown.
 * @param {number} column - the cell's column.
 * @returns {number[]|null} [start, end) of the field, null for none.
 */
function getCodeSpanOfCell(record, column) {
    if (!getExampleTable()) return getFieldSpan(record, column);
    const offset = getExampleCellOffset(record, column);
    return offset == null ? null : getFieldSpanAt(offset);
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
 * Writes cells of the table's rows into the text as one undo step: in the example view each
 * cell goes to the template's cell it stands for (rows of a list share it: the last value written
 * for it counts), and a cell that shows an example refuses the whole change.
 * @param {import('./grid-view.js').CellChange[]} cells - the cells, by their records in the rows shown.
 * @returns {void}
 */
function writeShownCells(cells) {
    if (!cells.length) return;
    updateTableNow();
    const templateCells = new Map();
    for (const cell of cells) {
        const target = getTemplateCellOf(cell.rec, cell.c);
        if (!target) { showToast(EXAMPLE_EDIT_MESSAGE); return; }
        templateCells.set(target.rec + ',' + target.c, { rec: target.rec, c: target.c, v: cell.v });
    }
    writeCells([...templateCells.values()]);
}

/**
 * Writes cells into the text as one undo step; the edited row stays the active one, also when
 * the view is sorted.
 * @param {import('./grid-view.js').CellChange[]} cells - the cells, by the template's records.
 * @returns {void}
 */
export function writeCells(cells) {
    if (!cells.length) return;
    updateTableNow();
    const kept = shownGrid.getActive();
    const keptRecord = getTemplateRecordOf(kept.rec);
    const isExampleView = !!getExampleTable();
    const code = getTextWithCells(state.code, state.P, cells.map(cell => ({ r: cell.rec, c: cell.c, v: cell.v })), getWriteFormat());
    if (code === state.code) return;
    editCode(code);
    if (kept.rec < 0 || kept.r < 0) return;
    const row = isExampleView ? tableSource.viewPos[kept.rec] ?? -1 : getShownViewRow(keptRecord);
    if (row >= 0) shownGrid.setActive(row, kept.c, { quiet: true, scroll: false });
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
