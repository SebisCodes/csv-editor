<?php
/**
 * The editor page: markup and keys of the shared language packs (src/php/page.php).
 */
?>
<!DOCTYPE html>
<html <?= build_html_attributes() ?>>
<head>
<meta charset="utf-8">
<!-- The same policy as the server header (.htaccess), in case the header is ever missing; frame-ancestors only works as a header. -->
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' data: blob: https: http://localhost:* http://127.0.0.1:*; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'self'; form-action 'self'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= get_text('title') ?></title>
<meta name="description" content="<?= get_text('description') ?>">
<meta name="author" content="Sebastian Grünwald, Grünwald Innovation">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#1a7f52">
<link rel="canonical" href="<?= escape_html(get_page_url()) ?>">
<?= build_hreflang_links() ?>
<meta property="og:type" content="website">
<meta property="og:locale" content="<?= get_page_locale() ?>">
<meta property="og:site_name" content="CSV Editor">
<meta property="og:title" content="<?= get_text('og_title') ?>">
<meta property="og:description" content="<?= get_text('og_description') ?>">
<meta property="og:url" content="<?= escape_html(get_page_url()) ?>">
<meta property="og:image" content="https://csv.giit.ch/img/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/svg+xml" href="/img/logo.svg">
<link rel="stylesheet" href="/css/style.css?v=27">
<script src="/js/lang-menu.js?v=1" defer></script>
<script src="/js/theme.js?v=9" data-editor-page></script>
<script type="application/ld+json"><?= get_json_ld('jsonld') ?></script>
</head>
<body>

<header class="header">
    <div class="header-brand">
        <a class="back-to-editors" href="<?= escape_html(get_site_url('https://editors.giit.ch/')) ?>" title="All giit editors" aria-label="All giit editors"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg></a>
        <a class="brand" href="<?= escape_html(get_language_path(get_template_language(), '')) ?>" aria-label="CSV Editor - home">
            <img src="/img/logo.svg" alt="" width="28" height="28">
            <h1>CSV Editor <span>online</span></h1>
        </a>
        <a class="by-giit" href="https://giit.ch/"><img src="/img/giit.svg" alt="" width="16" height="18">by giit.ch</a>
    </div>
    <div class="toolbar file" role="toolbar" aria-label="File">
        <button type="button" class="button with-symbol file-button" id="btn-files" title="My documents (Ctrl+O)" aria-label="My documents"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg><span id="file-name" class="file-title" data-no-i18n></span><svg class="arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
        <span class="menu-anchor">
            <button type="button" class="button with-symbol" id="btn-new" title="New document, or start this one over" aria-haspopup="menu" aria-expanded="false" aria-controls="new-menu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span class="txt">New</span></button>
            <span id="new-menu" class="menu" role="menu" aria-label="New" hidden>
                <button type="button" role="menuitem" data-new="blank"><b>New empty table</b><span>Three columns - your other documents stay as they are</span></button>
                <button type="button" role="menuitem" data-new="contacts"><b>Contacts</b><span>Names, email addresses and phone numbers</span></button>
                <button type="button" role="menuitem" data-new="products"><b>Product list</b><span>Article numbers, prices and stock</span></button>
                <button type="button" role="menuitem" data-new="budget"><b>Budget</b><span>Separated by semicolons, with decimal commas</span></button>
                <button type="button" role="menuitem" data-new="timesheet"><b>Time sheet</b><span>Separated by tabs (TSV)</span></button>
                <button type="button" role="menuitem" data-new="example"><b>The welcome example</b><span>Quotes, commas and line breaks in fields</span></button>
                <button type="button" role="menuitem" data-new="restart" id="new-restart"><b>Start this document over</b><span>Keeps the header row, removes the data - "Undo" brings it back</span></button>
            </span>
        </span>
        <button type="button" class="button" id="btn-open" title="Open a CSV or TSV file from your computer (you can also drag it into the window)">Open file…</button>
        <input type="file" id="file" accept=".csv,.tsv,.tab,.txt,.psv,text/csv,text/tab-separated-values,text/plain" multiple hidden>
        <span class="divider" aria-hidden="true"></span>
        <button type="button" class="button with-symbol" id="btn-undo" title="Undo the last change (Ctrl+Z)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg><span class="txt">Undo</span></button>
        <button type="button" class="button with-symbol" id="btn-redo" title="Redo the change you just undid (Ctrl+Y)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg><span class="txt">Redo</span></button>
    </div>
    <div class="toolbar output" role="toolbar" aria-label="Output">
        <span class="languages" data-languages><?= build_language_menu(get_text('language')) ?></span>
        <div class="schema" role="radiogroup" aria-label="Color theme">
            <button type="button" role="radio" data-theme-set="light" aria-checked="false" title="Light theme" aria-label="Light theme"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button>
            <button type="button" role="radio" data-theme-set="dark" aria-checked="false" title="Dark theme" aria-label="Dark theme"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg></button>
            <button type="button" role="radio" data-theme-set="auto" aria-checked="true" title="Same as your system setting" aria-label="Automatic theme (system setting)"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg></button>
        </div>
        <button type="button" class="button with-symbol ai-button" id="btn-ai" title="Let any AI write in this editor"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 4.9L19 9.5l-5.2 1.7L12 16l-1.8-4.8L5 9.5l5.2-1.6z"/><path d="M19 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/></svg><span class="txt">AI Assistant</span></button>
        <button type="button" class="button symbol" id="btn-sync" title="Save to your own server and embed the editor in your website" aria-label="Save to server"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 9.5"/><path d="M12 12v8m-3-3 3 3 3-3"/></svg></button>
        <button type="button" class="button" id="btn-help" title="How it works and keyboard shortcuts (?)">Help</button>
        <button type="button" class="button" id="btn-download" title="Save the document as a .csv file (Ctrl+S)">Download .csv</button>
        <button type="button" class="button primary save" id="btn-save" hidden>Save</button>
        <button type="button" class="button primary" id="btn-export" title="Excel (XLSX), JSON, Markdown, HTML, TSV and more (Ctrl+E)">Export…</button>
    </div>
