/**
 * The controls of template placeholders (?template=) in the CSV editor: the switch between the
 * example view and the template view in the table's bar, the note when the example view could
 * not be made, and the "Placeholders" box at the bottom of the code (template-controls.js).
 * Without a template syntax none of them is there.
 */

import { state, areas, ui, getElement } from './state.js?v=3';
import { TEMPLATE_SYNTAX } from './template-rows.js?v=1';
import { getCodePosition } from './text-index.js?v=3';
import { editCode } from './history.js?v=4';
import { renderTableView } from './refresh.js?v=4';
import { renderCode } from './code-view.js?v=4';
import { startViewSwitch, showViewSwitch, showViewNote, createPlaceholderBox, getListedPlaceholders } from './template-controls.js?v=2';
import { getViewMode, setViewMode, isExampleViewFailed, getTemplateExamples, getShownViewRow } from './table-views.js?v=1';

/** The box, once connected. */
let placeholderBox = null;
/** What the box lists: the examples it was drawn for, or the document's tags. */
let listedKey = null;
/** The page's template placeholders the table and the controls were last drawn with. */
let shownExamples = null;

/**
 * Connects the switch of the views and the box; without a template syntax nothing.
 * @returns {void}
 */
export function startTemplateControls() {
    if (!TEMPLATE_SYNTAX) return;
    startViewSwitch(getElement('#view-switch'), showView);
    placeholderBox = createPlaceholderBox(getElement('#placeholder-box'), { syntax: TEMPLATE_SYNTAX, textarea: ui.ta, insertText: editCodeAtRange });
}

/**
 * Shows a view of the table and keeps the active cell on the template's record it stood for.
 * @param {string} mode - the view chosen: "example" or "template".
 * @returns {void}
 */
function showView(mode) {
    const active = areas.grid.getActive();
    setViewMode(mode);
    renderTableView();
    const row = active.r === -1 ? -1 : getShownViewRow(active.rec);
    if (row >= -1) areas.grid.setActive(row, active.c, { quiet: true });
}

/**
 * Writes a placeholder's tag over a range of the code as one undo step.
 * @param {number} start - the start of the range in the textarea.
 * @param {number} end - the end of the range in the textarea.
 * @param {string} text - the tag, or a section's start tag, selection and end tag.
 * @param {number} selectionStart - the start of the selection afterwards, in the textarea.
 * @param {number} selectionEnd - the end of the selection afterwards, in the textarea.
 * @returns {void}
 */
function editCodeAtRange(start, end, text, selectionStart, selectionEnd) {
    const inserted = state.eol === '\n' ? text : text.replace(/\n/g, state.eol);
    editCode(state.code.slice(0, getCodePosition(start)) + inserted + state.code.slice(getCodePosition(end)));
    ui.ta.setSelectionRange(selectionStart, selectionEnd);
    renderCode();
}

/**
 * Shows the view chosen, the note when the example view could not be made, and the
 * placeholders in the box: the page's list, else the tags of the document.
 * @returns {void}
 */
export function renderTemplateControls() {
    shownExamples = getTemplateExamples();
    if (!placeholderBox) return;
    showViewSwitch(getElement('#view-switch'), getViewMode());
    showViewNote(getElement('#view-note'), isExampleViewFailed());
    const listed = getListedPlaceholders(getTemplateExamples(), state.code, TEMPLATE_SYNTAX);
    if (listed.key === listedKey) return;
    listedKey = listed.key;
    placeholderBox.render(listed.placeholders);
}

/**
 * Draws the table and its controls at once when the page's template placeholders differ from
 * the ones they show: a template that comes with a document (or before it) shows from the first
 * paint, in the table and in the box.
 * @returns {void}
 */
export function updateTemplateView() {
    if (getTemplateExamples() !== shownExamples) renderTableView();
}
