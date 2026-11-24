/**
 * Pointer and keyboard in the table: selecting cells, rows and columns, dragging a range,
 * resizing a column, the sort arrows, moving with the arrow keys, Home, End and the page keys,
 * and starting an edit (a double press, Enter, F2 or typing).
 */

import { getDataCount, getTableWidth, getTopRow, getColumnWidth, getPageRowCount, getRecordOf, getActiveRecord } from './grid-view.js?v=3';
import { renderGrid, startGridRender } from './grid-render.js?v=4';
import { setActiveCell, selectAll } from './grid-select.js?v=4';
import { startEdit, stopEdit } from './grid-edit.js?v=4';
import { clearSelection } from './grid-clipboard.js?v=3';

/** A second press on the same cell or column head within this time is a double-click. */
const DOUBLE_PRESS_TIME = 450;
const MIN_COLUMN_WIDTH = 40;
const MAX_COLUMN_WIDTH = 800;

/**
 * Tells whether a press is the second one on the same target in a short time.
 * pointerdown prevents the mouse events, so the browser's dblclick does not come.
 * @param {import('./grid-view.js').GridView} view - the view state.
 * @param {string} key - the target: "h<column>" or "<row>:<column>".
 * @returns {boolean} true for the second press.
 */
function isDoublePress(view, key) {
    return view.lastDown.key === key && Date.now() - view.lastDown.t < DOUBLE_PRESS_TIME;
}

/**
 * Sets the last press, so the next one can be told apart as a double press; the second press of a
 * double press starts the count anew.
 * @param {import('./grid-view.js').GridView} view - the view state.
 * @param {string} key - the target: "h<column>" or "<row>:<column>".
 * @param {boolean} wasDouble - true when this press is the second one.
 * @returns {void}
 */
function setLastPress(view, key, wasDouble) {
    view.lastDown = { t: wasDouble ? 0 : Date.now(), key };
}

/**
 * Connects the pointer: presses on cells, row numbers, column heads, the corner, sort arrows
 * and resize handles, and dragging a range.
 * @param {import('./grid-view.js').GridView} view - the view state.
 * @returns {void}
 */
export function connectPointer(view) {
    const element = view.element;
    element.addEventListener('pointerdown', event => handlePointerDown(view, event));
    element.addEventListener('pointermove', event => expandDragSelection(view, event));
    element.addEventListener('pointerup', () => { if (view.dragging) { view.dragging = false; view.context.selected(getActiveRecord(view), view.active.c); } });
    element.addEventListener('click', event => {
        const sortButton = event.target.closest('[data-sort]');
        if (sortButton) view.context.sortBy(+sortButton.dataset.sort);
    });
}

/**
 * While the pointer drags a range, makes the cell under it the active one (a pointermove handler).
 * @param {import('./grid-view.js').GridView} view - the view state.
 * @param {PointerEvent} event - the pointer move.
 * @returns {void}
 */
function expandDragSelection(view, event) {
    if (!view.dragging) return;
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const cell = target && target.closest && target.closest('.grid [data-c]');
    if (!cell) return;
    const r = +cell.parentElement.dataset.r, c = +cell.dataset.c;
    if (r !== view.active.r || c !== view.active.c) { view.active = { r, c }; renderGrid(view); }
}

/**
 * Routes a press in the table to what was pressed (a pointerdown handler).
 * @param {import('./grid-view.js').GridView} view - the view state.
 * @param {PointerEvent} event - the press.
 * @returns {void}
 */
function handlePointerDown(view, event) {
    if (event.button !== 0 || event.target === view.field) return;
    const handle = event.target.closest('[data-resize]');
    if (handle) { resizeColumn(view, event, +handle.dataset.resize); return; }
    if (event.target.closest('[data-sort]')) { event.preventDefault(); return; }
    if (view.edit) stopEdit(view, true);
    if (event.target.closest('[data-all]')) { event.preventDefault(); view.element.focus(); selectAll(view); return; }
    const head = event.target.closest('[data-h]');
    if (head) { selectColumn(view, event, +head.dataset.h); return; }
    const numberCell = event.target.closest('[data-num]');
    if (numberCell) { selectRow(view, event, +numberCell.dataset.num); return; }
    const cell = event.target.closest('[data-c]');
    if (cell) selectCell(view, event, cell);
}

/**
 * Selects a column from a press on its head; a double press on a header name edits it.
 * @param {import('./grid-view.js').GridView} view - the view state.
 * @param {PointerEvent} event - the press.
 * @param {number} column - the column.
 * @returns {void}
 */
function selectColumn(view, event, column) {
    event.preventDefault();
    view.element.focus({ preventScroll: true });
    const doublePress = isDoublePress(view, 'h' + column);
    setLastPress(view, 'h' + column, doublePress);
    if (doublePress && view.S.header && column < getTableWidth(view) && !event.shiftKey) {
        setActiveCell(view, -1, column, { scroll: false });
        startEdit(view);
        return;
    }
    const bottom = Math.max(getDataCount(view) - 1, getTopRow(view));
    if (event.shiftKey) { view.active = { r: getTopRow(view), c: view.active.c }; view.anchor = { r: bottom, c: column }; }
    else { view.active = { r: getTopRow(view), c: column }; view.anchor = { r: bottom, c: column }; }
    renderGrid(view);
    view.context.selected(view.S.header ? 0 : -1, view.active.c);
}