</header>

<nav class="views" role="tablist" aria-label="View">
    <button type="button" role="tab" data-pane="code" aria-selected="false">Code</button>
    <button type="button" role="tab" data-pane="table" aria-selected="true">Table</button>
    <button type="button" role="tab" data-pane="properties" aria-selected="false">Edit</button>
</nav>

<main id="work" class="workspace" data-show="table">
    <section class="pane code-pane" aria-label="CSV code">
        <div class="pane-header">
            <b>Code</b>
            <span id="code-status" class="muted"></span>
            <span class="right">
                <button type="button" class="button small" id="btn-wrap" aria-pressed="false" title="Wrap long lines in the view - each line of the code stays one line (Alt+Z)">Wrap</button>
                <button type="button" class="button small with-symbol" id="btn-copy" title="Copy the CSV text to the clipboard" aria-label="Copy code"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg><span class="txt">Copy</span></button>
            </span>
        </div>
        <div id="code-error" class="error problems" hidden role="status"></div>
        <div class="editor">
            <div class="gutter" aria-hidden="true"><div id="gutter"></div></div>
            <div class="code-field" id="code-layers">
                <div class="layer marks" id="marks" aria-hidden="true"></div>
                <pre class="layer hl" id="hl" aria-hidden="true"></pre>
                <textarea id="code" spellcheck="false" autocapitalize="off" autocomplete="off" wrap="off" aria-label="CSV code"></textarea>
            </div>
        </div>
        <div id="placeholder-box" class="placeholder-box template-control">
            <div id="placeholder-list" class="placeholder-list" data-placeholder-list role="group" aria-label="Placeholders" hidden></div>
            <button type="button" class="placeholder-header" data-placeholder-toggle aria-expanded="false" aria-controls="placeholder-list" title="The placeholders of the template - a click on one puts its tag at the cursor"><svg class="arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg><span>Placeholders</span><span class="placeholder-count" data-placeholder-count data-no-i18n></span></button>
        </div>
    </section>

    <div id="splitter" class="splitter" role="separator" aria-orientation="vertical" aria-label="Drag to change the width of the code area" title="Drag to change the width" tabindex="0"></div>

    <section class="pane tables-pane" aria-label="Table">
        <div class="pane-header tools" role="toolbar" aria-label="Table">
            <div id="view-switch" class="view-switch template-control" role="radiogroup" aria-label="View of the table">
                <button type="button" role="radio" data-view-set="example" aria-checked="true" title="The table filled with the examples">Examples</button>
                <button type="button" role="radio" data-view-set="template" aria-checked="false" tabindex="-1" title="The template with its placeholders as written">Template</button>
            </div>
            <div class="group filter-group">
                <input type="search" id="filter" placeholder="Filter rows" aria-label="Show only rows that contain this text (Ctrl+F)" title="Show only rows that contain this text (Ctrl+F)" spellcheck="false">
                <select id="filter-col" aria-label="Filter in" title="Filter in all columns or in one"></select>
                <span id="view-info" class="muted"></span>
            </div>
            <div class="group">
                <span id="sort-info" class="sorting" hidden>Sorted by <b id="sort-name" data-no-i18n></b> <span id="sort-dir" aria-hidden="true"></span> (view only)
                    <button type="button" class="button small" id="sort-apply" title="Put the rows of the CSV into this order (one step for Undo)">Sort the data</button>
                    <button type="button" class="tool" id="sort-clear" title="Show the rows in the order of the file" aria-label="Turn off sorting"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
                </span>
                <button type="button" class="tool" id="add-row" title="Add a row below the selected one" aria-label="Add a row"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="10" rx="1.5"/><path d="M3 9h18M12 16v6M9 19h6"/></svg></button>
                <button type="button" class="tool" id="add-col" title="Add a column at the end" aria-label="Add a column"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="10" height="18" rx="1.5"/><path d="M8 3v18M16 12h6M19 9v6"/></svg></button>
            </div>
        </div>
        <div class="stage table">
            <div id="grid" class="grid" tabindex="0" role="grid" aria-label="Table: arrow keys move, Enter edits, Ctrl+C / Ctrl+V copy and paste" data-no-i18n></div>
            <p id="empty-hint" class="empty-hint" hidden>No data rows yet - type into the row marked ＋ or paste cells from a spreadsheet.</p>
            <div id="view-note" class="view-note template-control" role="status" hidden>The examples could not be filled in - the table shows the template</div>
        </div>
    </section>

    <button type="button" class="tool panel-toggle" id="btn-panel" aria-controls="side-panel" aria-expanded="false" title="Show or hide the side panel" aria-label="Side panel"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/></svg></button>

    <aside class="pane inspector" id="side-panel" aria-label="Side panel">
        <div class="pane-header tabs" role="tablist">
            <button type="button" role="tab" data-itab="format" aria-selected="true" title="How the text is read: separator, quotes, header row, encoding, line endings">Format</button>
            <button type="button" role="tab" data-itab="column" aria-selected="false" title="What the selected column holds">Column</button>
            <button type="button" role="tab" data-itab="insert" aria-selected="false" title="Rows, columns and cleaning up">Insert</button>
        </div>
        <div id="format-body" class="inspector-body"></div>
        <div id="column-body" class="inspector-body" hidden></div>
        <div id="insert-body" class="inspector-body" hidden></div>
    </aside>
