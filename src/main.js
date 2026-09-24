// Relook: a viewer for Telegram chat exports. Not affiliated with Telegram.
//
// Window layout (all three are web views):
//   uiView   left   date tree, searches, list/gallery        (web/index.html)
//   shell    window divider + browser toolbar                  (web/shell.html)
//   paneView right  message/media viewer, or a live web page   (web/pane.html or any http(s) URL)
//
// App pages and export files are served from relook://app/ by this process.
// Export files live under /f/<token>/..., where <token> is random per launch, so web
// pages opened in the viewer pane can't guess their way to your files.

'use strict';

const { app, BrowserWindow, WebContentsView, Menu, dialog, ipcMain, nativeTheme, protocol, session, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = fs.promises;
const crypto = require('node:crypto');
const { Readable } = require('node:stream');

const APP = 'relook://app';
const WEB = path.join(__dirname, '..', 'web');
const PRELOAD = path.join(__dirname, 'preload.js');
const ICON = path.join(__dirname, '..', 'build', 'icon.png');
const TOKEN = crypto.randomBytes(16).toString('hex');
const FILE_BASE = `/f/${TOKEN}/`;
const BAR = 46;          // toolbar band height, same as the web header's top band
const DIVIDER = 5;
const MIN_SIDE = 340;
const CASE_INSENSITIVE_FS = process.platform === 'win32' || process.platform === 'darwin';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4',
  '.wav': 'audio/wav', '.aac': 'audio/aac', '.flac': 'audio/flac', '.pdf': 'application/pdf',
};
const mimeFor = (f) => MIME[path.extname(f).toLowerCase()] || 'application/octet-stream';

protocol.registerSchemesAsPrivileged([
  { scheme: 'relook', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// ------------------------------------------------------------------ settings

const settings = { lastFolder: null, theme: 'system', split: 0.48, bounds: null, maximized: false };
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() {
  try { Object.assign(settings, JSON.parse(fs.readFileSync(settingsFile(), 'utf8'))); } catch { /* first run */ }
}
function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
  } catch { /* settings are a convenience only */ }
}

// ------------------------------------------------------------------ state

let win = null;
let uiView = null;
let paneView = null;
let root = null;            // export folder currently open
let lastMessage = null;     // message shown in the pane; restored after browsing a link
let paneReady = false;      // pane.html loaded and listening

const isAppUrl = (u) => typeof u === 'string' && u.startsWith(APP + '/');
const send = (wc, data) => { if (wc && !wc.isDestroyed()) wc.send('host', data); };
// The theme actually in effect: the user's choice, or the OS setting for "system".
const isDark = () => (settings.theme === 'dark' ? true : settings.theme === 'light' ? false : nativeTheme.shouldUseDarkColors);
const panelColor = () => (isDark() ? '#161b21' : '#ffffff');

// ------------------------------------------------------------------ files

async function scanFolder(dir) {
  const files = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try { entries = await fsp.readdir(d, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile()) files.push(path.relative(dir, full).split(path.sep).join('/'));
    }
  }
  return files;
}

async function loadFolder(folder) {
  const dir = path.resolve(folder);
  send(uiView.webContents, { type: 'scanning', root: dir });
  let files;
  try { files = await scanFolder(dir); } catch (err) {
    send(uiView.webContents, { type: 'error', message: `Couldn't read ${dir}: ${err.message}` });
    return;
  }
  root = dir;
  settings.lastFolder = dir;
  saveSettings();
  send(uiView.webContents, { type: 'files', root: dir, files, base: FILE_BASE });
}

function insideRoot(full) {
  const base = root.endsWith(path.sep) ? root : root + path.sep;
  return CASE_INSENSITIVE_FS ? full.toLowerCase().startsWith(base.toLowerCase()) : full.startsWith(base);
}

async function serveFile(relative, range) {
  if (!root) return new Response('not found', { status: 404 });
  const full = path.resolve(root, relative);
  if (!insideRoot(full)) return new Response('not found', { status: 404 });
  let stat;
  try { stat = await fsp.stat(full); } catch { return new Response('not found', { status: 404 }); }
  if (!stat.isFile()) return new Response('not found', { status: 404 });

  const size = stat.size;
  const type = mimeFor(full);
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range);
  if (m && size > 0 && (m[1] || m[2])) {
    let start, end;
    if (m[1]) { start = Number(m[1]); end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1; }
    else { start = Math.max(0, size - Number(m[2])); end = size - 1; }
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
    }
    return new Response(Readable.toWeb(fs.createReadStream(full, { start, end })), {
      status: 206,
      headers: { 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': String(end - start + 1) },
    });
  }
  return new Response(Readable.toWeb(fs.createReadStream(full)), {
    status: 200,
    headers: { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': String(size) },
  });
}

