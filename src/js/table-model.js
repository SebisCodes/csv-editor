/**
 * Reading the document into the table: the text read with the document's format, the column
 * widths and kinds, the rows the view shows (filtered, then sorted - only the view), and the
 * place of a field in the text.
 *
 * parseDocument() runs these steps:
 *   1. find separator, quote character, header row and line ending;
 *   2. read the text;
 *   3. find the control rows of a template;
 *   4. measure the columns (for a new width or another document) or update their kinds;
 *   5. build the example view of a template (table-views.js);
 *   6. work out the rows of the view;
 *   7. find the problems.
 */

import { parseCsv, readRecord, findSeparator, findLineEnding, findRecordIndex } from './csv.js?v=4';
import { getColumnInfo, getSortKey, getValueOrder, getColumnLetter } from './values.js?v=3';
import { state, ui, getElement, getClamped } from './state.js?v=3';
import { updateProblems } from './problems.js?v=5';
import { TEMPLATE_SYNTAX, findControlRows, getRecordBlocks } from './template-rows.js?v=1';
import { tableSource, getExampleTable, setExampleOrder, updateExampleTable } from './table-views.js?v=1';

/** How much of the start of the text the separator and line ending are found in. */
const DETECTION_LENGTH = 65536;
/** The rows measured for the column widths. */
const MEASURED_ROWS = 300;
/** The rows read for the kind of a column. */
const TYPED_ROWS = 400;
const MIN_TEXT_LENGTH = 3;
const MAX_MEASURED_LENGTH = 48;
/** Extra characters for the header name (bold, with the sort arrow). */
const HEADER_EXTRA = 6;
const CHARACTER_WIDTH = 7.4;
const CELL_PADDING = 22;
const MIN_COLUMN_WIDTH = 64;
const MAX_COLUMN_WIDTH = 320;
/** The width of the empty column at the end. */
const NEW_COLUMN_WIDTH = 90;
/** The control rows of a table without any. */
const NO_CONTROL_ROWS = new Set();

/**
 * Reads the text with the document's format; the table, the view and the problems follow.
 * @returns {void}
 */
export function parseDocument() {
    const head = state.code.slice(0, DETECTION_LENGTH);
    state.sep = state.fmt.sep === 'auto' ? findSeparator(head) : state.fmt.sep;
    state.q = state.fmt.q || '"';
    state.header = state.fmt.header !== false;
    state.eol = findLineEnding(head);
    state.P = parseCsv(state.code, state.sep, state.q);
    state.parsed = state.code;
    state.controlRows = findControlRows(state.P.rows, TEMPLATE_SYNTAX);
    if (state.colW.length !== state.P.width + 1 || state.parsedFileId !== state.fileId) { setColumnWidths(); state.parsedFileId = state.fileId; }
    else updateColumnTypes();
    updateExampleTable();
    updateView();
    updateProblems();
}

/**
 * Sets the width of every column from the first rows, then the kinds of the columns.
 * @returns {void}
 */
function setColumnWidths() {
    const rows = state.P.rows, count = Math.min(rows.length, MEASURED_ROWS), width = state.P.width;
    const lengths = Array(width).fill(MIN_TEXT_LENGTH);
    for (let i = 0; i < count; i++) for (let c = 0; c < rows[i].length; c++) {
        const length = Math.min(rows[i][c].length, MAX_MEASURED_LENGTH) + (i === 0 && state.header ? HEADER_EXTRA : 0);
        if (length > lengths[c]) lengths[c] = length;
    }
    state.colW = [...lengths.map(length => getClamped(Math.round(length * CHARACTER_WIDTH + CELL_PADDING), MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH)), NEW_COLUMN_WIDTH];
    updateColumnTypes();
}

/**
 * Sets the kind of every column from its first data rows (control rows of a template left out).
 * @returns {void}
 */
function updateColumnTypes() {
    const rows = state.P.rows, typed = [];
    for (let i = state.header ? 1 : 0; i < rows.length && typed.length < TYPED_ROWS; i++) if (!state.controlRows.has(i)) typed.push(rows[i]);
    state.colType = Array.from({ length: state.P.width }, (_, column) => getColumnInfo(typed.map(values => values[column])).type);
}

/**
 * Works out the data rows the table shows: filtered, then sorted (only the view), of the
 * template and of its example table, and shows the row count and the sort above the table.
 * @returns {void}
 */
export function updateView() {
    const filter = state.filter.text.trim().toLowerCase();
    if (state.sort && state.sort.col >= state.P.width) state.sort = null;
    const order = getViewOrder(state.P.rows, state.controlRows, filter);
    state.view = order.view;
    state.viewPos = order.viewPos;
    const exampleTable = getExampleTable();
    if (exampleTable) setExampleOrder(getViewOrder(exampleTable.P.rows, NO_CONTROL_ROWS, filter));
    renderViewInfo(tableSource.P.rows.length - (state.header ? 1 : 0), !!filter);
}

