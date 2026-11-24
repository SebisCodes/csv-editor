"""Template placeholders (?template=mustache, ?template=angle): how the CSV editor reads and shows them.

    python3 tests/template_test.py            the checks in Node
    python3 tests/template_test.py --browser  also the checks in the editor (php -S on port 8104 first)

  order       an order template with {{name}} in cells and inside a quoted field, an {{#items}} block,
              a padded control row and {{#hasNote}} / {{^hasNote}} blocks (tests/order-template.csv):
              comma detected, the control rows found, 0 placeholder errors
  angle       the same template in the syntax "angle" (tests/order-template-angle.csv)
  separators  the separator detection reads the tags as text: semicolon, tab and pipe templates
  control     which rows are control rows: section tags only, also several in one cell or one per cell
  errors      a section left open and a stray end tag are errors at the tag
  view        the code view shows every tag as written, without a color of its own, also with CRLF line
              endings
  blocks      the blocks for sorting: the records between two control rows share a block
  export      the JSON export keeps every tag as a string and keeps the control rows
  option off  no control rows, no placeholder errors
  examples    the example view: the table of the template filled with the examples, a list repeated by
              rows, sections by their example state, control rows left out, an example with a separator,
              quotes and a line break as one value, the label in brackets without an example; a cell of
              copied text leads to the template's cell (a cell past the row's end to a new field), a cell
              with an example is read-only and leads to its tag; filled text with a new reading error is reported, filling past a limit stops
  browser     with --browser: through a page around the editor, the example view is the default and shows
              the examples, the switch shows the template view with the tags, the cells and the code view
              have no placeholder color, a cell with an example is refused with a message, a click leads
              to the code, a copied cell is edited in the template, the "Placeholders" box is closed and
              puts a tag at the cursor as one undo step, the side panel is closed and its button stays in
              its place, "get" carries the template, clear ends the examples; with the option off nothing
              of this is there
Needs Node; --browser needs Playwright with Chrome."""
import html
import json
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.join(os.path.dirname(HERE), 'src', 'js')
URL = os.environ.get('EDITOR_URL', 'http://127.0.0.1:8104/')
HOOK = 'csvEditor'
EXAMPLE_MESSAGE = 'This part shows an example - change it in the template view or in the code'
failed = []


def check_that(ok, text):
    """Prints one result line and notes a failure.

    Args:
        ok (bool): True when the check holds.
        text (str): what is checked.

    Returns:
        None: the result is printed and a failure is noted.
    """
    print(('ok    ' if ok else 'FAIL  ') + text, flush=True)
    if not ok:
        failed.append(text)


def run_report(cases):
    """Runs tests/template/report.mjs in Node on the cases.

    Args:
        cases (list[dict]): each with `code` (str) and `template` (str or None).

    Returns:
        list[dict]: one result per case, in order.
    """
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8') as file:
        json.dump(cases, file)
    try:
        run = subprocess.run(['node', os.path.join(HERE, 'template', 'report.mjs'), SCRIPTS, file.name],
                             capture_output=True, text=True, timeout=120)
    finally:
        os.unlink(file.name)
    if run.returncode:
        print(run.stderr)
        sys.exit('report.mjs failed')
    return json.loads(run.stdout)


def get_plain_text(highlighted):
    """Returns the plain text of highlighted HTML.

    Args:
        highlighted (str): the HTML of the code view or of a cell.

    Returns:
        str: the text with the tags removed and the entities decoded.
    """
    return html.unescape(re.sub(r'<[^>]+>', '', highlighted))


def read_fixture(name):
    """Returns the text of a fixture in the tests folder.

    Args:
        name (str): the file name.

    Returns:
        str: the file's text.
    """
    with open(os.path.join(HERE, name), encoding='utf-8') as fixture:
        return fixture.read()