/**
 * Selects a row from a press on its number (Shift: up to the anchor's row).
 * @param {import('./grid-view.js').GridView} view - the view state.
 * @param {PointerEvent} event - the press.
 * @param {number} row - the view row.
 * @returns {void}
 */
function selectRow(view, event, row) {
    event.preventDefault();
    view.element.focus({ preventScroll: true });
    view.anchor = { r: event.shiftKey ? view.anchor.r : row, c: Math.max(0, getTableWidth(view) - 1) };
    view.active = { r: row, c: 0 };
    renderGrid(view);
    view.context.selected(row < getDataCount(view) ? getRecordOf(view, row) : -1, 0);
}

/**
 * Selects a cell from a press on it and starts dragging a range; a double press on the active
 * cell edits it with the cursor at the pressed character.
 * @param {import('./grid-view.js').GridView} view - the view state.
 * @param {PointerEvent} event - the press.
 * @param {HTMLElement} cell - the pressed cell.
 * @returns {void}
 */
function selectCell(view, event, cell) {
    event.preventDefault();
    view.element.focus({ preventScroll: true });
    const r = +cell.parentElement.dataset.r, c = +cell.dataset.c;
    const doublePress = isDoublePress(view, r + ':' + c);
    setLastPress(view, r + ':' + c, doublePress);
    if (doublePress && !event.shiftKey && r === view.active.r && c === view.active.c) { startEdit(view, undefined, cell, event.clientX, event.clientY); return; }
    setActiveCell(view, r, c, { extend: event.shiftKey, scroll: false });
    view.dragging = true;
    view.element.setPointerCapture(event.pointerId);
}

/**
 * Lets the user drag a column's width (40 to 800 pixels).
 * @param {import('./grid-view.js').GridView} view - the view state.
 * @param {PointerEvent} event - the press on the resize handle.
 * @param {number} column - the column.
 * @returns {void}
 */
function resizeColumn(view, event, column) {
    event.preventDefault();
    const startX = event.clientX, startWidth = getColumnWidth(view, column);
    /**
     * Sets the column's width from the pointer.
     * @param {PointerEvent} moveEvent - the pointer move.
     * @returns {void}
     */
    const moveEdge = moveEvent => { view.S.colW[column] = Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, startWidth + moveEvent.clientX - startX)); startGridRender(view); };
    /**
     * Stops following the pointer.
     * @returns {void}
     */
    const stopResize = () => { removeEventListener('pointermove', moveEdge); removeEventListener('pointerup', stopResize); };
    addEventListener('pointermove', moveEdge);
    addEventListener('pointerup', stopResize);
}

/**
 * Connects the keyboard of the table (not of the edit field).
 * @param {import('./grid-view.js').GridView} view - the view state.
 * @returns {void}
 */
export function connectKeys(view) {
    view.element.addEventListener('keydown', event => {
        if (event.target === view.field) return;
        runTableKey(view, event);
    });
}

/**
 * Handles a key in the table: arrows, Home, End and the page keys move (Ctrl to the edge,
 * Shift extends the range), Tab and Enter move or edit, F2 edits, Escape drops the range,
 * Delete clears, Ctrl+A selects everything and a typed character starts an edit.
 * @param {import('./grid-view.js').GridView} view - the view state.
 * @param {KeyboardEvent} event - the key.
 * @returns {void}
 */
function runTableKey(view, event) {
    const ctrl = event.ctrlKey || event.metaKey;
    const { r, c } = view.active;
    const lastRow = getDataCount(view) - 1, lastColumn = getTableWidth(view) - 1;
    /**
     * Moves the active cell for this key; Shift extends the range.
     * @param {number} row - the new view row.
     * @param {number} column - the new column.
     * @returns {void}
     */
    const moveTo = (row, column) => { event.preventDefault(); setActiveCell(view, row, column, { extend: event.shiftKey }); };
    switch (event.key) {
        case 'ArrowDown': return moveTo(ctrl ? lastRow : r + 1, c);
        case 'ArrowUp': return moveTo(ctrl ? getTopRow(view) : r - 1, c);
        case 'ArrowRight': return moveTo(r, ctrl ? lastColumn : c + 1);
        case 'ArrowLeft': return moveTo(r, ctrl ? 0 : c - 1);
        case 'Home': return moveTo(ctrl ? getTopRow(view) : r, 0);
        case 'End': return moveTo(ctrl ? lastRow : r, Math.max(0, lastColumn));
        case 'PageDown': return moveTo(r + getPageRowCount(view), c);
        case 'PageUp': return moveTo(r - getPageRowCount(view), c);
        case 'Tab': event.preventDefault(); setActiveCell(view, r, c + (event.shiftKey ? -1 : 1)); return;
        case 'Enter': event.preventDefault(); if (event.shiftKey) setActiveCell(view, r - 1, c); else startEdit(view); return;
        case 'F2': event.preventDefault(); startEdit(view); return;
        case 'Escape': if (view.anchor.r !== view.active.r || view.anchor.c !== view.active.c) { event.preventDefault(); view.anchor = { ...view.active }; renderGrid(view); } return;
        case 'Delete': case 'Backspace': event.preventDefault(); clearSelection(view); return;
    }
    if (ctrl && (event.key === 'a' || event.key === 'A')) { event.preventDefault(); selectAll(view); return; }
    if (!ctrl && !event.altKey && event.key.length === 1 && !event.isComposing) { event.preventDefault(); startEdit(view, event.key); }
}