/**
 * Returns the data rows of a table that pass the filter, sorted by the sort of the view.
 * @param {string[][]} rows - the values of every record.
 * @param {Set<number>} controlRows - the control rows, which keep their places when sorting.
 * @param {string} filter - the filter text, trimmed and in lower case; "" for none.
 * @returns {{view: Int32Array, viewPos: Int32Array}} the records shown in their order, and the view row of each record (-1 when not shown).
 */
function getViewOrder(rows, controlRows, filter) {
    const list = getFilteredRecords(rows, filter);
    if (state.sort) setRecordOrder(list, state.sort.col, state.sort.dir, rows, controlRows);
    const view = Int32Array.from(list);
    const viewPos = new Int32Array(rows.length).fill(-1);
    view.forEach((record, index) => { viewPos[record] = index; });
    return { view, viewPos };
}

/**
 * Returns the data records that pass the filter, in their order.
 * @param {string[][]} rows - the values of every record.
 * @param {string} filter - the filter text, trimmed and in lower case; "" for none.
 * @returns {number[]} the record indices.
 */
function getFilteredRecords(rows, filter) {
    const list = [];
    for (let i = state.header ? 1 : 0; i < rows.length; i++) {
        if (filter) {
            const values = rows[i];
            const hit = state.filter.col >= 0 ? (values[state.filter.col] || '').toLowerCase().includes(filter) : values.some(value => value.toLowerCase().includes(filter));
            if (!hit) continue;
        }
        list.push(i);
    }
    return list;
}

/**
 * Sorts record indices by the values of a column, by its kind; equal values keep their order.
 * In a template the records are sorted within each block between control rows, and the control
 * rows keep their places.
 * @param {number[]} records - the record indices; sorted in place.
 * @param {number} column - the column.
 * @param {number} direction - 1 ascending, -1 descending.
 * @param {string[][]} [rows=state.P.rows] - the values of every record of the table the indices point into.
 * @param {Set<number>} [controlRows=state.controlRows] - the control rows of that table.
 * @returns {void}
 */
export function setRecordOrder(records, column, direction, rows = state.P.rows, controlRows = state.controlRows) {
    const getKey = getSortKey(state.colType[column]);
    const keys = new Map(records.map(i => [i, getKey(rows[i][column] ?? '')]));
    const blocks = getRecordBlocks(rows.length, controlRows);
    records.sort((a, b) => (blocks ? blocks[a] - blocks[b] : 0) || direction * getValueOrder(keys.get(a), keys.get(b)) || a - b);
}

/**
 * Shows the number of rows, the sort of the view and the hint for an empty table.
 * @param {number} total - the data rows of the table.
 * @param {boolean} filtered - true when a filter is set.
 * @returns {void}
 */
function renderViewInfo(total, filtered) {
    const rows = tableSource.P.rows;
    ui.viewInfo.textContent = filtered ? `${tableSource.view.length.toLocaleString('en')} of ${total.toLocaleString('en')} rows` : `${total.toLocaleString('en')} ${total === 1 ? 'row' : 'rows'}`;
    ui.sortInfo.hidden = !state.sort;
    if (state.sort) {
        getElement('#sort-name').textContent = state.header ? (rows[0]?.[state.sort.col] || getColumnLetter(state.sort.col)) : getColumnLetter(state.sort.col);
        getElement('#sort-dir').textContent = state.sort.dir > 0 ? '▲' : '▼';
    }
    ui.empty.hidden = rows.length > (state.header ? 1 : 0) || filtered;
}

/**
 * Returns the place of the field that holds a place of the text.
 * @param {number} position - the place in the text.
 * @returns {number[]|null} [start, end) of the field, null before the first record.
 */
export function getFieldSpanAt(position) {
    const record = findRecordIndex(state.P, position);
    if (record < 0) return null;
    const spans = readRecord(state.code, state.P.starts[record], state.sep, state.q, true).spans;
    return spans.findLast(span => span[0] <= position) || spans[0];
}

/**
 * Returns the place of a field in the text.
 * @param {number} record - the record.
 * @param {number} column - the column.
 * @returns {number[]|null} [start, end) of the field, the end of the record when it has fewer
 *   fields, null for a record that does not exist.
 */
export function getFieldSpan(record, column) {
    if (record < 0 || record >= state.P.starts.length) return null;
    const read = readRecord(state.code, state.P.starts[record], state.sep, state.q, true);
    return column < read.spans.length ? read.spans[column] : [read.end, read.end];
}