</main>

<div id="ai-receive" class="receive" role="status" hidden>
    <div class="receive-box"><img src="/img/logo.svg" alt="" width="40" height="40"><h2></h2><p></p>
        <div class="receive-buttons"><button type="button" class="button primary" data-here>Open it here</button></div>
    </div>
</div>

<div id="toast" class="toast" role="status" aria-live="polite"></div>
<div class="storage-hint" aria-hidden="true"><span>Drop the CSV file here</span></div>

<dialog id="export" class="dialog" aria-labelledby="ex-title">
    <form method="dialog" class="dialog-header"><h2 id="ex-title">Export</h2><button class="close" data-close aria-label="Close" title="Close">✕</button></form>
    <div class="dialog-content">
        <div class="ex-row">
            <label class="field"><span>File name</span><input id="ex-name" spellcheck="false"></label>
            <label class="field"><span>Format</span>
                <select id="ex-format">
                    <option value="xlsx">Excel workbook (.xlsx)</option>
                    <option value="csv">CSV with a separator of your choice</option>
                    <option value="tsv">Tab-separated (.tsv)</option>
                    <option value="json">JSON (objects with headers, arrays without)</option>
                    <option value="md">Markdown table</option>
                    <option value="html">HTML table (one page)</option>
                </select>
            </label>
        </div>
        <div class="ex-row only-csv">
            <label class="field only-sep"><span>Separator</span>
                <select id="ex-sep"><option value=",">Comma ( , )</option><option value=";">Semicolon ( ; )</option><option value="&#9;">Tab</option><option value="|">Pipe ( | )</option></select>
            </label>
            <label class="field"><span>Encoding</span>
                <select id="ex-enc"><option value="utf-8">Unicode (UTF-8)</option><option value="utf-8-bom">UTF-8 with BOM (for Excel)</option><option value="windows-1252">Windows-1252 (Western European)</option></select>
            </label>
        </div>
        <label class="box sync-choice only-csv"><input type="checkbox" id="ex-guard" checked> Protect CSV/TSV exports against formulas; plain signed numbers remain unchanged.</label>
        <label class="box sync-choice" id="ex-shown-wrap"><input type="checkbox" id="ex-shown"> Only the rows shown now (filter and sort of the table)</label>
        <textarea id="ex-text" class="ex-text" readonly spellcheck="false" aria-label="Result" data-no-i18n></textarea>
        <div class="dialog-footer">
            <span id="ex-info" class="muted"></span>
            <button type="button" class="button" id="ex-zip" title="Download every format at once">All formats (ZIP)</button>
            <button type="button" class="button" id="ex-copy">Copy</button>
            <button type="button" class="button primary" id="ex-download">Download</button>
        </div>
    </div>
