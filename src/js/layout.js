/**
 * The layout of the work area: the splitter between code and table (dragged or moved with the
 * arrow keys, stored with the settings), the view tabs on narrow screens, and the closing of
 * dialogs.
 */

import { openDialog } from './dialogs.js?v=5';
import { state, areas, ui, getElement, getElements, getClamped } from './state.js?v=2';
import { renderCode } from './code-view.js?v=3';
import { saveDocument } from './storage.js?v=3';

const MIN_SPLIT = 0.12;
const MAX_SPLIT = 0.85;
/** How far an arrow key moves the splitter, as a share of the width. */
const SPLIT_STEP = 0.03;
const SPLIT_DIGITS = 4;

/**
 * Shows the split between code and table.
 * @returns {void}
 */
export function showSplit() {
    ui.work.style.setProperty('--code-fr', state.split.toFixed(SPLIT_DIGITS) + 'fr');
    ui.work.style.setProperty('--view-fr', (1 - state.split).toFixed(SPLIT_DIGITS) + 'fr');
}

/**
 * Shows one pane on a narrow screen and draws it.
 * @param {string} pane - "code" or "table".
 * @returns {void}
 */
export function showPane(pane) {
    ui.work.dataset.show = pane;
    getElements('[data-pane]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.pane === pane)));
    requestAnimationFrame(() => { if (pane === 'table') areas.grid.render(); if (pane === 'code') renderCode(); });
}

/**
 * Connects the splitter and the view tabs.
 * @returns {void}
 */
export function startLayout() {
    const splitter = getElement('#splitter');
    splitter.addEventListener('pointerdown', event => startSplitDrag(splitter, event));
    splitter.addEventListener('keydown', moveSplitOnKey);
    getElements('[data-pane]').forEach(button => button.addEventListener('click', () => showPane(button.dataset.pane)));
}

/**
 * Moves the splitter one step with the left or right arrow key and stores the split.
 * @param {KeyboardEvent} event - the key on the splitter.
 * @returns {void}
 */
function moveSplitOnKey(event) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    state.split = getClamped(state.split + (event.key === 'ArrowLeft' ? -SPLIT_STEP : SPLIT_STEP), MIN_SPLIT, MAX_SPLIT);
    showSplit();
    saveDocument();
}

/**
 * Follows the pointer with the splitter until it is let go, then stores the split.
 * @param {HTMLElement} splitter - the splitter.
 * @param {PointerEvent} event - the press on it.
 * @returns {void}
 */
function startSplitDrag(splitter, event) {
    splitter.setPointerCapture(event.pointerId);
    const box = ui.work.getBoundingClientRect();
    const available = box.width - getElement('.inspector').offsetWidth - splitter.offsetWidth;
    /**
     * Moves the splitter with the pointer.
     * @param {PointerEvent} moveEvent - the pointer move.
     * @returns {void}
     */
    const moveSplit = moveEvent => { state.split = getClamped((moveEvent.clientX - box.left) / available, MIN_SPLIT, MAX_SPLIT); showSplit(); };
    /**
     * Stops following the pointer and stores the split.
     * @returns {void}
     */
    const stopSplit = () => { splitter.removeEventListener('pointermove', moveSplit); splitter.removeEventListener('pointerup', stopSplit); saveDocument(); };
    splitter.addEventListener('pointermove', moveSplit);
    splitter.addEventListener('pointerup', stopSplit);
}

/**
 * Connects the closing of dialogs (their close buttons and a click beside the dialog) and the
 * Help button.
 * @returns {void}
 */
export function startDialogs() {
    getElements('dialog [data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
    getElements('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); }));
    getElement('#btn-help').addEventListener('click', () => openDialog(getElement('#help')));
}
