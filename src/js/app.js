/**
 * CSV editor: the raw CSV on the left, the table in the middle, format, column information
 * and tools on the right. This file starts the editor and wires its areas together; each area
 * has its own module (state.js describes the shared state).
 *
 * The text is the single source of truth: the table is drawn from it (csv.js parseCsv()),
 * and every change in the table is written back into the text as a small edit (one undo
 * step). A click in the table puts the code's cursor on that field; the code's cursor selects
 * its cell.
 *
 * Start-up steps:
 *   1. the interface language (the AI prompt stays English) and the line wrap of the code;
 *   2. connect the code view, the problems, the table, the side panel, the documents, opening
 *      files, the keyboard, the layout, the Export dialog and the dialogs;
 *   3. take the stored settings and open the last document (or the welcome example);
 *   4. draw everything, and again once the language pack is there;
 *   5. start the AI Assistant, the WebMCP tools, the AI status, "Open in another editor" and
 *      sync.js (webhook, embedding, ?src=);
 *   6. offer the test hook window.csvEditor.
 */

import { createI18n } from './i18n.js?v=22';
import { createWrap } from './wrap.js?v=5';
import { createAiStatus } from './aistatus.js?v=8';
import { createSync } from './sync.js?v=23';
import './export-menu.js?v=6';
import { startConvert } from './convert-to.js?v=14';
import { START } from './samples.js?v=3';
import { store } from './files.js?v=8';
import { createAi } from './ai.js?v=8';
import { createMcp } from './mcp.js?v=4';
import { state, areas, ui, DEFAULT_FORMAT, showToast } from './state.js?v=2';
import { updateTextIndex, getAreaPosition, getCodePosition } from './text-index.js?v=2';
import { parseDocument } from './table-model.js?v=3';
import { renderCode, showCodePosition, startCodeView } from './code-view.js?v=3';
import { startProblems } from './problems.js?v=3';
import { renderAll } from './refresh.js?v=3';
import { setCode, addHistoryStep, undo, redo } from './history.js?v=3';
import { getSettings, startStorageSync } from './storage.js?v=3';
import { createTableView } from './table-view.js?v=3';
import { renderInsert, startSidePanel } from './panel.js?v=3';
import { setRowOrder } from './cleanup.js?v=3';
import { showFileName, openDocument, createDocumentsDialog, startDocumentButtons } from './documents.js?v=3';
import { startFileImport } from './file-import.js?v=3';
import { startKeyboard } from './keyboard.js?v=3';
import { showSplit, startLayout, startDialogs } from './layout.js?v=3';
import { startExportDialog } from './export-dialog.js?v=3';
import { receiveDocument, importExternalDocument } from './incoming.js?v=3';
import {
    getPromptState, getProblemList, getRowRange, setAgentCell, addAgentRows, getFileList, openFileByName, createFile,
} from './agent-api.js?v=3';

const PREFIX = 'csveditor';

startEditor();

/**
 * Starts the editor (the flow of the steps in the header).
 * @returns {void}
 */
function startEditor() {
    startLanguageAndWrap();
    connectAreas();
    openStartDocument();
    renderStart();
    startAiAndSync();
    window.csvEditor = createTestHook();
}

/**
 * Starts the interface language (translated at run time, see i18n.js) and the line wrap of
 * the code view (wrap.js); the gutter is drawn here for the lines in sight.
 * @returns {void}
 */
function startLanguageAndWrap() {
    areas.i18n = createI18n({
        prefix: 'csveditor',
        roots: '.header, .views, #work, #ai-receive, #toast, .storage-hint, dialog',
        skip: '',
    });
    areas.lineWrap = createWrap({
        prefix: PREFIX, ta: ui.ta, layers: [ui.hl], button: document.getElementById('btn-wrap'),
        onChange: () => { areas.lineWrap.update(state.ta); renderCode(); },
    });
}

/**
 * Connects the areas of the page, in the order their listeners take events.
 * @returns {void}
 */
function connectAreas() {
    startStorageSync();
    startCodeView();
    startProblems();
    areas.grid = createTableView();
    startSidePanel();
    areas.files = createDocumentsDialog();
    startDocumentButtons();
    startFileImport();
    startKeyboard();
    startLayout();
    startExportDialog();
    startDialogs();
}

