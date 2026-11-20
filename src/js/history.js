/**
 * Setting the text, and undo and redo. Every change from the table or a tool is one undo
 * step; typing becomes a step after a pause. Undo keeps up to 300 steps and 40 million
 * characters of earlier versions; a step that changed the separator keeps the format with it.
 *
 * setCode() runs these steps:
 *   1. give typing that still waits for its undo step that step;
 *   2. set the text and its index, and the textarea's text (cursor and scroll kept);
 *   3. read the text and draw everything;
 *   4. make an undo step, store the document and tell sync.js.
 */

import { state, areas, ui, getElement, showToast } from './state.js?v=2';
import { updateTextIndex } from './text-index.js?v=2';
import { parseDocument } from './table-model.js?v=3';
import { renderAll } from './refresh.js?v=3';
import { saveDocument, saveFormat } from './storage.js?v=3';

/** Characters kept for undo in all. */
const MAX_HISTORY_SIZE = 40e6;
const MAX_HISTORY_STEPS = 300;
/** The steps always kept, however large. */
const MIN_HISTORY_STEPS = 2;

/**
 * How setCode() sets the text.
 * @typedef {object} SetCodeOptions
 * @property {boolean} [history] - false to make no undo step (undo and redo themselves).
 * @property {boolean} [keepView] - false to clear sort and filter.
 */

/**
 * Sets the document's text; the table, the views and the storage follow.
 * @param {string} code - the new text.
 * @param {SetCodeOptions} [options] - history and keepView.
 * @returns {void}
 */
export function setCode(code, { history = true, keepView = true } = {}) {
    const place = getAreaPlace();
    if (history && state.histTimer) { clearTimeout(state.histTimer); state.histTimer = 0; addHistoryStep(); }
    state.code = code;
    updateTextIndex();
    showTextInArea(place);
    if (!keepView) { state.sort = null; state.filter = { text: '', col: -1 }; ui.filter.value = ''; }
    parseDocument();
    renderAll();
    if (history) addHistoryStep();
    saveDocument();
    areas.sync?.handleChange();
}

/**
 * Returns the scroll position and the selection of the textarea.
 * @returns {{scrollTop: number, scrollLeft: number, start: number, end: number}} where the textarea is.
 */
function getAreaPlace() {
    const textarea = ui.ta;
    return { scrollTop: textarea.scrollTop, scrollLeft: textarea.scrollLeft, start: textarea.selectionStart, end: textarea.selectionEnd };
}

/**
 * Puts the textarea's text into the textarea when it differs, keeping the scroll position and,
 * while it has the focus, the selection.
 * @param {Object} place - where the textarea was: scrollTop, scrollLeft and the selection's start and end.
 * @returns {void}
 */
function showTextInArea(place) {
    const textarea = ui.ta;
    if (textarea.value === state.ta) return;
    textarea.value = state.ta;
    textarea.scrollTop = place.scrollTop;
    textarea.scrollLeft = place.scrollLeft;
    if (document.activeElement === textarea) textarea.setSelectionRange(Math.min(place.start, state.ta.length), Math.min(place.end, state.ta.length));
}

/**
 * Enables Undo when there is a step to go back to and Redo when there is one to go forward to.
 * @returns {void}
 */
export function updateHistoryButtons() {
    const last = state.history[state.history.length - 1];
    getElement('#btn-undo').disabled = !(state.history.length > 1 || (last && last.code !== state.code));
    getElement('#btn-redo').disabled = !state.future.length;
}

/**
 * Makes the current text an undo step (or notes the cursor when the text is the last step's),
 * drops the oldest steps over the limits and clears Redo.
 * @returns {void}
 */
export function addHistoryStep() {
    const last = state.history[state.history.length - 1];
    const cursor = ui.ta.selectionStart;
    if (last && last.code === state.code) { last.sel = cursor; return; }
    state.history.push({ code: state.code, sel: cursor });
    let size = state.history.reduce((sum, step) => sum + step.code.length, 0);
    while ((state.history.length > MAX_HISTORY_STEPS || size > MAX_HISTORY_SIZE) && state.history.length > MIN_HISTORY_STEPS) size -= state.history.shift().code.length;
    state.future = [];
    updateHistoryButtons();
}

/**
 * Goes back one undo step.
 * @returns {void}
 */
export function undo() {
    if (areas.grid?.isEditing()) areas.grid.stopEdit(false);
    clearTimeout(state.histTimer);
    if (state.history[state.history.length - 1]?.code !== state.code) addHistoryStep();
    if (state.history.length < 2) { showToast('Nothing to undo'); return; }
    state.future.push(state.history.pop());
    const step = state.history[state.history.length - 1];
    applyFormatOf(step);
    setCode(step.code, { history: false });
}

/**
 * Goes forward one undo step.
 * @returns {void}
 */
export function redo() {
    const step = state.future.pop();
    if (!step) { showToast('Nothing to redo'); return; }
    state.history.push(step);
    applyFormatOf(step);
    setCode(step.code, { history: false });
}

/**
 * Sets a text from the table or a tool as one undo step and shows a message; a text equal to
 * the current one changes nothing but the message.
 * @param {string} code - the new text.
 * @param {string} [message] - the message to show.
 * @returns {void}
 */
export function editCode(code, message) {
    if (code !== state.code) {
        clearTimeout(state.histTimer);
        if (state.history[state.history.length - 1]?.code !== state.code) addHistoryStep();
        setCode(code);
    }
    if (message) showToast(message);
}

/**
 * Restores the format of an undo step, when it has one and it differs; the text is then read
 * again with it.
 * @param {import('./state.js').HistoryStep} step - the undo step.
 * @returns {void}
 */
function applyFormatOf(step) {
    if (!step.fmt || JSON.stringify(step.fmt) === JSON.stringify(state.fmt)) return;
    state.fmt = { ...step.fmt };
    saveFormat();
    state.parsed = null;
}
