"""A large file: 100 000 rows stay usable (the table draws only the rows in sight).

    php -S 127.0.0.1:8104 -t src src/php/router.php          (in the project folder)
    python tests/perf_test.py

Times loading, scrolling, editing a cell, filtering, sorting the view and
sorting the data, and checks that the page holds only a few rows."""
import os
import sys

from playwright.sync_api import sync_playwright

EDITOR = os.environ.get('EDITOR_URL', 'http://127.0.0.1:8104/')
ROWS = 100_000
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
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(EDITOR + '?lang=en', wait_until='load')
    page.wait_for_timeout(1000)
    ms = page.evaluate("""n => {
        const lines = ['id,name,city,amount,date,note,flag,code'];
        for (let i = 1; i <= n; i++) lines.push(`${i},Name ${i},"City, ${i % 97}",${(i * 7.31 % 1000).toFixed(2)},2026-${String(i % 12 + 1).padStart(2, '0')}-${String(i % 28 + 1).padStart(2, '0')},Note number ${i},${i % 2 ? 'yes' : 'no'},C${i % 1000}`);
        const text = lines.join('\\n') + '\\n';
        const t = performance.now();
        csvEditor.setCode(text);
        return [performance.now() - t, text.length];
    }""", ROWS)
    print(f'      {ms[1] / 1e6:.1f} MB, setCode {ms[0]:.0f} ms')
    check_that(page.evaluate('csvEditor.state.P.rows.length') == ROWS + 1, f'{ROWS:,} rows read')
    check_that(ms[0] < 4000, f'loading takes {ms[0]:.0f} ms (< 4000)')
    rows_in_page = page.locator('#grid .grid-row').count()
    check_that(rows_in_page < 120, f'only the rows in sight are in the page ({rows_in_page})')

    t = page.evaluate("""() => new Promise(res => {
        const g = document.getElementById('grid'); const t = performance.now();
        g.scrollTop = g.scrollHeight / 2;
        requestAnimationFrame(() => requestAnimationFrame(() => res(performance.now() - t)));
    })""")
    page.wait_for_timeout(100)
    first = page.locator('#grid .grid-row .num').nth(5).inner_text()
    check_that(t < 300 and int(first) > 40000, f'scrolling to the middle draws its rows in {t:.0f} ms (row {first})')

    page.locator('#grid .grid-row').nth(6).locator('[data-c="1"]').click()
    t = page.evaluate("""() => { const t = performance.now(); document.getElementById('grid').dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
        const f = document.querySelector('.cell-field'); f.value = 'Edited, with comma';
        f.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return performance.now() - t; }""")
    check_that('"Edited, with comma"' in page.evaluate('csvEditor.state.code.slice(csvEditor.state.code.length / 2 - 300000, csvEditor.state.code.length / 2 + 300000)'), 'a cell in the middle is edited')
    check_that(t < 2000, f'editing a cell (write, read again, draw) takes {t:.0f} ms (< 2000)')
    t = page.evaluate('() => { const t = performance.now(); csvEditor.undo(); return performance.now() - t; }')
    check_that(t < 2000 and 'Edited, with comma' not in page.evaluate('csvEditor.state.code'), f'undo takes {t:.0f} ms')

    page.fill('#filter', 'City, 13')
    page.wait_for_timeout(1200)
    n = page.evaluate('csvEditor.state.view.length')
    check_that(900 < n < 1200, f'filter: {n} rows with "City, 13"')
    t = page.evaluate("() => { const t = performance.now(); document.getElementById('filter').value = ''; document.getElementById('filter').dispatchEvent(new Event('input')); return performance.now() - t; }")
    page.wait_for_timeout(800)
    t = page.evaluate("() => { const t = performance.now(); document.querySelector('[data-sort=\"3\"]').click(); return performance.now() - t; }")
    check_that(t < 2500 and page.evaluate('csvEditor.state.sort.col') == 3, f'sorting the view by a number column takes {t:.0f} ms')
    t = page.evaluate('() => { const t = performance.now(); csvEditor.setRowOrder(3, 1); return performance.now() - t; }')
    check_that(t < 5000, f'sorting the data itself takes {t:.0f} ms')
    t = page.evaluate("""() => new Promise(res => { const ta = document.getElementById('code'); const t = performance.now(); ta.scrollTop = ta.scrollHeight * 0.7;
        requestAnimationFrame(() => requestAnimationFrame(() => res(performance.now() - t))); })""")
    lines = page.locator('#hl').inner_text().count('\n')
    check_that(t < 300 and lines < 120, f'the code view highlights only the lines in sight ({lines}) in {t:.0f} ms')
    check_that(not errors, 'no script errors: ' + '; '.join(errors))
    browser.close()

print()
print('all passed' if not failed else f'{len(failed)} failed')
sys.exit(1 if failed else 0)
