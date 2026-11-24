/**
 * Drawing everything that shows the document again: the code, the problems, the filter's
 * column list, the table, the controls of template placeholders and the side panel. Typing reads
 * the text after a pause, so anything that uses the table's places or values (edits in the table,
 * row tools, export) first makes sure the table is read from the current text.
 */

import { state, areas } from './state.js?v=3';
import { parseDocument, updateView } from './table-model.js?v=4';
import { renderProblems } from './problems.js?v=4';
import { renderCode, selectCellAtCursor } from './code-view.js?v=4';
import { renderFilterColumns } from './table-view.js?v=4';
import { renderPanel } from './panel.js?v=4';
import { updateExampleTable } from './table-views.js?v=1';
import { renderTemplateControls } from './template-panel.js?v=1';

/**
 * Draws the code, the problems, the filter's column list, the table, the controls of template
 * placeholders and the side panel.
 * @returns {void}
 */
export function renderAll() {
    renderCode();
    renderProblems();
    renderFilterColumns();
    areas.grid?.update();
    renderTemplateControls();
    renderPanel();
}

/**
 * Builds the view of a template again and draws the table and the controls of template
 * placeholders: after a switch of the view, and when the page's examples change.
 * @returns {void}
 */
export function renderTableView() {
    if (state.parsed !== state.code) { updateTableNow(); return; }
    updateExampleTable();
    updateView();
    areas.grid?.update();
    renderTemplateControls();
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
    renderTemplateControls();
    renderPanel();
    selectCellAtCursor();
    renderCode();
}
