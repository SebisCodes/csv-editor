"""Embedding (iframe + postMessage) and the webhook.

    php -S 127.0.0.1:8104 -t src src/php/router.php          (in the project folder)
    python tests/embed_test.py

A host page on another port embeds the editor, loads a table, and gets
"change" and "save" messages; a small PHP webhook on the same port records
what the editor sends. An editor without files: no assets fields."""

import json
import os
import socket
import subprocess
import sys
import tempfile
import time

from playwright.sync_api import sync_playwright

# The port of the test's own host page (another one when other tests use it at the same time).
HOST_PORT = os.environ.get('HOST_PORT', '8096')

EDITOR = os.environ.get('EDITOR_URL', 'http://127.0.0.1:8104/')
HERE = os.path.dirname(os.path.abspath(__file__))
failures = []


CSV = 'Name,Qty\nTea,3\nCoffee,4\n'


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


HOST = """<!doctype html><meta charset="utf-8"><title>host</title>
<iframe id="f" src="EDITOR?embed=1" style="width:1300px;height:820px;border:0"></iframe>
<script>
window.log = [];
const frame = document.getElementById('f');
addEventListener('message', async e => {
  if (e.source !== frame.contentWindow) return;
  log.push(e.data);
  if (e.data.type === 'csveditor:ready') {
    frame.contentWindow.postMessage({ type: 'csveditor:load', name: 'Dossier 17', content: await (await fetch('data.csv')).text(),
      assets: { 'logo.png': 'data:image/png;base64,iVBORw0KGgo=' } }, new URL(frame.src).origin);
  }
});
</script>"""

HOOK = """<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: POST, OPTIONS');
// Chrome asks before a public page (the live editor) talks to this local test server.
header('Access-Control-Allow-Private-Network: true');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;
file_put_contents(__DIR__ . '/hook.json', json_encode(['auth' => $_SERVER['HTTP_AUTHORIZATION'] ?? '', 'body' => json_decode(file_get_contents('php://input'), true)]));
echo '{"ok":true}';
"""