async function handleAppRequest(request) {
  const url = new URL(request.url);
  if (url.host !== 'app') return new Response('not found', { status: 404 });
  let p;
  try { p = decodeURIComponent(url.pathname); } catch { return new Response('bad request', { status: 400 }); }

  if (p.startsWith('/f/')) {
    const rest = p.slice(3);
    const slash = rest.indexOf('/');
    if (slash < 0 || rest.slice(0, slash) !== TOKEN) return new Response('forbidden', { status: 403 });
    return serveFile(rest.slice(slash + 1), request.headers.get('range'));
  }

  if (p === '/') p = '/index.html';
  const file = path.resolve(WEB, '.' + p);
  if (!file.startsWith(WEB + path.sep)) return new Response('not found', { status: 404 });
  try {
    return new Response(await fsp.readFile(file), { headers: { 'content-type': mimeFor(file), 'cache-control': 'no-store' } });
  } catch {
    return new Response('not found', { status: 404 });
  }
}

// ------------------------------------------------------------------ browser pane

function navigatePane(raw) {
  if (typeof raw !== 'string' || !raw.trim() || !paneView) return;
  let text = raw.trim();
  if (!text.includes('://')) text = 'https://' + text;
  let u;
  try { u = new URL(text); } catch { return; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
  paneView.webContents.loadURL(u.href);
}

function openExternally(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol === 'http:' || u.protocol === 'https:') shell.openExternal(u.href);
  } catch { /* not a URL */ }
}

function showMessageInPane() {
  const wc = paneView.webContents;
  if (isAppUrl(wc.getURL()) && paneReady) send(wc, lastMessage);
  else wc.loadURL(`${APP}/pane.html`);        // pane.html says "paneReady", then gets the message
}

function updateBar() {
  if (!win || !paneView) return;
  const wc = paneView.webContents;
  const url = wc.getURL();
  const web = /^https?:/i.test(url);
  const history = wc.navigationHistory;
  send(win.webContents, {
    type: 'nav', url, web, hasMessage: !!lastMessage,
    canBack: history.canGoBack(), canForward: history.canGoForward(),
  });
  const title = web ? wc.getTitle() : '';
  win.setTitle(title ? `${title} - Relook` : 'Relook');
}

// ------------------------------------------------------------------ layout & theme

function layout() {
  if (!win) return;
  const [w, h] = win.getContentSize();
  const left = Math.max(MIN_SIDE, Math.min(w - MIN_SIDE - DIVIDER, Math.round(w * settings.split)));
  uiView.setBounds({ x: 0, y: 0, width: left, height: h });
  paneView.setBounds({ x: left + DIVIDER, y: BAR, width: Math.max(0, w - left - DIVIDER), height: Math.max(0, h - BAR) });
  send(win.webContents, { type: 'layout', left, divider: DIVIDER, bar: BAR });
}

function applyTheme() {
  nativeTheme.themeSource = ['light', 'dark'].includes(settings.theme) ? settings.theme : 'system';
  const bg = panelColor();
  if (win) win.setBackgroundColor(bg);
  if (uiView) uiView.setBackgroundColor(bg);
  if (paneView) paneView.setBackgroundColor(bg);
  broadcastAppearance();
}

// Tell every app page which theme to draw. (prefers-color-scheme alone isn't reliable on every Linux desktop.)
function broadcastAppearance() {
  const msg = { type: 'appearance', dark: isDark() };
  for (const wc of [win?.webContents, uiView?.webContents, paneView?.webContents]) {
    if (wc && isAppUrl(wc.getURL())) send(wc, msg);
  }
}

// ------------------------------------------------------------------ messages from the pages

function onUi(msg) {
  switch (msg.type) {
    case 'ready': {
      send(uiView.webContents, { type: 'theme', value: settings.theme });
      broadcastAppearance();
      const folder = argFolder() || settings.lastFolder;
      if (folder && fs.existsSync(folder)) loadFolder(folder);
      else send(uiView.webContents, { type: 'needFolder' });
      break;
    }
    case 'pickFolder':
      dialog.showOpenDialog(win, {
        title: 'Choose your Telegram export folder',
        message: 'Choose "Telegram Desktop" to merge all exports, or one ChatExport folder',
        defaultPath: root || settings.lastFolder || app.getPath('downloads'),
        properties: ['openDirectory'],
      }).then((r) => { if (!r.canceled && r.filePaths[0]) loadFolder(r.filePaths[0]); });
      break;
    case 'rescan':
      if (root) loadFolder(root);
      break;
    case 'select':
      lastMessage = msg.msg && typeof msg.msg === 'object' ? msg.msg : null;
      if (typeof msg.url === 'string' && msg.url) navigatePane(msg.url);
      else showMessageInPane();
      break;
    case 'theme':
      if (['system', 'light', 'dark'].includes(msg.value)) { settings.theme = msg.value; saveSettings(); applyTheme(); }
      break;
  }
}

