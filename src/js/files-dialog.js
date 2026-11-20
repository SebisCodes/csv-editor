/**
 * The "My documents" dialog: a card per document with its first rows as the picture, and
 * buttons to open, rename, duplicate, download and delete it; a search field, "New",
 * "Open a file" and a ZIP of all documents.
 *
 * createFilesDialog() connects the dialog once and returns { open, render }.
 */

import { openDialog, openConfirmation } from './dialogs.js?v=5';
import { createZip } from './zip.js?v=4';
import { saveFile, getSafeName, convertToBytes } from './util.js?v=3';
import { store, LIST } from './files.js?v=8';
import { createCard, formatSize } from './files-card.js?v=2';

const STORAGE_FULL = 'The browser storage is full - delete or download some documents first';

/**
 * The open document as the dialog sees it.
 * @typedef {object} OpenDocument
 * @property {string} id - its id.
 * @property {string} name - its name.
 * @property {string} code - its text, with the edits not yet stored.
 */

/**
 * What the editor hands to createFilesDialog().
 * @typedef {object} FilesDialogEditor
 * @property {function(): OpenDocument} getCurrent - the open document.
 * @property {function(string): void} openDocument - opens a stored document by id.
 * @property {function(string): void} openNew - makes a new document of a kind of the "New" menu.
 * @property {function(string, string): void} renameDocument - gives a document a new name.
 * @property {function(string): void} onRemoved - a document was deleted.
 * @property {function(): void} showFilePicker - asks for a file to open.
 * @property {function(string): void} showToast - shows a short message.
 */

/**
 * What createFilesDialog() returns.
 * @typedef {object} FilesDialog
 * @property {function(): void} open - opens the dialog with the open document focused.
 * @property {function(): void} render - draws the list again while the dialog is open.
 */

/**
 * Returns the file encoding a document is downloaded in.
 * @param {import('./files.js').FileEntry} entry - the document's entry.
 * @returns {string} "utf-8-bom" when its format asks for a byte order mark, else "utf-8".
 */
function getDownloadEncoding(entry) {
    return entry.csv?.bom ? 'utf-8-bom' : 'utf-8';
}

/**
 * Connects the "My documents" dialog (an initializeX: it returns the dialog's API).
 * @param {FilesDialogEditor} editor - what the dialog needs of the editor.
 * @returns {FilesDialog} open and render.
 */
