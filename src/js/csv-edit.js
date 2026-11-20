/**
 * Changes of the CSV text: cells set in place, records reordered or replaced, records added
 * at the end, and every record rewritten from its raw fields. The raw text of every record and
 * field that does not change stays as it is, quoting and line endings included.
 */

import { readRecord, formatField, formatRecord } from './csv.js?v=4';

/**
 * A cell to set in the text.
 * @typedef {object} TextCell
 * @property {number} r - the record (past the last one: a new record).
 * @property {number} c - the column.
 * @property {string} v - the new value.
 */

/**
 * Returns the text with patches applied.
 * @param {string} text - the text.
 * @param {Array<Array<*>>} patches - [start, end, replacement] that do not overlap, in any order.
 * @returns {string} the changed text.
 */
function getPatchedText(text, patches) {
    const sorted = patches.slice().sort((x, y) => x[0] - y[0]);
    const out = [];
    let last = 0;
    for (const [start, end, replacement] of sorted) { out.push(text.slice(last, start), replacement); last = end; }
    out.push(text.slice(last));
    return out.join('');
}

/**
 * Returns the text with its records in a new order or replaced. Each place keeps the line
 * ending of the record that stood there; the last record keeps the ending of the last record
 * of the text (so a file without a final line break keeps it that way).
 * @param {string} text - the text.
 * @param {import('./csv.js').ParsedTable} table - the text as read.
 * @param {Array<number|string>} order - record indices (their raw text is kept) or strings (a new record).
 * @param {string} eol - the line ending for places the text does not have.
 * @returns {string} the new text.
 */
export function buildReorderedText(text, table, order, eol) {
    const count = table.starts.length;
    /**
     * Returns the line ending after a record.
     * @param {number} i - the record.
     * @returns {string} the line ending, "" at the end of a text without a final one.
     */
    const getEnding = i => text.slice(table.ends[i], i + 1 < count ? table.starts[i + 1] : text.length);
    const lastEnding = count ? getEnding(count - 1) : eol;
    const out = [];
    for (let place = 0; place < order.length; place++) {
        const item = order[place];
        out.push(typeof item === 'number' ? text.slice(table.starts[item], table.ends[item]) : item);
        out.push(place === order.length - 1 ? lastEnding : place < count - 1 ? getEnding(place) || eol : eol);
    }
    return out.join('');
}

/**
 * Returns the text with cells set: a field that exists is replaced in place, missing fields
 * are added at the end of their record, and cells past the last record become new records.
 * @param {string} text - the text.
 * @param {import('./csv.js').ParsedTable} table - the text as read.
 * @param {TextCell[]} cells - the cells to set.
 * @param {import('./csv.js').WriteFormat} format - separator, quote character and line ending.
 * @returns {string} the new text.
 */
export function getTextWithCells(text, table, cells, { sep, q, eol }) {
    const count = table.starts.length;
    const byRow = getCellsByRow(cells);
    const patches = [];
    const newRows = [];
    for (const [row, rowCells] of byRow) {
        if (row >= count) { newRows.push([row, rowCells]); continue; }
        patches.push(...getRecordPatches(text, table.starts[row], rowCells, sep, q));
    }
    const patched = getPatchedText(text, patches);
    return newRows.length ? joinRecords(patched, formatNewRecords(newRows, count, sep, q), eol) : patched;
}

/**
 * Returns cells grouped by their record, in the order of their first cell.
 * @param {TextCell[]} cells - the cells.
 * @returns {Map<number, TextCell[]>} the cells of each record.
 */
function getCellsByRow(cells) {
    const byRow = new Map();
    for (const cell of cells) { if (!byRow.has(cell.r)) byRow.set(cell.r, []); byRow.get(cell.r).push(cell); }
    return byRow;
}

/**
 * Returns the patches that set cells of one record of the text.
 * @param {string} text - the text.
 * @param {number} start - where the record starts.
 * @param {TextCell[]} rowCells - the cells of this record.
 * @param {string} sep - the separator.
 * @param {string} q - the quote character.
 * @returns {Array<Array<*>>} [start, end, replacement] patches.
 */
function getRecordPatches(text, start, rowCells, sep, q) {
    const record = readRecord(text, start, sep, q, true);
    const sorted = rowCells.slice().sort((a, b) => a.c - b.c);
    const patches = [];
    let tail = '', fieldCount = record.spans.length;
    for (const { c, v } of sorted) {
        if (c < record.spans.length) {
            const [fieldStart, fieldEnd] = record.spans[c];
            if (record.values[c] !== v) patches.push([fieldStart, fieldEnd, formatField(v, sep, q)]);
        } else {
            if (v === '') continue;
            tail += sep.repeat(c - fieldCount + 1) + formatField(v, sep, q);
            fieldCount = c + 1;
        }
    }
    if (tail) patches.push([record.end, record.end, tail]);
    return patches;
}

/**
 * Returns the new records for cells past the last record; records between them stay empty.
 * @param {Array<Array<*>>} newRows - [record index, cells] pairs.
 * @param {number} count - the number of records of the text.
 * @param {string} sep - the separator.
 * @param {string} q - the quote character.
 * @returns {string[]} the records without line endings.
 */
function formatNewRecords(newRows, count, sep, q) {
    const last = newRows.reduce((most, [row]) => Math.max(most, row), -1);
    const byRow = new Map(newRows);                       // one lookup per row, not a search through all of them
    const records = [];
    for (let row = count; row <= last; row++) {
        const rowCells = byRow.get(row) || [];
        const width = rowCells.reduce((most, cell) => Math.max(most, cell.c + 1), 0);
        const values = Array(width).fill('');
        for (const { c, v } of rowCells) values[c] = v;
        records.push(formatRecord(values, sep, q));
    }
    return records;
}

/**
 * Returns the text with raw records added at its end.
 * @param {string} text - the text.
 * @param {string[]} records - the records without line endings.
 * @param {string} eol - the line ending.
 * @returns {string} the new text; it ends with a line break when the text did or was empty.
 */
export function joinRecords(text, records, eol) {
    if (!records.length) return text;
    if (!text) return records.join(eol) + eol;
    const endsWithBreak = /[\r\n]$/.test(text);
    return endsWithBreak ? text + records.join(eol) + eol : text + eol + records.join(eol);
}

/**
 * Returns the text with every record rewritten from its raw fields.
 * @param {string} text - the text.
 * @param {import('./csv.js').ParsedTable} table - the text as read.
 * @param {string} sep - the separator.
 * @param {string} q - the quote character.
 * @param {string} eol - the line ending for places the text does not have.
 * @param {function(string[], number, string[]): (string[]|null)} convertFields - gets the raw
 *   fields, the record index and the values; returns the new raw fields, or null to keep the record.
 * @returns {string} the new text.
 */
export function convertRecords(text, table, sep, q, eol, convertFields) {
    const order = [];
    for (let i = 0; i < table.starts.length; i++) {
        const record = readRecord(text, table.starts[i], sep, q, true);
        const rawFields = record.spans.map(([start, end]) => text.slice(start, end));
        const converted = convertFields(rawFields, i, record.values);
        order.push(converted == null ? i : converted.join(sep));
    }
    return buildReorderedText(text, table, order, eol);
}
