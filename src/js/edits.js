/**
 * Rows and columns: added, copied, deleted and moved, each one undo step. Records are rebuilt
 * from the raw text of the others (csv-edit.js), so their quoting and line endings stay.
 */

import { formatField, formatRecord } from './csv.js?v=4';
import { buildReorderedText, convertRecords } from './csv-edit.js?v=3';
import { state, areas, ui, getDataStart, isViewFiltered, showToast } from './state.js?v=3';
import { editCode } from './history.js?v=5';
import { getShownViewRow } from './table-views.js?v=1';

/**
 * Returns the selected data records (the header row left out).
 * @returns {number[]} the record indices in view order.
 */
function getSelectedRecords() {
    return areas.grid.getRange().recs.filter(record => record >= getDataStart());
}

/**
 * Adds an empty row after (or before) the selected rows, or at the end without a selection;
 * sort and filter are turned off so the row is in sight.
 * @param {number} [where] - 1 after the selection, -1 before it.
 * @returns {void}
 */
export function addRows(where = 1) {
    const records = getSelectedRecords();
    const count = state.P.rows.length;
    let at = records.length ? (where > 0 ? Math.max(...records) + 1 : Math.min(...records)) : count;
    at = Math.max(getDataStart(), at);
    const emptyRecord = formatRecord(Array(Math.max(1, state.P.width)).fill(''), state.sep, state.q);
    const order = [];
    for (let i = 0; i < count; i++) { if (i === at) order.push(emptyRecord); order.push(i); }
    if (at >= count) order.push(emptyRecord);
    if (isViewFiltered()) { state.sort = null; state.filter.text = ''; ui.filter.value = ''; }
    editCode(buildReorderedText(state.code, state.P, order, state.eol), 'Row added');
    const viewRow = getShownViewRow(at);
    if (viewRow >= 0) areas.grid.setActive(viewRow, 0);
}

/**
 * Copies the selected rows below themselves.
 * @returns {void}
 */
export function copyRows() {
    const records = new Set(getSelectedRecords());
    if (!records.size) { showToast('Select a row first'); return; }
    const order = [];
    for (let i = 0; i < state.P.rows.length; i++) { order.push(i); if (records.has(i)) order.push(i); }
    editCode(buildReorderedText(state.code, state.P, order, state.eol), records.size === 1 ? 'Row duplicated' : `${records.size} rows duplicated`);
}

/**
 * Deletes the selected rows.
 * @returns {void}
 */
export function removeRows() {
    const records = new Set(getSelectedRecords());
    if (!records.size) { showToast('Select a row first'); return; }
    const order = [];
    for (let i = 0; i < state.P.rows.length; i++) if (!records.has(i)) order.push(i);
    editCode(buildReorderedText(state.code, state.P, order, state.eol), records.size === 1 ? 'Row deleted - "Undo" brings it back' : `${records.size} rows deleted - "Undo" brings them back`);
}

/**
 * Moves the selected rows one place up or down (not past the header, only in an unsorted,
 * unfiltered view).
 * @param {number} step - -1 up, 1 down.
 * @returns {void}
 */
export function moveRows(step) {
    if (isViewFiltered()) { showToast('Turn off sorting and the filter to move rows'); return; }
    const records = getSelectedRecords().sort((a, b) => a - b);
    if (!records.length) { showToast('Select a row first'); return; }
    const low = records[0], high = records[records.length - 1];
    if ((step < 0 && low <= getDataStart()) || (step > 0 && high >= state.P.rows.length - 1)) return;
    const order = [...Array(state.P.rows.length).keys()];
    const block = order.splice(low, high - low + 1);
    order.splice(low + step, 0, ...block);
    const active = areas.grid.getActive();
    editCode(buildReorderedText(state.code, state.P, order, state.eol));
    areas.grid.setActive(active.r + step, active.c);
}

/**
 * Adds an empty column at a place; with a header row it gets a free name ("Column 3").
 * @param {number} column - the place of the new column.
 * @returns {void}
 */
export function addColumn(column) {
    const name = state.header ? getNewColumnName() : '';
    editCode(convertRecords(state.code, state.P, state.sep, state.q, state.eol, (rawFields, index) => getFieldsWithColumn(rawFields, index, column, name)), 'Column added');
    areas.grid.setActive(areas.grid.getActive().r, column);
}

/**
 * Returns the raw fields of a record with an empty field (the header: the name) at a place.
 * @param {string[]} rawFields - the record's raw fields.
 * @param {number} index - the record index.
 * @param {number} column - the place of the new column.
 * @param {string} name - the name of the column in the header row.
 * @returns {string[]|null} the new raw fields, null to keep a data record too short to reach the place.
 */
function getFieldsWithColumn(rawFields, index, column, name) {
    const isHeader = index === 0 && state.header;
    if (column > rawFields.length && !isHeader) return null;
    const fields = rawFields.slice();
    while (fields.length < column) fields.push('');
    fields.splice(column, 0, isHeader ? formatField(name, state.sep, state.q) : '');
    return fields;
}

/**
 * Returns the first "Column <n>" no header name has (compared without case).
 * @returns {string} the name.
 */
function getNewColumnName() {
    const used = new Set((state.P.rows[0] || []).map(name => name.trim().toLowerCase()));
    for (let n = 1; ; n++) if (!used.has(`column ${n}`)) return `Column ${n}`;
}

/**
 * Deletes the selected columns (a record left without fields keeps one empty field).
 * @returns {void}
 */
export function removeColumns() {
    const range = areas.grid.getRange();
    const first = range.c1, last = Math.min(range.c2, state.P.width - 1);
    if (first > last) return;
    editCode(convertRecords(state.code, state.P, state.sep, state.q, state.eol, rawFields => {
        if (first >= rawFields.length) return null;
        const fields = rawFields.slice();
        fields.splice(first, last - first + 1);
        return fields.length ? fields : [''];
    }), first === last ? 'Column deleted - "Undo" brings it back' : `${last - first + 1} columns deleted - "Undo" brings them back`);
}

/**
 * Swaps the active column with its neighbor, the column widths too.
 * @param {number} step - -1 left, 1 right.
 * @returns {void}
 */
export function moveColumn(step) {
    const column = areas.grid.getActive().c, target = column + step;
    if (column >= state.P.width || target < 0 || target >= state.P.width) return;
    editCode(convertRecords(state.code, state.P, state.sep, state.q, state.eol, rawFields => getSwappedFields(rawFields, column, target)));
    [state.colW[column], state.colW[target]] = [state.colW[target], state.colW[column]];
    areas.grid.setActive(areas.grid.getActive().r, target);
}

/**
 * Returns the raw fields of a record with two fields swapped; a record too short for one of
 * them gets empty fields up to it.
 * @param {string[]} rawFields - the record's raw fields.
 * @param {number} column - the one field.
 * @param {number} target - the other field.
 * @returns {string[]|null} the new raw fields, null to keep a record that has neither field.
 */
function getSwappedFields(rawFields, column, target) {
    let fields = rawFields;
    if (Math.max(column, target) >= fields.length) {
        if (Math.min(column, target) >= fields.length) return null;
        fields = fields.slice();
        while (fields.length <= Math.max(column, target)) fields.push('');
    }
    const swapped = fields.slice();
    [swapped[column], swapped[target]] = [swapped[target], swapped[column]];
    return swapped;
}
