/**
 * Positions in the text and in the textarea. The textarea shows every line break as "\n",
 * the text keeps its own (CRLF too): an index of the CRLF breaks maps positions between the
 * two, and an index of line starts gives the line of a position.
 */

import { state, areas } from './state.js?v=2';

/**
 * Indexes the CRLF breaks and the line starts of the text, sets the textarea's text in the
 * state and measures the lines for the line wrap.
 * @returns {void}
 */
export function updateTextIndex() {
    const code = state.code;
    const breaks = [];
    for (let i = code.indexOf('\r\n'); i >= 0; i = code.indexOf('\r\n', i + 2)) breaks.push(i);
    state.crlf = breaks.length ? Int32Array.from(breaks) : null;
    state.crlfTa = state.crlf ? Int32Array.from(breaks, (position, index) => position - index) : null;
    state.ta = code.includes('\r') ? code.replace(/\r\n?/g, '\n') : code;
    const starts = [0];
    for (let i = state.ta.indexOf('\n'); i >= 0; i = state.ta.indexOf('\n', i + 1)) starts.push(i + 1);
    state.lines = Int32Array.from(starts);
    areas.lineWrap.update(state.ta);
}

/**
 * Returns how many values of a sorted list are below a value.
 * @param {Int32Array} sorted - the values in ascending order.
 * @param {number} value - the value.
 * @returns {number} the count.
 */
function getCountBelow(sorted, value) {
    let low = 0, high = sorted.length;
    while (low < high) { const middle = (low + high) >> 1; if (sorted[middle] < value) low = middle + 1; else high = middle; }
    return low;
}

/**
 * Returns the textarea position of a text position.
 * @param {number} position - the position in the text.
 * @returns {number} the position in the textarea.
 */
export function getAreaPosition(position) {
    return state.crlf ? position - getCountBelow(state.crlf, position) : position;
}

/**
 * Returns the text position of a textarea position.
 * @param {number} position - the position in the textarea.
 * @returns {number} the position in the text.
 */
export function getCodePosition(position) {
    return state.crlfTa ? position + getCountBelow(state.crlfTa, position) : position;
}

/**
 * Returns the line of a textarea position.
 * @param {number} position - the position in the textarea.
 * @returns {number} the line, 0-based.
 */
export function getAreaLine(position) {
    return getCountBelow(state.lines, position + 1) - 1;
}

/**
 * Returns the line of a text position.
 * @param {number} position - the position in the text.
 * @returns {number} the line, 0-based.
 */
export function getCodeLine(position) {
    return getAreaLine(getAreaPosition(position));
}
