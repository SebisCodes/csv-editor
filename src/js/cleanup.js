/**
 * Changes of the whole data, each one undo step: sorting the data rows themselves, cleaning
 * up (spaces, empty and repeated rows, short rows), writing every field anew (another
 * separator, quotes everywhere or only where needed) and the line endings.
 *
 * In a template (?template=) the control rows (template-rows.js) keep their places: sorting
 * works within each block of rows between them, repeated rows are those of one block, and
 * control rows keep their fields.
 */

import { formatField } from './csv.js?v=4';
import { buildReorderedText, convertRecords } from './csv-edit.js?v=3';
import { getColumnLetter } from './values.js?v=3';
import { state, getDataStart } from './state.js?v=3';
import { setRecordOrder } from './table-model.js?v=5';
import { editCode } from './history.js?v=5';
import { saveFormat } from './storage.js?v=5';

/**
 * Sorts the data rows themselves by a column (the header row stays on top; in a template each
 * block between control rows is sorted on its own).
 * @param {number} column - the column.
 * @param {number} direction - 1 ascending, -1 descending.
 * @returns {void}
 */
export function setRowOrder(column, direction) {
    const rows = state.P.rows;
    const data = [];
    for (let i = getDataStart(); i < rows.length; i++) data.push(i);
    setRecordOrder(data, column, direction);
    const order = state.header && rows.length ? [0, ...data] : data;
    state.sort = null;
    const name = state.header ? rows[0]?.[column] || getColumnLetter(column) : getColumnLetter(column);
    editCode(buildReorderedText(state.code, state.P, order, state.eol), `The data is sorted by "${name}" - "Undo" takes it back`);
}

/**
 * Removes the spaces at the start and end of every cell.
 * @returns {void}
 */
export function removeCellSpaces() {
    let count = 0;
    const code = convertRecords(state.code, state.P, state.sep, state.q, state.eol, (rawFields, index, values) => {
        if (!values.some(value => value !== value.trim())) return null;
        return values.map(value => { if (value !== value.trim()) count++; return formatField(value.trim(), state.sep, state.q); });
    });
    editCode(code, count ? `Spaces removed in ${count} ${count === 1 ? 'cell' : 'cells'}` : 'No cell has spaces at its start or end');
}

/**
 * Removes the data rows whose cells are all empty.
 * @returns {void}
 */
export function removeEmptyRows() {
    const order = [];
    let count = 0;
    state.P.rows.forEach((values, i) => { if (i >= getDataStart() && values.every(value => !value.trim())) count++; else order.push(i); });
    editCode(buildReorderedText(state.code, state.P, order, state.eol), count ? `${count} empty ${count === 1 ? 'row' : 'rows'} removed` : 'There are no empty rows');
}

/**
 * Removes data rows that repeat an earlier row of their block exactly; the header is never
 * compared with the rows, and a control row starts a new block.
 * @returns {void}
 */
export function removeRepeatedRows() {
    const seen = new Set(), order = [];
    let count = 0;
    for (const [i, values] of state.P.rows.entries()) {
        if (i < getDataStart()) { order.push(i); continue; }
        if (state.controlRows.has(i)) { seen.clear(); order.push(i); continue; }
        const key = JSON.stringify(values);                       // unambiguous, whatever the cells hold
        if (seen.has(key)) { count++; continue; }
        seen.add(key);
        order.push(i);
    }
    editCode(buildReorderedText(state.code, state.P, order, state.eol), count ? `${count} repeated ${count === 1 ? 'row' : 'rows'} removed` : 'There are no repeated rows');
}

/**
 * Gives rows with fewer fields than the header (or the widest row) empty fields up to that
 * number; control rows keep their fields.
 * @returns {void}
 */
export function expandShortRows() {
    const width = state.header && state.P.rows.length ? state.P.rows[0].length : state.P.width;
    let count = 0;
    const code = convertRecords(state.code, state.P, state.sep, state.q, state.eol, (rawFields, index) => {
        if (rawFields.length >= width || state.controlRows.has(index)) return null;
        count++;
        return [...rawFields, ...Array(width - rawFields.length).fill('')];
    });
    editCode(code, count ? `${count} ${count === 1 ? 'row' : 'rows'} filled up to ${width} fields` : 'Every row has enough fields');
}

/**
 * Writes every value anew: with another separator, every field quoted, or quotes only where
 * needed. The undo step keeps the separator setting with the text, so Undo reads the earlier
 * text with its own separator.
 * @param {string} separator - the separator to write.
 * @param {boolean} always - true to quote every field.
 * @param {string} message - the message to show.
 * @returns {void}
 */
export function formatAllFields(separator, always, message) {
    const order = state.P.rows.map(values => values.map(value => formatField(value, separator, state.q, always)).join(separator));
    const code = buildReorderedText(state.code, state.P, order, state.eol);
    const formatBefore = { ...state.fmt };
    if (separator !== state.sep) state.fmt.sep = separator;
    saveFormat();
    const changed = code !== state.code;
    editCode(code, message);
    if (!changed) return;
    const history = state.history;
    if (history.length >= 2) history[history.length - 2].fmt = formatBefore;
    history[history.length - 1].fmt = { ...state.fmt };
}

/**
 * Sets the line ending of every record.
 * @param {string} eol - "\r\n" or "\n".
 * @returns {void}
 */
export function setLineEndings(eol) {
    if (eol === state.eol) return;
    const count = state.P.starts.length;
    const out = [];
    for (let i = 0; i < count; i++) {
        out.push(state.code.slice(state.P.starts[i], state.P.ends[i]));
        const end = i + 1 < count ? state.P.starts[i + 1] : state.code.length;
        if (end > state.P.ends[i]) out.push(eol);
    }
    editCode(out.join(''), eol === '\r\n' ? 'Line endings: Windows (CRLF)' : 'Line endings: Unix, macOS (LF)');
}
