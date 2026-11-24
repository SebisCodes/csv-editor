/**
 * The Format tab of the side panel: how the text is read (separator, quote character, header
 * row), how files are opened (encoding, reading a file again in another encoding), the byte
 * order mark of downloads, and converting (separator, line endings, quoting).
 */

import { escapeHtml, SEPARATOR_NAMES } from './csv.js?v=4';
import { convertFromBytes } from './util.js?v=3';
import { state, ui, getElement, getDataStart, openedFileBytes, translate, showToast } from './state.js?v=3';
import { parseDocument } from './table-model.js?v=5';
import { renderAll } from './refresh.js?v=5';
import { editCode } from './history.js?v=5';
import { saveDocument, saveFormat } from './storage.js?v=5';
import { formatAllFields, setLineEndings } from './cleanup.js?v=5';

const SEPARATOR_LABELS = { ',': 'Comma ( , )', ';': 'Semicolon ( ; )', '\t': 'Tab', '|': 'Pipe ( | )' };
const ENCODING_LABELS = { 'utf-8': 'UTF-8', 'utf-8-bom': 'UTF-8 with BOM', 'windows-1252': 'Windows-1252' };
const KILOBYTE = 1024;

/**
 * Draws the Format tab with the document's settings.
 * @returns {void}
 */