with tempfile.TemporaryDirectory() as d:
    with open(os.path.join(d, 'host.html'), 'w') as f:
        f.write(HOST.replace('EDITOR', EDITOR))
    with open(os.path.join(d, 'hook.php'), 'w') as f:
        f.write(HOOK)
    with open(os.path.join(d, 'data.csv'), 'w') as f:
        f.write(CSV)
    server = subprocess.Popen(['php', '-S', '127.0.0.1:' + HOST_PORT, '-t', d], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(50):
        try:
            socket.create_connection(('127.0.0.1', int(HOST_PORT)), 0.2).close()
            break
        except OSError:
            time.sleep(0.1)
    try:
        with sync_playwright() as pw:
            # The live editor (a public page) may not talk to a local test server without these flags.
            browser = pw.chromium.launch(channel='chrome', headless=True, args=['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights'])
            ctx = browser.new_context(viewport={'width': 1360, 'height': 860})
            ctx.grant_permissions(['clipboard-read', 'clipboard-write'])
            page = ctx.new_page()
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.goto('http://127.0.0.1:' + HOST_PORT + '/host.html', wait_until='networkidle')
            page.wait_for_timeout(2500)
            frame = next(fr for fr in page.frames if fr.url.startswith(EDITOR))
            types = lambda: page.evaluate('log.map(m => m.type)')
            check_that(types()[:2] == ['csveditor:ready', 'csveditor:loaded'], 'ready, then loaded')
            check_that(frame.evaluate('csvEditor.state.name') == 'Dossier 17', 'the document from the page is open')
            check_that(frame.evaluate('csvEditor.state.code') == CSV and frame.locator('#grid .grid-row[data-r="1"] [data-c="0"]').inner_text() == 'Coffee', 'the table from the page is shown')
            check_that('csveditor:change' not in types(), 'loading is not reported as a change')
            check_that(frame.evaluate('document.documentElement.classList.contains("embedded")'), 'embedded mode')
            check_that(frame.locator('#btn-save').is_visible() and not frame.locator('.page-text').is_visible(), 'Save button, no page text')
            # AI Assistant in the frame: the page did not allow the clipboard API
            frame.click('#btn-ai')
            check_that('paste its whole answer below' in frame.inner_text('#ai-step-link'), 'AI: the dialog says to paste the answer (links do not reach a frame)')
            frame.click('#ai-copy')
            page.wait_for_timeout(300)
            clip = page.evaluate('navigator.clipboard.readText()')
            check_that('inside another website' in clip and 'Dossier 17' in clip, 'AI: the prompt is copied anyway and tells the AI not to rely on clicked links')
            frame.click('#btn-ai')
            frame.evaluate('() => { window._ec = document.execCommand; navigator.clipboard.writeText = () => Promise.reject(new Error("no")); document.execCommand = () => false; }')
            frame.click('#ai-copy')
            check_that(frame.locator('#ai-prompt-text').is_visible() and 'inside another website' in frame.input_value('#ai-prompt-text'), 'AI: without any clipboard the prompt is shown to copy by hand')
            frame.evaluate('() => { document.execCommand = window._ec; }')
            import base64
            link = EDITOR + '#b64=' + base64.urlsafe_b64encode((CSV + 'From the AI,5\n').encode()).decode()
            frame.fill('#ai-paste', 'Here is the link:\n' + link)
            page.wait_for_timeout(500)
            check_that(not frame.locator('#ask').is_visible(), 'AI: the link replaces the document without a question')
            page.wait_for_timeout(500)
            check_that('From the AI,5' in frame.evaluate('csvEditor.state.code'), 'AI: the pasted answer arrives in the framed editor')
            frame.evaluate('() => csvEditor.undo()')
            page.wait_for_timeout(300)
            frame.evaluate('() => document.querySelector("#ai").open && document.querySelector("#ai").close()')

            frame.evaluate('() => { const t = document.querySelector("#code"); t.focus(); t.setSelectionRange(0, 0); document.execCommand("insertText", false, "Milk,1\\n"); }')
            page.wait_for_timeout(700)
            check_that('csveditor:change' in types(), 'an edit is reported')
            frame.click('#btn-save')
            page.wait_for_timeout(400)
            last = page.evaluate('log[log.length - 1]')
            check_that(last['type'] == 'csveditor:save' and last['content'].startswith('Milk,1\n'), 'Save hands the table to the page')
            no_files = lambda x: not ({'assets', 'assetsChanged', 'assetsRemoved'} & set(x))
            check_that(all(no_files(x) for x in page.evaluate('log') if x['type'] in ('csveditor:save', 'csveditor:change')), 'save and change carry no assets fields (a CSV has no separate files)')

            # Webhook
            frame.click('#btn-sync')
            frame.fill('#sync-url', 'http://127.0.0.1:' + HOST_PORT + '/hook.php')
            frame.fill('#sync-token', 'secret')
            frame.click('#sync-test')
            page.wait_for_timeout(1500)
            status = frame.inner_text('#sync-status')
            try:
                with open(os.path.join(d, 'hook.json')) as f:
                    got = json.load(f)
            except FileNotFoundError:
                got = {'auth': '', 'body': {}}
                print('      webhook not reached: ' + status)
            check_that(got['auth'] == 'Bearer secret', 'webhook: token as Bearer')
            check_that(got['body'].get('editor') == 'csv' and got['body']['name'] == 'Dossier 17' and got['body']['content'].startswith('Milk,1\n'), 'webhook: the document as JSON')
            check_that('assets' not in got['body'] and 'assetsChanged' not in got['body'], 'webhook: no assets fields')
            check_that('Saved on' in status, 'webhook: status shows it was saved')
            check_that(not errors, 'no script errors' + (': ' + '; '.join(errors) if errors else ''))
            browser.close()
    finally:
        server.terminate()

print(f'\n{len(failures)} failed' if failures else '\nall passed')
sys.exit(1 if failures else 0)
