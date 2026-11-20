/**
 * Small helpers shared by the modules: file names, saving a file, and the text encodings
 * of CSV files (UTF-8, UTF-8 with a byte order mark, Windows-1252).
 */

/** The name of a file when the document has none. */
const DEFAULT_FILE_NAME = 'table';
/** How long the address of a saved file stays valid, in milliseconds. */
const DOWNLOAD_URL_LIFETIME = 4000;
/** The byte order mark of UTF-8. */
const UTF8_BOM = [0xef, 0xbb, 0xbf];
/** Windows-1252: the characters of 0x80-0x9F; the rest of 0xA0-0xFF is Latin-1. */
const CP1252 = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ';
const CP1252_START = 0x80;
const TO_1252 = new Map([...CP1252].map((character, index) => [character, CP1252_START + index]));
const LATIN1_START = 0xa0;
const LATIN1_END = 0xff;
const ASCII_END = 0x80;
/** A character Windows-1252 does not have is written as "?". */
const REPLACEMENT_BYTE = 0x3f;

/**
 * A text read from the bytes of a file.
 * @typedef {object} DecodedText
 * @property {string} text - the text without a byte order mark.
 * @property {string} encoding - "utf-8", "utf-8-bom" or "windows-1252".
 */

/**
 * Returns a name that can be used as a file name.
 * @param {*} name - the document's name.
 * @returns {string} the trimmed name, each run of \ / : * ? " < > | written as "-"; "table" when empty.
 */
export function getSafeName(name) {
    return (String(name || '').trim() || DEFAULT_FILE_NAME).replace(/[\\/:*?"<>|]+/g, '-');
}

/**
 * Saves text or a Blob as a file through the browser's download.
 * @param {string|Uint8Array|Blob} data - the content.
 * @param {string} name - the file name.
 * @param {string} [type] - the media type when data is not a Blob; text gets charset=utf-8.
 * @returns {void}
 */
export function saveFile(data, name, type = 'application/octet-stream') {
    const blob = data instanceof Blob ? data : new Blob([data], { type: type + (/^text|json/.test(type) && typeof data === 'string' ? ';charset=utf-8' : '') });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), DOWNLOAD_URL_LIFETIME);
}

/**
 * Returns a text as the bytes of an encoding.
 * @param {string} text - the text.
 * @param {string} encoding - "utf-8", "utf-8-bom" or "windows-1252" (characters it does not
 *   have become "?").
 * @returns {Uint8Array} the bytes.
 */
export function convertToBytes(text, encoding) {
    if (encoding === 'windows-1252') return convertToWindows1252(text);
    const bytes = new TextEncoder().encode(text);
    if (encoding !== 'utf-8-bom') return bytes;
    const out = new Uint8Array(bytes.length + UTF8_BOM.length);
    out.set(UTF8_BOM);
    out.set(bytes, UTF8_BOM.length);
    return out;
}

/**
 * Returns a text as Windows-1252 bytes.
 * @param {string} text - the text.
 * @returns {Uint8Array} one byte per character, "?" for characters the encoding does not have.
 */
function convertToWindows1252(text) {
    const out = new Uint8Array(text.length);
    let length = 0;
    for (const character of text) {
        const code = character.codePointAt(0);
        out[length++] = code < ASCII_END || (code >= LATIN1_START && code <= LATIN1_END) ? code : TO_1252.get(character) ?? REPLACEMENT_BYTE;
    }
    return out.subarray(0, length);
}

/**
 * Reads the bytes of a file as text.
 * @param {Uint8Array} bytes - the file's bytes.
 * @param {string} [wanted] - "auto" (UTF-8, otherwise Windows-1252), "utf-8" or "windows-1252".
 * @returns {DecodedText} the text and the encoding it was read in.
 */
export function convertFromBytes(bytes, wanted = 'auto') {
    const hasBom = bytes[0] === UTF8_BOM[0] && bytes[1] === UTF8_BOM[1] && bytes[2] === UTF8_BOM[2];
    const utf8Bytes = hasBom ? bytes.subarray(UTF8_BOM.length) : bytes;
    const utf8Encoding = hasBom ? 'utf-8-bom' : 'utf-8';
    if (wanted === 'windows-1252') return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'windows-1252' };
    if (wanted === 'utf-8') return { text: new TextDecoder('utf-8').decode(utf8Bytes), encoding: utf8Encoding };
    try {
        return { text: new TextDecoder('utf-8', { fatal: true }).decode(utf8Bytes), encoding: utf8Encoding };
    } catch (error) {
        return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'windows-1252' };
    }
}
