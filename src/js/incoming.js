/**
 * Documents that arrive: from AI links and WebMCP (ai.js, mcp.js), and from a page around the
 * editor or a ?src= link (sync.js).
 */

import { parseCsv, findSeparator, findLineEnding, formatRecord } from './csv.js?v=4';
import { joinRecords } from './csv-edit.js?v=3';
import { store } from './files.js?v=8';
import { VIEWER } from './sync.js?v=26';
import { state, areas, ui, showToast } from './state.js?v=3';
import { editCode } from './history.js?v=5';
import { openDocument, createDocument } from './documents.js?v=5';

/** How much of the start of the text the separator is found in. */
const DETECTION_LENGTH = 65536;
const AI_DOCUMENT_NAME = 'AI table';
const NAME_JOINER = '\u0001';

/**
 * Where a document from a link goes.
 * @typedef {object} ReceiveTarget
 * @property {string} [file] - "new" for a new document, a name for that document, "" for the open one.
 * @property {string} [name] - the name of a new document.
 */

/**
 * A document from a page around the editor or from ?src= (sync.js's load).
 * @typedef {object} ExternalDocument
 * @property {string} name - its name.
 * @property {string} content - its text.
 * @property {string} [into] - the id of the document it takes the place of.
 * @property {boolean} [asNew] - true to always make a new document.
 * @property {string} [page] - the origin of the page (or server) it came from.
 * @property {boolean} [temp] - true for a document kept in memory only, never stored.
 */

/**
 * Returns a text with the rows of a CSV added at its end; a repeated header row is left out.
 * @param {string} code - the text.
 * @param {string} csv - the rows to add.
 * @returns {string} the new text.
 */
function getCodeWithRows(code, csv) {
    const separator = state.fmt.sep === 'auto' ? findSeparator(code.slice(0, DETECTION_LENGTH) || csv) : state.fmt.sep;
    const table = parseCsv(code, separator, state.q), added = parseCsv(csv, separator, state.q).rows;
    if (state.header && table.rows.length && added.length && added[0].join(NAME_JOINER) === table.rows[0].join(NAME_JOINER)) added.shift();
    return joinRecords(code, added.map(values => formatRecord(values, separator, state.q)), findLineEnding(code) || '\n');
}

/**
 * Takes a document from an AI link or a tool: a new document, a named one (made when there is
 * none) or the open one; "add" puts the rows at the end. The link says which document, so
 * there is no question; Undo takes the change back.
 * @param {string} csv - the CSV.
 * @param {string} mode - "add" to add rows, anything else to replace the text.
 * @param {ReceiveTarget} [target] - which document.
 * @returns {Promise<void>} settles when the document is in the editor.
 */
export async function receiveDocument(csv, mode, target = {}) {
    if (areas.grid.isEditing()) areas.grid.stopEdit(true);
    const wanted = String(target.file || '').trim();
    const isNew = wanted.toLowerCase() === 'new';
    const entry = isNew ? null : wanted ? store.findByName(wanted) : store.getEntry(state.fileId);
    if (!entry) {
        if (createDocument(isNew ? target.name || AI_DOCUMENT_NAME : wanted || AI_DOCUMENT_NAME, csv)) VIEWER || showToast(`New document "${state.name}" from the AI - your other documents are unchanged`);
        return;
    }
    if (entry.id !== state.fileId) openDocument(entry.id);
    editCode(mode === 'add' ? getCodeWithRows(state.code, csv) : csv);
    const errors = state.problems.filter(problem => problem.kind === 'error').length;
    VIEWER || showToast(errors ? `Table received - the editor found ${errors} ${errors === 1 ? 'problem' : 'problems'}, see above the code` : `"${state.name}" changed by the AI - "Undo" takes it back`);
}

/**
 * Takes a document from the page around the editor or from ?src=: it replaces the document of
 * that name that came from the same page (one undo step), or becomes a new document. The
 * user's own documents are never replaced.
 * @param {ExternalDocument} external - the document and where it comes from.
 * @returns {Promise<void>} settles when the document is in the editor.
 */
export async function importExternalDocument({ name, content, into, asNew, page, temp }) {
    if (areas.grid.isEditing()) areas.grid.stopEdit(false);
    const entry = asNew ? null : (into && store.getEntry(into)) || store.list().find(item => item.name === name && item.page && item.page === page && !!item.temp === !!temp);
    if (entry) {
        if (entry.id !== state.fileId) openDocument(entry.id);
        if (content !== state.code) editCode(content);
    } else {
        const id = createDocument(name, content, null, !!temp);
        if (id && page) try { store.setEntryFields(id, { page }); } catch (e) { /* storage full: it is not recognized next time */ }
    }
    ui.ta.setSelectionRange(0, 0);
    ui.ta.scrollTop = 0;
    ui.grid.scrollTop = 0;
}