ORDER = read_fixture('order-template.csv')
ANGLE = read_fixture('order-template-angle.csv')
SEMICOLON = 'name;city\n{{#people}}\n{{name}};{{city}}\n{{/people}}\n'
TAB = 'name\tcity\n{{#people}}\n{{name}}\t{{city}}\n{{/people}}\n'
PIPE = 'name|city\n<<?people>>\n<<name>>|<<city>>\n<</?people>>\n'
CONTROL = ('name,city\n{{#a}}{{/a}}\n{{#a}} x\n{{name}}\n{{#a}},{{/b}}\n {{^c}} ,\n{{!x}}\n,\n{{/a}}{{/b}}{{/c}}\n')
BROKEN = 'name,city\n{{#items}}\n{{name}},{{city}}\n{{/people}}\n'
CRLF = ORDER.replace('\n', '\r\n')

(order, order_off, angle, semicolon, tab, pipe, control, broken, crlf) = run_report([
    {'code': ORDER, 'template': 'mustache'}, {'code': ORDER, 'template': None}, {'code': ANGLE, 'template': 'angle'},
    {'code': SEMICOLON, 'template': 'mustache'}, {'code': TAB, 'template': 'mustache'}, {'code': PIPE, 'template': 'angle'},
    {'code': CONTROL, 'template': 'mustache'}, {'code': BROKEN, 'template': 'mustache'}, {'code': CRLF, 'template': 'mustache'}])

print('-- the order template')
check_that(order['separator'] == ',', f'mustache: the comma is detected ({order["separator"]!r})')
check_that(order['controlRows'] == [2, 4, 5, 7, 8, 10], f'mustache: the control rows are found, the padded one too ({order["controlRows"]})')
check_that(order['problems'] == [], f'mustache: 0 placeholder errors ({order["problems"]})')
check_that(len(order['tags']) == 15, f'mustache: every tag of the template is found ({len(order["tags"])})')

print('-- angle')
check_that(angle['separator'] == ',' and angle['controlRows'] == [2, 4, 5, 7] and angle['problems'] == [],
           f'angle: comma, control rows {angle["controlRows"]}, 0 placeholder errors')
check_that(get_plain_text(angle['highlighted']) == ANGLE and 'class="tp"' not in angle['highlighted'],
           'angle: the code view shows every tag as written, without a color of its own')

print('-- separators')
check_that([semicolon['separator'], tab['separator'], pipe['separator']] == [';', '\t', '|'],
           'the separator detection reads the tags as text: semicolon, tab and pipe')
check_that(semicolon['controlRows'] == [1, 3] and pipe['controlRows'] == [1, 3], 'the control rows of these templates are found')

print('-- control rows')
check_that(control['controlRows'] == [1, 4, 5, 8],
           f'section tags only (several in one cell, one per cell, spaces around) make a control row; text, a value tag, an unknown sign and empty cells do not ({control["controlRows"]})')

print('-- placeholder errors')
messages = [(problem['pos'], problem['msg']) for problem in broken['problems']]
expected = [(BROKEN.index('{{#items}}'), 'The section {{#items}} stays open - add {{/items}}'),
            (BROKEN.index('{{/people}}'), '{{/people}} is a stray end tag - remove it or add {{#people}} before it')]
check_that(sorted(messages) == expected, f'a section left open and a stray end tag at their tags: {messages}')

print('-- code view')
check_that(get_plain_text(order['highlighted']) == ORDER, 'mustache: the highlighted text is the code')
check_that('class="tp"' not in order['highlighted'], 'mustache: a tag has no color of its own')
check_that('<span class="h f0">name</span>' in order['highlighted'], 'the header keeps its own highlighting')
check_that(get_plain_text(crlf['highlighted']) == ORDER and 'class="tp"' not in crlf['highlighted'], 'CRLF line endings: the code view shows every tag as written')
check_that(order['highlighted'] == order_off['highlighted'], 'the highlighting is the plain CSV highlighting with and without the option')
check_that(order['values'][6][0] == 'Note for {{name}}, {{city}}', f'a cell holds its tags as written ({order["values"][6][0]})')

