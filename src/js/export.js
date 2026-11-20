/**
 * Exports of the table: CSV with any separator, TSV, JSON, Markdown, HTML and an Excel
 * workbook (.xlsx, written here: a few XML files in a ZIP).
 * Every writer takes the header names (or null) and the rows as arrays of values.
 */

import { formatRecord, escapeHtml } from './csv.js?v=4';
import { isPlainNumber, parseNumber, getColumnLetter } from './values.js?v=3';
import { createZip } from './zip.js?v=4';

/** A cell starting with one of these would run as a formula in a spreadsheet program. */
const FORMULA_START = /^[=+\-@\t\r]/;
const FORMULA_GUARD = "'";
const LINE_BREAK = /\r?\n|\r/g;
/** The longest name of an Excel sheet. */
const MAX_SHEET_NAME = 31;
const DEFAULT_SHEET_NAME = 'Sheet1';
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';
const XML_ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const CONTENT_TYPES_XML = `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
const PACKAGE_RELS_XML = `${XML_HEAD}<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
const WORKBOOK_RELS_XML = `${XML_HEAD}<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/></Relationships>`;
const STYLES_XML = `${XML_HEAD}<styleSheet xmlns="${NS}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`;
const FROZEN_HEADER_XML = '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
const HTML_STYLE = `body { font: 14px/1.45 system-ui, sans-serif; margin: 24px; color: #1a1d26; }
table { border-collapse: collapse; }
th, td { border: 1px solid #c9ccd6; padding: 4px 8px; text-align: left; vertical-align: top; }
th { background: #eef6f1; }
tbody tr:nth-child(even) td { background: #f7f8fa; }`;

/**
 * How formatCsv() writes the text.
 * @typedef {object} CsvExportOptions
 * @property {string} [sep] - the separator.
 * @property {string} [q] - the quote character.
 * @property {string} [eol] - the line ending.
 * @property {boolean} [guard] - true to protect cells that would run as a formula.
 */

/**
 * Returns a cell protected against running as a formula in a spreadsheet program: a cell that
 * starts with = + - @, a tab or a carriage return gets a leading apostrophe; plain numbers like
 * -5 stay as they are.
 * @param {*} value - the cell.
 * @returns {string} the cell, protected where needed.
 */
function getProtectedCell(value) {
    const text = value == null ? '' : String(value);
    if (!FORMULA_START.test(text)) return text;
    if (/^[-+]/.test(text) && !Number.isNaN(parseNumber(text))) return text;
    return FORMULA_GUARD + text;
}

/**
 * Returns the most values in a row (a loop: there may be too many rows for Math.max(...)).
 * @param {string[]|null} head - the header names or null.
 * @param {string[][]} rows - the rows.
 * @param {number} min - the least width to return.
 * @returns {number} the width of the table.
 */
function getTableWidth(head, rows, min) {
    let width = Math.max(min, head ? head.length : 0);
    for (const row of rows) if (row.length > width) width = row.length;
    return width;
}

/**
 * Returns the table as CSV text.
 * @param {string[]|null} head - the header names or null.
 * @param {string[][]} rows - the rows.
 * @param {CsvExportOptions} [options] - separator, quote, line ending and formula protection.
 * @returns {string} the CSV with a line ending after every record.
 */
export function formatCsv(head, rows, { sep = ',', q = '"', eol = '\n', guard = false } = {}) {
    const all = head ? [head, ...rows] : rows;
    /**
     * Returns a row protected against formulas, or as it is without the guard.
     * @param {Array<*>} row - the values.
     * @returns {Array<*>} the values to write.
     */
    const protectRow = guard ? row => row.map(getProtectedCell) : row => row;
    return all.map(row => formatRecord(protectRow(row), sep, q) + eol).join('');
}

/**
 * Returns the header names as JSON keys: an empty name becomes "column_<n>"; the first column
 * of a name keeps it, a repeated one gets the next "_<n>" that no column has
 * (x, x, x_2 -> x, x_3, x_2).
 * @param {Array<string>|null} head - the header names or null.
 * @param {number} width - the number of columns.
 * @returns {string[]} one unique key per column.
 */
export function getJsonKeys(head, width) {
    const names = Array.from({ length: width }, (_, column) => String(head?.[column] ?? '').trim() || `column_${column + 1}`);
    const taken = new Set(names), firstSeen = new Set();
    const keys = [];
    for (const name of names) {
        if (!firstSeen.has(name)) { firstSeen.add(name); keys.push(name); continue; }
        let n = 2;
        while (taken.has(`${name}_${n}`)) n++;
        taken.add(`${name}_${n}`);
        keys.push(`${name}_${n}`);
    }
    return keys;
}

/**
 * Returns the table as JSON: an array of objects keyed by the header, or of arrays without one.
 * @param {string[]|null} head - the header names or null.
 * @param {string[][]} rows - the rows.
 * @returns {string} the JSON, indented by two spaces, with a final line break.
 */
export function formatJson(head, rows) {
    if (!head) return JSON.stringify(rows, null, 2) + '\n';
    const keys = getJsonKeys(head, getTableWidth(head, rows, 0));
    const objects = rows.map(row => Object.fromEntries(keys.map((name, column) => [name, row[column] ?? ''])));
    return JSON.stringify(objects, null, 2) + '\n';
}

/**
 * Returns a cell for a Markdown table: backslashes and pipes escaped, line breaks as <br>.
 * @param {*} value - the cell.
 * @returns {string} the escaped cell.
 */
