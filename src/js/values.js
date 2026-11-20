/**
 * The values of cells: numbers and dates as people write them, the kind of a column
 * (number, date, text or empty) with its counts, sort keys, and the letters of columns.
 */

/** A number as people write it: 1234, -1.5, 1'234.50, 1,234.5, 1.234,5, 12%, 1e3. */
const NUMBER = /^[-+]?(?:\d+|\d{1,3}(?:[’' ]\d{3})+|\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d{1,3}(?:\.\d{3})+(?:,\d+)?)?(?:[.,]\d+)?(?:[eE][-+]?\d+)?%?$/;
/** A plain number as a program writes it: -12, 3.5, 1e3; no leading zeros. */
const PLAIN_NUMBER = /^-?(?:0|[1-9]\d{0,14})(?:\.\d+)?(?:[eE][-+]?\d+)?$/;
const ISO_DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/;
const DOTTED_DATE = /^(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const SLASHED_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
/** An ISO date with more after it is a date only up to this length. */
const MAX_ISO_DATE_LENGTH = 30;
/** A two-digit year is read as 2000 + the year. */
const CENTURY = 2000;
/** A year below this is written with two digits. */
const TWO_DIGIT_YEAR_LIMIT = 100;
const MONTHS_PER_YEAR = 12;
const MAX_DAY_OF_MONTH = 31;
/** The factor that moves a sort key two decimal digits up, making room for the next part. */
const TWO_DIGIT_SHIFT = 100;
/** The factor that moves the date part of a sort key above hhmmss. */
const TIME_OF_DAY_SHIFT = 1e6;
/** A column is of a kind when this share of its filled cells is of it. */
const KIND_SHARE = 0.95;
/** The most frequent values listed per column. */
const TOP_VALUES = 5;
const ALPHABET_LENGTH = 26;
const CHAR_CODE_A = 65;
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * What getColumnInfo() finds in the values of a column.
 * @typedef {object} ColumnInfo
 * @property {number} count - the number of values.
 * @property {number} empty - the empty ones.
 * @property {number} filled - the others.
 * @property {number} distinct - the different filled values.
 * @property {string} type - "number", "date", "text" or "empty".
 * @property {number} nums - the values that are numbers.
 * @property {number} dates - the values that are dates.
 * @property {number} min - the smallest number.
 * @property {number} max - the largest number.
 * @property {number} sum - the sum of the numbers.
 * @property {number} avg - the average of the numbers, NaN without numbers.
 * @property {string} first - the earliest date as written.
 * @property {string} last - the latest date as written.
 * @property {Array<Array<*>>} top - the most frequent values as [value, count].
 */

/**
 * Reads a cell as a number.
 * @param {*} text - the cell (turned into a string).
 * @returns {number} the number, or NaN when the cell is no number.
 */
export function parseNumber(text) {
    const trimmed = String(text).trim();
    if (!trimmed || !/\d/.test(trimmed) || !NUMBER.test(trimmed)) return NaN;
    const value = Number(getNumberInCodeForm(trimmed.replace(/[’' %]/g, '')));
    return Number.isFinite(value) ? value : NaN;
}

/**
 * Returns a number as people write it in the form JavaScript reads: the last of dot and comma
 * is the decimal mark, the other one groups thousands.
 * @param {string} digits - the number without spaces, apostrophes and percent sign.
 * @returns {string} the number with a dot as decimal mark and no group marks.
 */
function getNumberInCodeForm(digits) {
    const dot = digits.lastIndexOf('.'), comma = digits.lastIndexOf(',');
    if (dot >= 0 && comma >= 0) return dot > comma ? digits.replace(/,/g, '') : digits.replace(/\./g, '').replace(',', '.');
    if (comma >= 0) return /^[-+]?\d{1,3}(,\d{3})+$/.test(digits) ? digits.replace(/,/g, '') : digits.replace(',', '.');
    if (/^[-+]?\d{1,3}(\.\d{3}){2,}$/.test(digits)) return digits.replace(/\./g, '');
    return digits;
}

/**
 * Tells whether a cell is a plain number as written in a program (for JSON and XLSX).
 * @param {string} text - the cell.
 * @returns {boolean} true for -12, 3.5, 1e3; false for leading zeros and grouped digits.
 */
export function isPlainNumber(text) {
    return PLAIN_NUMBER.test(text);
}

/**
 * Reads a cell as a date: YYYY-MM-DD, DD.MM.YYYY or MM/DD/YYYY, each with an optional time.
 * @param {*} text - the cell (turned into a string).
 * @returns {number} a sortable number yyyymmddhhmmss, or NaN when the cell is no date.
 */
export function parseDate(text) {
    const trimmed = String(text).trim();
    let match = ISO_DATE.exec(trimmed), year, month, day;
    if (match && trimmed.length <= MAX_ISO_DATE_LENGTH) [year, month, day] = [+match[1], +match[2], +match[3]];
    else if ((match = DOTTED_DATE.exec(trimmed))) [day, month, year] = [+match[1], +match[2], +match[3] < TWO_DIGIT_YEAR_LIMIT ? CENTURY + +match[3] : +match[3]];
    else if ((match = SLASHED_DATE.exec(trimmed))) [month, day, year] = [+match[1], +match[2], +match[3]];
    else return NaN;
    if (month < 1 || month > MONTHS_PER_YEAR || day < 1 || day > MAX_DAY_OF_MONTH) return NaN;
    const datePart = (year * TWO_DIGIT_SHIFT + month) * TWO_DIGIT_SHIFT + day;
    const timePart = ((+match[4] || 0) * TWO_DIGIT_SHIFT + (+match[5] || 0)) * TWO_DIGIT_SHIFT + (+match[6] || 0);
    return datePart * TIME_OF_DAY_SHIFT + timePart;
}

/**
 * Returns the kind of a column from its values, with its counts, numbers and dates.
 * @param {Array<string|null|undefined>} values - the values of the column's data rows.
 * @returns {ColumnInfo} what the column holds.
 */
export function getColumnInfo(values) {
    let empty = 0, nums = 0, dates = 0, min = Infinity, max = -Infinity, sum = 0, firstDate = Infinity, lastDate = -Infinity, first = '', last = '';
    const counts = new Map();
    for (const raw of values) {
        const value = raw == null ? '' : raw;
        if (!value.trim()) { empty++; continue; }
        counts.set(value, (counts.get(value) || 0) + 1);
        const number = parseNumber(value);
        if (!Number.isNaN(number)) { nums++; sum += number; if (number < min) min = number; if (number > max) max = number; continue; }
        const date = parseDate(value);
        if (!Number.isNaN(date)) { dates++; if (date < firstDate) { firstDate = date; first = value; } if (date > lastDate) { lastDate = date; last = value; } }
    }
    const filled = values.length - empty;
    const type = !filled ? 'empty' : nums / filled >= KIND_SHARE ? 'number' : dates / filled >= KIND_SHARE ? 'date' : 'text';
    const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, TOP_VALUES);
    return { count: values.length, empty, filled, distinct: counts.size, type, nums, dates, min, max, sum, avg: nums ? sum / nums : NaN, first, last, top };
}

/**
 * Returns the function that turns a cell into its sort key for a kind of column.
 * @param {string} type - "number", "date" or another kind (sorted as text).
 * @returns {function(string): (number|string)} the key of a cell; a cell that is not of the
 *   kind sorts last (Infinity).
 */
export function getSortKey(type) {
    if (type === 'number') return value => { const number = parseNumber(value); return Number.isNaN(number) ? Infinity : number; };
    if (type === 'date') return value => { const date = parseDate(value); return Number.isNaN(date) ? Infinity : date; };
    return value => (value || '').toLocaleLowerCase();
}

/**
 * Compares two sort keys: numbers by size, texts in natural order, empty texts last.
 * Shaped as an Array.prototype.sort comparator.
 * @param {number|string} a - the first key.
 * @param {number|string} b - the second key.
 * @returns {number} below 0 when a comes first, above 0 when b does, 0 when equal.
 */
export function getValueOrder(a, b) {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    if (a === '' && b !== '') return 1;
    if (b === '' && a !== '') return -1;
    return collator.compare(a, b);
}

/**
 * Returns the letter of a column as spreadsheet programs write it.
 * @param {number} column - the column, 0-based.
 * @returns {string} A, B, … Z, AA, AB …
 */
export function getColumnLetter(column) {
    let letters = '';
    for (let c = column + 1; c > 0; c = Math.floor((c - 1) / ALPHABET_LENGTH)) letters = String.fromCharCode(CHAR_CODE_A + ((c - 1) % ALPHABET_LENGTH)) + letters;
    return letters;
}
