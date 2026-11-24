"""Browser test of the CSV editor (Playwright, Google Chrome).

    php -S 127.0.0.1:8104 -t src src/php/router.php          (in the project folder)
    python tests/gui_test.py

Checks reading (separator, quotes, header, encoding), problems, code <->
table, sorting and filtering, the tools in the side panel, My documents and
templates, AI links, WebMCP tools, export, the phone layout and the rows of a template
(?template=mustache: control rows, sorting within blocks)."""

import base64
import io
import json
import os
import sys
import zipfile
import zlib

from playwright.sync_api import sync_playwright

URL = os.environ.get('EDITOR_URL', 'http://127.0.0.1:8104/')
failures = []
FAKE_MCP = "window.tools = []; document.modelContext = { registerTool(t) { window.tools.push(t); } };"


def check_that(cond, what):
    """Prints one result line and notes a failure.

    Args:
        cond (bool): True when the check holds.
        what (str): what is checked.

    Returns:
        None: the result is printed and a failure is noted.
    """
    print(('ok    ' if cond else 'FAIL  ') + what)
    if not cond:
        failures.append(what)


def show_side_panel(page, is_open):
    """Opens or closes the side panel's column (it is closed at the start).

    Args:
        page (Page): the editor's page.
        is_open (bool): True to open it, False to close it.

    Returns:
        None: the side panel is open or closed.
    """
    button = page.locator('#btn-panel')
    if button.count() and button.is_visible() and (button.get_attribute('aria-expanded') == 'true') != is_open:
        button.click()


def set_code(page, text):
    """Sets the editor's text and waits for the table.

    Args:
        page (Page): the editor page.
        text (str): the CSV text.

    Returns:
        None: the editor holds the text.
    """
    page.evaluate('t => csvEditor.setCode(t)', text)
    page.wait_for_timeout(250)


def get_state(page, expr):
    """Returns a value of the editor state.

    Args:
        page (Page): the editor page.
        expr (str): a JavaScript expression over S, the editor state.

    Returns:
        Any: the value of the expression.
    """
    return page.evaluate(f'() => {{ const S = csvEditor.state; return {expr}; }}')


def get_cell(page, r, c):
    """Returns a cell of the table.

    Args:
        page (Page): the editor page.
        r (int): the view row (-1 the header row).
        c (int): the column.

    Returns:
        Locator: the cell.
    """
    return page.locator(f'#grid .grid-row[data-r="{r}"] [data-c="{c}"]')


def run_tool(page, name, args):
    """Runs a WebMCP tool the editor registered with the stand-in for document.modelContext.

    Args:
        page (Page): the editor page.
        name (str): the tool's name.
        args (dict): the tool's input.

    Returns:
        Any: the tool's answer.
    """
    return page.evaluate('([n, a]) => window.tools.find(t => t.name === n).execute(a)', [name, args])


