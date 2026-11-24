/**
 * Template placeholders in a CSV document (?template=mustache or ?template=angle in the
 * editor's address). A tag is a cell value or part of one ({{name}}, "Order for {{name}}"). A
 * row whose cells hold section tags only ({{#items}}, {{/items}}; empty cells allowed) is a
 * control row: the page's server removes it when it fills the template and repeats or leaves
 * out the rows between. Control rows are left out of the checks for the number of fields and
 * for empty lines, and the row operations keep every block of rows between them in its place.
 *
 * This module reads the syntax from the address once and finds the control rows. It works on
 * strings only, so it runs in Node as well.
 */

import { getTemplateSyntax, getTemplateNameByAddress, hasOnlySectionTags } from './template-tags.js?v=2';

/** The template syntax the address asks for with ?template=, or null. */
export const TEMPLATE_SYNTAX = getTemplateSyntax(getTemplateNameByAddress(globalThis.location ? globalThis.location.search : ''));

/**
 * Tells whether a row is a control row: one cell, or every cell that is not empty, holds section
 * tags only.
 * @param {string[]} values - the values of the row.
 * @param {?import('./template-tags.js').TemplateSyntax} syntax - the syntax, or null.
 * @returns {boolean} true for a control row; false without a syntax.
 */
export function isControlRow(values, syntax) {
    let hasTag = false;
    for (const value of values) {
        if (!value.trim()) continue;
        if (!hasOnlySectionTags(value, syntax)) return false;
        hasTag = true;
    }
    return hasTag;
}

/**
 * Returns the control rows of a table.
 * @param {string[][]} rows - the values of every record.
 * @param {?import('./template-tags.js').TemplateSyntax} syntax - the syntax, or null.
 * @returns {Set<number>} the indices of the control rows; empty without a syntax.
 */
export function findControlRows(rows, syntax) {
    const controlRows = new Set();
    if (!syntax) return controlRows;
    rows.forEach((values, index) => { if (isControlRow(values, syntax)) controlRows.add(index); });
    return controlRows;
}

/**
 * Returns the block of every record, for sorting within the blocks: the records between two
 * control rows share an even number, each control row has the odd number between its blocks.
 * @param {number} rowCount - the number of records.
 * @param {Set<number>} controlRows - the indices of the control rows.
 * @returns {?Int32Array} the block of each record; null without control rows.
 */
export function getRecordBlocks(rowCount, controlRows) {
    if (!controlRows.size) return null;
    const blocks = new Int32Array(rowCount);
    let block = 0;
    for (let index = 0; index < rowCount; index++) {
        if (controlRows.has(index)) { blocks[index] = block + 1; block += 2; } else blocks[index] = block;
    }
    return blocks;
}
