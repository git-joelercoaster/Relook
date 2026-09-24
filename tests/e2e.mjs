// End-to-end tests: launches the real Relook app on the sample export and drives it.
//   npm test                   (Linux needs a display: xvfb-run -a npm test)
// Extra Electron flags (e.g. a proxy) can be passed in RELOOK_TEST_ARGS.
import { _electron as electron } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAMPLE = path.join(ROOT, 'tests', 'fixtures', 'Telegram Desktop');
const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass: !!pass, detail });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'relook-test-'));
const app = await electron.launch({
  args: [
    ...(process.platform === 'linux' ? ['--no-sandbox'] : []),
    ...(process.env.RELOOK_TEST_ARGS ? process.env.RELOOK_TEST_ARGS.split(' ') : []),
    `--user-data-dir=${userData}`,
    ROOT, SAMPLE,
  ],
  cwd: ROOT,
});

// Run JavaScript inside the view whose URL contains `part`.
const js = (part, code) => app.evaluate(async ({ webContents }, [part, code]) => {
  const wc = webContents.getAllWebContents().find((w) => w.getURL().includes(part));
  return wc ? wc.executeJavaScript(code) : undefined;
}, [part, code]);
const urls = () => app.evaluate(({ webContents }) => webContents.getAllWebContents().map((w) => w.getURL()));
const waitFor = async (fn, ms = 20000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(150)) if (await fn()) return true;
  return false;
};
const click = (part, selector) => js(part, `document.querySelector(${JSON.stringify(selector)}).click()`);
const setTheme = (v) => js('index.html', `(() => { const s = document.querySelector('#theme'); s.value = ${JSON.stringify(v)}; s.dispatchEvent(new Event('change')); })()`);
const themes = async () => (await Promise.all(['index.html', 'shell.html', 'pane.html'].map((p) => js(p, 'document.documentElement.dataset.theme')))).join(',');

try {
  check('window opens with its three views', await waitFor(async () => (await urls()).filter((u) => u.startsWith('relook://app/')).length === 3));
  check('sample export loads and merges', await waitFor(async () => (await js('index.html', 'window.__tgv && window.__tgv.S.msgs.length')) === 18),
    await js('index.html', 'document.querySelector("#status").textContent'));
  check('duplicates across exports are merged', /6 duplicates merged/.test(await js('index.html', 'document.querySelector("#status").textContent')));
  const chips = await js('index.html', `[...document.querySelectorAll('.chip')].map(c => c.textContent).join('|')`);
  check('type counts', chips === 'All18|Text10|Links4|Photos5|Videos1|Audio1|Files1', chips);
  check('emoji-only message is listed as text', await js('index.html', `window.__tgv.S.msgs.some(m => m.text === '😂😂🙌' && !m.media)`));

  const base = await js('index.html', 'window.__tgv.S.base');
  const photo = 'ChatExport_2026-01-10/photos/photo_1%4015-11-2025_07-58-00.jpg';
  check('file URLs carry a per-launch token', /^\/f\/[0-9a-f]{32}\/$/.test(base), base);
  check('files are served', (await js('index.html', `fetch("${base}${photo}").then(r => r.status)`)) === 200);
  check('byte ranges for video seeking', (await js('index.html', `fetch("${base}ChatExport_2026-01-10/video_files/video_1%4015-11-2025_12-20-00.mp4", { headers: { Range: "bytes=0-9" } }).then(r => r.status + " " + r.headers.get("content-range"))`)) === '206 bytes 0-9/2048');
  check('a wrong token is refused', (await js('index.html', `fetch("/f/${'0'.repeat(32)}/${photo}").then(r => r.status)`)) === 403);
  check('escaping the export folder is refused', (await js('index.html', `fetch("${base}..%2F..%2F..%2Fpackage.json").then(r => r.status)`)) === 404);

  await click('index.html', '.chip[data-k="photo"]');
  await js('index.html', `[...document.querySelectorAll('.cell')].find(c => c.querySelector('img')).click()`);
  check('photo opens in the viewer pane', await waitFor(async () => (await js('pane.html', `(() => { const i = document.querySelector('img'); return !!(i && i.complete && i.naturalWidth > 0); })()`)) === true));

  await click('index.html', '.chip[data-k="links"]');
  await js('index.html', `[...document.querySelectorAll('.row')].find(r => r.textContent.includes('example.com')).click()`);
  check('a link opens live in the pane', await waitFor(async () => (await urls()).some((u) => u.startsWith('https://example.com/'))));
  await sleep(1200);
  check('web pages get no bridge into the app', (await js('example.com', 'typeof window.relookHost')) === 'undefined');
  const bar = await js('shell.html', `({ addr: document.querySelector('#addr').value, message: !document.querySelector('#message').disabled })`);
  check('toolbar shows the page and offers "Message"', bar.addr.startsWith('https://example.com/') && bar.message, JSON.stringify(bar));
  await click('shell.html', '#message');
  check('"Message" returns to the message', await waitFor(async () => /one album/.test((await js('pane.html', 'document.body.innerText')) || '')));

  await setTheme('dark');
  check('Dark applies to every view', await waitFor(async () => (await themes()) === 'dark,dark,dark'), await themes());
  await setTheme('light');
  check('Light applies to every view', await waitFor(async () => (await themes()) === 'light,light,light'), await themes());

  await js('shell.html', `window.relookHost.postMessage({ type: 'split', x: 700 })`);
  check('divider resizes the panes', await waitFor(async () => (await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].contentView.children[0].getBounds().width)) === 700));
} finally {
  await app.close();
  fs.rmSync(userData, { recursive: true, force: true });
}

for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail && !r.pass ? '  -> ' + r.detail : ''}`);
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
