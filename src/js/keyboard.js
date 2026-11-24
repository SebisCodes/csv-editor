/**
 * Keyboard shortcuts of the page: Ctrl+S saves, Ctrl+E exports, Ctrl+O opens "My documents",
 * Ctrl+F the filter, Ctrl+Z / Ctrl+Y undo and redo, ? the help. Shortcuts that act on the
 * document pause while typing into a field or with a dialog open.
 */

import { openDialog } from './dialogs.js?v=5';
import { ui, areas, getElement } from './state.js?v=3';
import { undo, redo } from './history.js?v=4';
import { openExport, saveOnShortcut } from './export-dialog.js?v=4';
import { setNewMenuOpen, isNewMenuOpen } from './documents.js?v=4';

/** The fields that take typed text. */
const TYPING = 'textarea, select, [contenteditable], input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=button])';

/**
 * Connects the shortcuts of the page.
 * @returns {void}
 */
export function startKeyboard() {
    window.addEventListener('keydown', handleShortcut);
}

/**
 * Runs the shortcut of a key (a keydown handler).
 * @param {KeyboardEvent} event - the key.
 * @returns {void}
 */
function handleShortcut(event) {
    const active = document.activeElement;
    const typing = active && active.matches(TYPING);
    const ctrl = event.ctrlKey || event.metaKey;
    if (ctrl && event.key === 's') { event.preventDefault(); saveOnShortcut(); return; }
    if (ctrl && event.key === 'e') { event.preventDefault(); openExport(); return; }
    if (ctrl && event.key === 'o') { event.preventDefault(); areas.files.open(); return; }
    if (ctrl && event.key === 'f' && !typing) { event.preventDefault(); ui.filter.focus(); ui.filter.select(); return; }
    if (event.key === 'Escape' && isNewMenuOpen()) { setNewMenuOpen(false); return; }
    if (typing || getElement('dialog[open]')) return;
    if (ctrl && (event.key === 'z' || event.key === 'Z')) { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return; }
    if (ctrl && event.key === 'y') { event.preventDefault(); redo(); return; }
    if (ctrl) return;
    if (event.key === '?' && active !== ui.grid) openDialog(getElement('#help'));
}