print('-- blocks for sorting')
check_that(order['blocks'] == [0, 0, 1, 2, 3, 5, 6, 7, 9, 10, 11], f'the records between two control rows share a block ({order["blocks"]})')
check_that(order_off['blocks'] is None, 'option off: no blocks, the sort is the plain one')

print('-- export')
exported = json.loads(order['json'])
check_that(exported[0]['name'] == '{{name}}' and exported[1]['name'] == '{{#items}}' and len(exported) == 10,
           'the JSON export keeps every tag as a string and keeps the control rows')
check_that(order['json'] == order_off['json'], 'the export is the same with the option off')

print('-- option off')
check_that(order_off['controlRows'] == [] and order_off['problems'] == [], 'option off: no control rows, no placeholder errors')

print('-- examples')
EXAMPLES = {'placeholders': [
    {'name': 'name', 'kind': 'value', 'label': 'Name', 'example': 'John Doe, Jr.'},
    {'name': 'street', 'kind': 'value', 'label': 'Street', 'example': '1 Main Street'},
    {'name': 'city', 'kind': 'value', 'label': 'City', 'example': 'Springfield'},
    {'name': 'items', 'kind': 'list', 'label': 'Items', 'fields': [{'name': 'item', 'label': 'Item'}, {'name': 'quantity', 'label': 'Quantity'}],
     'rows': [{'item': 'Chair', 'quantity': '2'}, {'item': 'Table', 'quantity': '1'}]},
    {'name': 'hasNote', 'kind': 'section', 'label': 'With a note', 'shown': True},
    {'name': 'note', 'kind': 'value', 'label': 'Note', 'example': 'Ring "twice"\nthen wait'}]}
NO_NOTE = {'placeholders': [{'name': 'hasNote', 'kind': 'section', 'label': 'With a note', 'shown': False}]}
UNCLOSED = 'name,note\n"a\n{{#s}}\nb"\n{{/s}}\n'
DEEP = '{{#a}}' * 40 + 'x' + '{{/a}}' * 40 + '\n'
SEMICOLON_FILL = {'placeholders': [{'name': 'people', 'kind': 'list', 'fields': [{'name': 'name'}, {'name': 'city'}],
                                    'rows': [{'name': 'Doe; John', 'city': 'Springfield'}]}]}
record_count = order['rowCount']
filled, labels, no_note, angle_filled, crlf_filled, unclosed, deep, semicolon_filled = run_report([
    {'code': ORDER, 'template': 'mustache', 'example': {'message': EXAMPLES, 'cells': [[1, 0], [1, 4], [3, 0], [3, 4], [0, 1], [5, 1], [6, 0], [4, 4], [1, 6]]}},
    {'code': ORDER, 'template': 'mustache', 'example': {'message': None}},
    {'code': ORDER, 'template': 'mustache', 'example': {'message': NO_NOTE}},
    {'code': ANGLE, 'template': 'angle', 'example': {'message': EXAMPLES}},
    {'code': CRLF, 'template': 'mustache', 'example': {'message': EXAMPLES}},
    {'code': UNCLOSED, 'template': 'mustache', 'example': {'message': {'placeholders': [{'name': 's', 'kind': 'section', 'shown': False}]}}},
    {'code': DEEP, 'template': 'mustache', 'example': {'message': None}},
    {'code': SEMICOLON, 'template': 'mustache', 'example': {'message': SEMICOLON_FILL}},
])
rows = filled['example']['rows']
check_that(rows == [['name', 'street', 'postalCode', 'city', 'item', 'quantity'],
                    ['John Doe, Jr.', '1 Main Street', '[postalCode]', 'Springfield', '', ''],
                    ['', '', '', '', 'Chair', '2'], ['', '', '', '', 'Table', '1'],
                    ['Note for John Doe, Jr., Springfield', '', '', '', 'Ring "twice"\nthen wait', '']],
           f'the example view: values filled, the list repeated by rows, the shown section there, its inverted section and every control row left out: {rows}')