</dialog>

<dialog id="files" class="dialog files" aria-labelledby="files-title">
    <form method="dialog" class="dialog-header"><h2 id="files-title">My documents</h2><button class="close" data-close aria-label="Close" title="Close">✕</button></form>
    <div class="dialog-content">
        <div class="files-toolbar">
            <input id="files-search" type="search" placeholder="Search by name" aria-label="Search your documents" spellcheck="false">
            <button type="button" class="button" id="files-import" title="Open a CSV file from your computer as a new document">Open file…</button>
            <button type="button" class="button primary" id="files-new">New document</button>
        </div>
        <ul id="files-grid" class="file-grid"></ul>
        <p class="muted">Click a document to open it. They are stored only in this browser - nothing is uploaded. Clearing the browser's site data removes them, so download the ones you want to keep.</p>
        <div class="dialog-footer"><span id="files-info" class="muted"></span><button type="button" class="button" id="files-zip" title="Download every document as a .csv file in one ZIP">Download all (ZIP)</button></div>
    </div>
</dialog>

<dialog id="ask" class="dialog question" aria-labelledby="ask-title">
    <div class="dialog-header"><h2 id="ask-title"></h2></div>
    <div class="dialog-content"><p id="ask-text"></p>
        <div class="dialog-footer"><span class="muted"></span><button type="button" class="button" id="ask-cancel">Cancel</button><button type="button" class="button primary" id="ask-ok">OK</button></div>
    </div>
</dialog>

