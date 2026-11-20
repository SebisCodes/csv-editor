/**
 * Documents: opening one of "My documents" (each keeps its own undo history while the page is
 * open), making a new one (blank, the example or a template of the "New" menu), starting a
 * document over, and the "My documents" dialog.
 *
 * openDocument() runs these steps:
 *   1. end an edit in the table and store the edits of the document that is closed;
 *   2. keep its undo history;
 *   3. take the new document's name, format and history;
 *   4. clear sort, filter and the field mark, set the text and go to its start;
 *   5. show its name and tell the dialog and sync.js.
 */

import { START, TEMPLATES } from './samples.js?v=3';
import { openConfirmation } from './dialogs.js?v=5';
import { store } from './files.js?v=8';
import { createFilesDialog } from './files-dialog.js?v=2';
import {
    state, areas, ui, getElement, getElements, DEFAULT_FORMAT, historyByDocument, openedFileBytes, showToast,
} from './state.js?v=2';
import { setCode, addHistoryStep, updateHistoryButtons, editCode, undo, redo } from './history.js?v=3';
import { saveDocument } from './storage.js?v=3';
import { showFilePicker } from './file-import.js?v=3';

/** The text of a blank document. */
export const BLANK_CODE = 'Column 1,Column 2,Column 3\n';
/** The name of a document without one. */
export const DEFAULT_NAME = 'Table';

/**
 * Shows the open document's name in the bar, its button and the "New" menu.
 * @returns {void}
 */
export function showFileName() {
    getElement('#file-name').textContent = state.name;
    getElement('#btn-files').title = `"${state.name}" is open. My documents: open, rename, duplicate or delete your documents (Ctrl+O)`;
    getElement('#new-restart b').textContent = `Start "${state.name}" over`;
}

/**
 * Opens a document of "My documents".
 * @param {string} id - the document's id.
 * @param {string} [code] - its text, when the caller has it; else the stored text or a blank table.
 * @returns {void}
 */
export function openDocument(id, code) {
    closeOpenDocument();
    const text = code ?? store.code(id) ?? BLANK_CODE;
    const entry = store.getEntry(id);
    state.fileId = id;
    state.name = entry?.name || DEFAULT_NAME;
    state.fmt = { ...DEFAULT_FORMAT, ...(entry?.csv || {}) };
    state.enc = entry?.csv?.enc || 'utf-8';
    state.savedCode = text;
    const kept = historyByDocument.get(id);
    state.history = kept ? kept.history : [];
    state.future = kept ? kept.future : [];
    state.sort = null;
    state.filter = { text: '', col: -1 };
    ui.filter.value = '';
    state.mark = null;
    state.parsedFileId = null;
    setCode(text, { history: false });
    showDocumentStart();
    addHistoryStep();
    updateHistoryButtons();
    showFileName();
    areas.files.render();
    areas.sync?.updateUi();
}

/**
 * Leaves the open document: ends an edit in the table, stores the edits still waiting for the
 * automatic save and keeps the undo history.
 * @returns {void}
 */
function closeOpenDocument() {
    clearTimeout(state.histTimer);
    if (areas.grid.isEditing()) areas.grid.stopEdit(true);
    if (state.saveTimer) { clearTimeout(state.saveTimer); saveDocument(); }
    if (state.fileId) { addHistoryStep(); historyByDocument.set(state.fileId, { history: state.history, future: state.future }); }
}

/**
 * Puts the cursor and the scroll positions of code and table at the start, the first cell active.
 * @returns {void}
 */
function showDocumentStart() {
    ui.ta.scrollTop = 0;
    ui.ta.setSelectionRange(0, 0);
    ui.grid.scrollTop = 0;
    ui.grid.scrollLeft = 0;
    areas.grid.setActive(0, 0, { quiet: true });
}

/**
 * Creates a document in "My documents" and opens it. A command that returns the new id, as
 * the callers need it.
 * @param {string} name - the wanted name (a free one is taken).
 * @param {string} code - the text.
 * @param {import('./state.js').CsvFormat} [format] - how it is read, stored in its entry.
 * @param {boolean} [inMemory] - true to keep it in memory only (a page's document), never stored.
 * @returns {string|null} the new id, null when the browser storage is full.
 */
export function createDocument(name, code, format, inMemory = false) {
    let id;
    try {
        id = store.create(name, code, inMemory);
        if (format) store.setEntryFields(id, { csv: format });
    } catch (e) {
        showToast('The browser storage is full - delete or download documents under "My documents" first');
        return null;
    }
    openDocument(id, code);
    return id;
}

/**
 * Asks, then removes the data of the open document and keeps its header row.
 * @returns {Promise<void>} settles when the question is answered.
 */
