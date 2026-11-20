/**
 * Colors of the code view: the HTML of a part of the CSV text. Fields get a color by their
 * column (six colors in turn), the header row is marked, separators and quotes have their
 * own class. Spans never hold a line break, so the result can be split into lines.
 */

import { escapeHtml } from './csv.js?v=4';

/** The number of field colors before they repeat. */
const FIELD_COLORS = 6;

/**
 * Returns the HTML of text[from, to), colored by column.
 * @param {string} text - the text with "\n" line breaks.
 * @param {number} from - the start; it must be the start of a record.
 * @param {number} to - the end.
 * @param {string} sep - the separator.
 * @param {string} q - the quote character ("" for none).
 * @param {boolean} headerFirst - true when the first record is the header row.
 * @returns {string} the HTML; line breaks stay as "\n" between the spans.
 */
export function highlight(text, from, to, sep, q, headerFirst) {
    let out = '', i = from, column = 0, isHeader = headerFirst, fieldStart = true;
    /**
     * Adds a piece of text to the HTML in a span of a class (one span per line).
     * @param {string} className - the class, "" for none.
     * @param {string} piece - the text.
     * @returns {void}
     */
    const addPiece = (className, piece) => {
        if (!piece) return;
        const escaped = escapeHtml(piece);
        out += className ? escaped.split('\n').map(part => (part ? `<span class="${className}">${part}</span>` : '')).join('\n') : escaped;
    };
    while (i < to) {
        const character = text[i];
        const fieldClass = (isHeader ? 'h ' : '') + 'f' + (column % FIELD_COLORS);
        if (fieldStart && q && character === q) {
            i = addQuotedField(text, i, to, q, fieldClass, addPiece);
            fieldStart = false;
            continue;
        }
        if (character === sep) { addPiece('p' + (sep === '\t' ? ' tab' : ''), character); column++; i++; fieldStart = true; continue; }
        if (character === '\n' || character === '\r') { out += character === '\n' ? '\n' : ''; i++; column = 0; isHeader = false; fieldStart = true; continue; }
        let k = i;
        while (k < to && text[k] !== sep && text[k] !== '\n' && text[k] !== '\r') k++;
        addPiece(fieldClass, text.slice(i, k));
        i = k;
        fieldStart = false;
    }
    return out;
}

/**
 * Adds a quoted field to the HTML: its quotes (doubled ones too) and its text. It reads the
 * field as it goes and returns where it stopped, as a reader does.
 * @param {string} text - the text.
 * @param {number} start - the position of the opening quote.
 * @param {number} to - the end of the part to color.
 * @param {string} q - the quote character.
 * @param {string} fieldClass - the class of the field's text.
 * @param {function(string, string): void} addPiece - adds a piece of text in a class.
 * @returns {number} the position after the field.
 */
function addQuotedField(text, start, to, q, fieldClass, addPiece) {
    addPiece('q', q);
    let j = start + 1, segment = j;
    for (;;) {
        const k = text.indexOf(q, j);
        if (k < 0 || k >= to) { addPiece(fieldClass, text.slice(segment, to)); return to; }
        if (text[k + 1] === q) { addPiece(fieldClass, text.slice(segment, k)); addPiece('q', q + q); j = k + 2; segment = j; continue; }
        addPiece(fieldClass, text.slice(segment, k));
        addPiece('q', q);
        return k + 1;
    }
}
