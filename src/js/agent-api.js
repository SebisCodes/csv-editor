/**
 * What the AI prompt and the WebMCP tools see of the editor and may do in it: the document
 * (long files cut), its rows, single cells, rows added at the end and the user's documents.
 * Rows are counted from 1 = the first data row; columns by number from 1 or by header name.
 */

import { findRecordIndex, parseCsv, formatRecord, SEPARATOR_NAMES } from './csv.js?v=4';
import { joinRecords } from './csv-edit.js?v=3';
import { getColumnLetter } from './values.js?v=3';
import { store } from './files.js?v=8';
import { state, areas, getDataStart } from './state.js?v=3';
import { getCodeLine } from './text-index.js?v=3';
import { updateTableNow } from './refresh.js?v=5';
import { editCode } from './history.js?v=5';
import { writeCells } from './table-view.js?v=5';
import { openDocument, createDocument, BLANK_CODE } from './documents.js?v=5';

/** The prompt and get_document carry at most this many characters of the text. */
const PROMPT_CAP = 60000;
/** The problems the prompt lists. */
const PROMPT_PROBLEMS = 20;
/** get_rows returns 100 rows without an end, and at most 500: the rows after the first one. */
const DEFAULT_ROWS_AFTER_FIRST = 99;
const MAX_ROWS_AFTER_FIRST = 499;
/** One set_cell call reaches at most this far past the table's last row or column. */
const MAX_GROWTH = 1000;
const AI_DOCUMENT_NAME = 'AI table';

/**
 * Returns what the AI prompt and the WebMCP tools get to see: the CSV (long files cut after
 * the last whole record), the names of the documents, the selection and how the text is read.
 * @returns {import('./ai-prompt.js').PromptState} the state without framed and remote.
 */
export function getPromptState() {
    const count = Math.max(0, state.P.rows.length - getDataStart());
    let csv = state.code;
    if (csv.length > PROMPT_CAP) {
        const record = findRecordIndex(state.P, PROMPT_CAP);
        const cut = record > 0 ? state.P.starts[record] : PROMPT_CAP;
        csv = state.code.slice(0, cut) + `… (only the first ${Math.max(0, record - getDataStart())} of ${count} rows are shown here)`;
    }
    return {
        csv, name: state.name, files: store.getSortedEntries().map(entry => entry.name), sel: getSelectionText(),
        about: `Separator: ${SEPARATOR_NAMES[state.sep]} (${state.sep === '\t' ? 'tab' : state.sep}), ${state.header ? 'the first row is the header' : 'no header row'}, ${count} data rows, ${state.P.width} columns.`,
        problems: state.problems.slice(0, PROMPT_PROBLEMS).map(problem => `line ${getCodeLine(problem.pos) + 1}: ${problem.msg}`),
        context: areas.sync?.getContext() || null,
    };
}

/**
 * Returns the selected range in words, when more than one cell is selected.
 * @returns {string} "rows 2-5, columns A-C", or "".
 */
function getSelectionText() {
    const range = areas.grid.getRange();
    if (!range.recs.length || (range.r2 <= range.r1 && range.c2 <= range.c1)) return '';
    const start = getDataStart();
    return `rows ${range.recs[0] - start + 1}-${range.recs[range.recs.length - 1] - start + 1}, columns ${getColumnLetter(range.c1)}-${getColumnLetter(Math.min(range.c2, state.P.width - 1))}`;
}

/**
 * Returns a column's index from a number (from 1) or a header name (without case).
 * @param {number|string} column - the column.
 * @returns {number} the 0-based index, -1 for an unknown name.
 */
function getColumnIndex(column) {
    if (typeof column === 'number' || /^\d+$/.test(String(column))) return Math.round(+column) - 1;
    const name = String(column).trim().toLowerCase();
    return state.header && state.P.rows.length ? state.P.rows[0].findIndex(header => header.trim().toLowerCase() === name) : -1;
}

/**
 * Returns the problems with their lines, for get_problems.
 * @returns {Array<object>} the problems with line (1-based).
 */
export function getProblemList() {
    return state.problems.map(problem => ({ ...problem, line: getCodeLine(problem.pos) + 1 }));
}