async function resetDocument() {
    const next = state.header && state.P.rows.length ? state.code.slice(0, state.P.starts.length > 1 ? state.P.starts[1] : state.code.length) : '';
    if (state.code === next) { showToast('This document is empty already'); return; }
    const forId = state.fileId;
    if (!await openConfirmation({
        title: `Start "${state.name}" over?`,
        text: state.header ? 'Every row except the header row is removed. "Undo" brings them back as long as the page is open.' : 'Everything is removed. "Undo" brings it back as long as the page is open.',
        ok: 'Start over',
    })) return;
    if (state.fileId !== forId) return;                   // another document was opened while the question was open
    editCode(next.replace(/[^\r\n]$/, last => last + state.eol), `"${state.name}" is empty now - "Undo" brings it back`);
}

/**
 * Makes a new document of a kind of the "New" menu, or starts the open one over.
 * @param {string} kind - "restart", "example", "blank" or a template's key.
 * @returns {void}
 */
function openNewFromMenu(kind) {
    if (kind === 'restart') { resetDocument(); return; }
    const template = kind === 'example' ? START : TEMPLATES[kind];
    if (createDocument(template ? template.name : DEFAULT_NAME, template ? template.code : BLANK_CODE)) showToast(`New document "${state.name}" - your other documents are under "My documents"`);
}

/**
 * Sets up the "My documents" dialog over the open document (an initializeX: it returns the
 * dialog's API).
 * @returns {import('./files-dialog.js').FilesDialog} the dialog.
 */
export function createDocumentsDialog() {
    return createFilesDialog({
        getCurrent: () => ({ id: state.fileId, name: state.name, code: state.code }),
        openDocument: id => { openDocument(id); showToast(`"${state.name}" opened`); },
        openNew: openNewFromMenu,
        renameDocument,
        onRemoved: openNextAfterRemoval,
        showFilePicker,
        showToast,
    });
}

/**
 * Gives a document a new name; the open one shows it at once.
 * @param {string} id - the document's id.
 * @param {string} name - the new name.
 * @returns {void}
 */
function renameDocument(id, name) {
    try { store.save(id, { name }); } catch (e) { showToast('The browser storage is full'); return; }
    if (id === state.fileId) { state.name = name; showFileName(); areas.sync?.handleChange(); }
}

/**
 * Forgets what the session kept of a deleted document; when it was the open one, opens the
 * most recent other document or a new blank one.
 * @param {string} id - the deleted document's id.
 * @returns {void}
 */
function openNextAfterRemoval(id) {
    historyByDocument.delete(id);
    openedFileBytes.delete(id);
    if (id !== state.fileId) return;
    state.fileId = '';
    const next = store.getSortedEntries()[0];
    if (next) openDocument(next.id);
    else createDocument(DEFAULT_NAME, BLANK_CODE);
}

/**
 * Connects the "New" menu, "My documents", Undo and Redo in the bar.
 * @returns {void}
 */
export function startDocumentButtons() {
    const newButton = getElement('#btn-new'), newMenu = getElement('#new-menu');
    newButton.addEventListener('click', () => setNewMenuOpen(newMenu.hidden));
    newMenu.addEventListener('click', openClickedNewItem);
    newMenu.addEventListener('keydown', event => moveInNewMenu(event, newMenu, newButton));
    document.addEventListener('pointerdown', event => { if (!newMenu.hidden && !event.target.closest('#new-menu, #btn-new')) setNewMenuOpen(false); });
    getElement('#btn-files').addEventListener('click', () => areas.files.open());
    getElement('#btn-undo').addEventListener('click', undo);
    getElement('#btn-redo').addEventListener('click', redo);
}

/**
 * Closes the "New" menu and opens the kind of document of the clicked item.
 * @param {MouseEvent} event - the click in the menu.
 * @returns {void}
 */
function openClickedNewItem(event) {
    const item = event.target.closest('[data-new]');
    if (!item) return;
    setNewMenuOpen(false);
    openNewFromMenu(item.dataset.new);
}

/**
 * Moves the focus through the "New" menu with the arrow keys; Escape closes it.
 * @param {KeyboardEvent} event - the key in the menu.
 * @param {HTMLElement} newMenu - the menu.
 * @param {HTMLElement} newButton - the "New" button, focused again after Escape.
 * @returns {void}
 */
function moveInNewMenu(event, newMenu, newButton) {
    const items = getElements('button', newMenu), index = items.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
    if (event.key === 'Escape') { event.stopPropagation(); setNewMenuOpen(false); newButton.focus(); }
}

/**
 * Opens or closes the "New" menu; an opened menu has the focus on its first item.
 * @param {boolean} open - true to open it.
 * @returns {void}
 */
export function setNewMenuOpen(open) {
    const newMenu = getElement('#new-menu');
    newMenu.hidden = !open;
    getElement('#btn-new').setAttribute('aria-expanded', open);
    if (open) newMenu.querySelector('button').focus();
}

/**
 * Tells whether the "New" menu is open.
 * @returns {boolean} true while it is open.
 */
export function isNewMenuOpen() {
    return !getElement('#new-menu').hidden;
}
