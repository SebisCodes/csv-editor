/**
 * The code view: the raw CSV in a textarea with its colors, line numbers and marks drawn over
 * it for the lines in sight only. Typing goes into the text with the document's own line
 * endings; the text is read again after a pause. The code's cursor selects its cell in the
 * table, and a selected cell marks its field in the code.
 *
 * startCodeView() connects typing, scrolling, the cursor and the keys of the textarea.
 */

import { findRecordIndex, readRecord } from './csv.js?v=4';
import { highlight } from './highlight.js?v=2';
import { state, areas, ui, NARROW_SCREEN } from './state.js?v=2';
import { updateTextIndex, getAreaPosition, getCodePosition, getAreaLine } from './text-index.js?v=2';
import { updateTableNow } from './refresh.js?v=3';
import { renderPanel } from './panel.js?v=3';
import { addHistoryStep, updateHistoryButtons, undo, redo } from './history.js?v=3';
import { saveDocument } from './storage.js?v=3';

const LINE_HEIGHT = 20;
const CODE_PADDING = 10;
/** Lines highlighted above and below the ones in sight. */
const EXTRA_LINES = 4;
/** The height assumed before the textarea has one. */
const DEFAULT_HEIGHT = 600;
/** Highlighting starts at the line in sight when the record holding it starts further up. */
const MAX_RECORD_LOOKBACK = 2e6;
/** The left edge of the field mark beside the padding. */
const MARK_OFFSET = 14;
const MIN_MARK_WIDTH = 4;
const ROW_MARK_OFFSET = 4;
/** Reading the text waits this long after typing; longer for large texts. */
const PARSE_DELAY = 250;
const LARGE_PARSE_DELAY = 700;
const LARGE_TEXT = 500000;
const HISTORY_DELAY = 600;
const SAVE_DELAY = 500;
const CURSOR_DELAY = 60;
const KILOBYTE = 1024;
/** The characters measured for the width of one. */
const PROBE_LENGTH = 100;
/** The cursor is scrolled into sight when it is closer than this to the right edge. */
const RIGHT_MARGIN = 60;
/** Where the cursor lands from the left edge after a sideways scroll. */
const LEFT_MARGIN = 40;

let renderFrame = 0;
let charWidth = 0;
let cursorTimer = 0;

/**
 * Draws the colors, line numbers and marks of the lines in sight and the status below the code.
 * @returns {void}
 */
export function renderCode() {
    const textarea = ui.ta, lineCount = state.lines.length, lineWrap = areas.lineWrap;
    const top = textarea.scrollTop, height = textarea.clientHeight || DEFAULT_HEIGHT;
    const first = Math.max(0, lineWrap.getLineAt(Math.max(0, top - CODE_PADDING)) - EXTRA_LINES);
    const last = Math.min(lineCount - 1, lineWrap.getLineAt(top + height) + EXTRA_LINES);
    renderHighlight(first, last);
    const y = lineWrap.getLineTop(first) - top;
    ui.hl.style.transform = `translate(${-textarea.scrollLeft}px, ${y}px)`;
    ui.gutter.textContent = lineWrap.getLineNumbers(first, last);
    ui.gutter.style.transform = `translateY(${y}px)`;
    ui.marks.innerHTML = getMarksHtml(first, last, top);
    renderCodeStatus();
    updateHistoryButtons();
}

/**
 * Colors the lines from first to last. Highlighting starts at the record that holds the first
 * line (a quoted field may span lines).
 * @param {number} first - the first line, 0-based.
 * @param {number} last - the last line.
 * @returns {void}
 */
function renderHighlight(first, last) {
    const lineCount = state.lines.length;
    const from = state.lines[first], to = last + 1 < lineCount ? state.lines[last + 1] - 1 : state.ta.length;
    let start = from, headerFirst = false;
    if (state.parsed === state.code && state.P.starts.length) {
        const record = findRecordIndex(state.P, getCodePosition(from));
        if (record >= 0) { start = getAreaPosition(state.P.starts[record]); headerFirst = state.header && record === 0; }
    } else headerFirst = state.header && from === 0;
    if (from - start > MAX_RECORD_LOOKBACK) { start = from; headerFirst = false; }
    const skip = first - getAreaLine(start);
    const lines = highlight(state.ta, start, to, state.sep, state.q, headerFirst).split('\n').slice(skip, skip + last - first + 1);
    ui.hl.innerHTML = lines.join('\n') + '\n';
}

/**
 * Returns the marks of the lines in sight: lines with problems, the field of the selected
 * cell and the cursor's line.
 * @param {number} first - the first line in sight.
 * @param {number} last - the last line in sight.
 * @param {number} top - the scroll position of the textarea.
 * @returns {string} the HTML of the marks.
 */