<dialog id="ai" class="dialog ai-dialog" aria-labelledby="ai-title">
    <form method="dialog" class="dialog-header"><h2 id="ai-title">AI Assistant</h2><button class="close" data-close aria-label="Close" title="Close">✕</button></form>
    <div class="dialog-content">
        <p>Any AI can work with you - ChatGPT, Claude, Gemini, Copilot.</p>
        <ul id="ai-status" class="ai-status" aria-label="Connected AI"></ul>
        <ol class="steps">
            <li>Click <b>Copy prompt</b>.</li>
            <li>Paste it into your AI and say what it should do with the table.</li>
            <li id="ai-step-link">The AI answers with a link: click it, or paste the whole answer below. <b>Undo</b> takes it back.</li>
        </ol>
        <div id="ai-remote" class="ai-remote" hidden>
            <p><b>Connected to <span id="ai-remote-host" data-no-i18n></span>:</b> the AI sends its result there, and it opens here. <span id="ai-key-exp" class="muted"></span></p>
            <details id="ai-remote-details" hidden><summary>What <span data-no-i18n></span> tells the AI</summary><pre id="ai-remote-prompt" class="ai-remote-prompt" data-no-i18n></pre></details>
        </div>
        <fieldset class="ai-target">
            <legend>The AI should</legend>
            <label><input type="radio" name="ai-target" value="change" checked><span><b>Change “<span id="ai-cur" data-no-i18n></span>”</b></span></label>
            <label><input type="radio" name="ai-target" value="new"><span><b>Make a new document</b></span></label>
        </fieldset>
        <label class="field ai-insert"><span id="ai-paste-label">The AI's answer (or press Ctrl+V anywhere):</span><textarea id="ai-paste" rows="2" spellcheck="false" placeholder="https://csv.giit.ch/#…"></textarea></label>
        <p class="muted" id="ai-privacy">The table travels in the link after the “#”, which no server sees. What you paste into your AI is handled by its provider.</p>
        <textarea id="ai-prompt-text" class="ai-prompt-text" rows="6" readonly hidden aria-label="The prompt - copy it with Ctrl+C"></textarea>
        <div class="dialog-footer"><span class="muted"></span><button type="button" class="button primary" id="ai-copy">Copy prompt</button></div>
    </div>
</dialog>

