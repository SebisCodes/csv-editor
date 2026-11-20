/**
 * Drawing everything that shows the document again: the code, the problems, the filter's
 * column list, the table and the side panel. Typing reads the text after a pause, so anything
 * that uses the table's places or values (edits in the table, row tools, export) first makes
 * sure the table is read from the current text.
 */

import { state, areas } from './state.js?v=2';
import { parseDocument } from './table-model.js?v=3';
import { renderProblems } from './problems.js?v=3';
import { renderCode, selectCellAtCursor } from './code-view.js?v=3';
import { renderFilterColumns } from './table-view.js?v=3';
import { renderPanel } from './panel.js?v=3';

/**
 * Draws the code, the problems, the filter's column list, the table and the side panel.
 * @returns {void}
 */
export function renderAll() {
    renderCode();
    renderProblems();
    renderFilterColumns();
    areas.grid?.update();
    renderPanel();
}

/**
 * Reads the text at once when the table is not read from the current text, and draws what
 * depends on it.
 * @returns {void}
 */
export function updateTableNow() {
    clearTimeout(state.parseTimer);
    if (state.parsed === state.code) return;
    parseDocument();
    renderProblems();
    renderFilterColumns();
    areas.grid.update();
    renderPanel();
    selectCellAtCursor();
    renderCode();
}
