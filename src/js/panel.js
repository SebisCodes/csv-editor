/**
 * The side panel: the tabs Format (panel-format.js), Column (what the active column holds,
 * sorting the data by it) and Insert (rows, columns, cleaning up).
 *
 * startSidePanel() connects the tabs and their buttons.
 */

import { escapeHtml } from './csv.js?v=4';
import { getColumnInfo, getColumnLetter } from './values.js?v=3';
import { state, areas, ui, getElements, getDataStart, translate } from './state.js?v=2';
import { renderFormat, startFormatTab } from './panel-format.js?v=3';
import { updateTableNow } from './refresh.js?v=3';
import { addRows, copyRows, removeRows, moveRows, addColumn, removeColumns, moveColumn } from './edits.js?v=3';
import { setRowOrder, removeCellSpaces, removeEmptyRows, removeRepeatedRows, expandShortRows } from './cleanup.js?v=3';

const KIND_LABELS = { number: 'Numbers', date: 'Dates', text: 'Text', empty: 'Empty' };
/** Values longer than this are cut in the list of frequent values. */
const MAX_VALUE_LENGTH = 60;
const NUMBER_DIGITS = 4;

/**
 * Draws the open tab of the side panel (Format or Column; Insert does not change).
 * @returns {void}
 */
export function renderPanel() {
    if (!ui.format.hidden) renderFormat();
    if (!ui.column.hidden) renderColumn();
}

/**
 * Draws the Column tab: name, kind, counts, numbers or dates and the most frequent values of
 * the active column, and the buttons that sort the data by it.
 * @returns {void}
 */
function renderColumn() {
    const t = translate;
    const column = areas.grid.getActive().c;
    if (column >= state.P.width) { ui.column.innerHTML = `<p class="hint">${t('Click a cell or a column head in the table to see what the column holds.')}</p>`; return; }
    const rows = state.P.rows, values = [];
    for (let i = getDataStart(); i < rows.length; i++) values.push(rows[i][column] ?? '');
    const info = getColumnInfo(values);
    ui.column.innerHTML = `
        <h3>${t('Column')} <code data-no-i18n>${escapeHtml(getColumnLetter(column))}</code></h3>
        <dl class="columns-info">${getColumnFactsHtml(info, state.header ? rows[0]?.[column] ?? '' : '')}</dl>
        ${info.top.length ? `<h3>${t('Most frequent values')}</h3><ul class="frequent">${info.top.map(([value, count]) => `<li><span data-no-i18n>${escapeHtml(value.length > MAX_VALUE_LENGTH ? value.slice(0, MAX_VALUE_LENGTH) + '…' : value)}</span><b>${count.toLocaleString('en')}</b></li>`).join('')}</ul>` : ''}
        <h3>${t('Sort the data by this column')}</h3>
        <div class="button-row two"><button type="button" class="button small" data-act="sort-up">${t('Ascending (A → Z)')}</button><button type="button" class="button small" data-act="sort-down">${t('Descending (Z → A)')}</button></div>
        <p class="hint">${t('This changes the order of the rows in the CSV. Sorting with the arrows in the column heads only changes the view.')}</p>`;
}

/**
 * Returns the facts of a column as the terms and values of a description list.
 * @param {import('./values.js').ColumnInfo} info - what the column holds.
 * @param {string} name - the column's header name.
 * @returns {string} the HTML of the <dt> and <dd> elements.
 */
function getColumnFactsHtml(info, name) {
    const t = translate;
    /**
     * Returns a number for the Column tab.
     * @param {number} value - the number.
     * @returns {string} the number with up to four decimals, "-" when not finite.
     */
    const formatNumber = value => (Number.isFinite(value) ? value.toLocaleString('en', { maximumFractionDigits: NUMBER_DIGITS }) : '-');
    const share = info.filled ? ` (${Math.round((info.type === 'date' ? info.dates : info.nums) / info.filled * 100)}%)` : '';
    return `
            ${state.header ? `<dt>${t('Name')}</dt><dd data-no-i18n>${escapeHtml(name) || '<em>-</em>'}</dd>` : ''}
            <dt>${t('Kind')}</dt><dd>${t(KIND_LABELS[info.type])}${info.type === 'number' || info.type === 'date' ? escapeHtml(share) : ''}</dd>
            <dt>${t('Filled')}</dt><dd>${escapeHtml(`${info.filled.toLocaleString('en')} / ${info.count.toLocaleString('en')}`)}</dd>
            <dt>${t('Empty')}</dt><dd>${escapeHtml(info.empty.toLocaleString('en'))}</dd>
            <dt>${t('Different values')}</dt><dd>${escapeHtml(info.distinct.toLocaleString('en'))}</dd>
            ${info.type === 'number' ? `<dt>${t('Smallest')}</dt><dd>${formatNumber(info.min)}</dd><dt>${t('Largest')}</dt><dd>${formatNumber(info.max)}</dd><dt>${t('Sum')}</dt><dd>${formatNumber(info.sum)}</dd><dt>${t('Average')}</dt><dd>${formatNumber(info.avg)}</dd>` : ''}
            ${info.type === 'date' ? `<dt>${t('Earliest')}</dt><dd data-no-i18n>${escapeHtml(info.first)}</dd><dt>${t('Latest')}</dt><dd data-no-i18n>${escapeHtml(info.last)}</dd>` : ''}
        `;
}