check_that('{{' not in json.dumps(rows), 'no tag is left in the example view')
check_that(filled['example']['records'] == [0, 1, 3, 3, 6], f'each row knows the template\'s record it comes from: {filled["example"]["records"]}')
name_cell, copied_cell, list_cell, item_cell, header_cell, new_row, past_rows, note_cell, new_field = filled['example']['cells']
check_that(name_cell['cell'] is None and name_cell['offset'] == ORDER.index('{{name}}'), f'a cell with an example is read-only and leads to its tag: {name_cell}')
check_that(copied_cell['cell'] == {'rec': 1, 'c': 4}, f'an empty copied cell leads to the template\'s cell: {copied_cell}')
check_that(list_cell['cell'] == {'rec': 3, 'c': 0} and item_cell['cell'] is None and item_cell['offset'] == ORDER.index('{{item}}'),
           f'a cell of a repeated list row leads to the template row\'s cell; its example to the tag: {list_cell} {item_cell}')
check_that(header_cell['cell'] == {'rec': 0, 'c': 1} and header_cell['offset'] == ORDER.index('street'), f'a header cell leads to its field: {header_cell}')
check_that(new_row['cell'] == {'rec': record_count, 'c': 1} and new_row['offset'] is None and past_rows['cell'] == {'rec': record_count + 1, 'c': 0},
           f'a row past the end stands for a new record of the template: {new_row} {past_rows}')
check_that(new_field['cell'] == {'rec': 1, 'c': 6}, f'a cell past the end of a row with examples is a new field of the template\'s record: {new_field}')
check_that(note_cell['cell'] is None and note_cell['offset'] == ORDER.index('{{note}}'), f'a quoted example with a line break leads to its tag: {note_cell}')
label_rows = labels['example']['rows']
check_that(label_rows[1][:4] == ['[name]', '[street]', '[postalCode]', '[city]'] and label_rows[2][4:] == ['[item]', '[quantity]'] and len(label_rows) == 4
           and label_rows[3][0] == 'Note for [name], [city]',
           f'without examples: labels in brackets, a list shows one entry, a section is shown once and its inverted section hidden: {label_rows}')
check_that(no_note['example']['rows'][-1] == ['No note', '', '', '', '', ''] and not any('Note for' in row[0] for row in no_note['example']['rows']),
           'a hidden section is left out and its inverted section shown')
check_that(angle_filled['example']['rows'] == rows, f'angle: the same example view ({angle_filled["example"]["rows"]})')
check_that(crlf_filled['example']['rows'] == rows and crlf_filled['example']['records'] == [0, 1, 3, 3, 6], 'CRLF line endings: the same example view')
check_that(unclosed['example']['newError'], 'filled text with a reading error the template lacks is reported (the table then shows the template)')
check_that(deep['example'].get('error') == 'TemplateExpansionError', f'filling past a limit stops: {deep["example"]}')
check_that(semicolon_filled['example']['rows'] == [['name', 'city'], ['Doe; John', 'Springfield']], f'an example with the separator stays one value: {semicolon_filled["example"]["rows"]}')

HOST = """<!doctype html><meta charset="utf-8"><body style="margin:0">
<iframe id="ed" src="%s" style="width:1280px;height:800px;border:0"></iframe>
<script>
window.msgs = [];
addEventListener('message', e => { if (e.data && typeof e.data.type === 'string') msgs.push(e.data); });
window.send = m => document.getElementById('ed').contentWindow.postMessage(m, '*');
</script>"""
PREFIX = HOOK.lower()
# Records, frame by frame, what the editor shows: whether the work area is visible, the header and
# count of the "Placeholders" box, and whether the table shows a tag (runs in the editor's frame only).
FRAMES = """(() => { if (location.port !== '%s') return; window.shownFrames = [];
  const record = () => { const box = document.querySelector('#placeholder-box'), grid = document.querySelector('#grid');
    if (box && grid) { const work = document.querySelector('#work');
      const row = [document.documentElement.classList.contains('translate') || getComputedStyle(work).visibility === 'hidden' ? 'hidden' : 'shown',
        box.querySelector('[data-placeholder-toggle] span:not([data-placeholder-count])').textContent, box.querySelector('[data-placeholder-count]').textContent,
        grid.textContent.includes('{{') ? 'tags' : 'filled'].join('|');
      const frames = window.shownFrames; if (!frames.length || frames[frames.length - 1] !== row) frames.push(row); }
    requestAnimationFrame(record); };
  requestAnimationFrame(record); })();"""