function escapeMarkdownCell(value) {
    return String(value ?? '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(LINE_BREAK, '<br>');
}

/**
 * Returns the table as a Markdown table; without a header the column letters head it.
 * @param {string[]|null} head - the header names or null.
 * @param {string[][]} rows - the rows.
 * @returns {string} the table with a final line break.
 */
export function formatMarkdown(head, rows) {
    const width = getTableWidth(head, rows, 1);
    const header = head || Array.from({ length: width }, (_, column) => getColumnLetter(column));
    /**
     * Returns one row of the Markdown table.
     * @param {Array<*>} row - the values.
     * @returns {string} the row with its pipes.
     */
    const formatLine = row => '| ' + Array.from({ length: width }, (_, column) => escapeMarkdownCell(row[column])).join(' | ') + ' |';
    return [formatLine(header), '| ' + Array(width).fill('---').join(' | ') + ' |', ...rows.map(formatLine)].join('\n') + '\n';
}

/**
 * Returns a cell for an HTML table: escaped, line breaks as <br>.
 * @param {*} value - the cell.
 * @returns {string} the cell's HTML.
 */
function escapeHtmlCell(value) {
    return escapeHtml(value ?? '').replace(LINE_BREAK, '<br>');
}

/**
 * Returns the table as an HTML page.
 * @param {string[]|null} head - the header names or null.
 * @param {string[][]} rows - the rows.
 * @param {string} title - the page title.
 * @returns {string} the whole page.
 */
export function formatHtml(head, rows, title) {
    const width = getTableWidth(head, rows, 1);
    /**
     * Returns the cells of one row of the HTML table.
     * @param {Array<*>} row - the values.
     * @param {string} tag - "th" or "td".
     * @returns {string} the cells.
     */
    const formatCells = (row, tag) => Array.from({ length: width }, (_, column) => `<${tag}>${escapeHtmlCell(row[column])}</${tag}>`).join('');
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${HTML_STYLE}
</style>
</head>
<body>
<table>
${head ? `<thead><tr>${formatCells(head, 'th')}</tr></thead>\n` : ''}<tbody>
${rows.map(row => `<tr>${formatCells(row, 'td')}</tr>`).join('\n')}
</tbody>
</table>
</body>
</html>
`;
}

/* ---------- XLSX ---------- */

/**
 * Returns a text for XML: characters XML does not allow removed, markup characters escaped.
 * @param {*} text - the text.
 * @returns {string} the escaped text.
 */
function escapeXml(text) {
    return String(text ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '').replace(/[&<>"]/g, character => XML_ENTITIES[character]);
}

/**
 * Returns the worksheet XML of the table. Plain numbers become number cells; everything else
 * is a text cell (inline string), so text is never written as a formula. The header row is
 * bold and frozen.
 * @param {string[]|null} head - the header names or null.
 * @param {string[][]} rows - the rows.
 * @returns {string} the XML of xl/worksheets/sheet1.xml.
 */
export function formatSheetXml(head, rows) {
    const out = [];
    const all = head ? [head, ...rows] : rows;
    let width = 0;
    for (let r = 0; r < all.length; r++) {
        const row = all[r];
        if (row.length > width) width = row.length;
        out.push(`<row r="${r + 1}">${formatSheetCells(row, r, !!head && r === 0)}</row>`);
    }
    const pane = head && rows.length ? FROZEN_HEADER_XML : '';
    const dimension = all.length && width ? `<dimension ref="A1:${getColumnLetter(width - 1)}${all.length}"/>` : '';
    return `${XML_HEAD}<worksheet xmlns="${NS}" xmlns:r="${REL}">${dimension}${pane}<sheetData>${out.join('')}</sheetData></worksheet>`;
}

/**
 * Returns the cells of one worksheet row; empty cells are left out.
 * @param {string[]} row - the values.
 * @param {number} rowIndex - the row, 0-based.
 * @param {boolean} isHeader - true for the header row (bold, always text).
 * @returns {string} the <c> elements.
 */
function formatSheetCells(row, rowIndex, isHeader) {
    const bold = isHeader ? ' s="1"' : '';
    const cells = [];
    for (let c = 0; c < row.length; c++) {
        const value = row[c] ?? '';
        if (value === '') continue;
        const reference = getColumnLetter(c) + (rowIndex + 1);
        if (!bold && isPlainNumber(value)) cells.push(`<c r="${reference}"><v>${value}</v></c>`);
        else cells.push(`<c r="${reference}" t="inlineStr"${bold}><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`);
    }
    return cells.join('');
}

/**
 * Creates the Excel workbook of the table: one sheet named after the document.
 * @param {string[]|null} head - the header names or null.
 * @param {string[][]} rows - the rows.
 * @param {string} name - the document's name, the name of the sheet.
 * @returns {Promise<Blob>} the .xlsx file.
 */
export function createXlsxBlob(head, rows, name) {
    const sheet = (String(name || DEFAULT_SHEET_NAME).replace(/[\[\]:*?/\\]/g, ' ').trim() || DEFAULT_SHEET_NAME).slice(0, MAX_SHEET_NAME);
    const files = [
        { name: '[Content_Types].xml', data: CONTENT_TYPES_XML },
        { name: '_rels/.rels', data: PACKAGE_RELS_XML },
        { name: 'xl/workbook.xml', data: `${XML_HEAD}<workbook xmlns="${NS}" xmlns:r="${REL}"><sheets><sheet name="${escapeXml(sheet)}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
        { name: 'xl/_rels/workbook.xml.rels', data: WORKBOOK_RELS_XML },
        { name: 'xl/styles.xml', data: STYLES_XML },
        { name: 'xl/worksheets/sheet1.xml', data: formatSheetXml(head, rows) },
    ];
    return createZip(files).then(bytes => new Blob([bytes], { type: XLSX_TYPE }));
}
