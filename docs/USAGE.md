# Using the CSV Editor

The CSV Editor shows the raw CSV and a spreadsheet-like table side by side. You edit cells
in place, and each change is written into the text exactly at that field, quoted only where
needed and with the line endings kept. Copy and paste ranges from and to spreadsheet
programs, sort and filter, find broken rows, convert separators and export to Excel, JSON,
Markdown, HTML, TSV or CSV.

Open it at https://csv.giit.ch/. It is free, needs no sign-up, and runs in your browser:
your documents stay there unless you send them somewhere yourself.

## What it can do

- Separator comma, semicolon, tab or pipe (detected, or chosen); quote character `"` or `'`;
  header row on or off; UTF-8 with or without BOM and Windows-1252 when opening a file; line
  endings (LF, CRLF) kept.
- Editing in place like in a spreadsheet; copy and paste of ranges with Excel, LibreOffice
  or Google Sheets.
- Rows and columns added, duplicated, deleted and moved; sort and filter for the view;
  sorting the data itself on request; clean up (spaces, empty rows, repeated rows, missing
  fields).
- Column info: kind (numbers, dates, text), filled, empty and different values, smallest,
  largest, sum, average, most frequent values.
- Problems with their line: rows with a different number of fields, unclosed quotes, text
  after a closing quote, empty and repeated header names.
- Large files: the table and the code draw only what is in sight, so 100 000 rows stay
  usable.
- Templates: contacts, product list, budget (semicolons), time sheet (tabs).

## Getting started

1. **Start**: open a CSV file, drop it into the window, or start with **New**.
2. **Edit** cells in the table, or type in the raw text on the left.
3. **Export**: save an Excel workbook, JSON, Markdown, HTML, TSV or CSV.

## Editing the table

Type, press **Enter** or **F2**, or double-click a cell to edit it. **Enter** or **Tab**
keeps the value, **Escape** cancels, **Alt+Enter** is a line break inside the cell. Type
into the row marked ＋ to add a row. Every change is one step for Undo.

A click in the table puts the code's cursor on that field; the cursor in the code selects
its cell. The arrows in the column heads sort and the field above the table filters: that
only changes the view. **Sort the data** puts the rows of the file into that order.

The side panel has **Format** (how the text is read: separator, quote, header row, and
converting it), **Column** (what a column holds) and **Insert** (add, delete and move rows
and columns, clean up). The button at the top right of the work area opens it as a column
right of the table, which gets narrower, and closes it again; it is closed when the editor
opens. On a phone it is the view **Edit**.

## Templates with placeholders

A website that edits templates opens the editor with `?template=mustache` or `?template=angle`.
The table then shows the rows filled with the website's examples: a list once per example row,
sections by their example state, and without the rows that hold only section tags.
**Template** in the table's bar shows the template's table with the placeholders as written,
**Examples** brings the examples back. A placeholder without an example shows its label in
brackets. The **Placeholders** box below the code lists them: a click puts one at the cursor, a
section around the selected text. A cell that shows an example cannot be changed in the table;
a click on it puts the code's cursor at its placeholder. Saving, downloading and exporting keep
the placeholders.

## Your documents

Your documents are kept only in your browser (in `localStorage`), not on a server, and stay
there after you close the page. **My documents** (the folder button at the top left) lists
every document of this browser: open, rename, duplicate, download (`.csv`) and delete them.

