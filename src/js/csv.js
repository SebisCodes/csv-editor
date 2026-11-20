/**
 * CSV: reading the text, writing fields and records, and changing the text.
 *
 * The text is the single source of truth. parseCsv() reads it into records
 * (rows) with their offsets in the text; every change is made on the text
 * itself: a changed cell replaces only that field, rows and columns are
 * rebuilt from the raw text of the other records, so their quoting and the
 * line endings stay as they are. A field is quoted only when it needs it
 * (it contains the separator, the quote character or a line break).
 *
 * Changes of the text (cells, records, columns) are made in csv-edit.js, the values of the
 * cells (numbers, dates, column kinds) are read in values.js, the colors of the code view are
 * made in highlight.js.
 */

/** The separators the editor detects and offers. */
export const SEPARATORS = [',', ';', '\t', '|'];
/** The English name of each separator, for messages and the AI prompt. */
export const SEPARATOR_NAMES = { ',': 'comma', ';': 'semicolon', '\t': 'tab', '|': 'pipe' };

/** How many lines findSeparator() looks at. */
const SAMPLE_LINES = 40;
/** A separator found in more lines wins over one found more often in fewer lines. */
const LINE_COUNT_WEIGHT = 1000;
/** At most this many reading problems are kept for the whole text. */
const MAX_PARSE_PROBLEMS = 500;
const QUOTE = '"';
const LINE_FEED = 10;
const CARRIAGE_RETURN = 13;
const HTML_ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

/**
 * A reading problem found by readRecord().
 * @typedef {object} ParseProblem
 * @property {number} pos - the position in the text where it is.
 * @property {string} kind - "error" or "warn".
 * @property {string} code - "unclosed", "after-quote" or "stray-quote".
 * @property {number} [row] - the record it is in (set by parseCsv()).
 */

/**
 * One record read by readRecord().
 * @typedef {object} CsvRecord
 * @property {string[]} values - the values of its fields, quotes removed.
 * @property {Array<number[]>|null} spans - with spans asked for, the raw [start, end) of each field.
 * @property {number} end - where its line ending starts (or the end of the text).
 * @property {number} next - where the next record starts.
 * @property {ParseProblem[]|null} probs - the problems in it, null when there are none.
 */

/**
 * The whole text read by parseCsv().
 * @typedef {object} ParsedTable
 * @property {string[][]} rows - the values of every record.
 * @property {Int32Array} starts - where each record starts.
 * @property {Int32Array} ends - where the line ending of each record starts.
 * @property {number} width - the most fields in a record.
 * @property {ParseProblem[]} probs - the reading problems (at most 500).
 */

/**
 * How the text is written: separator, quote character and line ending.
 * @typedef {object} WriteFormat
 * @property {string} sep - the separator.
 * @property {string} q - the quote character.
 * @property {string} eol - the line ending of new records.
 */

/**
 * Returns a text with the characters that HTML reads as markup written as entities.
 * @param {*} text - the text (turned into a string).
 * @returns {string} the escaped text.
 */