/**
 * Takes the stored settings and opens the last document, or the welcome example when
 * "My documents" is empty; with the storage blocked, the example without saving.
 * @returns {void}
 */
function openStartDocument() {
    const settings = getSettings();
    if (settings) {
        if (settings.split) state.split = settings.split;
        if (settings.openEnc) state.openEnc = settings.openEnc;
    }
    showSplit();
    let code = null;
    try {
        if (!store.list().length) store.create(START.name, START.code);
        const entry = store.getEntry(settings?.file) || store.getSortedEntries()[0];
        code = store.code(entry.id);
        if (code != null) {
            state.fileId = entry.id;
            state.name = entry.name;
            state.savedCode = code;
            state.fmt = { ...DEFAULT_FORMAT, ...(entry.csv || {}) };
            state.enc = entry.csv?.enc || 'utf-8';
        }
    } catch (e) { /* storage blocked: one document without saving */ }
    if (code == null) { code = START.code; state.name = START.name; }
    state.code = code;
}

/**
 * Reads and draws the start document, makes its first undo step and draws everything again
 * once the language pack is there.
 * @returns {void}
 */
function renderStart() {
    updateTextIndex();
    ui.ta.value = state.ta;
    showFileName();
    state.parsedFileId = null;
    parseDocument();
    renderInsert();
    renderAll();
    addHistoryStep();
    areas.grid.setActive(0, 0, { quiet: true });
    areas.i18n.ready.then(() => { state.filterColumnsKey = null; renderAll(); });
}

/**
 * Starts the AI Assistant, the WebMCP tools, the AI status, "Open in another editor" and
 * sync.js. The callbacks reach the areas through `areas`, so each may start after the ones
 * it calls.
 * @returns {void}
 */
function startAiAndSync() {
    areas.ai = createAi({
        getState: getPromptState,
        receiveDocument: async (...args) => { setTimeout(() => areas.aiStatus.addDelivery('link')); await receiveDocument(...args); return state.fileId; },
        tryOpenDocument: id => { if (!store.getEntry(id)) return false; openDocument(id); return true; },
        showToast,
        getRemote: () => areas.sync?.getAiSettings() || null,
        fetchKey: () => (areas.sync ? areas.sync.fetchKey() : Promise.resolve(null)),
        hasValidKey: () => !!areas.sync?.hasValidKey(),
    });
    const agent = createMcp({
        onUse: () => areas.aiStatus.addDelivery('agent'),
        getState: getPromptState,
        getProblems: getProblemList,
        getRows: getRowRange,
        setCell: setAgentCell,
        addRows: addAgentRows,
        getFiles: getFileList,
        openFileByName,
        createFile,
        receiveDocument,
        undo,
    });
    areas.aiStatus = createAiStatus({
        prefix: PREFIX, btn: document.getElementById('btn-ai'), box: document.getElementById('ai-status'),
        remote: () => areas.sync?.getAiSettings() || null, agent: () => agent,
    });
    startConvert({ editor: 'csv', code: () => state.code, name: () => state.name, toast: showToast, t: text => areas.i18n.translate(text) });
    areas.sync = createSync(createSyncEditor());
}

/**
 * Creates what sync.js gets from the editor; the property names are sync.js's contract.
 * @returns {import('./sync.js').SyncEditor} the adapter.
 */
function createSyncEditor() {
    return {
        onAiResult: () => areas.aiStatus.addDelivery('page'),
        onAiEnd: () => areas.aiStatus.resetDelivery(),
        prefix: PREFIX, editor: 'csv', word: 'document',
        current: () => { if (areas.grid.isEditing()) areas.grid.stopEdit(true); return { id: state.fileId, name: state.name, content: state.code, assets: {} }; },
        load: importExternalDocument,
        toast: showToast,
        hookFor: id => store.getEntry(id)?.hook || null,
        setHookFor: (id, hook) => { try { store.setEntryFields(id, { hook }); } catch (e) { showToast('The browser storage is full'); } },
        onAi: () => areas.ai?.updateRemote(),
    };
}

/**
 * Creates the hook for automated UI tests (window.csvEditor).
 * @returns {object} the state and the functions the tests call.
 */
function createTestHook() {
    return {
        state, store, setCode, undo, redo, receive: receiveDocument, showCodePosition, setRowOrder, getAreaPosition, getCodePosition,
        sync: () => areas.sync, grid: () => areas.grid,
    };
}