/**
 * Draws the Insert tab: the buttons for rows, columns and cleaning up.
 * @returns {void}
 */
export function renderInsert() {
    const t = translate;
    /**
     * Returns a button of the Insert tab.
     * @param {string} action - its data-act value.
     * @param {string} label - its label.
     * @param {string} [title] - its title, else the label.
     * @returns {string} the HTML.
     */
    const formatButton = (action, label, title) => `<button type="button" class="button" data-act="${action}" title="${escapeHtml(t(title || label))}">${t(label)}</button>`;
    ui.insert.innerHTML = `
        <div class="insert-group"><h3>${t('Rows')}</h3><div class="insert-grid">
            ${formatButton('row-above', 'Row above')}${formatButton('row-below', 'Row below')}${formatButton('row-dup', 'Duplicate')}${formatButton('row-del', 'Delete', 'Delete the selected rows')}
            ${formatButton('row-up', 'Move up')}${formatButton('row-down', 'Move down')}
        </div></div>
        <div class="insert-group"><h3>${t('Columns')}</h3><div class="insert-grid">
            ${formatButton('col-left', 'Column left')}${formatButton('col-right', 'Column right')}${formatButton('col-del', 'Delete', 'Delete the selected columns')}
            ${formatButton('col-move-left', 'Move left')}${formatButton('col-move-right', 'Move right')}
        </div></div>
        <div class="insert-group"><h3>${t('Clean up')}</h3><div class="insert-grid one">
            ${formatButton('trim', 'Remove spaces at the start and end of cells')}
            ${formatButton('empty-rows', 'Remove empty rows')}
            ${formatButton('dupes', 'Remove repeated rows')}
            ${formatButton('even', 'Give every row all fields', 'Rows with fewer fields than the header get empty fields')}
        </div></div>
        <p class="hint">${t('Every change is written into the CSV and is one step for Undo.')}</p>`;
}

/**
 * Connects the tabs of the side panel and the buttons of the Format, Column and Insert tabs.
 * @returns {void}
 */
export function startSidePanel() {
    startFormatTab();
    ui.column.addEventListener('click', event => {
        const action = event.target.closest('[data-act]')?.dataset.act;
        if (action === 'sort-up') setRowOrder(areas.grid.getActive().c, 1);
        if (action === 'sort-down') setRowOrder(areas.grid.getActive().c, -1);
    });
    // The buttons keep the focus where it is, so the selection in the table stays.
    ui.insert.addEventListener('mousedown', event => { if (event.target.closest('[data-act]')) event.preventDefault(); });
    ui.insert.addEventListener('click', runInsertButton);
    getElements('[data-itab]').forEach(button => button.addEventListener('click', () => showPanelTab(button)));
}

/**
 * Runs a button of the Insert tab on the table read from the current text (a click handler).
 * @param {MouseEvent} event - the click.
 * @returns {void}
 */
function runInsertButton(event) {
    const action = event.target.closest('[data-act]')?.dataset.act;
    if (!action) return;
    updateTableNow();
    /**
     * Returns the active column.
     * @returns {number} the column.
     */
    const getColumn = () => areas.grid.getActive().c;
    const actions = {
        'row-above': () => addRows(-1), 'row-below': () => addRows(1), 'row-dup': copyRows, 'row-del': removeRows,
        'row-up': () => moveRows(-1), 'row-down': () => moveRows(1),
        'col-left': () => addColumn(Math.min(getColumn(), state.P.width)), 'col-right': () => addColumn(Math.min(getColumn() + 1, state.P.width)),
        'col-del': removeColumns, 'col-move-left': () => moveColumn(-1), 'col-move-right': () => moveColumn(1),
        trim: removeCellSpaces, 'empty-rows': removeEmptyRows, dupes: removeRepeatedRows, even: expandShortRows,
    };
    (actions[action] || (() => {}))();
}

/**
 * Shows one tab of the side panel and draws it.
 * @param {HTMLElement} tabButton - the tab's button (data-itab: format, column or insert).
 * @returns {void}
 */
function showPanelTab(tabButton) {
    getElements('[data-itab]').forEach(button => button.setAttribute('aria-selected', String(button === tabButton)));
    ui.format.hidden = tabButton.dataset.itab !== 'format';
    ui.column.hidden = tabButton.dataset.itab !== 'column';
    ui.insert.hidden = tabButton.dataset.itab !== 'insert';
    renderPanel();
}