export function createFilesDialog(editor) {
    const dialog = document.getElementById('files');
    const list = document.getElementById('files-grid');
    const search = document.getElementById('files-search');
    const info = document.getElementById('files-info');

    list.addEventListener('click', handleCardClick);
    search.addEventListener('input', renderFiles);
    document.getElementById('files-new').addEventListener('click', () => { dialog.close(); editor.openNew('blank'); });
    document.getElementById('files-import').addEventListener('click', () => { dialog.close(); editor.showFilePicker(); });
    document.getElementById('files-zip').addEventListener('click', exportAllAsZip);
    // Another editor tab changed the list.
    addEventListener('storage', event => { if (event.key === LIST && dialog.open) renderFiles(); });

    return {
        open: openFilesDialog,
        render: () => { if (dialog.open) renderFiles(); },
    };

    /**
     * Opens the dialog with an empty search and the open document focused.
     * @returns {void}
     */
    function openFilesDialog() {
        search.value = '';
        renderFiles();
        openDialog(dialog);
        list.querySelector('.current .file-open')?.focus();
    }

    /**
     * Returns the text of a document: the open one with its edits, the others as stored.
     * @param {string} id - the document's id.
     * @returns {string} the text, empty when there is none.
     */
    function getDocumentCode(id) {
        const current = editor.getCurrent();
        return id === current.id ? current.code : store.code(id) || '';
    }

    /**
     * Draws the cards of the documents that match the search, and the total size.
     * @returns {void}
     */
    function renderFiles() {
        const current = editor.getCurrent();
        const all = store.getSortedEntries();
        const query = search.value.trim().toLowerCase();
        const shown = query ? all.filter(entry => entry.name.toLowerCase().includes(query)) : all;
        list.replaceChildren(...shown.map(entry => createCard(entry, entry.id === current.id ? current.code : store.code(entry.id) || '', entry.id === current.id)));
        if (!shown.length) {
            const empty = document.createElement('p');
            empty.className = 'muted file-empty';
            empty.textContent = query ? `No document named "${search.value.trim()}".` : 'No documents yet.';
            list.append(empty);
        }
        const total = all.reduce((sum, entry) => sum + (entry.size || 0), 0);
        info.textContent = `${all.length} ${all.length === 1 ? 'document' : 'documents'} · ${formatSize(total)} in this browser`;
    }

    /**
     * Puts a field in place of a card's name to rename the document: Enter or leaving the field
     * keeps the name, Escape keeps the old one.
     * @param {HTMLLIElement} card - the card.
     * @returns {void}
     */
    function startRename(card) {
        const id = card.dataset.id;
        const nameElement = card.querySelector('.file-name');
        const input = document.createElement('input');
        input.className = 'file-rename';
        input.value = store.getEntry(id)?.name || '';
        input.setAttribute('aria-label', 'New name');
        nameElement.replaceWith(input);
        input.focus();
        input.select();
        let done = false;
        /**
         * Ends the rename once and draws the list again.
         * @param {boolean} keep - true to take the new name.
         * @returns {void}
         */
        const stopRename = keep => {
            if (done) return;
            done = true;
            const name = input.value.trim();
            if (keep && name) editor.renameDocument(id, store.getUniqueName(name, id));
            renderFiles();
            list.querySelector(`[data-id="${id}"] .file-open`)?.focus();
        };
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter') { event.preventDefault(); stopRename(true); }
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); stopRename(false); }
        });
        input.addEventListener('blur', () => stopRename(true));
    }

    /**
     * Routes a click on a card: the card opens its document, its buttons rename, duplicate,
     * download or delete it (a click handler).
     * @param {MouseEvent} event - the click in the list.
     * @returns {Promise<void>} settles when a delete is answered.
     */
    async function handleCardClick(event) {
        const card = event.target.closest('.file-card');
        if (!card) return;
        const id = card.dataset.id;
        const entry = store.getEntry(id);
        if (!entry) { renderFiles(); return; }
        const action = event.target.closest('[data-act]')?.dataset.act;
        if (!action && !event.target.closest('input')) openCardDocument(id);
        else if (action === 'rename') startRename(card);
        else if (action === 'copy') copyDocument(entry);
        else if (action === 'download') saveFile(new Blob([convertToBytes(getDocumentCode(id), getDownloadEncoding(entry))], { type: 'text/csv' }), `${getSafeName(entry.name)}.csv`);
        else if (action === 'delete') await removeDocument(entry);
    }

    /**
     * Closes the dialog and opens a document unless it is the open one.
     * @param {string} id - the document's id.
     * @returns {void}
     */
    function openCardDocument(id) {
        dialog.close();
        if (id !== editor.getCurrent().id) editor.openDocument(id);
    }

    /**
     * Stores a copy of a document under a free name, with its format.
     * @param {import('./files.js').FileEntry} entry - the document's entry.
     * @returns {void}
     */
    function copyDocument(entry) {
        try {
            const copyId = store.create(store.getUniqueName(entry.name + ' copy'), getDocumentCode(entry.id));
            if (entry.csv) store.setEntryFields(copyId, { csv: entry.csv });
            editor.showToast(`"${entry.name}" duplicated`);
        } catch (err) { editor.showToast(STORAGE_FULL); }
        renderFiles();
    }

    /**
     * Asks, then deletes a document from this browser.
     * @param {import('./files.js').FileEntry} entry - the document's entry.
     * @returns {Promise<void>} settles when the question is answered.
     */
    async function removeDocument(entry) {
        const confirmed = await openConfirmation({
            title: `Delete "${entry.name}"?`,
            text: 'The document is removed from this browser for good. Download it first if you want to keep a copy.',
            ok: 'Delete',
        });
        openDialog(dialog);
        if (!confirmed) return;
        store.remove(entry.id);
        editor.onRemoved(entry.id);
        editor.showToast(`"${entry.name}" deleted`);
        renderFiles();
    }

    /**
     * Saves every document as a .csv file in one ZIP, each under a free file name.
     * @returns {Promise<void>} settles when the ZIP is handed to the browser.
     */
    async function exportAllAsZip() {
        const used = new Set();
        const files = [];
        const entries = store.getSortedEntries();
        for (const entry of entries) {
            let name = getSafeName(entry.name);
            for (let k = 2; used.has(name.toLowerCase()); k++) name = `${getSafeName(entry.name)}-${k}`;
            used.add(name.toLowerCase());
            files.push({ name: `${name}.csv`, data: convertToBytes(getDocumentCode(entry.id), getDownloadEncoding(entry)) });
        }
        saveFile(await createZip(files), 'csv-documents.zip');
        editor.showToast(`ZIP with ${entries.length} ${entries.length === 1 ? 'document' : 'documents'} downloaded`);
    }
}
