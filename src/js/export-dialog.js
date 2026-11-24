/**
 * The Export dialog and the download buttons: CSV with a chosen separator and encoding, TSV,
 * JSON, Markdown, HTML and XLSX (export.js), all data rows or only the rows shown, a preview
 * of the first 300 rows, a download, a ZIP of every format and a copy to the clipboard.
 * "Download .csv" saves the text exactly as it is; Ctrl+S saves to the server or the page
 * around the editor when one is set up, else downloads the CSV.
 */

import { openDialog } from './dialogs.js?v=5';
import { createZip } from './zip.js?v=4';
import { saveFile, getSafeName, convertToBytes } from './util.js?v=3';
import { formatCsv, formatJson, formatMarkdown, formatHtml, createXlsxBlob } from './export.js?v=7';
import { state, areas, ui, getElement, getDataStart, isViewFiltered, translate, showToast } from './state.js?v=3';
import { updateTableNow } from './refresh.js?v=4';

const EXTENSIONS = { csv: 'csv', tsv: 'tsv', json: 'json', md: 'md', html: 'html', xlsx: 'xlsx' };
const MEDIA_TYPES = { csv: 'text/csv', tsv: 'text/tab-separated-values', json: 'application/json', md: 'text/markdown', html: 'text/html', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
/** The rows shown in the preview. */
const PREVIEW_ROWS = 300;
const XLSX_HINT = '(The workbook is made when you download it: one sheet, the header row in bold, numbers as numbers, everything else as text - never as a formula.)';

const dialog = getElement('#export');
const nameField = getElement('#ex-name'), formatField = getElement('#ex-format'), separatorField = getElement('#ex-sep'), encodingField = getElement('#ex-enc');
const guardField = getElement('#ex-guard'), shownField = getElement('#ex-shown'), previewField = getElement('#ex-text'), infoField = getElement('#ex-info');
let xlsxHint = null;

/**
 * The header and rows to export.
 * @typedef {object} ExportData
 * @property {string[]|null} head - the header names, null without a header row.
 * @property {string[][]} rows - the data rows.
 * @property {number} more - the rows left out by the limit.
 */

/**
 * Connects the Export dialog and the buttons Export, Copy and Download in the bar.
 * @returns {void}
 */
export function startExportDialog() {
    xlsxHint = document.createElement('p');
    xlsxHint.className = 'hint';
    xlsxHint.hidden = true;
    previewField.before(xlsxHint);
    [formatField, separatorField, encodingField, guardField, shownField].forEach(field => field.addEventListener('change', updateExportPreview));
    nameField.addEventListener('input', updateExportPreview);
    getElement('#ex-download').addEventListener('click', saveExportFile);
    getElement('#ex-zip').addEventListener('click', saveAllFormatsAsZip);
    getElement('#ex-copy').addEventListener('click', copyExport);
    getElement('#btn-export').addEventListener('click', openExport);
    getElement('#btn-copy').addEventListener('click', copyCode);
    getElement('#btn-download').addEventListener('click', () => saveCsvFile());
}

/**
 * Opens the Export dialog with the document's name, separator and encoding.
 * @returns {void}
 */
export function openExport() {
    updateTableNow();
    if (areas.grid.isEditing()) areas.grid.stopEdit(true);
    nameField.value = state.name;
    separatorField.value = state.sep;
    encodingField.value = state.fmt.bom ? 'utf-8-bom' : 'utf-8';
    shownField.checked = false;
    getElement('#ex-shown-wrap').hidden = !isViewFiltered();
    updateExportPreview();
    openDialog(dialog);
}

/**
 * Returns the file name of the export, without extension.
 * @returns {string} the safe name from the dialog, else the document's.
 */
function getExportName() {
    return getSafeName(nameField.value || state.name);
}

/**
 * Returns the header and the rows to export: all data rows, or those the view shows.
 * @param {number} [limit] - the most rows to return (for the preview).
 * @returns {ExportData} the header, the rows and how many are left out.
 */
function getExportData(limit = Infinity) {
    const rows = state.P.rows;
    const head = state.header && rows.length ? rows[0] : null;
    const records = shownField.checked ? state.view : null;
    const out = [];
    const count = records ? records.length : rows.length - getDataStart();
    for (let i = 0; i < Math.min(count, limit); i++) out.push(rows[records ? records[i] : i + getDataStart()]);
    return { head, rows: out, more: count > limit ? count - limit : 0 };
}

/**
 * Returns the export as text in a format.
 * @param {string} format - "csv", "tsv", "json", "md" or "html".
 * @param {ExportData} data - the header and rows.
 * @returns {string} the text, "" for another format.
 */
function formatExport(format, data) {
    if (format === 'csv') return formatCsv(data.head, data.rows, { sep: separatorField.value, q: state.q, eol: state.eol, guard: guardField.checked });
    if (format === 'tsv') return formatCsv(data.head, data.rows, { sep: '\t', q: '"', eol: state.eol, guard: guardField.checked });
    if (format === 'json') return formatJson(data.head, data.rows);
    if (format === 'md') return formatMarkdown(data.head, data.rows);
    if (format === 'html') return formatHtml(data.head, data.rows, state.name);
    return '';
}

/**
 * Shows the preview and the row count of the chosen format (XLSX: a note in place of the preview).
 * @returns {void}
 */
function updateExportPreview() {
    if (formatField.value === 'convert') return;
    const format = formatField.value;
    dialog.dataset.format = format;
    getElement('#ex-copy').hidden = format === 'xlsx';
    const data = getExportData(PREVIEW_ROWS);
    previewField.hidden = format === 'xlsx';
    xlsxHint.hidden = format !== 'xlsx';
    xlsxHint.textContent = translate(XLSX_HINT);
    previewField.value = format === 'xlsx' ? '' : formatExport(format, data) + (data.more ? `… (${data.more.toLocaleString('en')} more rows)` : '');
    const count = getExportData(0).more;
    infoField.textContent = `${count.toLocaleString('en')} ${count === 1 ? 'row' : 'rows'}`;
}

/**
 * Returns the export file of a format.
 * @param {string} format - a key of the formats.
 * @returns {Promise<Blob>} the file; CSV and TSV in the chosen encoding, the rest in UTF-8.
 */
async function getExportBlob(format) {
    const data = getExportData();
    if (format === 'xlsx') return createXlsxBlob(data.head, data.rows, state.name);
    const text = formatExport(format, data);
    const encoding = format === 'csv' || format === 'tsv' ? encodingField.value : 'utf-8';
    return new Blob([convertToBytes(text, encoding)], { type: MEDIA_TYPES[format] });
}

/**
 * Downloads the export in the chosen format.
 * @returns {Promise<void>} settles when the file is handed to the browser.
 */
async function saveExportFile() {
    updateTableNow();
    const format = formatField.value, button = getElement('#ex-download');
    button.disabled = true;
    try { saveFile(await getExportBlob(format), `${getExportName()}.${EXTENSIONS[format]}`); showToast('Downloaded'); } catch (err) { console.error(err); showToast(err.message); } finally { button.disabled = false; }
}

/**
 * Downloads a ZIP with the export in every format.
 * @returns {Promise<void>} settles when the ZIP is handed to the browser.
 */
async function saveAllFormatsAsZip() {
    const button = getElement('#ex-zip');
    button.disabled = true;
    try {
        const name = getExportName(), files = [];
        for (const format of Object.keys(EXTENSIONS)) files.push({ name: `${name}.${EXTENSIONS[format]}`, data: await getExportBlob(format) });
        saveFile(await createZip(files), `${name}-all.zip`);
        showToast('ZIP downloaded: CSV, TSV, JSON, Markdown, HTML and XLSX');
    } catch (err) { console.error(err); showToast(err.message); } finally { button.disabled = false; }
}

/**
 * Copies the export in the chosen format to the clipboard.
 * @returns {Promise<void>} settles when it is copied.
 */
async function copyExport() {
    const text = formatExport(formatField.value, getExportData());
    try { await navigator.clipboard.writeText(text); } catch (e) { previewField.value = text; previewField.select(); document.execCommand('copy'); }
    showToast('Copied to the clipboard');
}

/**
 * Copies the CSV text to the clipboard.
 * @returns {Promise<void>} settles when it is copied.
 */
async function copyCode() {
    try { await navigator.clipboard.writeText(state.code); } catch (e) { ui.ta.select(); document.execCommand('copy'); }
    showToast('CSV copied');
}

/**
 * Downloads the text exactly as it is: .tsv with a tab separator, else .csv, with a byte
 * order mark when the format asks for one.
 * @returns {void}
 */
function saveCsvFile() {
    const extension = state.sep === '\t' ? 'tsv' : 'csv';
    saveFile(new Blob([convertToBytes(state.code, state.fmt.bom ? 'utf-8-bom' : 'utf-8')], { type: MEDIA_TYPES[extension] }), `${getSafeName(state.name)}.${extension}`);
    showToast(`.${extension} downloaded`);
}

/**
 * Ctrl+S: saves to the server or the page around the editor when one is set up, else downloads
 * the CSV.
 * @returns {void}
 */
export function saveOnShortcut() {
    if (areas.grid.isEditing()) areas.grid.stopEdit(true);
    if (areas.sync && areas.sync.isActive()) { areas.sync.save(); return; }
    saveCsvFile();
}