def open_hosted_editor(browser, query, frames=False):
    """Opens the editor inside a page around it (on another origin) and waits for its ready message.

    Args:
        browser (Browser): the browser.
        query (str): the editor's address parameters after ?embed=1, e.g. "&template=mustache".
        frames (bool): True to record what the editor shows in every frame (window.shownFrames).

    Returns:
        tuple: the browser context and the page around the editor.
    """
    context = browser.new_context(viewport={'width': 1300, 'height': 820})
    if frames:
        context.add_init_script(FRAMES % URL.rstrip('/').rsplit(':', 1)[-1])
    page = context.new_page()
    page.route('http://localhost:8199/**', lambda route: route.fulfill(status=200, content_type='text/html', body=HOST % (URL + '?embed=1' + query)))
    page.goto('http://localhost:8199/', wait_until='load')
    page.wait_for_function(f"msgs.some(m => m.type === '{PREFIX}:ready')", timeout=15000)
    return context, page


def send_and_wait(page, message, answer):
    """Sends a message to the editor and waits for its answer of a type.

    Args:
        page (Page): the page around the editor.
        message (dict): the message.
        answer (str): the type of the answer without the prefix, e.g. "loaded".

    Returns:
        dict: the answer.
    """
    page.evaluate('m => { msgs.length = 0; send(m); }', message)
    page.wait_for_function(f"msgs.some(m => m.type === '{PREFIX}:{answer}')", timeout=15000)
    return page.evaluate(f"msgs.find(m => m.type === '{PREFIX}:{answer}')")


def get_box(frame, selector):
    """Returns the place and size of an element.

    Args:
        frame (Frame): the editor's frame.
        selector (str): the element's selector.

    Returns:
        dict: x, y, width and height, rounded.
    """
    return frame.evaluate("s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }; }", selector)