export function escapeHtml(text) {
    return String(text).replace(/[&<>"]/g, character => HTML_ENTITIES[character]);
}

/* ---------- Reading ---------- */

/**
 * Returns the separator used most consistently in the first lines (outside quotes).
 * @param {string} text - the start of the text.
 * @returns {string} the separator; a comma when none of them is found.
 */
export function findSeparator(text) {
    const lines = getSampleLines(text);
    let best = ',', bestScore = -1;
    for (const separator of SEPARATORS) {
        const score = getSeparatorScore(lines, separator);
        if (score > bestScore) { bestScore = score; best = separator; }
    }
    return best;
}

/**
 * Returns the first lines of a text that are not empty, with the quoted parts left out.
 * @param {string} text - the start of the text.
 * @returns {string[]} at most 40 lines.
 */
function getSampleLines(text) {
    const lines = [];
    let inQuotes = false, current = '';
    for (let i = 0; i < text.length && lines.length < SAMPLE_LINES; i++) {
        const character = text[i];
        if (character === QUOTE) { inQuotes = !inQuotes; continue; }
        if (!inQuotes && (character === '\n' || character === '\r')) { if (current.trim()) lines.push(current); current = ''; continue; }
        if (!inQuotes) current += character;
    }
    if (current.trim() && lines.length < SAMPLE_LINES) lines.push(current);
    return lines;
}

/**
 * Returns how well a separator fits sample lines: the number of lines that share the most
 * common count of it, then that count.
 * @param {string[]} lines - the sample lines.
 * @param {string} separator - the separator to rate.
 * @returns {number} the score; -1 when no line has the separator.
 */
function getSeparatorScore(lines, separator) {
    const frequency = new Map();
    for (const line of lines) {
        const count = line.split(separator).length - 1;
        if (count > 0) frequency.set(count, (frequency.get(count) || 0) + 1);
    }
    let mode = 0, hits = 0;
    for (const [count, lineCount] of frequency) if (lineCount > hits || (lineCount === hits && count > mode)) { mode = count; hits = lineCount; }
    return hits ? hits * LINE_COUNT_WEIGHT + mode : -1;
}

/**
 * Returns the line ending of the records: the first one outside quotes.
 * @param {string} text - the text or its start.
 * @returns {string} "\r\n", "\r" or "\n" (also when the text has no line break).
 */
export function findLineEnding(text) {
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const character = text[i];
        if (character === QUOTE) inQuotes = !inQuotes;
        else if (!inQuotes && character === '\r') return text[i + 1] === '\n' ? '\r\n' : '\r';
        else if (!inQuotes && character === '\n') return '\n';
    }
    return '\n';
}

/**
 * Reads one record. The loop over the fields stays in one function: it runs for every
 * record of files with 100 000 rows.
 * @param {string} text - the whole text.
 * @param {number} start - where the record starts.
 * @param {string} sep - the separator.
 * @param {string} q - the quote character ("" for none).
 * @param {boolean} [spans] - true to note the raw [start, end) of each field.
 * @returns {CsvRecord} the values, spans, end, next record and problems.
 */
export function readRecord(text, start, sep, q, spans = false) {
    const length = text.length, separatorCode = sep.charCodeAt(0), quoteCode = q ? q.charCodeAt(0) : -1;
    const values = [], fieldSpans = spans ? [] : null;
    let problems = null, end, i = start;
    for (;;) {
        const fieldStart = i;
        if (i < length && text.charCodeAt(i) === quoteCode) {
            i++;
            let value = '', segment = i;
            for (;;) {
                const j = text.indexOf(q, i);
                if (j < 0) { value += text.slice(segment); i = length; (problems ||= []).push({ pos: fieldStart, kind: 'error', code: 'unclosed' }); break; }
                if (text.charCodeAt(j + 1) === quoteCode) { value += text.slice(segment, j + 1); i = j + 2; segment = i; continue; }
                value += text.slice(segment, j);
                i = j + 1;
                break;
            }
            let k = i;
            while (k < length) { const code = text.charCodeAt(k); if (code === separatorCode || code === LINE_FEED || code === CARRIAGE_RETURN) break; k++; }
            if (k > i) { (problems ||= []).push({ pos: i, kind: 'warn', code: 'after-quote' }); value += text.slice(i, k); i = k; }
            values.push(value);
        } else {
            let k = i;
            while (k < length) { const code = text.charCodeAt(k); if (code === separatorCode || code === LINE_FEED || code === CARRIAGE_RETURN) break; k++; }
            const value = text.slice(i, k);
            if (q && value.includes(q)) (problems ||= []).push({ pos: i + value.indexOf(q), kind: 'warn', code: 'stray-quote' });
            values.push(value);
            i = k;
        }
        if (fieldSpans) fieldSpans.push([fieldStart, i]);
        if (i >= length) { end = length; break; }
        const code = text.charCodeAt(i);
        if (code === separatorCode) {
            i++;
            if (i >= length) { values.push(''); if (fieldSpans) fieldSpans.push([length, length]); end = length; break; }
            continue;
        }
        end = i;
        i += code === CARRIAGE_RETURN && text.charCodeAt(i + 1) === LINE_FEED ? 2 : 1;
        break;
    }
    return { values, spans: fieldSpans, end, next: i, probs: problems };
}

/**
 * Reads the whole text into records.
 * @param {string} text - the text.
 * @param {string} sep - the separator.
 * @param {string} q - the quote character.
 * @returns {ParsedTable} the records with their places, the width and the problems.
 */
export function parseCsv(text, sep, q) {
    const rows = [], starts = [], ends = [], problems = [];
    let i = 0, width = 0;
    while (i < text.length) {
        const record = readRecord(text, i, sep, q);
        rows.push(record.values);
        starts.push(i);
        ends.push(record.end);
        if (record.values.length > width) width = record.values.length;
        if (record.probs) for (const problem of record.probs) if (problems.length < MAX_PARSE_PROBLEMS) problems.push({ ...problem, row: rows.length - 1 });
        i = record.next;
    }
    return { rows, starts: Int32Array.from(starts), ends: Int32Array.from(ends), width, probs: problems };
}

/**
 * Returns the index of the record that holds a text position.
 * @param {ParsedTable} table - the read text.
 * @param {number} position - the position in the text.
 * @returns {number} the record index, -1 before the first record.
 */
export function findRecordIndex(table, position) {
    const starts = table.starts;
    let low = 0, high = starts.length - 1, best = -1;
    while (low <= high) { const middle = (low + high) >> 1; if (starts[middle] <= position) { best = middle; low = middle + 1; } else high = middle - 1; }
    return best;
}

/* ---------- Writing ---------- */

/**
 * Tells whether a value must be quoted.
 * @param {string} value - the value.
 * @param {string} sep - the separator.
 * @param {string} q - the quote character.
 * @returns {boolean} true when it holds the separator, the quote character or a line break.
 */
export function isQuoteNeeded(value, sep, q) {
    return value.includes(sep) || (!!q && value.includes(q)) || value.includes('\n') || value.includes('\r');
}

/**
 * Returns a value as a field of the text, quoted when it needs it (or always).
 * @param {*} value - the value (null and undefined are empty).
 * @param {string} sep - the separator.
 * @param {string} q - the quote character ("" writes a double quote when quoting).
 * @param {boolean} [always] - true to quote every field.
 * @returns {string} the field as written in the text.
 */
export function formatField(value, sep, q, always = false) {
    const text = value == null ? '' : String(value);
    if (!always && !isQuoteNeeded(text, sep, q)) return text;
    const quote = q || QUOTE;
    return quote + text.split(quote).join(quote + quote) + quote;
}

/**
 * Returns values as one record of the text, without a line ending.
 * @param {Array<*>} values - the values.
 * @param {string} sep - the separator.
 * @param {string} q - the quote character.
 * @returns {string} the record.
 */
export function formatRecord(values, sep, q) {
    return values.map(value => formatField(value, sep, q)).join(sep);
}