<dialog id="sync" class="dialog" aria-labelledby="sync-title">
    <form method="dialog" class="dialog-header"><h2 id="sync-title">Save to your server</h2><button class="close" data-close aria-label="Close" title="Close">✕</button></form>
    <div class="dialog-content">
        <p>The editor can send each saved version to your own server (a <b>webhook</b>), so your work is kept where you want it. Nothing is sent until you enter an address here.</p>
        <div class="sync-fields">
            <label class="field"><span>Webhook address</span><input id="sync-url" type="url" placeholder="https://example.com/api/csv" spellcheck="false" autocomplete="off"></label>
            <label class="field"><span>Token <small>(optional, sent as "Authorization: Bearer …"; kept until this tab is closed)</small></span><input id="sync-token" type="password" spellcheck="false" autocomplete="off"></label>
        </div>
        <label class="box sync-choice"><input type="checkbox" id="sync-auto"> Send automatically a few seconds after each change (otherwise only when you click <b>Save</b> or press Ctrl+S)</label>
        <label class="box sync-choice"><input type="checkbox" id="sync-doc"> Only for “<span id="sync-docname" data-no-i18n></span>” (other documents use the general address)</label>
        <details class="sync-help">
            <summary>What your server receives</summary>
            <p class="muted">A POST request with JSON (your server must allow CORS from https://csv.giit.ch):</p>
            <pre class="code-example">{ "editor": "csv", "event": "save", "id": "…", "name": "Products",
  "content": "SKU,Product,Price\nA-100,Notebook,4.50\n",
  "updated": "2026-01-15T09:30:00.000Z" }</pre>
        </details>
        <details class="sync-help">
            <summary>Embed the editor in your website</summary>
            <pre class="code-example">&lt;iframe src="https://csv.giit.ch/?embed=1" style="width:100%;height:80vh;border:0"&gt;&lt;/iframe&gt;
&lt;script&gt;
const frame = document.querySelector('iframe');
addEventListener('message', e =&gt; {
  if (e.origin !== 'https://csv.giit.ch' || e.source !== frame.contentWindow) return;
  if (e.data.type === 'csveditor:ready')
    frame.contentWindow.postMessage({ type: 'csveditor:load', name: 'Products',
      content: 'SKU,Product,Price\nA-100,Notebook,4.50\n' }, 'https://csv.giit.ch');
  if (e.data.type === 'csveditor:save') saveOnYourServer(e.data.content);
});
&lt;/script&gt;</pre>
            <p class="muted">Also possible: <code>?src=&lt;URL of a .csv file&gt;</code> opens a file, <code>&amp;webhook=&lt;URL&gt;</code> saves this document there. The editor can also open in a window of its own (<code>?embed=window</code>), and your page can hand it its own AI prompt and a session key so the AI sends its result to your server (<code>csveditor:ai</code>, <code>csveditor:key-request</code>) - see "Use the editor on your own website" below the editor. Details are in <a href="/llms.txt">llms.txt</a>.</p>
        </details>
        <div class="dialog-footer"><span id="sync-status" class="muted"></span><button type="button" class="button" id="sync-test">Send now</button><button type="button" class="button primary" id="sync-ok">Save setting</button></div>
    </div>
</dialog>

<dialog id="help" class="dialog" aria-labelledby="help-title">
    <form method="dialog" class="dialog-header"><h2 id="help-title">Help</h2><button class="close" data-close aria-label="Close" title="Close">✕</button></form>
    <div class="dialog-content shortcuts">
        <h3>How it works</h3>
        <ol class="steps">
            <li><b>Open</b> a CSV file, drop it into the window, or start with <b>New</b>. The raw text is on the left, the table in the middle.</li>
            <li><b>Edit cells</b> in the table like in a spreadsheet: type, or press <b>Enter</b> or <b>F2</b>, or double-click a cell. <b>Enter</b> or <b>Tab</b> keeps the value, <b>Escape</b> cancels. The change goes into the CSV text right at that field - quotes only where needed, the line endings stay - and is one step for Undo.</li>
            <li><b>Copy and paste</b> ranges between the table and Excel, LibreOffice or Google Sheets with Ctrl+C and Ctrl+V. Type into the row marked ＋ to add a row.</li>
            <li>A click in the table puts the code's cursor on that field; the cursor in the code selects its cell.</li>
            <li><b>Sort</b> with the arrows in the column heads and <b>filter</b> above the table: that only changes the view. <b>Sort the data</b> puts the rows of the file into that order.</li>
            <li><b>Format</b> on the right sets how the text is read (separator, quote, header row) and converts it; <b>Column</b> shows what a column holds; <b>Insert</b> adds, deletes and moves rows and columns and cleans up.</li>
            <li>Problems (rows with another number of fields, unclosed quotes, empty or repeated header names) are listed above the code - click one to go there.</li>
            <li><b>Export</b> makes an Excel workbook, JSON, Markdown, HTML, TSV or CSV with another separator. <b>Download .csv</b> saves the text as it is.</li>
            <li><b>Export</b> also has <b>Open in another editor</b>: it converts the document and opens it as a new document there. Anything the other format cannot hold is listed first.</li>
        </ol>
        <h3>Keyboard shortcuts in the table</h3>
        <dl>
            <dt><kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd>, <kbd>Shift</kbd> + arrows</dt><dd>Move, select a range</dd>
            <dt><kbd>Enter</kbd> / <kbd data-no-i18n>F2</kbd> / typing</dt><dd>Edit the cell (typing replaces its value)</dd>
            <dt><kbd data-no-i18n>Alt</kbd> + <kbd>Enter</kbd></dt><dd>A line break inside the cell</dd>
            <dt><kbd>Tab</kbd> / <kbd>Shift</kbd> + <kbd>Tab</kbd></dt><dd>Next / previous cell</dd>
            <dt><kbd>Delete</kbd></dt><dd>Empty the selected cells</dd>
            <dt><kbd>Ctrl</kbd> + <kbd>C</kbd> / <kbd>X</kbd> / <kbd>V</kbd></dt><dd>Copy / cut / paste (tab-separated, as spreadsheets use it)</dd>
            <dt><kbd>Ctrl</kbd> + <kbd>A</kbd></dt><dd>Select the whole table</dd>
            <dt><kbd>Ctrl</kbd> + <kbd>F</kbd></dt><dd>Filter the rows</dd>
            <dt><kbd>Ctrl</kbd> + <kbd>Z</kbd> / <kbd>Y</kbd></dt><dd>Undo / redo</dd>
            <dt><kbd>Ctrl</kbd> + <kbd>S</kbd> / <kbd>E</kbd></dt><dd>Save (download .csv, or to your server) / export</dd>
            <dt><kbd>Ctrl</kbd> + <kbd>O</kbd></dt><dd>My documents</dd>
            <dt><kbd>Ctrl</kbd> + <kbd>Enter</kbd> in the code</dt><dd>Go to the cursor's cell in the table</dd>
        </dl>
    </div>
</dialog>

<div class="page-text">
<?= get_html('page_text') ?>
</div>

<?php include __DIR__ . '/footer.php'; ?>

<script type="module" src="/js/app.js?v=45"></script>
</body>
</html>