def run_view_checks(browser):
    """Checks the example view, the template view, the "Placeholders" box and the side panel through
    a page around the editor that sends examples.

    Args:
        browser (Browser): the browser.

    Returns:
        None: the results are printed and failures are noted.
    """
    context, page = open_hosted_editor(browser, '&lang=en&template=mustache')
    frame = page.frames[1]
    send_and_wait(page, {'type': f'{PREFIX}:load', 'name': 'Order', 'content': ORDER, 'template': EXAMPLES}, 'loaded')
    frame.wait_for_function("document.querySelector('#grid').innerText.includes('John Doe')", timeout=10000)
    grid = frame.inner_text('#grid')
    check_that('{{' not in grid and 'Chair' in grid and 'Table' in grid and 'Springfield' in grid, 'the example view is the default: the examples, the list rows, no tag')
    check_that(frame.locator('#hl .tp, #grid .tp').count() == 0, 'the code view and the cells show the tags without a color of their own')
    switch_before = [get_box(frame, '#view-switch [data-view-set=example]'), get_box(frame, '#view-switch [data-view-set=template]')]
    check_that(switch_before[0]['width'] == switch_before[1]['width'], f'the two buttons of the switch have one width: {switch_before}')
    frame.locator('#grid .z', has_text='Chair').first.dblclick()
    page.wait_for_timeout(200)
    check_that(frame.inner_text('#toast') == EXAMPLE_MESSAGE and not frame.evaluate(f'{HOOK}.grid().isEditing()'), 'a cell with an example is read-only, with a message')
    frame.locator('#grid .z', has_text='Springfield').first.click()
    page.wait_for_timeout(300)
    after_cursor = frame.evaluate('() => { const ta = document.querySelector("#code"); return ta.value.slice(ta.selectionStart, ta.selectionStart + 8); }')
    check_that(after_cursor == '{{city}}', f'a click on a cell with an example puts the code\'s cursor at its tag: {after_cursor!r}')
    frame.locator('#grid .grid-row[data-r="2"] .z[data-c="0"]').click()
    page.keyboard.type('x')
    page.keyboard.press('Enter')
    page.wait_for_timeout(300)
    code = frame.evaluate(f'{HOOK}.state.code')
    check_that(code == ORDER.replace(',,,,{{item}}', 'x,,,,{{item}}'), 'a copied cell of a repeated row is changed in the template\'s row')
    check_that(frame.locator('#grid .grid-row[data-r="1"] .z[data-c="0"]').inner_text() == 'x', 'every row of the list shows the change')
    frame.evaluate(f'{HOOK}.undo()')
    check_that(frame.evaluate(f'{HOOK}.state.code') == ORDER, 'one undo step takes it back')
    frame.locator('#grid .grid-row[data-r="1"] .z[data-c="0"]').click()
    frame.locator('#grid .grid-row[data-r="2"] .z[data-c="0"]').click(modifiers=['Shift'])
    frame.evaluate("() => { const data = new DataTransfer(); data.setData('text/plain', 'y'); document.querySelector('#grid').dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true })); }")
    page.wait_for_timeout(300)
    check_that(frame.evaluate(f'{HOOK}.state.code') == ORDER.replace(',,,,{{item}}', 'y,,,,{{item}}'), 'a value pasted over two rows of a list goes once into the template\'s cell')
    frame.evaluate(f'{HOOK}.undo()')
    table_before = get_box(frame, '#grid')
    frame.click('#view-switch [data-view-set=template]')
    page.wait_for_timeout(300)
    grid = frame.inner_text('#grid')
    check_that('{{name}}' in grid and '{{#items}}' in grid and 'John Doe' not in grid, 'the switch shows the template view with the tags as text')
    switch_after = [get_box(frame, '#view-switch [data-view-set=example]'), get_box(frame, '#view-switch [data-view-set=template]')]
    check_that(switch_after == switch_before and get_box(frame, '#grid') == table_before, 'the switch and the table keep their place and size')
    frame.click('#view-switch [data-view-set=example]')
    editor_before = get_box(frame, '.code-pane .editor')
    check_that(frame.locator('#placeholder-list').is_hidden() and frame.inner_text('[data-placeholder-count]') == str(len(EXAMPLES['placeholders'])),
               'the "Placeholders" box is closed and counts the page\'s placeholders')
    frame.click('[data-placeholder-toggle]')
    check_that(frame.locator('#placeholder-list').is_visible() and get_box(frame, '.code-pane .editor') == editor_before, 'the box opens over the code without moving it')
    cursor = ORDER.index('No note')
    frame.evaluate('c => { const ta = document.querySelector("#code"); ta.focus(); ta.setSelectionRange(c, c + 2); }', cursor)
    frame.locator('.placeholder-entry', has_text='With a note').click()
    code = frame.evaluate(f'{HOOK}.state.code')
    check_that(code == ORDER[:cursor] + '{{#hasNote}}No{{/hasNote}}' + ORDER[cursor + 2:], 'a section goes around the selection')
    frame.evaluate(f'{HOOK}.undo()')
    check_that(frame.evaluate(f'{HOOK}.state.code') == ORDER, 'one undo step takes it back')
    check_that(send_and_wait(page, {'type': f'{PREFIX}:get'}, 'save')['content'] == ORDER, '"get" carries the template as written')
    panel_button = get_box(frame, '#btn-panel')
    check_that(frame.evaluate("getComputedStyle(document.querySelector('#side-panel')).display") == 'none', 'the side panel is closed at the start')
    frame.click('#btn-panel')
    check_that(frame.evaluate("getComputedStyle(document.querySelector('#side-panel')).display") != 'none' and get_box(frame, '#btn-panel') == panel_button
               and get_box(frame, '#grid') == table_before, 'its button opens it over the table, which keeps its size, and stays in its place')
    check_that(get_box(frame, '#side-panel')['y'] >= get_box(frame, '.tables-pane > .pane-header')['y'] + get_box(frame, '.tables-pane > .pane-header')['height'],
               'the drawer starts below the table\'s bar')
    page.evaluate(f"() => {{ document.querySelector('#ed').contentWindow.postMessage({{ type: '{PREFIX}:template', clear: true }}, '*'); }}")
    frame.wait_for_function("document.querySelector('#grid').innerText.includes('[name]')", timeout=10000)
    check_that('[city]' in frame.inner_text('#grid'), 'clear ends the examples: labels in brackets')
    context.close()


