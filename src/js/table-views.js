/**
 * The two views of a template's table (?template=): the example view, the table of the template
 * filled with the page's examples (the default), and the template view, the table of the code
 * with its tags as written.
 *
 * updateExampleTable() runs these steps after the code is read (state.P):
 *   1. without a template syntax, in the template view, or for a code without tags (whose filled
 *      text is the code itself), the table shows state.P;
 *   2. in the example view, fill the code with the examples and read the filled text
 *      (template-table.js buildExampleTable); the table shows those rows;
 *   3. when the filled text cannot be read as the template can, the table shows the template
 *      with a note.
 * Everything else works on the template: the problems, the side panel, saving and every export.
 * The table reads its rows through tableSource, and the functions below lead its rows and cells
 * back to the template's records, fields and places in the code; a cell that shows an example is
 * read-only in the example view.
 */

import { state, areas } from './state.js?v=3';
import { TEMPLATE_SYNTAX } from './template-rows.js?v=1';
import { getTemplateTags } from './template-tags.js?v=2';
import { buildExampleTable, getTemplateCell, getCodeOffsetOfCell, hasNewReadingError } from './template-table.js?v=1';

/** The view that shows the template filled with the examples. */
export const EXAMPLE_VIEW = 'example';
/** The view that shows the template with its tags. */
export const TEMPLATE_VIEW = 'template';
/** The message when a change in the example view would change the text of an example. */
export const EXAMPLE_EDIT_MESSAGE = 'This part shows an example - change it in the template view or in the code';
/** The control rows of the example table: none, its rows are filled. */
const NO_CONTROL_ROWS = new Set();
/** The view row of a record the table does not show. */
const NO_VIEW_ROW = -2;

/**
 * The state of the views: the view chosen, whether the example view could not be made, the
 * example table shown, and the order of its rows in the table (filter and sort).
 */
const views = { mode: EXAMPLE_VIEW, failed: false, shown: null, view: new Int32Array(0), viewPos: new Int32Array(0) };

/**
 * What the table reads: the example table's rows and their order in the example view, the
 * template's otherwise; the columns, their kinds and the sort are the template's.
 * @type {object}
 */
export const tableSource = {
    get P() { return views.shown ? views.shown.P : state.P; },
    get view() { return views.shown ? views.view : state.view; },
    get viewPos() { return views.shown ? views.viewPos : state.viewPos; },
    get controlRows() { return views.shown ? NO_CONTROL_ROWS : state.controlRows; },
    get header() { return state.header; },
    get colW() { return state.colW; },
    get colType() { return state.colType; },
    get sort() { return state.sort; },
};

/**
 * Returns the view chosen.
 * @returns {string} EXAMPLE_VIEW or TEMPLATE_VIEW.
 */
export function getViewMode() {
    return views.mode;
}

/**
 * Sets the view chosen.
 * @param {string} mode - EXAMPLE_VIEW or TEMPLATE_VIEW.
 * @returns {void}
 */
export function setViewMode(mode) {
    views.mode = mode === TEMPLATE_VIEW ? TEMPLATE_VIEW : EXAMPLE_VIEW;
}

/**
 * Tells whether the example view was chosen and failed, so the template's table stands in for it.
 * @returns {boolean} true while the template's table stands in for the example view.
 */
export function isExampleViewFailed() {
    return Boolean(TEMPLATE_SYNTAX) && views.mode === EXAMPLE_VIEW && views.failed;
}

/**
 * Returns the page's examples for the open document.
 * @returns {?import('./template-examples.js').TemplateExamples} the examples, null without a page or away from its document.
 */
export function getTemplateExamples() {
    return areas.sync?.getTemplate() || null;
}

/**
 * Returns the example table shown.
 * @returns {?import('./template-table.js').ExampleTable} the example table, null when the table shows the template.
 */
export function getExampleTable() {
    return views.shown;
}

/**
 * Sets the order of the example table's rows in the table (table-model.js updateView).
 * @param {{view: Int32Array, viewPos: Int32Array}} order - the rows shown in their order, and the place of each row.
 * @returns {void}
 */
export function setExampleOrder(order) {
    views.view = order.view;
    views.viewPos = order.viewPos;
}

/**
 * Returns the template as the example table leads back to it: the text the table was read from.
 * @returns {import('./template-table.js').TemplateTable} the code as read.
 */
function getTemplateTable() {
    return { code: state.parsed ?? state.code, P: state.P, sep: state.sep, q: state.q, controlRows: state.controlRows };
}

/**
 * Builds the view of the code read last (the steps in the header).
 * @returns {void}
 */
export function updateExampleTable() {
    const examples = TEMPLATE_SYNTAX && views.mode === EXAMPLE_VIEW ? getTemplateExamples() : null;
    views.shown = null;
    views.failed = false;
    if (!TEMPLATE_SYNTAX || views.mode !== EXAMPLE_VIEW) return;
    const template = getTemplateTable();
    if (!getTemplateTags(template.code, TEMPLATE_SYNTAX).length) return;
    try {
        const table = buildExampleTable(template, TEMPLATE_SYNTAX, examples);
        if (hasNewReadingError(table, template)) views.failed = true;
        else views.shown = table;
    } catch (error) {
        views.failed = true;
    }
}

/**
 * Returns the record of the template a row of the table stands for: in the example view the
 * record its row comes from (a row past the end: a new record of the template).
 * @param {number} record - the row of the table's rows, -1 for none.
 * @returns {number} the template's record, -1 for none.
 */
export function getTemplateRecordOf(record) {
    if (!views.shown || record < 0) return record;
    if (record < views.shown.records.length) return views.shown.records[record];
    return state.P.rows.length + record - views.shown.records.length;
}

/**
 * Returns the view row of the table that shows a record of the template: in the example view the
 * first row in the view's order that comes from it.
 * @param {number} record - the template's record.
 * @returns {number} the view row (-1 the header row), NO_VIEW_ROW (-2) when the table does not show it.
 */
export function getShownViewRow(record) {
    if (state.header && record === 0) return -1;
    if (!views.shown) return state.viewPos[record] >= 0 ? state.viewPos[record] : NO_VIEW_ROW;
    const row = views.view.findIndex(exampleRecord => views.shown.records[exampleRecord] === record);
    return row >= 0 ? row : NO_VIEW_ROW;
}

/**
 * Returns the cell of the template a change of a cell of the table writes to.
 * @param {number} record - the row of the table's rows (past the end: a new row).
 * @param {number} column - the column.
 * @returns {?{rec: number, c: number}} the template's record and column, null when the cell shows an example.
 */
export function getTemplateCellOf(record, column) {
    return views.shown ? getTemplateCell(views.shown, getTemplateTable(), record, column) : { rec: record, c: column };
}

/**
 * Returns why a cell of the table cannot be edited in the example view.
 * @param {number} record - the row of the table's rows.
 * @param {number} column - the column.
 * @returns {?string} the message, or null when the edit may start.
 */
export function getCellEditRefusal(record, column) {
    return getTemplateCellOf(record, column) ? null : EXAMPLE_EDIT_MESSAGE;
}

/**
 * Returns the place in the code of a cell of the example table: the start of its field there,
 * the place of its tag for a field that shows an example.
 * @param {number} record - the row of the table's rows.
 * @param {number} column - the column.
 * @returns {?number} the place in the code, null outside the example view or for a row past the end.
 */
export function getExampleCellOffset(record, column) {
    return views.shown ? getCodeOffsetOfCell(views.shown, getTemplateTable(), record, column) : null;
}
