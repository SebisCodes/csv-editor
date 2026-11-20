/**
 * Drawing the table: the surface has the size of the whole table, but only the header and
 * the rows in sight are in the page, so 100 000 rows stay quick.
 */

import { escapeHtml } from './csv.js?v=4';
import { getColumnLetter } from './values.js?v=3';
import {
    ROW_HEIGHT, HEAD_HEIGHT, NUMBER_WIDTH, getDataCount, getTableWidth, getRecordOf, getColumnWidth, getSelectionRange,
} from './grid-view.js?v=2';

/** Rows drawn above and below the ones in sight. */
const EXTRA_ROWS = 3;
/** The height assumed before the table has one. */
const DEFAULT_HEIGHT = 600;
/** The least width of the edit field. */
const MIN_FIELD_WIDTH = 140;
const SORT_UP = '▲';
const SORT_DOWN = '▼';
const SORT_NONE = '⇅';
const NEW_ROW_MARK = '＋';
/** How a line break inside a cell is shown. */
const LINE_BREAK_MARK = '<i class="nl">↵</i>';

/**
 * Returns a value as HTML with its line breaks shown as a mark.
 * @param {*} value - the value.
 * @returns {string} the HTML.
 */
function formatCellHtml(value) {
    return escapeHtml(value).replace(/\r\n|\r|\n/g, LINE_BREAK_MARK);
}

/**
 * Sets the left edge of each column and the size of the surface.
 * @param {import('./grid-view.js').GridView} view - the view state.
 * @returns {void}
 */
function updateGridLayout(view) {
    const width = getTableWidth(view);
    view.lefts = [0];
    for (let c = 0; c <= width; c++) view.lefts.push(view.lefts[c] + getColumnWidth(view, c));
    view.area.style.width = NUMBER_WIDTH + view.lefts[width + 1] + 'px';
    view.area.style.height = HEAD_HEIGHT + (getDataCount(view) + 1) * ROW_HEIGHT + 'px';
}

/**
 * Draws the header and the rows in sight, with the selection, and places the edit field.
 * @param {import('./grid-view.js').GridView} view - the view state.
 * @returns {void}
 */
export function renderGrid(view) {
    updateGridLayout(view);
    const range = getSelectionRange(view);
    view.head.innerHTML = formatHeaderHtml(view, range);
    view.head.style.width = view.area.style.width;
    const top = view.element.scrollTop, height = view.element.clientHeight || DEFAULT_HEIGHT;
    const first = Math.max(0, Math.floor(top / ROW_HEIGHT) - EXTRA_ROWS);
    const last = Math.min(getDataCount(view), Math.ceil((top + height) / ROW_HEIGHT) + EXTRA_ROWS);
    let rows = '';
    for (let r = first; r <= last; r++) rows += formatRowHtml(view, r, range);
    view.body.innerHTML = rows;
    moveEditField(view);
}

/**
 * Tells whether a cell is in the selected range.
 * @param {import('./grid-view.js').ViewRange} range - the selected range.
 * @param {number} row - the view row.
 * @param {number} column - the column.
 * @returns {boolean} true inside the range.
 */
function isSelected(range, row, column) {
    return row >= range.r1 && row <= range.r2 && column >= range.c1 && column <= range.c2;
}

/**
 * Returns the HTML of the header row: the corner, the column heads with their letters, names,
 * sort arrows and resize handles, and the empty column.
 * @param {import('./grid-view.js').GridView} view - the view state.
 * @param {import('./grid-view.js').ViewRange} range - the selected range.
 * @returns {string} the HTML.
 */
function formatHeaderHtml(view, range) {
    const { S, context, active } = view;
    const width = getTableWidth(view);
    const names = S.header ? S.P.rows[0] || [] : [];
    let html = `<span class="corner" title="${context.t('Select everything (Ctrl+A)')}" data-all></span>`;
    for (let c = 0; c <= width; c++) {
        const isNewColumn = c === width;
        const name = S.header && !isNewColumn ? names[c] ?? '' : '';
        const arrow = S.sort && S.sort.col === c ? (S.sort.dir > 0 ? SORT_UP : SORT_DOWN) : '';
        const classes = ['head-cell'];
        if (isNewColumn) classes.push('empty');
        if (c >= range.c1 && c <= range.c2) classes.push('column-on');
        if (S.header && isSelected(range, -1, c)) classes.push(active.r === -1 && active.c === c ? 'a' : 'b');
        html += `<span class="${classes.join(' ')}" data-h="${c}" style="width:${getColumnWidth(view, c)}px"><small>${getColumnLetter(c)}</small>`
            + `<b>${S.header ? formatCellHtml(name) || (isNewColumn ? '' : `<em>${context.t('(empty)')}</em>`) : ''}</b>`
            + (isNewColumn ? '' : `<button type="button" class="sort${arrow ? ' on' : ''}" data-sort="${c}" tabindex="-1" title="${context.t('Sort the view by this column')}">${arrow || SORT_NONE}</button><span class="drag" data-resize="${c}"></span>`)
            + '</span>';
    }
    return html;
}

/**
 * Returns the HTML of one view row: its number and its cells.
 * @param {import('./grid-view.js').GridView} view - the view state.
 * @param {number} row - the view row.
 * @param {import('./grid-view.js').ViewRange} range - the selected range.
 * @returns {string} the HTML.
 */
function formatRowHtml(view, row, range) {
    const { S, context, active } = view;
    const width = getTableWidth(view);
    const isNewRow = row === getDataCount(view);
    const record = getRecordOf(view, row);
    const values = isNewRow ? [] : S.P.rows[record] || [];
    const number = isNewRow ? NEW_ROW_MARK : record - (S.header ? 0 : -1);
    let cells = '';
    for (let c = 0; c <= width; c++) {
        const classes = ['z'];
        if (S.colType[c] === 'number') classes.push('number');
        if (c === width || isNewRow) classes.push('empty');
        if (isSelected(range, row, c)) classes.push(active.r === row && active.c === c ? 'a' : 'b');
        if (!isNewRow && c >= values.length && c < width) classes.push('missing');
        cells += `<span class="${classes.join(' ')}" data-c="${c}" style="width:${getColumnWidth(view, c)}px">${c < values.length ? formatCellHtml(values[c]) : ''}</span>`;
    }
    const rowClass = row >= range.r1 && row <= range.r2 ? ' row-on' : '';
    return `<div class="grid-row${rowClass}${isNewRow ? ' new' : ''}" data-r="${row}" style="top:${row * ROW_HEIGHT}px"><span class="num" data-num="${row}" title="${context.t(isNewRow ? 'Type here to add a row' : 'Select the row')}">${number}</span>${cells}</div>`;
}

/**
 * Asks for the table to be drawn at the next animation frame (once, however often it is asked).
 * @param {import('./grid-view.js').GridView} view - the view state.
 * @returns {void}
 */
export function startGridRender(view) {
    if (!view.renderFrame) view.renderFrame = requestAnimationFrame(() => { view.renderFrame = 0; renderGrid(view); });
}

/**
 * Places the edit field over the cell being edited.
 * @param {import('./grid-view.js').GridView} view - the view state.
 * @returns {void}
 */
export function moveEditField(view) {
    if (!view.edit) return;
    const { r, c } = view.edit;
    view.field.style.left = NUMBER_WIDTH + view.lefts[c] + 'px';
    view.field.style.top = (r === -1 ? view.element.scrollTop : HEAD_HEIGHT + r * ROW_HEIGHT) + 'px';
    view.field.style.width = Math.max(getColumnWidth(view, c), MIN_FIELD_WIDTH) + 'px';
}
