/**
 * The editor's state and the parts every module shares: the open document as text and as a
 * read table, the view (sort, filter), undo history, the page elements, the areas set up at
 * start (table, line wrap, sync …) and a few small queries on them.
 *
 * The text is the single source of truth: the table is drawn from it, and every change in the
 * table is written back into the text as a small edit (one undo step). The textarea shows
 * line breaks as "\n"; the text keeps its own line endings (CRLF too), so positions are
 * mapped between the two (text-index.js).
 *
 * The field names of the state are read by the tests through window.csvEditor.state.
 */

/** How a document is read when its entry says nothing else. */
export const DEFAULT_FORMAT = { sep: 'auto', q: '"', header: true, bom: false };
/** The width below which the editor shows one view at a time. */
export const NARROW_SCREEN = matchMedia('(max-width: 860px)');
/** How long a toast stays, in milliseconds. */
const TOAST_TIME = 2800;

/**
 * How a document is read and downloaded (stored in its entry as csv).
 * @typedef {object} CsvFormat
 * @property {string} sep - the separator, or "auto" to detect it.
 * @property {string} q - the quote character.
 * @property {boolean} header - true when the first row holds the column names.
 * @property {boolean} bom - true to download with a byte order mark.
 * @property {string} [enc] - the encoding the file was opened in.
 */

/**
 * A step of the undo history.
 * @typedef {object} HistoryStep
 * @property {string} code - the text.
 * @property {number} sel - the cursor in the textarea.
 * @property {CsvFormat} [fmt] - the format that belongs to the text (after a separator change).
 */

/**
 * A problem listed above the code.
 * @typedef {object} Problem
 * @property {number} pos - the position in the text.
 * @property {string} kind - "error" or "warn".
 * @property {string} msg - the message.
 */

/**
 * The editor's state.
 * @typedef {object} EditorState
 * @property {string} code - the document's text with its own line endings.
 * @property {string} ta - the text as the textarea shows it ("\n" line breaks).
 * @property {Int32Array|null} crlf - the text position of each "\r" of a CRLF, null without CRLF.
 * @property {Int32Array|null} crlfTa - the same places in the textarea's text.
 * @property {Int32Array} lines - where each line of the textarea's text starts.
 * @property {import('./csv.js').ParsedTable} P - the text as read.
 * @property {string|null} parsed - the text P was read from.
 * @property {string} sep - the separator in use.
 * @property {string} q - the quote character in use.
 * @property {boolean} header - true when the first record is the header row.
 * @property {string} eol - the line ending of the records.
 * @property {CsvFormat} fmt - the document's format.
 * @property {string} enc - the encoding the document was opened in.
 * @property {Int32Array} view - the records of the data rows the table shows, in view order.
 * @property {Int32Array} viewPos - the view row of each record, -1 when not shown.
 * @property {Set<number>} controlRows - the control rows of a template (rows of section tags only, template-rows.js).
 * @property {{col: number, dir: number}|null} sort - the sort of the view (dir 1 or -1).
 * @property {{text: string, col: number}} filter - the filter of the view (col -1: all columns).
 * @property {number[]} colW - the width of each column and of the empty column.
 * @property {string[]} colType - the kind of each column.
 * @property {Problem[]} problems - the problems, sorted by position.
 * @property {number} problemsMore - rows with another number of fields beyond the listed ones.
 * @property {Map<number, string>} probLines - the kind of problem on each textarea line.
 * @property {number[]|null} mark - the textarea range of the selected cell's field.
 * @property {string} name - the document's name.
 * @property {string} fileId - the document's id in "My documents", "" for none.
 * @property {number} split - the share of the width the code takes.
 * @property {string} openEnc - the encoding for files the user opens.
 * @property {HistoryStep[]} history - the undo steps; the last one is the current text.
 * @property {HistoryStep[]} future - the redo steps.
 * @property {number} histTimer - the timer that makes an undo step of typing.
 * @property {boolean} showProblems - true when the list of problems is open.
 * @property {string|null} savedCode - the text as last stored or read from storage.
 * @property {number} parseTimer - the timer that reads the text after typing.
 * @property {number} saveTimer - the timer that stores the text after typing.
 * @property {string|null} parsedFileId - the document whose column widths are measured.
 * @property {string|null} filterColumnsKey - the columns the filter's column list was made for.
 */