/**
 * Returns the header and a range of data rows, for get_rows.
 * @param {number} from - the first row, from 1.
 * @param {number} to - the last row; 0 for 100 rows.
 * @returns {{header: (string[]|null), total: number, rows: Array<{row: number, values: string[]}>}} the rows (at most 500).
 */
export function getRowRange(from, to) {
    const count = state.P.rows.length - getDataStart();
    const last = Math.min(count, to > 0 ? to : from + DEFAULT_ROWS_AFTER_FIRST, from + MAX_ROWS_AFTER_FIRST);
    const rows = [];
    for (let i = from; i <= last; i++) rows.push({ row: i, values: state.P.rows[i - 1 + getDataStart()] });
    return { header: state.header ? state.P.rows[0] || [] : null, total: count, rows };
}

/**
 * Sets one cell, for set_cell (a command that returns the answer for the agent, as the tool
 * API asks).
 * @param {*} row - the row: 1 the first data row, 0 the header row.
 * @param {*} column - the column number from 1, or the header name.
 * @param {string} value - the new value.
 * @returns {string} the answer for the agent.
 * @throws {Error} for an unknown column, a wrong row, or a cell too far past the table's end.
 */
export function setAgentCell(row, column, value) {
    const columnIndex = getColumnIndex(column);
    if (columnIndex < 0) throw new Error(`No column "${column}" - use a number from 1 or a header name.`);
    const rowNumber = Math.round(+row);
    if (!(rowNumber >= 0) || (rowNumber === 0 && !state.header)) throw new Error('Rows are counted from 1 (0 is the header row).');
    updateTableNow();
    // A huge number would build every row or column up to it.
    const rowCount = state.P.rows.length - getDataStart();
    if (!Number.isFinite(rowNumber) || rowNumber > rowCount + MAX_GROWTH) throw new Error(`Row ${row} is too far past the table's end (it has ${rowCount} rows; at most ${MAX_GROWTH} more in one call).`);
    if (!Number.isFinite(columnIndex) || columnIndex >= state.P.width + MAX_GROWTH) throw new Error(`Column ${column} is too far past the table's last column (it has ${state.P.width}; at most ${MAX_GROWTH} more).`);
    writeCells([{ rec: rowNumber - 1 + getDataStart(), c: columnIndex, v: value }]);
    return `Row ${rowNumber}, column ${getColumnLetter(columnIndex)} is "${value}".`;
}

/**
 * Adds rows at the end of the table, for add_rows (a command that returns the answer for the
 * agent, as the tool API asks).
 * @param {Array|string} rows - rows as arrays of values, or CSV text.
 * @returns {string} the answer for the agent.
 * @throws {Error} when no rows are given.
 */
export function addAgentRows(rows) {
    const records = typeof rows === 'string' ? parseCsv(rows, state.sep, state.q).rows : Array.isArray(rows) ? rows.map(row => (Array.isArray(row) ? row.map(value => String(value ?? '')) : [String(row ?? '')])) : [];
    if (!records.length) throw new Error('No rows given.');
    editCode(joinRecords(state.code, records.map(values => formatRecord(values, state.sep, state.q)), state.eol));
    return `${records.length} row(s) added; the table has ${state.P.rows.length - getDataStart()} rows.`;
}

/**
 * Returns the user's documents, for list_files.
 * @returns {Array<{name: string, updated: number, open: boolean}>} the documents, most recently changed first.
 */
export function getFileList() {
    return store.getSortedEntries().map(entry => ({ name: entry.name, updated: entry.updated, open: entry.id === state.fileId }));
}

/**
 * Opens a document by name, for open_file. Returns whether there is one (the
 * tool needs to know).
 * @param {string} name - the document's name.
 * @returns {boolean} false when no document has the name.
 */
export function openFileByName(name) {
    const entry = store.findByName(name);
    if (entry && entry.id !== state.fileId) openDocument(entry.id);
    return !!entry;
}

/**
 * Makes and opens a new document, for new_file. A command that returns the name the document
 * got, as the tool needs it.
 * @param {string} name - the wanted name.
 * @param {string} [csv] - the text; a blank table without one.
 * @returns {string|null} the name it got, null when the browser storage is full.
 */
export function createFile(name, csv) {
    return createDocument(name || AI_DOCUMENT_NAME, csv || BLANK_CODE) && state.name;
}