function getMarksHtml(first, last, top) {
    const textarea = ui.ta, lineWrap = areas.lineWrap;
    /**
     * Returns the position style of a band over a line.
     * @param {number} line - the line.
     * @returns {string} the top and height.
     */
    const getBandStyle = line => `top:${CODE_PADDING + lineWrap.getLineTop(line) - top}px;height:${lineWrap.getLineHeight(line)}px`;
    let html = '';
    for (let line = first; line <= last; line++) {
        const kind = state.probLines.get(line);
        if (kind) html += `<div class="band ${kind === 'error' ? 'err' : 'warn'}" style="${getBandStyle(line)}"></div>`;
    }
    if (state.mark) html += getFieldMarkHtml(first, last, top, getBandStyle);
    if (document.activeElement === textarea && textarea.selectionStart === textarea.selectionEnd) {
        html += `<div class="line-band" style="${getBandStyle(getAreaLine(textarea.selectionStart))}"></div>`;
    }
    return html;
}

/**
 * Returns the mark of the selected cell's field: a box on one line, else a band per line.
 * @param {number} first - the first line in sight.
 * @param {number} last - the last line in sight.
 * @param {number} top - the scroll position of the textarea.
 * @param {function(number): string} getBandStyle - the position style of a line's band.
 * @returns {string} the HTML of the mark, "" when the field is not in sight.
 */
function getFieldMarkHtml(first, last, top, getBandStyle) {
    const textarea = ui.ta;
    const [start, end] = state.mark, startLine = getAreaLine(start), endLine = getAreaLine(end);
    if (endLine < first || startLine > last) return '';
    if (startLine === endLine && !areas.lineWrap.on) {
        const width = getCharWidth();
        return `<div class="field-mark" style="top:${CODE_PADDING + startLine * LINE_HEIGHT - top}px;left:${MARK_OFFSET + (start - state.lines[startLine]) * width - textarea.scrollLeft}px;width:${Math.max(MIN_MARK_WIDTH, (end - start) * width)}px"></div>`;
    }
    let html = '';
    for (let line = Math.max(startLine, first); line <= Math.min(endLine, last); line++) {
        html += `<div class="field-mark row" style="${getBandStyle(line)};left:${CODE_PADDING + ROW_MARK_OFFSET - textarea.scrollLeft}px"></div>`;
    }
    return html;
}

/**
 * Shows lines, size, rows and columns below the code.
 * @returns {void}
 */
function renderCodeStatus() {
    const lineCount = state.lines.length;
    const size = state.code.length < KILOBYTE ? state.code.length + ' B' : (new Blob([state.code]).size / KILOBYTE).toFixed(1) + ' KB';
    const rowCount = Math.max(0, state.P.rows.length - (state.header ? 1 : 0));
    const width = state.P.width;
    ui.status.textContent = `${lineCount.toLocaleString('en')} ${lineCount === 1 ? 'line' : 'lines'} · ${size} · ${rowCount.toLocaleString('en')} × ${width}`;
    ui.status.title = `${rowCount.toLocaleString('en')} ${rowCount === 1 ? 'row' : 'rows'}, ${width} ${width === 1 ? 'column' : 'columns'}`;
}

/**
 * Asks for the code view to be drawn at the next animation frame (once, however often it is asked).
 * @returns {void}
 */
function startCodeRender() {
    if (!renderFrame) renderFrame = requestAnimationFrame(() => { renderFrame = 0; renderCode(); });
}

/**
 * Returns the width of one character of the code's font, measured once (a query that fills a cache).
 * @returns {number} the width in pixels.
 */
function getCharWidth() {
    if (!charWidth) {
        const probe = document.createElement('span');
        probe.textContent = 'x'.repeat(PROBE_LENGTH);
        probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
        probe.style.font = getComputedStyle(ui.ta).font;
        document.body.appendChild(probe);
        charWidth = probe.getBoundingClientRect().width / PROBE_LENGTH;
        probe.remove();
    }
    return charWidth;
}

/**
 * Puts the code's cursor at a text position (or selects up to end) and scrolls there.
 * @param {number} position - the text position.
 * @param {boolean} [focus] - false to leave the focus where it is (on narrow screens it stays anyway).
 * @param {number} [end] - the end of the selection.
 * @returns {void}
 */
export function showCodePosition(position, focus = true, end = position) {
    const textarea = ui.ta, lineWrap = areas.lineWrap;
    if (focus && !NARROW_SCREEN.matches) textarea.focus({ preventScroll: true });
    const start = getAreaPosition(position);
    textarea.setSelectionRange(start, getAreaPosition(end));
    const line = getAreaLine(start);
    const y = lineWrap.getLineTop(line), height = textarea.clientHeight;
    if (y < textarea.scrollTop + LINE_HEIGHT || y > textarea.scrollTop + height - LINE_HEIGHT * 2) textarea.scrollTop = Math.max(0, y - height / 3);
    const x = (start - state.lines[line]) * getCharWidth();
    if (!lineWrap.on && (x < textarea.scrollLeft || x > textarea.scrollLeft + textarea.clientWidth - RIGHT_MARGIN)) textarea.scrollLeft = Math.max(0, x - LEFT_MARGIN);
    renderCode();
}

