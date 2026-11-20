/**
 * The card of a document in "My documents": its first rows as the picture, its name, how long
 * ago it changed and its size, and the buttons to rename, duplicate, download and delete it.
 */

import { findSeparator, readRecord } from './csv.js?v=4';

/** How much of a document's text the card reads for its picture. */
const PREVIEW_TEXT_LENGTH = 4000;
const PREVIEW_ROWS = 6;
const PREVIEW_COLUMNS = 4;
const SECOND = 1000;
const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;
const TWO_DAYS = 172800;
const KILOBYTE = 1024;
/** Sizes below this many bytes are shown with one decimal in KB. */
const DECIMAL_LIMIT = 10240;
const ICONS = {
    rename: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
    download: '<path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/>',
    delete: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
};

/**
 * Returns how long ago a time was, in words.
 * @param {number} time - the time in milliseconds since 1970.
 * @returns {string} "just now", "5 min ago", "3 h ago", "yesterday" or the date.
 */
function getAgeText(time) {
    const seconds = (Date.now() - time) / SECOND;
    if (seconds < MINUTE) return 'just now';
    if (seconds < HOUR) return `${Math.floor(seconds / MINUTE)} min ago`;
    if (seconds < DAY) return `${Math.floor(seconds / HOUR)} h ago`;
    if (seconds < TWO_DAYS) return 'yesterday';
    return new Date(time).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Returns the first rows of a document for the picture of its card.
 * @param {string} code - the document's text.
 * @returns {string[][]} at most 6 rows of at most 4 values.
 */
function getPreviewRows(code) {
    const head = code.slice(0, PREVIEW_TEXT_LENGTH), separator = findSeparator(head), rows = [];
    for (let i = 0; i < head.length && rows.length < PREVIEW_ROWS;) {
        const record = readRecord(head, i, separator, '"');
        rows.push(record.values.slice(0, PREVIEW_COLUMNS));
        if (record.next <= i) break;
        i = record.next;
    }
    return rows;
}

/**
 * Returns a size in words.
 * @param {number} bytes - the size in bytes.
 * @returns {string} "512 bytes", "1.5 KB" or "42 KB".
 */
export function formatSize(bytes) {
    return bytes < KILOBYTE ? `${bytes} bytes` : `${(bytes / KILOBYTE).toFixed(bytes < DECIMAL_LIMIT ? 1 : 0)} KB`;
}

/**
 * Returns the SVG of a button icon.
 * @param {string} name - "rename", "copy", "download" or "delete".
 * @returns {string} the SVG element.
 */
function getIconSvg(name) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
}

/**
 * Creates the card of a document.
 * @param {import('./files.js').FileEntry} entry - the document's entry.
 * @param {string} code - its text, for the picture.
 * @param {boolean} isCurrent - true for the open document.
 * @returns {HTMLLIElement} the card.
 */
export function createCard(entry, code, isCurrent) {
    const card = document.createElement('li');
    card.className = 'file-card' + (isCurrent ? ' current' : '');
    card.dataset.id = entry.id;
    card.innerHTML = `<button type="button" class="file-open"><span class="file-picture doc"><span class="mini-table" data-no-i18n></span></span></button>
        <div class="file-text"><span class="file-name" data-no-i18n></span><span class="file-info muted"></span></div>
        <div class="file-buttons">
            <button type="button" class="item-button" data-act="rename" title="Rename" aria-label="Rename">${getIconSvg('rename')}</button>
            <button type="button" class="item-button" data-act="copy" title="Duplicate" aria-label="Duplicate">${getIconSvg('copy')}</button>
            <button type="button" class="item-button" data-act="download" title="Download as .csv" aria-label="Download">${getIconSvg('download')}</button>
            <button type="button" class="item-button danger" data-act="delete" title="Delete" aria-label="Delete">${getIconSvg('delete')}</button>
        </div>`;
    card.title = isCurrent ? 'This document is open' : 'Click to open this document';
    addPreviewRows(card.querySelector('.mini-table'), code);
    card.querySelector('.file-name').textContent = entry.name;
    card.querySelector('.file-open').setAttribute('aria-label', isCurrent ? `${entry.name} (open now)` : `Open ${entry.name}`);
    card.querySelector('.file-info').textContent = isCurrent ? `Open now · ${formatSize(entry.size || 0)}` : `${getAgeText(entry.updated)} · ${formatSize(entry.size || 0)}`;
    return card;
}

/**
 * Adds the first rows of a text to the picture of a card, the first one as the header.
 * @param {HTMLElement} picture - the .mini-table of the card.
 * @param {string} code - the document's text.
 * @returns {void}
 */
function addPreviewRows(picture, code) {
    for (const [index, values] of getPreviewRows(code).entries()) {
        const row = document.createElement('span');
        row.className = index ? 'mz' : 'mz header-row';
        for (const value of values) { const cell = document.createElement('span'); cell.textContent = value; row.append(cell); }
        picture.append(row);
    }
}
