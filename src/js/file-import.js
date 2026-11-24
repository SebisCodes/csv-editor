/**
 * Opening files: from the file picker or dropped on the page. Each file becomes a new document
 * in "My documents"; its encoding is detected (or as chosen in Format), and its bytes are kept
 * for this session so Format can read it again in another encoding.
 */

import { convertFromBytes } from './util.js?v=3';
import { state, getElement, DEFAULT_FORMAT, openedFileBytes, showToast } from './state.js?v=3';
import { createDocument, DEFAULT_NAME } from './documents.js?v=5';
import { renderPanel } from './panel.js?v=5';

const CSV_FILE = /\.(csv|tsv|tab|txt|psv|dat)$/i;
const TAB_FILE = /\.(tsv|tab)$/i;
const TEXT_TYPE = /^text\//;
const MAX_FILE_SIZE = 60 * 1024 * 1024;

let dragDepth = 0;

/**
 * Asks the user for files to open (the file picker).
 * @returns {void}
 */
export function showFilePicker() {
    getElement('#file').click();
}

/**
 * Opens files as new documents, one after the other.
 * @param {File[]} files - the files.
 * @returns {Promise<void>} settles when every file is read.
 */
async function importFiles(files) {
    for (const file of files) {
        if (!CSV_FILE.test(file.name) && !TEXT_TYPE.test(file.type)) { showToast(`"${file.name}" is not a CSV file`); continue; }
        if (file.size > MAX_FILE_SIZE) { showToast('The file is larger than 60 MB'); continue; }
        const bytes = new Uint8Array(await file.arrayBuffer());
        const decoded = convertFromBytes(bytes, state.openEnc);
        const format = { ...DEFAULT_FORMAT, sep: TAB_FILE.test(file.name) ? '\t' : 'auto', bom: decoded.encoding === 'utf-8-bom', enc: decoded.encoding };
        const id = createDocument(file.name.replace(/\.[^.]+$/, '') || DEFAULT_NAME, decoded.text, format);
        if (!id) continue;
        openedFileBytes.set(id, bytes);
        state.enc = decoded.encoding;
        renderPanel();
        showToast(decoded.encoding === 'windows-1252' ? `Opened "${file.name}" as Windows-1252 - it is now in "My documents"` : `Opened "${file.name}" - it is now in "My documents"`);
    }
}

/**
 * Connects the file picker, the Open button and dropping files on the page.
 * @returns {void}
 */
export function startFileImport() {
    const input = getElement('#file');
    getElement('#btn-open').addEventListener('click', () => input.click());
    input.addEventListener('change', async () => { await importFiles([...input.files]); input.value = ''; });
    window.addEventListener('dragenter', event => { if (event.dataTransfer.types.includes('Files')) { dragDepth++; document.body.classList.add('drop'); event.preventDefault(); } });
    window.addEventListener('dragover', event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); });
    window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('drop'); } });
    window.addEventListener('drop', importDroppedFiles);
}

/**
 * Opens the files dropped on the page and ends the drop highlight.
 * @param {DragEvent} event - the drop event.
 * @returns {void}
 */
function importDroppedFiles(event) {
    dragDepth = 0;
    document.body.classList.remove('drop');
    const files = [...event.dataTransfer.files];
    if (!files.length) return;
    event.preventDefault();
    importFiles(files);
}
