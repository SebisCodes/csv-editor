/**
 * The example view of a CSV template (?template=): the table of the template filled with the
 * page's examples, and the way from each of its cells back to the code.
 *
 * buildExampleTable() runs these steps:
 *   1. fill the code with the examples (template-expansion.js); each fill is written as a mark of
 *      private-use characters, which holds no separator, quote or line break, so the records and
 *      fields of the filled text stand where the template has them;
 *   2. read the filled text with the template's separator and quote character;
 *   3. leave out what remains of control rows: rows that come from a control row of the template
 *      and hold empty fields only;
 *   4. put the text of each fill (the example, or the label in brackets) in the place of its mark
 *      in the values, so an example is a value as it is, whatever separators, quotes or line
 *      breaks it holds.
 * Every row knows the record of the template it comes from; a cell leads back to the code through
 * the map of the filled text. It works on strings only, so it runs in Node as well.
 */

import { parseCsv, readRecord, findRecordIndex } from './csv.js?v=4';
import { expandTemplate, getCodeOffsetByViewOffset, getCopiedCodeRange } from './template-expansion.js?v=2';

/** The first private-use character a mark may use. */
const FIRST_MARK_CODE = 0xe000;
/** The last private-use character a mark may use. */
const LAST_MARK_CODE = 0xf8ff;

/**
 * The table of a template filled with the examples.
 * @typedef {object} ExampleTable
 * @property {import('./csv.js').ParsedTable} P - the rows and their places in the filled text (with marks).
 * @property {string} text - the filled text, each fill written as its mark.
 * @property {import('./template-expansion.js').ViewSegment[]} map - leads each place of the filled text back to the code.
 * @property {Int32Array} records - the record of the template each row comes from.
 */

/**
 * The template a cell leads back to.
 * @typedef {object} TemplateTable
 * @property {string} code - the template.
 * @property {import('./csv.js').ParsedTable} P - the template as read.
 * @property {string} sep - the separator.
 * @property {string} q - the quote character.
 * @property {Set<number>} controlRows - the control rows of the template.
 */

/**
 * Fills a template with the examples and reads it as a table (the steps in the header).
 * @param {TemplateTable} template - the template as read.
 * @param {import('./template-tags.js').TemplateSyntax} syntax - the syntax of the tags.
 * @param {?import('./template-examples.js').TemplateExamples} examples - the page's examples, or null.
 * @returns {ExampleTable} the filled table.
 * @throws {import('./template-expansion.js').TemplateExpansionError} when the filling goes past its limits.
 */
export function buildExampleTable(template, syntax, examples) {
    const marks = buildFillMarks(template.code);
    const fills = [];
    const view = expandTemplate(template.code, syntax, { examples, writeFill: (tag, fill) => marks.open + (fills.push(fill.text) - 1) + marks.close });
    const filled = parseCsv(view.text, template.sep, template.q);
    const table = { P: { rows: [], starts: [], ends: [], width: 0, probs: filled.probs }, text: view.text, map: view.map, records: [] };
    filled.rows.forEach((values, index) => addExampleRow(table, template, filled, index, values.map(value => buildFilledValue(value, marks, fills))));
    table.P.starts = Int32Array.from(table.P.starts);
    table.P.ends = Int32Array.from(table.P.ends);
    table.records = Int32Array.from(table.records);
    return table;
}

/**
 * Returns the two characters a fill's mark starts and ends with: the first private-use
 * characters the code does not hold.
 * @param {string} code - the template.
 * @returns {{open: string, close: string, pattern: RegExp}} the characters and the pattern of a mark.
 * @throws {RangeError} when the code holds every private-use character.
 */
function buildFillMarks(code) {
    const found = [];
    for (let charCode = FIRST_MARK_CODE; charCode <= LAST_MARK_CODE && found.length < 2; charCode++) {
        const character = String.fromCharCode(charCode);
        if (!code.includes(character)) found.push(character);
    }
    if (found.length < 2) throw new RangeError('The template holds every private-use character');
    const [open, close] = found;
    return { open, close, pattern: new RegExp(open + '(\\d+)' + close, 'g') };
}

