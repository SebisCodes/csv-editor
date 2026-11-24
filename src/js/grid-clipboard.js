/**
 * Copy, cut, paste and clearing in the table. The clipboard holds the selected range as TSV,
 * as spreadsheet programs use it; a pasted block of TSV fills the cells from the active one,
 * one value fills the whole selected range.
 */

import { parseCsv } from './csv.js?v=4';
import { hasLink } from './ai-links.js?v=2';
import { getDataCount, getRecordOf, getValueAt, getSelectionRange } from './grid-view.js?v=3';

/**
 * Returns the cells of a range, made by a function.
 * @param {import('./grid-view.js').ViewRange} range - the range.
 * @param {function(number, number): *} createCell - makes the cell of a view row and column.
 * @returns {Array<*>} the cells row by row.
 */
function getRangeCells(range, createCell) {
    const cells = [];
    for (let r = range.r1; r <= range.r2; r++) for (let c = range.c1; c <= range.c2; c++) cells.push(createCell(r, c));
    return cells;
}

/**
 * Empties the selected cells (the header row's too, never the empty row).
 * @param {import('./grid-view.js').GridView} view - the view state.
 * @returns {void}
 */
export function clearSelection(view) {
    const range = getSelectionRange(view);
    const cells = getRangeCells(range, (r, c) => ({ rec: getRecordOf(view, r), c, v: '' })).filter((cell, index) => {
        const row = range.r1 + Math.floor(index / (range.c2 - range.c1 + 1));
        return row < getDataCount(view) || row === -1;
    });
    if (cells.length) view.context.write(cells);
}

/**
 * Returns a value as a TSV field: quoted when it holds a tab, a line break or a quote.
 * @param {string} value - the value.
 * @returns {string} the field.
 */
function formatTsvField(value) {
    return /[\t\n\r"]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
}

/**
 * Returns the selected range as TSV (the empty row left out).
 * @param {import('./grid-view.js').GridView} view - the view state.
 * @returns {string} the rows joined by line breaks.
 */
function getSelectionTsv(view) {
    const range = getSelectionRange(view);
    const lastData = getDataCount(view) - 1;
    const lines = [];
    for (let r = range.r1; r <= Math.min(range.r2, lastData < range.r1 ? range.r2 : lastData); r++) {
        const fields = [];
        for (let c = range.c1; c <= range.c2; c++) fields.push(formatTsvField(getValueAt(view, r, c)));
        lines.push(fields.join('\t'));
    }
    return lines.join('\n');
}

/**
 * Writes pasted text into the table: one value fills the selected range, a block of TSV fills
 * the cells from the selection's first cell and is selected.
 * @param {import('./grid-view.js').GridView} view - the view state.
 * @param {string} text - the pasted text.
 * @returns {void}
 */
function importPastedText(view, text) {
    const block = /[\t\r\n]/.test(text) ? parseCsv(text.replace(/(\r\n|\n|\r)$/, '') + '\n', '\t', '"').rows : [[text]];
    if (!block.length) return;
    const range = getSelectionRange(view);
    const cells = [];
    if (block.length === 1 && block[0].length === 1 && (range.r2 > range.r1 || range.c2 > range.c1)) {
        for (let r = range.r1; r <= Math.min(range.r2, getDataCount(view)); r++) for (let c = range.c1; c <= range.c2; c++) cells.push({ rec: getRecordOf(view, r), c, v: block[0][0] });
    } else {
        for (let i = 0; i < block.length; i++) for (let j = 0; j < block[i].length; j++) cells.push({ rec: getRecordOf(view, range.r1 + i), c: range.c1 + j, v: block[i][j] });
        view.anchor = { r: range.r1, c: range.c1 };
        view.active = { r: range.r1 + block.length - 1, c: range.c1 + Math.max(...block.map(row => row.length)) - 1 };
    }
    view.context.write(cells);
    view.context.toast(cells.length === 1 ? 'Pasted into 1 cell' : `Pasted into ${cells.length} cells`);
}

/**
 * Connects copy, cut and paste while the table has the focus. Paste listens in the capture
 * phase so it comes first; an AI's answer with links is left to ai.js.
 * @param {import('./grid-view.js').GridView} view - the view state.
 * @returns {void}
 */
export function connectClipboard(view) {
    document.addEventListener('copy', event => copySelection(view, event));
    document.addEventListener('cut', event => moveSelectionToClipboard(view, event));
    document.addEventListener('paste', event => setSelectionFromClipboard(view, event), true);
}

/**
 * Tells whether the table has the focus.
 * @param {import('./grid-view.js').GridView} view - the view state.
 * @returns {boolean} true when it has.
 */
function isFocused(view) {
    return document.activeElement === view.element;
}

/**
 * Puts the selected range on the clipboard as TSV (a copy handler).
 * @param {import('./grid-view.js').GridView} view - the view state.
 * @param {ClipboardEvent} event - the copy.
 * @returns {void}
 */
function copySelection(view, event) {
    if (!isFocused(view)) return;
    event.preventDefault();
    event.clipboardData.setData('text/plain', getSelectionTsv(view));
    const range = getSelectionRange(view);
    const count = (range.r2 - range.r1 + 1) * (range.c2 - range.c1 + 1);
    view.context.toast(count === 1 ? 'Cell copied' : `${count} cells copied`);
}

/**
 * Puts the selected range on the clipboard as TSV and empties it (a cut handler).
 * @param {import('./grid-view.js').GridView} view - the view state.
 * @param {ClipboardEvent} event - the cut.
 * @returns {void}
 */
function moveSelectionToClipboard(view, event) {
    if (!isFocused(view)) return;
    event.preventDefault();
    event.clipboardData.setData('text/plain', getSelectionTsv(view));
    clearSelection(view);
}

/**
 * Writes pasted text into the table; an AI's answer with links is left to ai.js (a paste
 * handler in the capture phase).
 * @param {import('./grid-view.js').GridView} view - the view state.
 * @param {ClipboardEvent} event - the paste.
 * @returns {void}
 */
function setSelectionFromClipboard(view, event) {
    if (!isFocused(view)) return;
    const text = event.clipboardData.getData('text/plain');
    if (!text || hasLink(text)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    importPastedText(view, text);
}
