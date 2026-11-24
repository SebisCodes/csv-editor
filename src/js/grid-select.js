/**
 * Selecting in the table: the active cell, the range from the anchor to it, scrolling a cell
 * into sight, and selecting everything.
 */

import {
    ROW_HEIGHT, HEAD_HEIGHT, NUMBER_WIDTH, getDataCount, getTableWidth, getTopRow, getColumnWidth, getClampedRow,
    getClampedColumn, getActiveRecord,
} from './grid-view.js?v=3';
import { renderGrid } from './grid-render.js?v=4';

/** Pixels kept between a cell scrolled into sight and the edge. */
const SCROLL_MARGIN = 2;

/**
 * How setActiveCell() moves.
 * @typedef {object} ActiveOptions
 * @property {boolean} [extend] - true to keep the anchor (Shift: the range grows).
 * @property {boolean} [scroll] - false to leave the scroll position as it is.
 * @property {boolean} [quiet] - true to leave the editor uninformed.
 */

/**
 * Makes a cell the active one (kept inside the table), draws the table and tells the editor.
 * @param {import('./grid-view.js').GridView} view - the view state.
 * @param {number} row - the view row.
 * @param {number} column - the column.
 * @param {ActiveOptions} [options] - extend, scroll and quiet.
 * @returns {void}
 */
export function setActiveCell(view, row, column, { extend = false, scroll = true, quiet = false } = {}) {
    view.active = { r: getClampedRow(view, row), c: getClampedColumn(view, column) };
    if (!extend) view.anchor = { ...view.active };
    if (scroll) showCell(view, view.active.r, view.active.c);
    renderGrid(view);
    if (!quiet) view.context.selected(getActiveRecord(view), view.active.c);
}

/**
 * Scrolls the table so a cell is in sight below the header and right of the row numbers.
 * @param {import('./grid-view.js').GridView} view - the view state.
 * @param {number} row - the view row (the header row is always in sight).
 * @param {number} column - the column.
 * @returns {void}
 */
function showCell(view, row, column) {
    const element = view.element;
    if (row >= 0) {
        const y = HEAD_HEIGHT + row * ROW_HEIGHT;
        if (y < element.scrollTop + HEAD_HEIGHT) element.scrollTop = y - HEAD_HEIGHT;
        else if (y + ROW_HEIGHT > element.scrollTop + element.clientHeight) element.scrollTop = y + ROW_HEIGHT - element.clientHeight + SCROLL_MARGIN;
    }
    const x = NUMBER_WIDTH + view.lefts[column], width = getColumnWidth(view, column);
    if (x < element.scrollLeft + NUMBER_WIDTH) element.scrollLeft = x - NUMBER_WIDTH;
    else if (x + width > element.scrollLeft + element.clientWidth) element.scrollLeft = x + width - element.clientWidth + SCROLL_MARGIN;
}

/**
 * Selects the whole table, the header row included.
 * @param {import('./grid-view.js').GridView} view - the view state.
 * @returns {void}
 */
export function selectAll(view) {
    view.anchor = { r: getTopRow(view), c: 0 };
    view.active = { r: Math.max(getDataCount(view) - 1, getTopRow(view)), c: Math.max(0, getTableWidth(view) - 1) };
    renderGrid(view);
}

/**
 * Keeps the active cell and the anchor inside the table after the table changed, and draws it.
 * @param {import('./grid-view.js').GridView} view - the view state.
 * @returns {void}
 */
export function updateSelection(view) {
    view.active.r = getClampedRow(view, view.active.r);
    view.active.c = getClampedColumn(view, view.active.c);
    view.anchor.r = getClampedRow(view, view.anchor.r);
    view.anchor.c = getClampedColumn(view, view.anchor.c);
    renderGrid(view);
}