/** @type {EditorState} */
export const state = {
    code: '', ta: '', crlf: null, crlfTa: null, lines: new Int32Array([0]),
    P: { rows: [], starts: new Int32Array(0), ends: new Int32Array(0), width: 0, probs: [] }, parsed: null,
    sep: ',', q: '"', header: true, eol: '\n', fmt: { ...DEFAULT_FORMAT }, enc: 'utf-8',
    view: new Int32Array(0), viewPos: new Int32Array(0), controlRows: new Set(), sort: null, filter: { text: '', col: -1 },
    colW: [], colType: [], problems: [], problemsMore: 0, probLines: new Map(), mark: null,
    name: 'Table', fileId: '', split: 0.42, openEnc: 'auto',
    history: [], future: [], histTimer: 0, showProblems: true,
    savedCode: null, parseTimer: 0, saveTimer: 0, parsedFileId: null, filterColumnsKey: null,
};

/**
 * The areas set up at start by app.js; null until then.
 * @typedef {object} EditorAreas
 * @property {import('./i18n.js').I18n|null} i18n - the interface language.
 * @property {object|null} lineWrap - the line wrap of the code view (wrap.js).
 * @property {import('./grid.js').GridApi|null} grid - the table.
 * @property {import('./files-dialog.js').FilesDialog|null} files - the "My documents" dialog.
 * @property {object|null} sync - webhook and embedding (sync.js).
 * @property {{updateRemote: function(): void}|null} ai - the AI Assistant.
 * @property {object|null} aiStatus - the AI status at the button (aistatus.js).
 */

/** @type {EditorAreas} */
export const areas = { i18n: null, lineWrap: null, grid: null, files: null, sync: null, ai: null, aiStatus: null };

/** The bytes of files opened in this session by document id, to read them again in another encoding. */
export const openedFileBytes = new Map();
/** The undo history of each document opened in this session, by id. */
export const historyByDocument = new Map();

/**
 * Returns the first element that matches a selector.
 * @param {string} selector - the CSS selector.
 * @param {ParentNode} [root] - where to look.
 * @returns {HTMLElement|null} the element.
 */
export function getElement(selector, root = document) {
    return root.querySelector(selector);
}

/**
 * Returns every element that matches a selector.
 * @param {string} selector - the CSS selector.
 * @param {ParentNode} [root] - where to look.
 * @returns {HTMLElement[]} the elements.
 */
export function getElements(selector, root = document) {
    return [...root.querySelectorAll(selector)];
}

/** The elements the modules use. */
export const ui = {
    ta: getElement('#code'), hl: getElement('#hl'), marks: getElement('#marks'), gutter: getElement('#gutter'),
    status: getElement('#code-status'), error: getElement('#code-error'), grid: getElement('#grid'),
    format: getElement('#format-body'), column: getElement('#column-body'), insert: getElement('#insert-body'),
    work: getElement('#work'), toast: getElement('#toast'), filter: getElement('#filter'), filterCol: getElement('#filter-col'),
    viewInfo: getElement('#view-info'), sortInfo: getElement('#sort-info'), empty: getElement('#empty-hint'),
};

let toastTimer = 0;

/**
 * Translates an interface text into the page's language.
 * @param {string} text - the English text.
 * @returns {string} the translation, or the text as it is.
 */
export function translate(text) {
    return areas.i18n.translate(text);
}

/**
 * Shows a short message at the bottom of the page.
 * @param {string} message - the message.
 * @returns {void}
 */
export function showToast(message) {
    ui.toast.textContent = message;
    ui.toast.classList.add('shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove('shown'), TOAST_TIME);
}

/**
 * Returns a number kept between two limits.
 * @param {number} value - the number.
 * @param {number} min - the lower limit.
 * @param {number} max - the upper limit.
 * @returns {number} the number inside the limits.
 */
export function getClamped(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

/**
 * Returns the first data record.
 * @returns {number} 1 with a header row, else 0.
 */
export function getDataStart() {
    return state.header ? 1 : 0;
}

/**
 * Tells whether the view is sorted or filtered.
 * @returns {boolean} true when the table does not show the records in their order.
 */
export function isViewFiltered() {
    return !!state.filter.text.trim() || !!state.sort;
}

/**
 * Returns how the text is written: separator, quote character and line ending.
 * @returns {import('./csv.js').WriteFormat} the format in use.
 */
export function getWriteFormat() {
    return { sep: state.sep, q: state.q, eol: state.eol };
}