function onPane(msg) {
  switch (msg.type) {
    case 'paneReady': paneReady = true; broadcastAppearance(); send(paneView.webContents, lastMessage); break;
    case 'openLink': navigatePane(msg.url); break;
    case 'openExternal': openExternally(msg.url); break;
    case 'jump': send(uiView.webContents, { type: 'jump', chat: String(msg.chat ?? ''), id: Number(msg.id) || 0 }); break;
  }
}

function onShell(msg) {
  const wc = paneView.webContents;
  switch (msg.type) {
    case 'ready': layout(); updateBar(); broadcastAppearance(); break;
    case 'back': if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); break;
    case 'forward': if (wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward(); break;
    case 'reload': wc.reload(); break;
    case 'message': showMessageInPane(); break;
    case 'external': openExternally(wc.getURL()); break;
    case 'navigate': navigatePane(msg.url); break;
    case 'split': {
      const [w] = win.getContentSize();
      if (typeof msg.x === 'number' && w > 0) { settings.split = Math.min(0.8, Math.max(0.2, msg.x / w)); layout(); }
      break;
    }
    case 'dragEnd': saveSettings(); break;
  }
}

ipcMain.on('host', (event, msg) => {
  // Only Relook's own pages have the bridge; check the sender anyway.
  if (!msg || typeof msg !== 'object' || !isAppUrl(event.senderFrame?.url)) return;
  if (uiView && event.sender === uiView.webContents) onUi(msg);
  else if (paneView && event.sender === paneView.webContents) onPane(msg);
  else if (win && event.sender === win.webContents) onShell(msg);
});

// ------------------------------------------------------------------ window

function argFolder() {
  const appDir = path.resolve(app.getAppPath());
  const args = process.argv.slice(1);
  return args.find((a) => !a.startsWith('-') && path.resolve(a) !== appDir && fs.existsSync(a) && fs.statSync(a).isDirectory()) || null;
}

function keepOnApp(wc) {
  // The list and the toolbar never leave the app; anything that tries opens in the viewer pane.
  wc.setWindowOpenHandler(({ url }) => { navigatePane(url); return { action: 'deny' }; });
  wc.on('will-navigate', (e, url) => { if (!isAppUrl(url)) { e.preventDefault(); navigatePane(url); } });
}

function createWindow() {
  const prefs = { preload: PRELOAD, sandbox: true, contextIsolation: true, nodeIntegration: false };
  const b = settings.bounds || {};
  win = new BrowserWindow({
    width: b.width || 1500, height: b.height || 950, x: b.x, y: b.y,
    minWidth: 900, minHeight: 600, title: 'Relook', show: false,
    backgroundColor: panelColor(), icon: fs.existsSync(ICON) ? ICON : undefined, webPreferences: prefs,
  });
  if (settings.maximized) win.maximize();

  uiView = new WebContentsView({ webPreferences: prefs });
  paneView = new WebContentsView({ webPreferences: prefs });
  win.contentView.addChildView(uiView);
  win.contentView.addChildView(paneView);
  applyTheme();

  keepOnApp(win.webContents);
  keepOnApp(uiView.webContents);

  const pane = paneView.webContents;
  pane.setWindowOpenHandler(({ url }) => { navigatePane(url); return { action: 'deny' }; });
  pane.on('will-navigate', (e, url) => { if (!/^https?:/i.test(url) && !isAppUrl(url)) e.preventDefault(); });
  pane.on('did-start-navigation', (details, legacyUrl, legacyInPlace, legacyMainFrame) => {
    const main = details?.isMainFrame ?? legacyMainFrame;
    const same = details?.isSameDocument ?? legacyInPlace;
    if (main && !same) paneReady = false;
  });
  // Update the toolbar on every outcome, including failed loads, so "Message" is always there to go back.
  for (const ev of ['did-navigate', 'did-navigate-in-page', 'page-title-updated', 'did-fail-load', 'did-stop-loading']) pane.on(ev, updateBar);

  win.loadURL(`${APP}/shell.html`);
  uiView.webContents.loadURL(`${APP}/index.html`);
  pane.loadURL(`${APP}/pane.html`);

  win.on('resize', layout);
  win.once('ready-to-show', () => { layout(); win.show(); });
  win.on('close', () => {
    settings.maximized = win.isMaximized();
    settings.bounds = win.getNormalBounds();
    saveSettings();
  });
  win.on('closed', () => { win = null; uiView = null; paneView = null; });
}

// ------------------------------------------------------------------ startup

app.setName('Relook');
app.whenReady().then(() => {
  loadSettings();
  protocol.handle('relook', handleAppRequest);

  // Web pages in the viewer pane get no camera, microphone, location, notifications, etc.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(['fullscreen', 'clipboard-sanitized-write'].includes(permission));
  });
  nativeTheme.on('updated', applyTheme);

  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  createWindow();
});

app.on('window-all-closed', () => app.quit());
