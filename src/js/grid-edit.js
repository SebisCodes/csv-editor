/**
 * Editing a cell in place: a field over the cell. Typing starts the edit with that character;
 * a second click puts the cursor on the clicked character, Enter and F2 at the end. Enter and
 * Tab write the value and move on, Alt+Enter adds a line break, Escape drops the edit; every
 * written value goes to the editor as one list of cells (one undo step).
 */

import { getDataCount, getRecordOf, getValueAt } from './grid-view.js?v=2';
import { renderGrid, moveEditField } from './grid-render.js?v=3';
import { setActiveCell } from './grid-select.js?v=3';

/** The most lines the edit field grows to. */
const MAX_FIELD_LINES = 8;
const FIELD_LINE_HEIGHT = 18;
const FIELD_PADDING = 8;

/**
 * A place in the text of an element.
 * @typedef {object} TextPlace
 * @property {Text} node - the text node.
 * @property {number} offset - the offset in it.
 */

/**
 * Returns the text position under a point inside an element, from the boxes of its characters.
 * Unlike caretPositionFromPoint this also holds in pages shown with CSS zoom. Beside the
 * characters (right of a line's end, in the space between lines) the nearest character within
 * about a line counts, so a click right of a line's end lands at its end.
 * @param {HTMLElement} element - the element.
 * @param {number} x - the point's x in the viewport.
 * @param {number} y - the point's y in the viewport.
 * @returns {TextPlace|null} the place before the character under the point, or after it on its
 *   right half; null when no character of the element is that near.
 */
function findCharAt(element, x, y) {
    const doc = element.ownerDocument;
    const walker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const range = doc.createRange();
    let best = null, bestDy = Infinity, bestDx = Infinity;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        for (let i = 0; i < node.length; i++) {
            range.setStart(node, i);
            range.setEnd(node, i + 1);
            for (const box of range.getClientRects()) {
                const dy = y < box.top ? box.top - y : y > box.bottom ? y - box.bottom : 0;
                if (dy > box.height) continue;                                       // another line
                const offset = x < box.left + box.width / 2 ? i : i + 1;
                if (!dy && x >= box.left && x <= box.right) return { node, offset };
                const dx = x < box.left ? box.left - x : x > box.right ? x - box.right : 0;
                if (dy < bestDy || (dy === bestDy && dx < bestDx)) { bestDy = dy; bestDx = dx; best = { node, offset }; }
            }
        }
    }
    return best;
}

/**
 * Returns the number of characters before the place findCharAt() finds, counted from the
 * start of the element's text.
 * @param {HTMLElement} element - the element.
 * @param {number} x - the point's x in the viewport.
 * @param {number} y - the point's y in the viewport.
 * @returns {number|null} the character index, null when no character is near.
 */
function getCharIndexAt(element, x, y) {
    const place = findCharAt(element, x, y);
    if (!place) return null;
    const range = element.ownerDocument.createRange();
    range.selectNodeContents(element);
    range.setEnd(place.node, place.offset);
    return range.toString().length;
}

/**
 * Starts editing the active cell.
 * @param {import('./grid-view.js').GridView} view - the view state.
 * @param {string} [initial] - the character typed to start, which replaces the value.
 * @param {HTMLElement} [cellElement] - the clicked cell, to put the cursor on the clicked character.
 * @param {number} [x] - the click's x in the viewport.
 * @param {number} [y] - the click's y in the viewport.
 * @returns {void}
 */
export function startEdit(view, initial, cellElement, x, y) {
    if (view.edit) return;
    const { r, c } = view.active;
    const before = r < getDataCount(view) || r === -1 ? getValueAt(view, r, c) : '';
    const clickedIndex = initial == null && cellElement && x != null ? getCharIndexAt(cellElement, x, y) : null;
    view.edit = { r, c, before };
    const field = view.field;
    field.hidden = false;
    field.value = initial ?? before;
    moveEditField(view);
    field.focus({ preventScroll: true });
    const cursor = clickedIndex == null ? field.value.length : Math.max(0, Math.min(field.value.length, clickedIndex));
    field.setSelectionRange(cursor, cursor);
    resizeEditField(view);
}

/**
 * Sets the height of the edit field to its lines (at most 8).
 * @param {import('./grid-view.js').GridView} view - the view state.
 * @returns {void}
 */
function resizeEditField(view) {
    const lines = Math.min(MAX_FIELD_LINES, view.field.value.split('\n').length);
    view.field.style.height = (lines * FIELD_LINE_HEIGHT + FIELD_PADDING) + 'px';
}

/**
 * Ends the edit, writes the value when asked and it changed, then moves the active cell.
 * @param {import('./grid-view.js').GridView} view - the view state.
 * @param {boolean} keep - true to write the value.
 * @param {number} [rowStep] - rows to move after the edit.
 * @param {number} [columnStep] - columns to move after the edit.
 * @returns {void}
 */
export function stopEdit(view, keep, rowStep = 0, columnStep = 0) {
    if (!view.edit) return;
    const edit = view.edit;
    view.edit = null;
    const value = view.field.value;
    view.field.hidden = true;
    view.element.focus({ preventScroll: true });
    if (keep && value !== edit.before) view.context.write([{ rec: getRecordOf(view, edit.r), c: edit.c, v: value }]);
    if (rowStep || columnStep) setActiveCell(view, edit.r + rowStep, edit.c + columnStep);
    else renderGrid(view);
}

/**
 * Connects the edit field: it grows with its lines, keys end or extend the edit, and leaving
 * it writes the value.
 * @param {import('./grid-view.js').GridView} view - the view state.
 * @returns {void}
 */
export function connectEditField(view) {
    const field = view.field;
    field.addEventListener('input', () => resizeEditField(view));
    field.addEventListener('keydown', event => runFieldKey(view, event));
    field.addEventListener('blur', () => { if (view.edit) stopEdit(view, true); });
}

/**
 * Handles a key in the edit field: Escape drops the edit, Alt+Enter adds a line break, Enter
 * and Tab write the value and move (Shift: back); other keys stay in the field.
 * @param {import('./grid-view.js').GridView} view - the view state.
 * @param {KeyboardEvent} event - the key.
 * @returns {void}
 */
function runFieldKey(view, event) {
    const field = view.field;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); stopEdit(view, false); return; }
    if (event.key === 'Enter' && event.altKey) {
        event.preventDefault();
        field.setRangeText('\n', field.selectionStart, field.selectionEnd, 'end');
        resizeEditField(view);
        return;
    }
    if (event.key === 'Enter') { event.preventDefault(); stopEdit(view, true, event.shiftKey ? -1 : 1, 0); return; }
    if (event.key === 'Tab') { event.preventDefault(); stopEdit(view, true, 0, event.shiftKey ? -1 : 1); return; }
    event.stopPropagation();
}