def run_first_paint_checks(browser):
    """Checks frame by frame that the table and the box show the page's examples from the first
    paint of a document that comes with them (in the load, or in a template message before it).

    Args:
        browser (Browser): the browser.

    Returns:
        None: the results are printed and failures are noted.
    """
    for mode in ('field', 'before'):
        context, page = open_hosted_editor(browser, '&lang=de&template=mustache', frames=True)
        frame = page.frames[1]
        load = {'type': f'{PREFIX}:load', 'name': 'Order', 'content': ORDER}
        if mode == 'field':
            load['template'] = EXAMPLES
        else:
            page.evaluate('m => send(m)', {'type': f'{PREFIX}:template', **EXAMPLES})
        send_and_wait(page, load, 'loaded')
        page.wait_for_timeout(600)
        frames = frame.evaluate('window.shownFrames')
        shown = [row for row in frames if row.startswith('shown|')]
        loaded = [row for row in shown if not row.endswith('|0|filled')]
        expected = f'shown|Platzhalter|{len(EXAMPLES["placeholders"])}|filled'
        check_that(loaded and all(row == expected for row in loaded),
                   f'{mode}: from its first paint the document shows the examples and the box the page\'s list, in German: {frames}')
        context.close()


def run_browser_checks():
    """Checks the option in the editor: views of the table, box, side panel and the first paint.

    Returns:
        None: the results are printed and failures are noted.
    """
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        # The page around the editor is served by the browser itself; these flags let it frame the local editor.
        browser = pw.chromium.launch(channel='chrome', headless=True, args=['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights'])
        print('-- browser')
        run_view_checks(browser)
        run_first_paint_checks(browser)
        page = browser.new_page(viewport={'width': 1300, 'height': 820})
        page.goto(URL + '?lang=en&template=mustache', wait_until='networkidle')
        page.evaluate('t => %s.setCode(t)' % HOOK, ORDER)
        page.wait_for_timeout(300)
        check_that('[name]' in page.inner_text('#grid') and '{{' not in page.inner_text('#grid'), 'without a page: the example view shows the labels in brackets')
        page.goto(URL + '?lang=en', wait_until='networkidle')
        page.evaluate('t => %s.setCode(t)' % HOOK, ORDER)
        page.wait_for_timeout(300)
        check_that('{{name}}' in page.inner_text('#grid') and page.locator('#hl .tp, #grid .tp').count() == 0, 'option off: the table shows the text as it is, no placeholder colors')
        check_that(page.locator('#view-switch').is_hidden() and page.locator('#placeholder-box').is_hidden() and page.locator('#view-note').is_hidden(),
                   'option off: no switch, no box, no note')
        check_that(page.evaluate("getComputedStyle(document.querySelector('#side-panel')).display") == 'none' and page.locator('#btn-panel').is_visible(),
                   'option off: the side panel is a closed drawer with its button too')
        page.close()
        browser.close()


if '--browser' in sys.argv:
    run_browser_checks()

print(f'\n{len(failed)} failed' if failed else '\nall passed')
sys.exit(1 if failed else 0)