/**
 * Selects the cell of the code's cursor in the table (while the code has the focus and the
 * table is read from the current text).
 * @returns {void}
 */
export function selectCellAtCursor() {
    if (document.activeElement !== ui.ta || state.parsed !== state.code || !areas.grid) return;
    const position = getCodePosition(ui.ta.selectionStart);
    const record = findRecordIndex(state.P, position);
    if (record < 0) return;
    const read = readRecord(state.code, state.P.starts[record], state.sep, state.q, true);
    let column = 0;
    for (let i = 0; i < read.spans.length; i++) if (position >= read.spans[i][0]) column = i;
    const viewRow = state.header && record === 0 ? -1 : state.viewPos[record];
    if (viewRow == null || viewRow < -1 || (viewRow === -1 && !(state.header && record === 0))) return;
    state.mark = null;
    areas.grid.setActive(viewRow, column, { quiet: true });
    renderPanel();
}

/**
 * Connects the textarea: typing, scrolling, resizing, the cursor and the keys.
 * @returns {void}
 */
export function startCodeView() {
    const textarea = ui.ta;
    textarea.addEventListener('input', importTyping);
    textarea.addEventListener('scroll', startCodeRender, { passive: true });
    new ResizeObserver(startCodeRender).observe(textarea);
    document.addEventListener('selectionchange', updateCursorCell);
    textarea.addEventListener('blur', startCodeRender);
    textarea.addEventListener('keydown', runCodeKey);
}

/**
 * Redraws the code after the cursor moved in it and, after a short pause, selects the cell
 * at the cursor; a selection change outside the code is ignored.
 * @returns {void}
 */
function updateCursorCell() {
    if (document.activeElement !== ui.ta) return;
    startCodeRender();
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(selectCellAtCursor, CURSOR_DELAY);
}

/**
 * Writes what was typed into the text with the document's line endings: the part between the
 * same start and the same end of the old and new textarea text is replaced. The text is read,
 * made an undo step and stored after a pause (an input handler).
 * @returns {void}
 */
function importTyping() {
    const before = state.ta, after = ui.ta.value;
    let start = 0;
    const max = Math.min(before.length, after.length);
    while (start < max && before.charCodeAt(start) === after.charCodeAt(start)) start++;
    let tail = 0;
    while (tail < before.length - start && tail < after.length - start && before.charCodeAt(before.length - 1 - tail) === after.charCodeAt(after.length - 1 - tail)) tail++;
    let inserted = after.slice(start, after.length - tail);
    if (state.eol !== '\n') inserted = inserted.replace(/\n/g, state.eol);
    const codeStart = getCodePosition(start), codeEnd = getCodePosition(before.length - tail);
    state.code = state.code.slice(0, codeStart) + inserted + state.code.slice(codeEnd);
    updateTextIndex();
    state.mark = null;
    renderCode();
    clearTimeout(state.parseTimer);
    state.parseTimer = setTimeout(updateTableNow, state.code.length > LARGE_TEXT ? LARGE_PARSE_DELAY : PARSE_DELAY);
    clearTimeout(state.histTimer);
    state.histTimer = setTimeout(addHistoryStep, HISTORY_DELAY);
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(saveDocument, SAVE_DELAY);
    areas.sync?.handleChange();
}

/**
 * Handles a key in the code: Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y undo and redo, Ctrl+Enter goes to
 * the cell in the table, Escape leaves the code, Tab types a tab.
 * @param {KeyboardEvent} event - the key.
 * @returns {void}
 */
function runCodeKey(event) {
    const ctrl = event.ctrlKey || event.metaKey;
    if (ctrl && !event.altKey && (event.key === 'z' || event.key === 'Z')) { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return; }
    if (ctrl && event.key === 'y') { event.preventDefault(); redo(); return; }
    if (ctrl && event.key === 'Enter') { event.preventDefault(); selectCellAtCursor(); areas.grid.setFocus(); return; }
    if (event.key === 'Escape') { ui.ta.blur(); return; }
    if (event.key === 'Tab' && !ctrl) {
        event.preventDefault();
        if (!document.execCommand || !document.execCommand('insertText', false, '\t')) {
            ui.ta.setRangeText('\t', ui.ta.selectionStart, ui.ta.selectionEnd, 'end');
            ui.ta.dispatchEvent(new Event('input'));
        }
    }
}