export function renderFormat() {
    const separatorOptions = Object.entries(SEPARATOR_LABELS).map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(translate(label))}</option>`).join('');
    const t = translate;
    ui.format.innerHTML = `
        <div class="doc-form">
            <p class="subhead">${t('Reading the text')}</p>
            <label class="field"><span>${t('Separator')}</span><select id="f-sep"><option value="auto">${escapeHtml(t('Detect it') + ' (' + t(SEPARATOR_LABELS[state.sep]) + ')')}</option>${separatorOptions}</select></label>
            <label class="field"><span>${t('Quote character')}</span><select id="f-quote"><option value='"'>${t('Double quote ( " )')}</option><option value="'">${t("Single quote ( ' )")}</option></select></label>
            <label class="box"><input type="checkbox" id="f-header"${state.header ? ' checked' : ''}> ${t('The first row holds the column names')}</label>
            <div class="doc-info">${getDocumentInfoHtml()}</div>
            <p class="subhead">${t('Opening files')}</p>
            <label class="field"><span>${t('Encoding of files you open')}</span><select id="f-enc"><option value="auto">${t('Detect it (UTF-8, otherwise Windows-1252)')}</option><option value="utf-8">${t('Always UTF-8')}</option><option value="windows-1252">${t('Always Windows-1252 (Western European)')}</option></select></label>
            ${openedFileBytes.get(state.fileId) ? `<div class="button-row two"><button type="button" class="button small" data-act="reread-utf8">${t('Read again as UTF-8')}</button><button type="button" class="button small" data-act="reread-1252">${t('Read again as Windows-1252')}</button></div>` : ''}
            <label class="box"><input type="checkbox" id="f-bom"${state.fmt.bom ? ' checked' : ''}> ${t('Download with a byte order mark (BOM), so that Excel reads UTF-8 correctly')}</label>
            <p class="subhead">${t('Convert')}</p>
            <div class="row2 bottom"><label class="field"><span>${t('New separator')}</span><select id="f-conv">${separatorOptions}</select></label><button type="button" class="button" data-act="convert-sep">${t('Convert')}</button></div>
            <label class="field"><span>${t('Line endings')}</span><select id="f-eol"><option value="lf">${t('Unix, macOS (LF)')}</option><option value="crlf">${t('Windows (CRLF)')}</option></select></label>
            <div class="button-row two"><button type="button" class="button small" data-act="quote-all">${t('Quote every field')}</button><button type="button" class="button small" data-act="quote-needed">${t('Quotes only where needed')}</button></div>
        </div>`;
    getElement('#f-sep').value = state.fmt.sep;
    getElement('#f-quote').value = state.q;
    getElement('#f-enc').value = state.openEnc;
    getElement('#f-eol').value = state.eol === '\r\n' ? 'crlf' : 'lf';
    getElement('#f-conv').value = state.sep === ',' ? ';' : ',';
}

/**
 * Returns the size, line endings and encoding of the document for the Format tab.
 * @returns {string} the HTML.
 */
function getDocumentInfoHtml() {
    const t = translate;
    const size = new Blob([state.code]).size;
    const rowCount = Math.max(0, state.P.rows.length - getDataStart()), width = state.P.width;
    const sizeText = size < KILOBYTE ? size + ' B' : (size / KILOBYTE).toFixed(1) + ' KB';
    const lineEndings = state.eol === '\r\n' ? 'CRLF (Windows)' : state.eol === '\r' ? 'CR (Mac OS 9)' : 'LF (Unix, macOS)';
    return `${escapeHtml(`${rowCount.toLocaleString('en')} ${rowCount === 1 ? t('row') : t('rows')} · ${width} ${width === 1 ? t('column') : t('columns')} · ${sizeText}`)}<br>${escapeHtml(t('Line endings') + ': ' + lineEndings)}<br>${escapeHtml(t('Opened as') + ' ' + t(ENCODING_LABELS[state.enc] || 'UTF-8'))}`;
}

/**
 * Connects the fields and buttons of the Format tab.
 * @returns {void}
 */
export function startFormatTab() {
    ui.format.addEventListener('change', updateFormatSetting);
    ui.format.addEventListener('click', handleFormatButton);
}

/**
 * Takes a changed field of the Format tab: the document is read again with a new separator,
 * quote or header setting; the encoding and the byte order mark are stored; line endings are
 * converted (a change handler).
 * @param {Event} event - the change.
 * @returns {void}
 */
function updateFormatSetting(event) {
    const id = event.target.id;
    if (id === 'f-sep') { state.fmt.sep = event.target.value; saveFormat(); parseDocument(); renderAll(); }
    else if (id === 'f-quote') { state.fmt.q = event.target.value; saveFormat(); parseDocument(); renderAll(); }
    else if (id === 'f-header') { state.fmt.header = event.target.checked; saveFormat(); state.sort = null; parseDocument(); renderAll(); }
    else if (id === 'f-enc') { state.openEnc = event.target.value; saveDocument(); }
    else if (id === 'f-bom') { state.fmt.bom = event.target.checked; saveFormat(); }
    else if (id === 'f-eol') setLineEndings(event.target.value === 'crlf' ? '\r\n' : '\n');
}

/**
 * Runs a button of the Format tab: convert the separator, quote every field or only where
 * needed, or read the opened file again in another encoding (a click handler).
 * @param {MouseEvent} event - the click.
 * @returns {void}
 */
function handleFormatButton(event) {
    const action = event.target.closest('[data-act]')?.dataset.act;
    if (!action) return;
    if (action === 'convert-sep') convertSeparator(getElement('#f-conv').value);
    else if (action === 'quote-all') formatAllFields(state.sep, true, 'Every field is in quotes now');
    else if (action === 'quote-needed') formatAllFields(state.sep, false, 'Quotes only where needed');
    else if (action === 'reread-utf8' || action === 'reread-1252') readFileAgain(action === 'reread-utf8' ? 'utf-8' : 'windows-1252');
}

/**
 * Writes the text with another separator.
 * @param {string} separator - the new separator.
 * @returns {void}
 */
function convertSeparator(separator) {
    if (separator === state.sep) { showToast('The text already uses this separator'); return; }
    formatAllFields(separator, false, `Separator converted to ${SEPARATOR_NAMES[separator]}`);
}

/**
 * Reads the file the document was opened from again in an encoding (one undo step).
 * @param {string} encoding - "utf-8" or "windows-1252".
 * @returns {void}
 */
function readFileAgain(encoding) {
    const decoded = convertFromBytes(openedFileBytes.get(state.fileId), encoding);
    state.enc = decoded.encoding;
    editCode(decoded.text, encoding === 'utf-8' ? 'Read again as UTF-8' : 'Read again as Windows-1252');
}
