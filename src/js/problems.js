/**
 * Problems of the document, listed above the code with their line: unclosed quotes, text after
 * a closing quote, quotes inside an unquoted field, rows with another number of fields than
 * the header (or most rows), and empty and repeated header names. In a template (?template=)
 * the control rows are left out of the field count, and the placeholder errors of the whole text
 * join the list. A click on one puts the code's cursor there.
 */

import { readRecord, escapeHtml } from './csv.js?v=4';
import { getColumnLetter } from './values.js?v=3';
import { state, ui, NARROW_SCREEN, translate } from './state.js?v=3';
import { getCodeLine } from './text-index.js?v=3';
import { showCodePosition, selectCellAtCursor } from './code-view.js?v=4';
import { showPane } from './layout.js?v=4';
import { checkTemplateSections } from './template-tags.js?v=2';
import { TEMPLATE_SYNTAX } from './template-rows.js?v=1';

/** At most this many problems are listed per kind of check. */
const MAX_LISTED = 400;
/** The rows counted to find the usual number of fields of a table without a header. */
const COUNTED_ROWS = 5000;
/** The problems shown in the list. */
const SHOWN_PROBLEMS = 80;
const PARSE_MESSAGES = {
    'unclosed': 'This quote is never closed - the rest of the file is one field',
    'after-quote': 'Text after the closing quote of a field',
    'stray-quote': 'A quote inside a field that does not start with a quote',
};

/**
 * Finds the problems of the read text and the kind of problem on each line.
 * @returns {void}
 */
export function updateProblems() {
    const problems = getParseProblems();
    const expected = getExpectedFieldCount();
    const fieldCounts = getFieldCountProblems(expected, problems.length);
    problems.push(...fieldCounts.problems, ...getHeaderNameProblems());
    for (const problem of getTemplateProblems()) problems.push(problem);
    problems.sort((a, b) => a.pos - b.pos);
    state.problems = problems;
    state.problemsMore = fieldCounts.wrongRows > MAX_LISTED ? fieldCounts.wrongRows - MAX_LISTED : 0;
    state.probLines = new Map();
    for (const problem of problems) {
        const line = getCodeLine(problem.pos);
        if (!state.probLines.has(line) || problem.kind === 'error') state.probLines.set(line, problem.kind);
    }
}

/**
 * Returns the problems found while reading the text, with their messages.
 * @returns {import('./state.js').Problem[]} the problems.
 */
function getParseProblems() {
    const problems = [];
    for (const problem of state.P.probs) {
        const message = PARSE_MESSAGES[problem.code];
        if (message) problems.push({ pos: problem.pos, kind: problem.code === 'unclosed' ? 'error' : 'warn', msg: message });
    }
    return problems;
}

/**
 * Returns the number of fields a row should have: the header's, or the most common one (control
 * rows left out).
 * @returns {number} the number of fields.
 */
function getExpectedFieldCount() {
    const rows = state.P.rows;
    if (state.header && rows.length) return rows[0].length;
    const frequency = new Map();
    let counted = 0;
    for (let i = 0; i < rows.length && counted < COUNTED_ROWS; i++) {
        if (state.controlRows.has(i)) continue;
        frequency.set(rows[i].length, (frequency.get(rows[i].length) || 0) + 1);
        counted++;
    }
    let expected = 0, best = 0;
    for (const [count, rowCount] of frequency) if (rowCount > best) { best = rowCount; expected = count; }
    return expected;
}

/**
 * Returns the rows with another number of fields than expected (empty lines told apart); control
 * rows are left out.
 * @param {number} expected - the number of fields a row should have.
 * @param {number} alreadyListed - the problems already in the list; the list stops at 401.
 * @returns {{problems: import('./state.js').Problem[], wrongRows: number}} the listed problems and
 *   the number of all such rows.
 */
function getFieldCountProblems(expected, alreadyListed) {
    const rows = state.P.rows, problems = [];
    let wrongRows = 0;
    for (let i = state.header ? 1 : 0; i < rows.length; i++) {
        const count = rows[i].length;
        if (count === expected || state.controlRows.has(i)) continue;
        wrongRows++;
        if (alreadyListed + problems.length > MAX_LISTED) continue;
        const pos = state.P.starts[i];
        const fields = `${count} ${count === 1 ? 'field' : 'fields'}`;
        if (count === 1 && rows[i][0] === '') problems.push({ pos, kind: 'warn', msg: 'Empty line' });
        else problems.push({ pos, kind: 'warn', msg: state.header ? `${fields} - the header has ${expected}` : `${fields} - most rows have ${expected}` });
    }
    return { problems, wrongRows };
}

