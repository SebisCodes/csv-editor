"""Editing in place in the table: typing into a cell writes the
CSV text - only that field, quoted only where needed, line endings kept -
as one undo step; Escape cancels; Tab and Enter move; copy and paste of
ranges as TSV; header names; the empty row at the end adds a row.

    php -S 127.0.0.1:8104 -t src src/php/router.php          (in the project folder)
    python tests/inplace_test.py"""
import os
import sys

from playwright.sync_api import sync_playwright

EDITOR = os.environ.get('EDITOR_URL', 'http://127.0.0.1:8104/')
CODE = 'Name,City,Amount\nAnna,"Zug, ZG",10\nLuca,Basel,20\n'
failed = []


def check_that(ok, text):
    """Prints one result line and notes a failure.

    Args:
        ok (bool): True when the check holds.
        text (str): what is checked.

    Returns:
        None: the result is printed and a failure is noted.
    """
    print(('ok    ' if ok else 'FAIL  ') + text)
    if not ok:
        failed.append(text)


with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='chrome', headless=True)
    ctx = browser.new_context(viewport={'width': 1400, 'height': 860})
    ctx.grant_permissions(['clipboard-read', 'clipboard-write'])
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(EDITOR + '?lang=en', wait_until='load')
    page.wait_for_timeout(1000)
    page.evaluate('c => csvEditor.setCode(c)', CODE)
    page.wait_for_timeout(300)
    code = lambda: page.evaluate('csvEditor.state.code')
    hist = lambda: page.evaluate('csvEditor.state.history.length')
    cell = lambda r, c: page.locator(f'#grid .grid-row[data-r="{r}"] [data-c="{c}"]')
    field = page.locator('.cell-field')

    cell(0, 0).click()
    check_that(page.evaluate('document.activeElement.id') == 'grid', 'a click selects the cell and the table has the focus')
    caret = page.evaluate('() => { const t = document.querySelector("#code"); return t.value.slice(t.selectionStart, t.selectionStart + 4); }')
    check_that(caret == 'Anna', 'a click in the table puts the code cursor on that field')
    n = hist()
    page.keyboard.type('Ann, the 1st')
    check_that(field.is_visible() and field.input_value() == 'Ann, the 1st', 'typing starts editing and replaces the value')
    page.keyboard.press('Enter')
    page.wait_for_timeout(200)
    check_that(code() == 'Name,City,Amount\n"Ann, the 1st","Zug, ZG",10\nLuca,Basel,20\n', 'Enter writes the cell, quoted because of the comma: ' + repr(code()))
    check_that(hist() == n + 1, 'one undo step')
    check_that(page.evaluate('csvEditor.grid().getActive().r') == 1, 'Enter moves down')
    page.keyboard.press('Control+z')
    page.wait_for_timeout(200)
    check_that(code() == CODE, 'one Undo brings the old text back')

    cell(0, 1).click()
    page.keyboard.press('Enter')
    check_that(field.input_value() == 'Zug, ZG', 'Enter edits with the cell\'s value (without the quotes)')
    page.keyboard.press('Control+a')
    page.keyboard.type('Zug')
    page.keyboard.press('Tab')
    page.wait_for_timeout(200)
    check_that(code() == 'Name,City,Amount\nAnna,Zug,10\nLuca,Basel,20\n', 'quotes only where needed: a value without a comma loses them')
    check_that(page.evaluate('csvEditor.grid().getActive().c') == 2, 'Tab moves right')
    page.keyboard.type('say "hi"')
    page.keyboard.press('Escape')
    page.wait_for_timeout(200)
    check_that(code() == 'Name,City,Amount\nAnna,Zug,10\nLuca,Basel,20\n' and not field.is_visible(), 'Escape cancels')
    page.keyboard.type('say "hi"')
    page.keyboard.press('Enter')
    page.wait_for_timeout(200)
    check_that('Anna,Zug,"say ""hi"""\n' in code(), 'quotes inside a value are doubled')
    cell(1, 0).click()
    page.keyboard.press('F2')
    page.keyboard.press('End')
    page.keyboard.press('Alt+Enter')
    page.keyboard.type('second line')
    page.keyboard.press('Enter')
    page.wait_for_timeout(200)
    check_that('"Luca\nsecond line",Basel,20' in code(), 'Alt+Enter puts a line break into the cell (quoted)')

    # Header names
    page.locator('#grid .head-cell[data-h="2"]').dblclick()
    page.wait_for_timeout(100)
    check_that(field.is_visible() and field.input_value() == 'Amount', 'a double-click on a column head edits its name')
    page.keyboard.press('Control+a')
    page.keyboard.type('Sum')
    page.keyboard.press('Enter')
    page.wait_for_timeout(200)
    check_that(code().startswith('Name,City,Sum\n'), 'the header name is written into the first row')

    # The empty row at the end adds a row; a cell past the last column adds a field
    page.locator('#grid .grid-row.new [data-c="1"]').click()
    page.keyboard.type('Bern')
    page.keyboard.press('Enter')
    page.wait_for_timeout(200)
    check_that(code().endswith('\n,Bern\n'), 'typing into the row marked + adds a row: ' + repr(code()[-20:]))
    cell(0, 3).click()
    page.keyboard.type('x')
    page.keyboard.press('Enter')
    page.wait_for_timeout(200)
    check_that('Anna,Zug,"say ""hi""",x\n' in code(), 'typing into the empty column adds a field to that row')
    page.keyboard.press('Control+z')
    page.wait_for_timeout(200)

    # Line endings are kept (CRLF), also for new rows
    page.evaluate('c => csvEditor.setCode(c)', 'a;b\r\n1;2\r\n3;4\r\n')
    page.wait_for_timeout(300)
    check_that(page.evaluate('csvEditor.state.sep') == ';', 'semicolon detected')
    cell(0, 1).click()
    page.keyboard.type('x;y')
    page.keyboard.press('Enter')
    page.wait_for_timeout(200)
    check_that(code() == 'a;b\r\n1;"x;y"\r\n3;4\r\n', 'CRLF kept, the separator in a value is quoted: ' + repr(code()))
    page.locator('#grid .grid-row.new [data-c="0"]').click()
    page.keyboard.type('5')
    page.keyboard.press('Enter')
    page.wait_for_timeout(200)
    check_that(code() == 'a;b\r\n1;"x;y"\r\n3;4\r\n5\r\n', 'a new row gets the same line ending')
    # Typing in the code keeps CRLF too
    page.evaluate('() => { const t = document.querySelector("#code"); t.focus(); t.setSelectionRange(t.value.length, t.value.length); document.execCommand("insertText", false, "6;7\\n"); }')
    page.wait_for_timeout(500)
    check_that(code() == 'a;b\r\n1;"x;y"\r\n3;4\r\n5\r\n6;7\r\n', 'a line typed in the code ends with CRLF: ' + repr(code()))
    check_that(page.evaluate('csvEditor.state.P.rows.length') == 5, 'the table follows the code')

    # The code cursor selects its cell
    page.evaluate('() => { const t = document.querySelector("#code"); t.focus(); const i = t.value.indexOf("x;y"); t.setSelectionRange(i, i); }')
    page.wait_for_timeout(300)
    a = page.evaluate('csvEditor.grid().getActive()')
    check_that(a['r'] == 0 and a['c'] == 1, 'the code cursor selects its cell: ' + str(a))

    # Copy and paste ranges as TSV
    page.evaluate('c => csvEditor.setCode(c)', 'A,B,C\n1,2,3\n4,5,6\n')
    page.wait_for_timeout(300)
    cell(0, 0).click()
    cell(1, 1).click(modifiers=['Shift'])
    page.keyboard.press('Control+c')
    page.wait_for_timeout(200)
    check_that(page.evaluate('navigator.clipboard.readText()') == '1\t2\n4\t5', 'Ctrl+C copies the range as TSV')
    page.evaluate('navigator.clipboard.writeText("x\\ty\\n\\"multi\\nline\\"\\tz\\n")')
    n = hist()
    cell(0, 1).click()
    page.keyboard.press('Control+v')
    page.wait_for_timeout(300)
    check_that(code() == 'A,B,C\n1,x,y\n4,"multi\nline",z\n', 'Ctrl+V pastes a range from a spreadsheet: ' + repr(code()))
    check_that(hist() == n + 1, 'the paste is one undo step')
    cell(0, 0).click()
    cell(1, 2).click(modifiers=['Shift'])
    page.keyboard.press('Delete')
    page.wait_for_timeout(200)
    check_that(code() == 'A,B,C\n,,\n,,\n', 'Delete empties the selected cells')

    # Nothing in a cell is HTML; the German interface leaves cells alone
    page.evaluate('c => csvEditor.setCode(c)', 'Name,Note\n<b>bold</b>,Delete\n')
    page.goto(EDITOR + '?lang=de', wait_until='load')
    page.wait_for_timeout(1500)
    page.evaluate('c => csvEditor.setCode(c)', 'Name,Note\n<b>bold</b>,Delete\n')
    page.wait_for_timeout(300)
    check_that(cell(0, 0).inner_text() == '<b>bold</b>' and page.locator('#grid b:text("bold")').count() == 0, 'a cell shows its text, never HTML')
    check_that(cell(0, 1).inner_text() == 'Delete', 'the German interface does not translate cells')
    cell(0, 1).dblclick()
    check_that(field.input_value() == 'Delete', 'and the edit field has the cell\'s own text')
    page.keyboard.press('Escape')
    page.goto(EDITOR + '?lang=en', wait_until='load')
    check_that(not errors, 'no script errors: ' + '; '.join(errors))
    browser.close()

print()
print('all passed' if not failed else f'{len(failed)} failed')
sys.exit(1 if failed else 0)