with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='chrome', headless=True)
    ctx = browser.new_context(viewport={'width': 1440, 'height': 900}, accept_downloads=True)
    ctx.grant_permissions(['clipboard-read', 'clipboard-write'])
    page = ctx.new_page()
    page.add_init_script(FAKE_MCP)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL + '?lang=en', wait_until='networkidle')
    page.wait_for_timeout(800)

    # --- First visit: the welcome example ---
    check_that(get_state(page, 'S.name') == 'Welcome', 'the first visit opens the welcome example')
    check_that(get_state(page, '[S.P.rows.length, S.P.width, S.sep, S.header]') == [7, 5, ',', True], 'read: 7 records, 5 columns, comma, header row')
    check_that(get_state(page, 'S.problems.length') == 0, 'the example has no problems')
    check_that(get_cell(page, 3, 4).inner_text().startswith('Federal city') and '↵' in get_cell(page, 3, 4).inner_text(), 'a line break inside a quoted field stays in its cell')
    check_that(get_cell(page, 1, 4).inner_text() == 'Seat of many "international" organizations', 'doubled quotes are read as one')
    check_that('number' in get_cell(page, 0, 2).get_attribute('class'), 'a number column is aligned right')
    check_that(page.locator('#grid .head-cell[data-h="0"] b').inner_text() == 'City', 'the header row is the head of the table')
    check_that(page.locator('#hl .h').count() >= 5 and page.locator('#hl .p').count() > 10, 'the code is highlighted (header, separators)')

    # --- Problems ---
    set_code(page, 'a,b,a,\n1,2,3,4\n1,2\n"open,3\nmore\n')
    probs = get_state(page, 'S.problems.map(p => p.msg)')
    check_that(any('never closed' in p for p in probs), 'an unclosed quote is reported')
    check_that(any('2 fields - the header has 4' in p for p in probs), 'a row with too few fields is reported')
    check_that(any('used twice' in p for p in probs) and any('no name' in p for p in probs), 'repeated and empty header names are reported')
    check_that(page.locator('#code-error li').count() >= 4, 'problems are listed above the code')
    page.locator('#code-error [data-prob]', has_text='2 fields').click()
    check_that(page.evaluate('document.activeElement.id') == 'code' and page.evaluate('() => { const t = document.querySelector("#code"); return t.value.slice(t.selectionStart, t.selectionStart + 3); }') == '1,2', 'clicking a problem goes to its line')

    # --- Separator, quote, header ---
    set_code(page, 'Name;Price\nTea;3,50\nCoffee;4,20\n')
    check_that(get_state(page, 'S.sep') == ';' and get_cell(page, 0, 1).inner_text() == '3,50', 'a semicolon file is detected, decimal commas stay in the cell')
    check_that(get_state(page, 'S.colType[1]') == 'number', 'decimal commas count as numbers')
    show_side_panel(page, True)
    page.select_option('#f-sep', ',')
    page.wait_for_timeout(200)
    check_that(get_state(page, 'S.P.width') == 2 and get_cell(page, 0, 0).inner_text() == 'Tea;3', 'Format: the separator can be chosen (the text stays)')
    page.select_option('#f-sep', 'auto')
    page.uncheck('#f-header')
    page.wait_for_timeout(200)
    check_that(page.locator('#grid .head-cell[data-h="0"] b').inner_text() == '' and get_cell(page, 0, 0).inner_text() == 'Name', 'without a header row the first row is data, columns are A, B')
    page.check('#f-header')
    page.select_option('#f-conv', ',')
    page.click('[data-act=convert-sep]')
    page.wait_for_timeout(200)
    check_that(get_state(page, 'S.code') == 'Name,Price\nTea,"3,50"\nCoffee,"4,20"\n' and get_state(page, 'S.sep') == ',', 'Convert: another separator, quoted where needed')
    page.select_option('#f-eol', 'crlf')
    page.wait_for_timeout(200)
    check_that(get_state(page, 'S.code') == 'Name,Price\r\nTea,"3,50"\r\nCoffee,"4,20"\r\n', 'line endings converted to CRLF')
    page.click('[data-act=quote-all]')
    check_that(get_state(page, 'S.code').startswith('"Name","Price"\r\n'), 'every field quoted')
    page.click('[data-act=quote-needed]')
    check_that(get_state(page, 'S.code').startswith('Name,Price\r\nTea,"3,50"'), 'quotes only where needed again')

    # --- Sort and filter (view), sort the data ---
    data = 'Item,Qty\nb,10\na,9\nc,100\n'
    set_code(page, data)
    page.locator('[data-sort="1"]').click()
    page.wait_for_timeout(150)
    check_that([get_cell(page, i, 0).inner_text() for i in range(3)] == ['a', 'b', 'c'] and get_state(page, 'S.code') == data, 'sorting by a number column changes only the view')
    check_that(page.locator('#sort-info').is_visible() and 'Qty' in page.inner_text('#sort-info'), 'the view says it is sorted')
    page.locator('[data-sort="1"]').click()
    page.wait_for_timeout(150)
    check_that(get_cell(page, 0, 0).inner_text() == 'c', 'a second click sorts descending')
    page.click('#sort-apply')
    page.wait_for_timeout(200)
    check_that(get_state(page, 'S.code') == 'Item,Qty\nc,100\nb,10\na,9\n' and page.locator('#sort-info').is_hidden(), '"Sort the data" puts the rows of the file in that order, the header stays')
    page.evaluate('csvEditor.undo()')
    page.wait_for_timeout(200)
    check_that(get_state(page, 'S.code') == data, 'one Undo brings the old order back')
    page.fill('#filter', 'b')
    page.wait_for_timeout(300)
    check_that(get_state(page, 'S.view.length') == 1 and '1 of 3 rows' in page.inner_text('#view-info'), 'the filter shows only matching rows')
    page.fill('#filter', '')
    page.wait_for_timeout(300)

    # --- Column info ---
    get_cell(page, 0, 1).click()
    show_side_panel(page, True)
    page.click('[data-itab=column]')
    info = page.inner_text('#column-body')
    check_that('Numbers' in info and '119' in info and 'Qty' in info, 'Column: kind, sum and name of the column')
    page.click('[data-act=sort-down]')
    page.wait_for_timeout(200)
    check_that(get_state(page, 'S.code') == 'Item,Qty\nc,100\nb,10\na,9\n', 'Column: sort the data descending')
    page.evaluate('csvEditor.undo()')

    # --- Insert: rows and columns ---
    page.click('[data-itab=insert]')
    get_cell(page, 0, 0).click()
    page.click('[data-act=row-below]')
    page.wait_for_timeout(150)
    check_that(get_state(page, 'S.code') == 'Item,Qty\nb,10\n,\na,9\nc,100\n', 'a row below the selected one')
    page.click('[data-act=row-del]')
    page.wait_for_timeout(150)
    check_that(get_state(page, 'S.code') == data, 'delete the row')
    get_cell(page, 1, 0).click()
    page.click('[data-act=row-up]')
    page.wait_for_timeout(150)
    check_that(get_state(page, 'S.code') == 'Item,Qty\na,9\nb,10\nc,100\n' and page.evaluate('csvEditor.grid().getActive().r') == 0, 'move a row up (the selection goes along)')
    page.click('[data-act=col-right]')
    page.wait_for_timeout(150)
    check_that(get_state(page, 'S.code') == 'Item,Column 1,Qty\na,,9\nb,,10\nc,,100\n', 'a column to the right, with a name in the header')
    page.click('[data-act=col-move-right]')
    page.wait_for_timeout(150)
    check_that(get_state(page, 'S.code') == 'Item,Qty,Column 1\na,9,\nb,10,\nc,100,\n', 'move the column right')
    page.click('[data-act=col-del]')
    page.wait_for_timeout(150)
    check_that(get_state(page, 'S.code') == 'Item,Qty\na,9\nb,10\nc,100\n', 'delete the column')
    set_code(page, 'A,B\n x ,y\n x ,y\n,\n1\n')
    page.click('[data-act=trim]')
    page.click('[data-act=dupes]')
    page.click('[data-act=empty-rows]')
    page.click('[data-act=even]')
    page.wait_for_timeout(200)
    check_that(get_state(page, 'S.code') == 'A,B\nx,y\n1,\n', 'clean up: spaces, repeated rows, empty rows, missing fields: ' + repr(get_state(page, 'S.code')))
    page.click('[data-itab=format]')
    show_side_panel(page, False)

    # --- My documents, templates ---
    page.click('#btn-new')
    page.click('[data-new=budget]')
    check_that(get_state(page, 'S.name') == 'Budget' and get_state(page, 'S.sep') == ';', 'New > Budget (semicolons)')
    page.click('#btn-new')
    page.click('[data-new=timesheet]')
    check_that(get_state(page, 'S.sep') == '\t' and get_state(page, 'S.P.width') == 4, 'New > Time sheet (tabs)')
    page.click('#btn-files')
    check_that(page.locator('#files-grid .file-card').count() >= 3 and page.locator('#files-grid .mini-table .mz').count() > 3, 'My documents lists the documents with their first rows')
    page.locator('#files-grid .file-card', has_text='Welcome').locator('.file-open').click()
    check_that(get_state(page, 'S.name') == 'Welcome', 'a document opens from My documents')

    # --- Opening files: encoding ---
    page.set_input_files('#file', files=[{'name': 'Orte.csv', 'mimeType': 'text/csv', 'buffer': 'Name;Ort\nJürg;Zürich\n'.encode('cp1252')}])
    page.wait_for_timeout(500)
    check_that(get_state(page, 'S.name') == 'Orte' and get_cell(page, 0, 1).inner_text() == 'Zürich' and get_state(page, 'S.enc') == 'windows-1252', 'a Windows-1252 file is read correctly')
    show_side_panel(page, True)
    check_that('Windows-1252' in page.inner_text('#format-body'), 'Format shows how the file was read')
    show_side_panel(page, False)
    page.set_input_files('#file', files=[{'name': 'Bom.csv', 'mimeType': 'text/csv', 'buffer': b'\xef\xbb\xbfA,B\n\xc3\xa4,2\n'}])
    page.wait_for_timeout(500)
    check_that(get_state(page, 'S.code') == 'A,B\nä,2\n' and page.is_checked('#f-bom'), 'UTF-8 with BOM: read without the BOM, and downloaded with it')
    with page.expect_download() as d:
        page.click('#btn-download')
    with open(d.value.path(), 'rb') as f:
        check_that(f.read() == b'\xef\xbb\xbfA,B\n\xc3\xa4,2\n', 'Download .csv: the text as it is, with the BOM')

    # --- AI link to a new document, and a pasted answer that adds rows ---
    csv = 'Fruit,Color\nApple,red\nBanana,yellow\n'
    z = base64.urlsafe_b64encode(zlib.compress(csv.encode())).decode().rstrip('=')
    page.goto(URL + '#z=' + z + '&file=new&name=AI%20fruit', wait_until='networkidle')
    page.wait_for_timeout(800)
    check_that(get_state(page, 'S.name') == 'AI fruit' and get_state(page, 'S.code') == csv, 'an AI link makes a new document')
    link = 'https://csv.giit.ch/#csv=' + 'Fruit%2CColor%0ACherry%2Cdark%20red%0A' + '&mode=add'
    page.click('#btn-ai')
    page.fill('#ai-paste', 'Here you go:\n' + link + '\nClick it.')
    page.wait_for_timeout(800)
    check_that(not page.locator('#ask').is_visible(), 'a link changes the document without a question')
    page.wait_for_timeout(400)
    check_that(get_state(page, 'S.code') == csv + 'Cherry,dark red\n', 'mode=add appends the rows (a repeated header row is left out)')
    page.click('#btn-ai')
    page.click('#ai-copy')
    page.wait_for_timeout(300)
    prompt = page.evaluate('navigator.clipboard.readText()')
    check_that('You write CSV for my editor https://csv.giit.ch/' in prompt and 'Cherry,dark red' in prompt and 'Separator: comma' in prompt, 'the prompt carries the CSV and how it is read')

    # --- WebMCP tools ---
    rows = json.loads(run_tool(page, 'get_rows', {'from': 2, 'to': 3}))
    check_that(rows['header'] == ['Fruit', 'Color'] and rows['rows'][0] == {'row': 2, 'values': ['Banana', 'yellow']}, 'WebMCP get_rows')
    run_tool(page, 'set_cell', {'row': 1, 'column': 'Color', 'value': 'green, red'})
    check_that('Apple,"green, red"\n' in get_state(page, 'S.code'), 'WebMCP set_cell by header name')
    run_tool(page, 'add_rows', {'rows': [['Kiwi', 'brown']]})
    check_that(get_state(page, 'S.code').endswith('Kiwi,brown\n'), 'WebMCP add_rows')
    run_tool(page, 'undo', {})
    check_that('Kiwi' not in get_state(page, 'S.code'), 'WebMCP undo')
    check_that('No problems' in run_tool(page, 'get_problems', {}), 'WebMCP get_problems')
    check_that('Fruit,Color' in run_tool(page, 'get_document', {}), 'WebMCP get_document')

    # --- Export ---
    set_code(page, 'Name,Formula,Qty\nAnna,=1+2,-5\nLuca,@SUM(A1),007\n')
    page.click('#btn-export')
    page.select_option('#ex-format', 'xlsx')
    with page.expect_download() as d:
        page.click('#ex-download')
    check_that(d.value.suggested_filename.endswith('.xlsx'), 'export: XLSX')
    with zipfile.ZipFile(d.value.path()) as zf:
        names = zf.namelist()
        sheet = zf.read('xl/worksheets/sheet1.xml').decode()
    check_that('xl/workbook.xml' in names and '[Content_Types].xml' in names, 'the workbook has its parts')
    check_that('<v>-5</v>' in sheet and '>007<' in sheet and '<f>' not in sheet and 't="inlineStr"><is><t xml:space="preserve">=1+2</t>' in sheet, 'XLSX: numbers as numbers, 007 and formulas as text, never as a formula')
    page.select_option('#ex-format', 'csv')
    page.select_option('#ex-sep', ';')
    text = page.input_value('#ex-text')
    check_that(text == "Name;Formula;Qty\nAnna;'=1+2;-5\nLuca;'@SUM(A1);007\n", 'CSV export: another separator, formulas protected, numbers not: ' + repr(text))
    page.select_option('#ex-format', 'json')
    check_that(json.loads(page.input_value('#ex-text'))[0] == {'Name': 'Anna', 'Formula': '=1+2', 'Qty': '-5'}, 'JSON: an array of objects')
    page.select_option('#ex-format', 'md')
    check_that(page.input_value('#ex-text').startswith('| Name | Formula | Qty |\n| --- | --- | --- |'), 'Markdown table')
    page.select_option('#ex-format', 'html')
    with page.expect_download() as d:
        page.click('#ex-download')
    with open(d.value.path(), encoding='utf-8') as f:
        check_that('<th>Name</th>' in f.read(), 'HTML table')
    with page.expect_download() as d:
        page.click('#ex-zip')
    with zipfile.ZipFile(d.value.path()) as zf:
        check_that(len(zf.namelist()) == 6, 'all formats as ZIP')
    page.keyboard.press('Escape')

    # --- Phone ---
    page.set_viewport_size({'width': 390, 'height': 800})
    page.wait_for_timeout(300)
    check_that(page.locator('.views').is_visible(), 'phone: Code / Table / Format tabs')
    check_that(page.evaluate('document.documentElement.scrollWidth') <= 391, 'phone: no sideways scrolling')
    check_that(page.locator('#grid').is_visible(), 'phone: the table')
    page.click('[data-pane=code]')
    check_that(page.locator('#code').is_visible(), 'phone: the code view')

    # --- Template placeholders (?template=mustache) ---
    template_page = ctx.new_page()
    template_page.on('pageerror', lambda e: errors.append(str(e)))
    template_page.goto(URL + '?lang=en&template=mustache', wait_until='networkidle')
    template_page.wait_for_timeout(500)
    blocks = 'name,qty\n{{#items}}\nb,2\na,1\nb,2\n{{/items}}\n{{#items}},\nb,2\n{{/items}}\n'
    set_code(template_page, blocks + 'short\n')
    check_that(get_state(template_page, 'S.problems.map(p => p.msg)') == ['1 field - the header has 2'], 'template: control rows are left out of the field count, a short row is reported')
    check_that(template_page.locator('#hl .tp, #grid .tp').count() == 0, 'template: the tags have no color of their own in the code and in the cells')
    template_page.click('#view-switch [data-view-set=template]')
    check_that(template_page.inner_text('#grid .grid-row[data-r="0"]').strip().endswith('{{#items}}') and template_page.locator('#grid .grid-row[data-r="0"] .missing').count() == 0,
               'template: the template view shows a control row, its cells are not marked as missing')
    set_code(template_page, blocks)
    template_page.evaluate('csvEditor.setRowOrder(0, 1)')
    check_that(get_state(template_page, 'S.code') == 'name,qty\n{{#items}}\na,1\nb,2\nb,2\n{{/items}}\n{{#items}},\nb,2\n{{/items}}\n', 'template: sorting keeps every block between control rows in its place')
    set_code(template_page, 'amount\n{{#x}}\n-2\n-10\n{{/x}}\n')
    template_page.evaluate('csvEditor.setRowOrder(0, 1)')
    check_that(get_state(template_page, 'S.colType[0]') == 'number' and get_state(template_page, 'S.code') == 'amount\n{{#x}}\n-10\n-2\n{{/x}}\n', 'template: control rows are left out of the column kind, numbers sort as numbers')
    set_code(template_page, blocks)
    show_side_panel(template_page, True)
    template_page.click('[data-itab=insert]')
    template_page.click('[data-act=dupes]')
    template_page.wait_for_timeout(150)
    check_that(get_state(template_page, 'S.code') == 'name,qty\n{{#items}}\nb,2\na,1\n{{/items}}\n{{#items}},\nb,2\n{{/items}}\n', 'template: repeated rows are those of one block, control rows stay')
    set_code(template_page, blocks + 'short\n')
    template_page.click('[data-act=even]')
    template_page.wait_for_timeout(150)
    check_that(get_state(template_page, 'S.code').endswith('{{/items}}\nshort,\n') and '\n{{#items}}\n' in get_state(template_page, 'S.code'), 'template: short rows are filled up, control rows keep their fields')
    plain_page = ctx.new_page()
    plain_page.on('pageerror', lambda e: errors.append(str(e)))
    plain_page.goto(URL + '?lang=en', wait_until='networkidle')
    plain_page.wait_for_timeout(500)
    set_code(plain_page, blocks + 'short\n')
    check_that(len(get_state(plain_page, 'S.problems')) == 4 and plain_page.locator('#hl .tp').count() == 0, 'option off: every row with another number of fields is reported, no placeholder color')
    show_side_panel(plain_page, True)
    plain_page.click('[data-itab=insert]')
    plain_page.click('[data-act=dupes]')
    plain_page.wait_for_timeout(150)
    check_that(get_state(plain_page, 'S.code') == 'name,qty\n{{#items}}\nb,2\na,1\n{{/items}}\n{{#items}},\nshort\n', 'option off: repeated rows across the whole table')
    template_page.close()
    plain_page.close()

    check_that(not errors, 'no script errors' + (': ' + '; '.join(errors) if errors else ''))
    browser.close()

print(f'\n{len(failures)} failed' if failures else '\nall passed')
sys.exit(1 if failures else 0)