/**
 * Returns a value with the text of each fill in the place of its mark.
 * @param {string} value - the value read from the filled text.
 * @param {{pattern: RegExp}} marks - the pattern of a mark.
 * @param {string[]} fills - the text of each fill, by its number.
 * @returns {string} the value with the fills.
 */
function buildFilledValue(value, marks, fills) {
    return value.replace(marks.pattern, (mark, index) => fills[+index] ?? '');
}

/**
 * Adds one row of the filled text to the table, unless it is what remains of a control row.
 * @param {object} table - the table being built; changed in place.
 * @param {TemplateTable} template - the template as read.
 * @param {import('./csv.js').ParsedTable} filled - the filled text as read.
 * @param {number} index - the row in the filled text.
 * @param {string[]} values - its values with the fills.
 * @returns {void}
 */
function addExampleRow(table, template, filled, index, values) {
    const record = findRecordIndex(template.P, getCodeOffsetByViewOffset(table.map, filled.starts[index]));
    if (template.controlRows.has(record) && values.every(value => !value.trim())) return;
    table.P.rows.push(values);
    table.P.starts.push(filled.starts[index]);
    table.P.ends.push(filled.ends[index]);
    table.records.push(Math.max(0, record));
    if (values.length > table.P.width) table.P.width = values.length;
}

/**
 * Returns the cell of the template a cell of the example table stands for, when an edit there
 * changes the template's cell as it is: the cell's text is copied text of the template, of one
 * piece, and exactly one field of it. A cell past the end of its row stands for a new field of the
 * template's record when the row ends where that record ends and both have as many fields; a row
 * past the end stands for a new record of the template.
 * @param {ExampleTable} table - the example table.
 * @param {TemplateTable} template - the template as read.
 * @param {number} record - the row of the example table.
 * @param {number} column - the column.
 * @returns {?{rec: number, c: number}} the template's record and column, null when the cell shows an example.
 */
export function getTemplateCell(table, template, record, column) {
    if (record >= table.P.rows.length) return { rec: template.P.rows.length + record - table.P.rows.length, c: column };
    const read = readRecord(table.text, table.P.starts[record], template.sep, template.q, true);
    const templateRecord = table.records[record];
    const templateRead = readRecord(template.code, template.P.starts[templateRecord], template.sep, template.q, true);
    if (column >= read.spans.length) {
        const end = getCopiedCodeRange(table.map, read.end, read.end);
        return end && end.start === templateRead.end && templateRead.spans.length === read.spans.length ? { rec: templateRecord, c: column } : null;
    }
    const [start, end] = read.spans[column];
    const range = getCopiedCodeRange(table.map, start, end);
    if (!range) return null;
    const templateColumn = templateRead.spans.findIndex(span => span[0] === range.start && span[1] === range.end);
    return templateColumn >= 0 ? { rec: templateRecord, c: templateColumn } : null;
}

/**
 * Returns the place in the code of a cell of the example table: the start of its field there
 * (a field that holds an example: the place of its tag), the end of the record for a cell past it.
 * @param {ExampleTable} table - the example table.
 * @param {TemplateTable} template - the template as read.
 * @param {number} record - the row of the example table.
 * @param {number} column - the column.
 * @returns {?number} the place in the code, null for a row past the end.
 */
export function getCodeOffsetOfCell(table, template, record, column) {
    if (record < 0 || record >= table.P.rows.length) return null;
    const read = readRecord(table.text, table.P.starts[record], template.sep, template.q, true);
    const viewOffset = column < read.spans.length ? read.spans[column][0] : read.end;
    return getCodeOffsetByViewOffset(table.map, viewOffset);
}

/**
 * Tells whether the filled text has reading errors the template has none of (a quote an example
 * opened or closed), so the example table would show another table than the template's.
 * @param {ExampleTable} table - the example table.
 * @param {TemplateTable} template - the template as read.
 * @returns {boolean} true when the filled text has an error the template lacks.
 */
export function hasNewReadingError(table, template) {
    return getErrorCount(table.P.probs) > getErrorCount(template.P.probs);
}

/**
 * Returns how many reading problems are errors.
 * @param {import('./csv.js').ParseProblem[]} problems - the reading problems.
 * @returns {number} the number of errors among them.
 */
function getErrorCount(problems) {
    return problems.filter(problem => problem.kind === 'error').length;
}
