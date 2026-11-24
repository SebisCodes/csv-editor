/**
 * Reads a JSON list of cases (argv[3]) and runs each through the CSV editor's modules in src/js
 * (argv[2]) as the editor runs them: the separator detection, the reader, the control rows of a
 * template, the code view's highlighting, the placeholder errors, the JSON export and, for a case
 * with examples, the example view's table with the way from its cells back to the code. Prints one
 * JSON result per case for template_test.py.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const scriptFolder = process.argv[2];
const cases = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const { findSeparator, parseCsv } = await loadModule('csv.js');
const { highlight } = await loadModule('highlight.js');
const { formatJson } = await loadModule('export.js');
const rowsModule = await loadModule('template-rows.js');
const template = await loadModule('template-tags.js');
const { createTemplateExamples } = await loadModule('template-examples.js');
const exampleTable = await loadModule('template-table.js');

/**
 * Imports a module of the editor by its file name.
 * @param {string} fileName - the file in src/js, e.g. "csv.js".
 * @returns {Promise<object>} the module's exports.
 */
function loadModule(fileName) {
    return import(pathToFileURL(join(scriptFolder, fileName)).href);
}

/**
 * Returns the size of a picture as a decoder in the browser would (Node has none).
 * @returns {Promise<{width: number, height: number}>} a size of one pixel.
 */
async function readPictureSize() {
    return { width: 1, height: 1 };
}

/**
 * One case of template_test.py.
 * @typedef {object} TemplateCase
 * @property {string} code - the CSV text.
 * @property {?string} template - the template syntax, or null for plain CSV.
 * @property {?object} [example] - for the example view: `message` (the page's template message, null for none) and
 *     `cells` ([row, column] pairs of the example table to lead back to the code).
 */

/**
 * Builds the result of one case: what the editor makes of its text with its template syntax.
 * @param {TemplateCase} testCase - the text and the template syntax.
 * @returns {Promise<object>} the separator, the control rows, the highlighted HTML, the problems, the export and the example view.
 */
async function buildCaseResult(testCase) {
    const syntax = template.getTemplateSyntax(testCase.template);
    const separator = findSeparator(testCase.code);
    const table = parseCsv(testCase.code, separator, '"');
    const controlRows = rowsModule.findControlRows(table.rows, syntax);
    const shown = testCase.code.replace(/\r\n?/g, '\n');
    const blocks = rowsModule.getRecordBlocks(table.rows.length, controlRows);
    const result = {
        separator,
        rowCount: table.rows.length,
        controlRows: [...controlRows],
        blocks: blocks ? [...blocks] : null,
        problems: syntax ? template.checkTemplateSections(testCase.code, syntax) : [],
        highlighted: highlight(shown, 0, shown.length, separator, '"', true),
        values: table.rows,
        json: formatJson(table.rows[0], table.rows.slice(1)),
        tags: syntax ? template.getTemplateTags(testCase.code, syntax).map(tag => testCase.code.slice(tag.start, tag.end)) : [],
    };
    if (testCase.example) result.example = await buildExampleResult(testCase, { code: testCase.code, P: table, sep: separator, q: '"', controlRows }, syntax);
    return result;
}

/**
 * Builds the example view of a case: its rows, the template's record of each row, and for each
 * asked cell the template's cell an edit there goes to and its place in the code.
 * @param {TemplateCase} testCase - the case with `example`.
 * @param {object} templateTable - the template as read: code, P, sep, q and controlRows.
 * @param {object} syntax - the template syntax.
 * @returns {Promise<object>} rows, records, cells and newError; or the name of the error that stopped the filling.
 */
async function buildExampleResult(testCase, templateTable, syntax) {
    const message = testCase.example.message;
    const examples = message ? await createTemplateExamples(message, { decodePicture: readPictureSize }) : null;
    try {
        const filled = exampleTable.buildExampleTable(templateTable, syntax, examples);
        return {
            rows: filled.P.rows,
            records: [...filled.records],
            newError: exampleTable.hasNewReadingError(filled, templateTable),
            cells: (testCase.example.cells || []).map(([row, column]) => ({
                cell: exampleTable.getTemplateCell(filled, templateTable, row, column),
                offset: exampleTable.getCodeOffsetOfCell(filled, templateTable, row, column),
            })),
        };
    } catch (error) {
        return { error: error.name };
    }
}

const results = [];
for (const testCase of cases) results.push(await buildCaseResult(testCase));
console.log(JSON.stringify(results));