/**
 * Returns the placeholder errors of the whole text: sections left open, stray or misplaced end
 * tags and tags with a sign outside the syntax.
 * @returns {import('./state.js').Problem[]} the errors; empty without a template syntax.
 */
function getTemplateProblems() {
    return TEMPLATE_SYNTAX ? checkTemplateSections(state.code, TEMPLATE_SYNTAX) : [];
}

/**
 * Returns the empty and repeated header names (compared without case and spaces around them).
 * @returns {import('./state.js').Problem[]} the problems, at most 400.
 */
function getHeaderNameProblems() {
    const rows = state.P.rows, problems = [];
    if (!state.header || !rows.length) return problems;
    const seen = new Map();
    const header = readRecord(state.code, state.P.starts[0], state.sep, state.q, true);      // the header's places, read once
    let named = 0;
    for (const [column, name] of rows[0].entries()) {
        const key = name.trim();
        if (key && !seen.has(key.toLowerCase())) { seen.set(key.toLowerCase(), column); continue; }
        if (++named > MAX_LISTED) continue;
        const pos = column < header.spans.length ? header.spans[column][0] : header.end;
        if (!key) problems.push({ pos, kind: 'warn', msg: `Column ${getColumnLetter(column)} has no name` });
        else problems.push({ pos, kind: 'warn', msg: `The name "${key}" is used twice (columns ${getColumnLetter(seen.get(key.toLowerCase()))} and ${getColumnLetter(column)})` });
    }
    return problems;
}

/**
 * Shows the count of errors and notes above the code and, when open, the list of problems.
 * @returns {void}
 */
export function renderProblems() {
    const problems = state.problems;
    const box = ui.error;
    if (!problems.length) { box.hidden = true; return; }
    const errors = problems.filter(problem => problem.kind === 'error').length, notes = problems.length - errors + (state.problemsMore || 0);
    const parts = [];
    if (errors) parts.push(`<b>${escapeHtml(translate(`${errors} ${errors === 1 ? 'error' : 'errors'}`))}</b>`);
    if (notes) parts.push(escapeHtml(translate(`${notes.toLocaleString('en')} ${notes === 1 ? 'note' : 'notes'}`)));
    const items = problems.slice(0, SHOWN_PROBLEMS).map(formatProblemItem).join('');
    box.innerHTML = `<div class="pr-header"><span>${parts.join(' · ')}</span><button type="button" class="button small" data-toggle-probs>${escapeHtml(translate(state.showProblems ? 'Hide' : 'Show'))}</button></div>${state.showProblems ? `<ul>${items}</ul>` : ''}`;
    box.classList.toggle('only-warnings', !errors);
    box.hidden = false;
}

/**
 * Returns the list item of one problem.
 * @param {import('./state.js').Problem} problem - the problem.
 * @param {number} index - its place in the list.
 * @returns {string} the HTML.
 */
function formatProblemItem(problem, index) {
    const isError = problem.kind === 'error';
    return `<li class="${isError ? 'err' : 'warn'}"><div class="pr-row" role="button" tabindex="0" data-prob="${index}"><span class="kind">${isError ? '✕' : '!'}</span><span class="line-number">${escapeHtml(translate(`Line ${getCodeLine(problem.pos) + 1}`))}</span><span>${escapeHtml(translate(problem.msg))}</span></div></li>`;
}

/**
 * Connects the list of problems: Enter and Space open a problem like a click, a click shows it
 * in the code, the button opens and closes the list.
 * @returns {void}
 */
export function startProblems() {
    ui.error.addEventListener('keydown', event => {
        if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-prob]')) { event.preventDefault(); event.target.click(); }
    });
    ui.error.addEventListener('click', showClickedProblem);
}

/**
 * Shows a clicked problem in the code and selects its cell, or opens and closes the list
 * (a click handler).
 * @param {MouseEvent} event - the click in the problems box.
 * @returns {void}
 */
function showClickedProblem(event) {
    if (event.target.closest('[data-prob]') && String(getSelection())) return;   // the user selects the text to copy it
    if (event.target.closest('[data-toggle-probs]')) { state.showProblems = !state.showProblems; renderProblems(); return; }
    const row = event.target.closest('[data-prob]');
    if (!row) return;
    const problem = state.problems[+row.dataset.prob];
    if (NARROW_SCREEN.matches) showPane('code');
    showCodePosition(problem.pos);
    selectCellAtCursor();
}
