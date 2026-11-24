/**
 * Storing the open document and the settings in this browser, and other editor tabs. The
 * settings go to csveditor.v1, the document's text to its file in "My documents" (files.js),
 * how it is read (separator, quote, header) to its entry there.
 *
 * Two tabs on one document: an edit in this tab over a version another tab stored keeps both
 * (this tab's version becomes a document of its own); a hidden tab without edits of its own
 * shows the version another tab stored.
 */

import { store } from './files.js?v=8';
import { state, areas, showToast } from './state.js?v=3';
import { setCode } from './history.js?v=5';
import { showFileName } from './documents.js?v=5';

const SETTINGS_KEY = 'csveditor.v1';
const STORAGE_FULL = 'The browser storage is full - download and delete documents under "My documents"';

let storageWarningShown = false;

/**
 * The settings stored under csveditor.v1.
 * @typedef {object} EditorSettings
 * @property {string} file - the id of the open document.
 * @property {number} split - the share of the width the code takes.
 * @property {string} openEnc - the encoding for files the user opens.
 */

/**
 * Returns the stored settings.
 * @returns {EditorSettings|null} the settings, null when none are stored or readable.
 */
export function getSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); } catch (e) { return null; }
}

/**
 * Stores the settings and the open document's text when it changed. When another tab stored
 * another version meanwhile, both are kept. A full storage is reported once.
 * @returns {void}
 */
export function saveDocument() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ file: state.fileId, split: state.split, openEnc: state.openEnc })); } catch (e) { /* storage blocked */ }
    if (!state.fileId || state.code === state.savedCode) return;
    try {
        const stored = store.code(state.fileId);
        if (stored != null && stored !== state.savedCode && stored !== state.code) { saveAsOwnCopy(); return; }
        store.save(state.fileId, { code: state.code });
        state.savedCode = state.code;
    } catch (e) {
        if (!storageWarningShown) showToast(STORAGE_FULL);
        storageWarningShown = true;
    }
}

/**
 * Makes this tab's version of the open document a document of its own (with a free name),
 * when another tab changed the document while this tab had edits of its own; the other tab's
 * version stays as it is.
 * @returns {void}
 */
function saveAsOwnCopy() {
    const name = state.name;
    let id;
    try { id = store.create(name, state.code); } catch (e) { showToast(STORAGE_FULL); return; }
    state.fileId = id;
    state.name = store.getEntry(id)?.name || name;
    state.savedCode = state.code;
    showFileName();
    areas.files.render();
    areas.sync?.updateUi();
    saveDocument();
    showToast(`"${name}" was changed in another tab - your version here is kept as "${state.name}"`);
}

/**
 * Stores the open document's format in its entry.
 * @returns {void}
 */
export function saveFormat() {
    if (!state.fileId) return;
    try { store.setEntryFields(state.fileId, { csv: { ...state.fmt } }); } catch (e) { /* storage full: the setting lasts while the page is open */ }
}

/**
 * Follows what other tabs store: a hidden tab without edits of its own shows the version of
 * the open document another tab stored.
 * @returns {void}
 */
export function startStorageSync() {
    addEventListener('storage', showOtherTabVersion);
}

/**
 * Shows the version of the open document another tab stored, in a tab that is not on screen
 * and has no edits of its own: what the user is looking at never changes by itself (a storage
 * event handler).
 * @param {StorageEvent} event - the storage change.
 * @returns {void}
 */
function showOtherTabVersion(event) {
    if (!state.fileId || !event.key || !event.key.endsWith(state.fileId) || event.newValue == null || store.isInMemory(state.fileId)) return;
    const stored = store.code(state.fileId);
    if (stored == null || stored === state.code || state.code !== state.savedCode || document.visibilityState !== 'hidden') return;
    state.savedCode = stored;
    setCode(stored);
}