Clearing the browser's site data removes them, so download the ones you want to keep, or let
the editor send them to your own server: **Save to server** (the cloud button) sets up a
webhook, an address that gets every saved version (see [EMBEDDING.md](EMBEDDING.md#webhook)
for what it receives). Nothing is sent until you enter an address there.

**Opening files:** Open `.csv`, `.tsv` and `.txt` files with the button, by drop or by
paste; the separator and the encoding are detected.

## Export

**Export** offers an **Excel workbook** (`.xlsx`: numbers as numbers, text never as a
formula), **CSV** with any separator and encoding, **TSV**, **JSON** (objects with headers,
arrays without), a **Markdown table** and an **HTML table**. CSV and TSV exports are
protected against formulas by default; plain signed numbers stay unchanged.

**Download .csv** in the bar saves the text as it is.

**Export > Open in another editor** converts the document in the browser to JSON, YAML,
TOML, SHLS or XML and opens the result as a new document in that editor. Anything the other
format cannot hold is listed first.

## AI Assistant

Any AI can work with you: ChatGPT, Claude, Gemini, Copilot or the AI in your coding tool.
Nothing to install and no key needed. Click **AI Assistant**, then **Copy prompt**, paste it
into your AI and say what it should do. The prompt holds the instructions and the current
document.

The AI answers with a link that carries the document after the `#`; click it and the
document appears in your editor. **Undo** takes every change back. The links look like this:

- `https://csv.giit.ch/#b64=<base64url of the UTF-8 text>`
- `https://csv.giit.ch/#csv=<URL-encoded text>`
- `https://csv.giit.ch/#z=<base64url of the zlib-compressed text>` (shortest)
- `&mode=add` appends rows at the end of the open document (a repeated header row is left
  out).
- `&file=new&name=<name>` makes a new document next to your others, `&file=<name>` changes
  that one; without `&file=` the open document changes.
- `&part=N&of=M&id=<name>` sends a long document in several links; the editor collects the
  parts.

A tab opened with such a link hands the document to the editor tab you used last. You can
also paste the AI's whole answer into the editor (Ctrl+V outside the code); links that a
terminal broke over several lines are joined. When the editor is embedded in another
website, links cannot reach it, so paste the answer there. A website that embeds the
editor may give its own instructions for how the AI answers, or show its own AI dialog
when you press the button; the dialog names the website and shows its instructions.

**Browser agents (WebMCP):** in browsers that offer WebMCP, the page registers tools for AI
agents that run in the page itself: `get_document`, `get_problems`, `get_rows`, `set_cell`,
`add_rows`, `set_document`, `undo`, and `list_files`, `open_file`, `new_file` for your other
documents. Every change is one step for Undo.

## Languages

The editor speaks English at `/`, German `/de/`, French `/fr/`, Italian `/it/`, Spanish
`/es/`, Portuguese `/pt/`, Dutch `/nl/`, Polish `/pl/`, Turkish `/tr/`, Russian `/ru/`,
Ukrainian `/uk/`, Chinese `/zh/`, Japanese `/ja/` and Korean `/ko/`. Opening
`https://csv.giit.ch/` leads to the language you picked before in a language menu, or else
to your browser's language. A language picked in the menu holds for every giit.ch site. The
prompt for the AI is always in English.

## Color theme

Light, dark or automatic (following your system): the theme switch in the bar sets it, and
the editor remembers your choice.

## Keyboard shortcuts

On macOS use Cmd instead of Ctrl. The **Help** dialog in the editor lists them as well.

| Keys | Action |
|---|---|
| ← → ↑ ↓, Shift + arrows | Move, select a range |
| Enter / F2 / typing | Edit the cell (typing replaces its value) |
| Alt + Enter | A line break inside the cell |
| Tab / Shift + Tab | Next / previous cell |
| Delete | Empty the selected cells |
| Ctrl + C / X / V | Copy / cut / paste (tab-separated, as spreadsheets use it) |
| Ctrl + A | Select the whole table |
| Ctrl + F | Filter the rows |
| Ctrl + Z / Y | Undo / redo |
| Ctrl + S | Save (download `.csv`, or to your server) |
| Ctrl + E | Export |
| Ctrl + O | My documents |
| Ctrl + Enter in the code | Go to the cursor's cell in the table |

## On your own website

The editor can be embedded in other websites with an iframe, opened in a window of its own
or used as a read-only viewer. See [EMBEDDING.md](EMBEDDING.md).
