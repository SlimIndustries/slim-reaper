'use strict';
// Slim Reaper - main process. Creates the window, tray icon, runs scans, talks to the UI.
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const {
  app, BrowserWindow, ipcMain, dialog, shell, clipboard, nativeImage, Tray, Menu, Notification, session, powerSaveBlocker
} = require('electron');

const { Store } = require('./store');
const { Engine } = require('./engine');
const { Fetcher } = require('./fetcher');
const { ElectronDriver, sessionFor, PERSIST, TEMP } = require('./electron-driver');
const { ProcessorHost } = require('./processor-host');
const { makeDownloadFn } = require('./download');
const { FileWatcher } = require('./watcher');
const { findDuplicates } = require('./dupes');
const os = require('os');
const crypto = require('crypto');
const { DEFAULT_RULES, BUILT_IN_PRESETS, ACCENTS, mergeRules } = require('../shared/defaults');
const { extractUrls, hostOf } = require('../shared/urls');

const APP_ID = 'com.slimindustries.slimreaper';
const ICON = path.join(__dirname, '..', '..', 'build', 'icon.png');
const ICO = path.join(__dirname, '..', '..', 'build', 'icon.ico');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.setAppUserModelId(APP_ID);

let store, mainWin, splashWin, tray, engine, processor, fetcher;
let currentSession = null;
let quitting = false;
let psbId = null;
let clipboardTimer = null, lastClip = '';
const eventBuffer = [];
let flushTimer = null;
let watcher = null;
let dupesAbort = null;
const thumbDir = () => path.join(app.getPath('userData'), 'thumbs');

function defaultOutDir() { return path.join(app.getPath('pictures'), 'Slim Reaper'); }
function send(channel, payload) { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send(channel, payload); }

// ---------------- windows ----------------
function createSplash() {
  splashWin = new BrowserWindow({
    width: 760, height: 460, frame: false, resizable: false, show: false, center: true, transparent: false,
    backgroundColor: '#07090D', skipTaskbar: true, alwaysOnTop: true, icon: fs.existsSync(ICO) ? ICO : ICON,
    webPreferences: { contextIsolation: true, sandbox: true }
  });
  splashWin.loadFile(path.join(__dirname, '..', 'renderer', 'splash.html'), { query: { accent: store.settings.app.accent } });
  splashWin.once('ready-to-show', () => splashWin.show());
}

function createMain() {
  mainWin = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 680, show: false,
    backgroundColor: '#0A0C10', title: 'Slim Reaper', icon: fs.existsSync(ICO) ? ICO : ICON,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0D1015', symbolColor: '#B9C0CF', height: 44 },
    webPreferences: { preload: path.join(__dirname, '..', 'renderer', 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false }
  });
  mainWin.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWin.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  mainWin.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); } });
  mainWin.once('ready-to-show', () => {
    const showMain = () => {
      if (splashWin && !splashWin.isDestroyed()) splashWin.destroy();
      mainWin.show();
    };
    if (store.settings.app.showSplash) setTimeout(showMain, 1600); else showMain();
  });
  mainWin.on('minimize', (e) => {
    if (store.settings.app.minimizeToTray && tray) { e.preventDefault(); mainWin.hide(); }
  });
  mainWin.on('close', (e) => {
    if (quitting) return;
    if (store.settings.app.closeToTray && tray) { e.preventDefault(); mainWin.hide(); return; }
    if (engine && engine.running) {
      const choice = dialog.showMessageBoxSync(mainWin, { type: 'warning', buttons: ['Keep scanning', 'Stop and quit'], defaultId: 0, cancelId: 0, title: 'Scan in progress', message: 'A scan is still running.', detail: 'Images already saved are safe. Unfinished URLs will stay in your queue for next time.' });
      if (choice === 0) { e.preventDefault(); return; }
      engine.stop();
    }
    quitting = true;
  });
  mainWin.on('closed', () => { mainWin = null; if (quitting) shutdown(); });
}

// Shut everything down: stop the scan, close hidden helper windows, save, exit.
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  quitting = true;
  try { if (engine && engine.running) engine.stop(); } catch { /* ignore */ }
  try { if (store) store.flushAll(); } catch { /* ignore */ }
  clearInterval(clipboardTimer);
  try { if (watcher) watcher.close(); } catch { /* ignore */ }
  if (dupesAbort) dupesAbort.abort();
  try { if (processor) processor.destroy(); } catch { /* ignore */ }
  for (const w of BrowserWindow.getAllWindows()) { try { w.destroy(); } catch { /* ignore */ } }
  try { if (tray) { tray.destroy(); tray = null; } } catch { /* ignore */ }
  app.quit();
  setTimeout(() => app.exit(0), 2500); // never linger in the background
}

function showMainWindow() {
  if (!mainWin) return;
  if (mainWin.isMinimized()) mainWin.restore();
  mainWin.show(); mainWin.focus();
}

function createTray() {
  try {
    const img = nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 });
    tray = new Tray(img);
    tray.setToolTip('Slim Reaper');
    tray.on('click', showMainWindow);
    updateTrayMenu();
  } catch (e) { tray = null; }
}
function updateTrayMenu() {
  if (!tray) return;
  const running = engine && engine.running;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Slim Reaper', click: showMainWindow },
    { type: 'separator' },
    { label: running ? (engine.paused ? 'Resume scan' : 'Pause scan') : 'No scan running', enabled: !!running, click: () => (engine.paused ? engine.resume() : engine.pause()) },
    { label: 'Stop scan', enabled: !!running, click: () => engine.stop() },
    { label: 'Open output folder', click: () => shell.openPath(store.settings.app.outputDir || defaultOutDir()) },
    { type: 'separator' },
    { label: 'Quit Slim Reaper', click: () => shutdown() }
  ]));
}

// ---------------- engine wiring ----------------
function applyProxy(rules) {
  const cfg = rules.proxy ? { proxyRules: rules.proxy } : { mode: 'system' };
  return Promise.all([session.fromPartition(PERSIST).setProxy(cfg), session.fromPartition(TEMP).setProxy(cfg)]).catch(() => {});
}

function makeFetcher() {
  // See download.js: Node fetch + your sign-in cookies, so the Referer header works.
  return new Fetcher(makeDownloadFn({
    getSession: (useSignIns) => sessionFor(useSignIns),
    getRules: () => (engine && engine.rules) || store.settings.rules
  }));
}

function queueEvent(ev) {
  eventBuffer.push(ev);
  if (!flushTimer) flushTimer = setTimeout(flushEvents, 120);
}
function flushEvents() {
  flushTimer = null;
  if (!eventBuffer.length) return;
  const batch = eventBuffer.splice(0, eventBuffer.length);
  send('engine-events', batch);
}

let lastProgress = -1;
function onEngineEvent(ev) {
  if (ev.type === 'image') { if (currentSession) store.addImage(currentSession.id, ev); if (watcher) watcher.add(ev.path); }
  if (ev.type === 'job') {
    const q = store.settings.queue;
    const item = q.find((x) => x.id === ev.id);
    if (item) { item.status = ev.status; item.saved = ev.saved; item.found = ev.found; item.skipped = ev.skipped; item.note = ev.note; }
    if (engine && engine.jobs) {
      const p = engine.jobs.reduce((s, j) => s + (j.progress || 0), 0) / Math.max(1, engine.jobs.length);
      if (Math.abs(p - lastProgress) > 0.01 && mainWin) { lastProgress = p; mainWin.setProgressBar(Math.max(0.02, p), { mode: engine.paused ? 'paused' : 'normal' }); }
    }
  }
  if (ev.type === 'state') {
    updateTrayMenu();
    if (mainWin) mainWin.setProgressBar(ev.running ? Math.max(0.02, lastProgress) : -1, { mode: ev.paused ? 'paused' : 'normal' });
  }
  if (ev.type === 'done') onScanDone(ev);
  queueEvent(ev);
}

function onScanDone(ev) {
  if (currentSession) store.finishSession(currentSession.id, ev.stats, ev.stopped);
  const finished = currentSession;
  currentSession = null;
  lastProgress = -1;
  if (psbId !== null) { try { powerSaveBlocker.stop(psbId); } catch { /* ignore */ } psbId = null; }
  // Keep unfinished URLs in the queue for next time
  store.saveSettings({ queue: store.settings.queue });
  if (mainWin) { mainWin.setProgressBar(-1); if (!mainWin.isFocused()) mainWin.flashFrame(true); }
  const s = ev.stats;
  const a = store.settings.app;
  if (a.notifyWhenDone && Notification.isSupported()) {
    const n = new Notification({
      title: ev.stopped ? 'Scan stopped' : 'Reaping complete',
      body: `${s.saved} images saved · ${s.skipped} skipped · ${(s.bytes / 1048576).toFixed(1)} MB`,
      icon: ICON
    });
    n.on('click', () => { showMainWindow(); if (finished) shell.openPath(finished.outDir); });
    n.show();
  }
  if (a.openFolderWhenDone && finished && s.saved) shell.openPath(finished.outDir);
  setTimeout(runDueSchedules, 3000);
}

async function startScan({ urls, rules, outDir, presetName, scheduleId, forceAgain }) {
  if (engine.running) return { ok: false, error: 'A scan is already running' };
  const list = (urls || []).filter((u) => /^https?:\/\//i.test(u.url || u));
  if (!list.length) return { ok: false, error: 'Add at least one URL' };
  const r = mergeRules(DEFAULT_RULES, rules || store.settings.rules);
  // One simple switch drives all the "already have it" checks
  r.checkExistingFolder = r.rememberAcrossScans = !!r.skipExactDupes;
  if (forceAgain) Object.assign(r, { skipExactDupes: false, skipNearDupes: false, checkExistingFolder: false, rememberAcrossScans: false, onConflict: 'rename' });
  let dir = outDir || store.settings.app.outputDir || defaultOutDir();
  if (r.scanSubfolder) { const d = new Date(); const p2 = (n) => String(n).padStart(2, '0'); dir = path.join(dir, `Scan ${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}-${p2(d.getMinutes())}`); }
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { return { ok: false, error: `Can't use that folder: ${e.message}` }; }
  await applyProxy(r);
  const id = new Date().toISOString().replace(/[:.]/g, '-');
  const base = store.settings.app.outputDir || defaultOutDir();
  const jobs = buildJobs(list, id);
  currentSession = store.startSession({ id, startedAt: Date.now(), urls: jobs.map((j) => j.url), outDir: dir, presetName: presetName || '', scheduleId: scheduleId || null });
  try { psbId = powerSaveBlocker.start('prevent-app-suspension'); } catch { psbId = null; }
  if (watcher) watcher.watch([base, dir, ...jobs.map((j) => j.folder)]);
  engine.run({ jobs, rules: r, outDir: dir, sessionId: id, thumbDir: thumbDir() });
  return { ok: true, sessionId: id, outDir: dir };
}

function buildJobs(list, id) {
  const base = store.settings.app.outputDir || defaultOutDir();
  return list.map((u, i) => ({ id: u.id || `${id}-${Date.now()}-${i}`, url: u.url || u, folder: u.folder ? (path.isAbsolute(u.folder) ? u.folder : path.join(base, u.folder.replace(/[<>:"|?*]/g, '_'))) : '' }));
}
// New URLs join the scan that's already running (side by side) instead of waiting.
function addToScan({ urls }) {
  if (!engine.running) return { ok: false, joined: false };
  const list = (urls || []).filter((u) => /^https?:\/\//i.test(u.url || u));
  const jobs = buildJobs(list, currentSession ? currentSession.id : 'x');
  const added = engine.addJobs(jobs);
  if (currentSession) {
    const rec = store.history.find((h) => h.id === currentSession.id);
    if (rec) for (const j of jobs) if (added.includes(j.id) && !rec.urls.includes(j.url)) rec.urls.push(j.url);
  }
  if (watcher) watcher.watch([store.settings.app.outputDir || defaultOutDir(), ...jobs.map((j) => j.folder)]);
  return { ok: true, joined: true, added };
}

// ---------------- scheduler ----------------
function runDueSchedules() {
  if (!engine || engine.running) return;
  const now = Date.now();
  for (const s of store.settings.schedules) {
    if (!s.enabled || !s.urls || !s.urls.length) continue;
    const every = Math.max(0.25, Number(s.everyHours) || 24) * 3600000;
    if (!s.lastRun || now - s.lastRun >= every) {
      s.lastRun = now;
      store.saveSettings({ schedules: store.settings.schedules });
      const preset = s.presetId ? (BUILT_IN_PRESETS[s.presetId] || store.settings.presets[s.presetId]) : null;
      const rules = mergeRules(store.settings.rules, Object.assign({}, preset ? preset.rules : {}, { rememberAcrossScans: true, skipExactDupes: true }));
      startScan({ urls: s.urls.map((u, i) => ({ id: `sched-${s.id}-${i}`, url: u })), rules, outDir: s.outDir || undefined, presetName: `Scheduled: ${s.name}`, scheduleId: s.id })
        .then((r) => send('schedule-started', { schedule: s, result: r }));
      return;
    }
  }
}

// ---------------- clipboard watcher ----------------
function setClipboardWatch(on) {
  clearInterval(clipboardTimer);
  clipboardTimer = null;
  if (!on) return;
  lastClip = clipboard.readText();
  clipboardTimer = setInterval(() => {
    const t = clipboard.readText();
    if (t && t !== lastClip) {
      lastClip = t;
      const urls = extractUrls(t);
      if (urls.length) send('clipboard-urls', urls);
    }
  }, 1000);
}

// ---------------- helpers ----------------
async function copyImageToClipboard(file) {
  let img = nativeImage.createFromPath(file);
  if (img.isEmpty()) {
    const buf = fs.readFileSync(file);
    const mime = /\.webp$/i.test(file) ? 'image/webp' : /\.avif$/i.test(file) ? 'image/avif' : /\.gif$/i.test(file) ? 'image/gif' : 'image/png';
    const r = await processor.process(buf, mime, { hash: false, convert: 'png' });
    if (r.converted) img = nativeImage.createFromBuffer(Buffer.from(r.converted));
  }
  if (img.isEmpty()) return false;
  clipboard.writeImage(img);
  return true;
}

function setWallpaper(file) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(false);
    const ps = `Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class W { [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int SystemParametersInfo(int a, int b, string c, int d); }'; [W]::SystemParametersInfo(20, 0, $env:REAPER_WALL, 3)`;
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps], { env: Object.assign({}, process.env, { REAPER_WALL: file }), windowsHide: true }, (err) => resolve(!err));
  });
}

async function listSignIns() {
  const ses = session.fromPartition(PERSIST);
  const cookies = await ses.cookies.get({});
  const byDomain = new Map();
  for (const c of cookies) {
    const d = c.domain.replace(/^\./, '').replace(/^www\./, '');
    byDomain.set(d, (byDomain.get(d) || 0) + 1);
  }
  return [...byDomain.entries()].map(([domain, count]) => ({ domain, count })).sort((a, b) => a.domain.localeCompare(b.domain));
}
async function signOut(domain) {
  const ses = session.fromPartition(PERSIST);
  const cookies = await ses.cookies.get({});
  for (const c of cookies) {
    const d = c.domain.replace(/^\./, '').replace(/^www\./, '');
    if (d === domain || d.endsWith('.' + domain)) {
      const url = `http${c.secure ? 's' : ''}://${c.domain.replace(/^\./, '')}${c.path}`;
      try { await ses.cookies.remove(url, c.name); } catch { /* ignore */ }
    }
  }
}
function openSignInWindow(url) {
  const w = new BrowserWindow({
    width: 1200, height: 860, title: 'Sign in — Slim Reaper', icon: fs.existsSync(ICO) ? ICO : ICON, parent: mainWin, autoHideMenuBar: true,
    webPreferences: { session: session.fromPartition(PERSIST), contextIsolation: true, sandbox: true }
  });
  w.loadURL(/^https?:/i.test(url) ? url : 'https://' + url);
  w.on('closed', () => send('signins-changed'));
}

function csvEscape(v) { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

// ---------------- files: delete / copy / move / drag ----------------
function filesGone(paths) {
  if (!paths.length) return;
  store.removeImages(paths);
  if (watcher) watcher.forget(paths);
  send('files-removed', paths);
}

async function trashFiles(paths) {
  const moved = [], gone = [], failed = [];
  for (const p of paths) {
    if (!fs.existsSync(p)) { gone.push(p); continue; }
    try {
      await shell.trashItem(p);
      moved.push(p);
      const side = p.replace(/\.[^.\\/]+$/, '') + '.json';
      if (fs.existsSync(side)) { try { await shell.trashItem(side); } catch { /* ignore */ } }
    } catch { failed.push(p); }
  }
  filesGone([...moved, ...gone]);
  return { moved: moved.length, gone: gone.length, failed };
}

function freeName(dir, name) {
  const ext = path.extname(name), base = path.basename(name, ext);
  let p = path.join(dir, name);
  for (let i = 2; fs.existsSync(p); i++) p = path.join(dir, `${base} (${i})${ext}`);
  return p;
}
async function copyFiles({ paths, move }) {
  const r = await dialog.showOpenDialog(mainWin, { title: move ? `Move ${paths.length} image(s) to…` : `Copy ${paths.length} image(s) to…`, defaultPath: store.settings.app.outputDir || defaultOutDir(), properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled) return null;
  const dest = r.filePaths[0];
  let done = 0; const failed = [], movedFrom = [];
  for (const p of paths) {
    if (!fs.existsSync(p)) { failed.push(p); continue; }
    const to = freeName(dest, path.basename(p));
    try {
      if (move) {
        try { fs.renameSync(p, to); } catch { fs.copyFileSync(p, to); fs.unlinkSync(p); }
        movedFrom.push(p);
      } else fs.copyFileSync(p, to);
      done++;
    } catch { failed.push(p); }
  }
  if (movedFrom.length) filesGone(movedFrom);
  return { done, failed, dest };
}

function startDrag(sender, paths) {
  const files = (paths || []).filter((p) => fs.existsSync(p));
  if (!files.length) return;
  let icon = nativeImage.createFromPath(files[0]);
  if (icon.isEmpty()) icon = nativeImage.createFromPath(ICON);
  icon = icon.resize({ width: 64 });
  try { sender.startDrag(files.length > 1 ? { files, file: files[0], icon } : { file: files[0], icon }); } catch { /* ignore */ }
}

// ---------------- folders: list / rename ----------------
function sessionFolders(id) {
  const h = store.history.find((x) => x.id === id);
  if (!h) return [];
  const base = h.outDir;
  const out = new Map();
  for (const i of store.sessionImages(id)) {
    if (!i.path) continue;
    const rel = path.relative(base, i.path);
    const top = !rel.startsWith('..') && rel.includes(path.sep) ? path.join(base, rel.split(path.sep)[0]) : path.dirname(i.path);
    out.set(top, (out.get(top) || 0) + 1);
  }
  return [...out.entries()].map(([dir, count]) => ({ dir, name: path.basename(dir), count, exists: fs.existsSync(dir) }));
}
function renameFolder(from, name) {
  const clean = String(name || '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '').trim();
  if (!clean) return { ok: false, error: 'Type a folder name' };
  if (!fs.existsSync(from)) return { ok: false, error: "That folder doesn't exist any more" };
  const to = path.join(path.dirname(from), clean);
  if (to === from) return { ok: true, to };
  if (fs.existsSync(to) && to.toLowerCase() !== from.toLowerCase()) return { ok: false, error: 'A folder with that name already exists' };
  if (engine.running) return { ok: false, error: 'Stop the scan first' };
  if (watcher) watcher.renamePrefix(from, to);
  try { fs.renameSync(from, to); }
  catch (e) {
    if (watcher) watcher.renamePrefix(to, from);
    return { ok: false, error: /EPERM|EBUSY|EACCES/.test(e.code || '') ? 'Windows is using a file in that folder. Close any windows showing it and try again.' : e.message };
  }
  store.renamePrefix(from, to);
  send('paths-renamed', { from, to });
  return { ok: true, to };
}

// ---------------- Duplicate Finder ----------------
const MIME_BY_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', ico: 'image/x-icon', tif: 'image/tiff', tiff: 'image/tiff' };
async function scanDupes({ dir, recursive, similarity }) {
  if (dupesAbort) dupesAbort.abort();
  dupesAbort = new AbortController();
  const signal = dupesAbort.signal;
  const tdir = thumbDir();
  fs.mkdirSync(tdir, { recursive: true });
  const getInfo = async (file, st) => {
    const cached = store.fileInfo(file, st.size, st.mtimeMs);
    if (cached && cached.dhash && cached.thumb && fs.existsSync(cached.thumb)) return cached;
    const buf = await fs.promises.readFile(file);
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    const mime = MIME_BY_EXT[path.extname(file).slice(1).toLowerCase()] || 'application/octet-stream';
    const r = await processor.process(buf, mime, { hash: true, thumb: 300 });
    let thumb = '';
    if (r.thumb) { thumb = path.join(tdir, sha.slice(0, 40) + '.jpg'); try { if (!fs.existsSync(thumb)) fs.writeFileSync(thumb, Buffer.from(r.thumb)); } catch { thumb = ''; } }
    const info = { sha, dhash: r.dhash || '', w: r.w || 0, h: r.h || 0, thumb };
    store.setFileHash(file, st.size, st.mtimeMs, sha, info);
    return info;
  };
  try {
    const res = await findDuplicates({ dir, recursive, similarity, getInfo, signal, onProgress: (p) => send('dupes-progress', p) });
    return res;
  } catch (e) { return { error: (e && e.message) || String(e), groups: [] }; }
  finally { dupesAbort = null; }
}

// ---------------- Report a problem ----------------
const errorLogPath = () => path.join(app.getPath('userData'), 'error.log');
function logError(kind, err) {
  try { fs.appendFileSync(errorLogPath(), `[${new Date().toISOString()}] ${kind}: ${(err && err.stack) || err}\n`); } catch { /* ignore */ }
}
process.on('uncaughtException', (e) => logError('crash', e));
process.on('unhandledRejection', (e) => logError('promise', e));

async function saveReport(logText) {
  const r = await dialog.showSaveDialog(mainWin, { title: 'Save problem report', defaultPath: path.join(app.getPath('desktop'), 'slim-reaper-report.txt'), filters: [{ name: 'Text', extensions: ['txt'] }] });
  if (r.canceled) return false;
  const rules = Object.assign({}, store.settings.rules, { customHeaders: store.settings.rules.customHeaders ? '(hidden)' : '', proxy: store.settings.rules.proxy ? '(set)' : '' });
  let errors = '';
  try { errors = fs.readFileSync(errorLogPath(), 'utf8').split('\n').slice(-150).join('\n'); } catch { errors = '(none)'; }
  const lines = [
    'SLIM REAPER PROBLEM REPORT', `Made: ${new Date().toString()}`,
    `App ${app.getVersion()} · Electron ${process.versions.electron} · Chrome ${process.versions.chrome} · ${os.type()} ${os.release()} ${os.arch()} · ${Math.round(os.totalmem() / 1073741824)} GB RAM`,
    `Portable: ${process.env.PORTABLE_EXECUTABLE_FILE ? 'yes' : 'no'}`,
    '', '== QUEUE ==', ...store.settings.queue.map((q) => `${q.status || ''}\t${q.url}\t${q.note || ''}`),
    '', '== LAST SCANS ==', ...store.history.slice(0, 10).map((h) => `${new Date(h.startedAt).toISOString()}  saved ${h.saved} skipped ${h.skipped}${h.stopped ? ' (stopped)' : ''}  ${(h.urls || []).join(' ')}`),
    '', '== RULES ==', JSON.stringify(rules, null, 1), '', '== APP SETTINGS ==', JSON.stringify(store.settings.app, null, 1),
    '', '== ERRORS ==', errors, '', '== LOG (most recent last) ==', String(logText || '').split('\n').slice(-1500).join('\n')
  ];
  fs.writeFileSync(r.filePath, lines.join('\r\n'));
  shell.showItemInFolder(r.filePath);
  return true;
}

// ---------------- IPC ----------------
function registerIpc() {
  ipcMain.handle('get-state', async () => ({
    settings: store.settings,
    builtInPresets: BUILT_IN_PRESETS,
    accents: ACCENTS,
    defaults: DEFAULT_RULES,
    history: store.history,
    defaultOutDir: defaultOutDir(),
    version: app.getVersion(),
    running: engine.running, paused: engine.paused,
    memoryCount: store.memoryCount(),
    platform: process.platform
  }));
  ipcMain.handle('save-settings', (e, patch) => {
    store.saveSettings(patch);
    if (patch.app) {
      if ('outputDir' in patch.app && watcher) watcher.watch([store.settings.app.outputDir]);
      if ('clipboardWatch' in patch.app) setClipboardWatch(!!store.settings.app.clipboardWatch);
      if ('launchAtStartup' in patch.app) { try { app.setLoginItemSettings({ openAtLogin: !!patch.app.launchAtStartup, path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath, args: ['--hidden'] }); } catch { /* ignore */ } }
    }
    return true;
  });
  ipcMain.handle('pick-folder', async (e, current) => {
    const r = await dialog.showOpenDialog(mainWin, { title: 'Choose where to save images', defaultPath: current || defaultOutDir(), properties: ['openDirectory', 'createDirectory', 'promptToCreate'] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('make-folder', async (e, { parent, name }) => {
    const p = path.join(parent || defaultOutDir(), name.replace(/[<>:"/\\|?*]/g, '_').trim());
    fs.mkdirSync(p, { recursive: true });
    return p;
  });
  ipcMain.handle('import-urls', async () => {
    const r = await dialog.showOpenDialog(mainWin, { title: 'Import URLs', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Lists', extensions: ['txt', 'csv', 'html', 'htm', 'md', 'json', 'url'] }, { name: 'All files', extensions: ['*'] }] });
    if (r.canceled) return [];
    let text = '';
    for (const f of r.filePaths) { try { text += '\n' + fs.readFileSync(f, 'utf8'); } catch { /* skip */ } }
    return extractUrls(text);
  });
  ipcMain.handle('read-dropped-file', async (e, file) => { try { return extractUrls(fs.readFileSync(file, 'utf8')); } catch { return []; } });
  ipcMain.handle('extract-urls', (e, text) => extractUrls(text));

  ipcMain.handle('start-scan', (e, payload) => startScan(payload));
  ipcMain.handle('add-to-scan', (e, payload) => addToScan(payload));
  ipcMain.handle('pause', () => { engine.pause(); return true; });
  ipcMain.handle('resume', () => { engine.resume(); return true; });
  ipcMain.handle('stop', () => { engine.stop(); return true; });
  ipcMain.handle('skip-job', (e, id) => { engine.skipJob(id); return true; });

  ipcMain.handle('open-path', (e, p) => shell.openPath(p));
  ipcMain.handle('show-in-folder', (e, p) => { shell.showItemInFolder(p); return true; });
  ipcMain.handle('open-external', (e, url) => { if (/^https?:/i.test(url)) shell.openExternal(url); return true; });
  ipcMain.handle('copy-text', (e, t) => { lastClip = String(t); clipboard.writeText(lastClip); return true; });
  ipcMain.handle('copy-image', (e, p) => copyImageToClipboard(p));
  ipcMain.handle('set-wallpaper', (e, p) => setWallpaper(p));
  ipcMain.handle('trash', async (e, p) => {
    const r = await trashFiles([p]);
    return r.failed.length === 0;
  });
  ipcMain.handle('trash-files', (e, paths) => trashFiles(paths));
  ipcMain.handle('copy-files', (e, opts) => copyFiles(opts));
  ipcMain.on('start-drag', (e, paths) => startDrag(e.sender, paths));
  ipcMain.handle('preview-url', async (e, { url, rules }) => {
    try { return await engine.preview(url, mergeRules(DEFAULT_RULES, rules || store.settings.rules)); }
    catch (err) { return { error: (err && err.message) || String(err) }; }
  });
  ipcMain.handle('pick-any-folder', async (e, { title, current }) => {
    const r = await dialog.showOpenDialog(mainWin, { title: title || 'Choose a folder', defaultPath: current || store.settings.app.outputDir || defaultOutDir(), properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('dupes-scan', (e, opts) => scanDupes(opts));
  ipcMain.handle('dupes-cancel', () => { if (dupesAbort) dupesAbort.abort(); return true; });
  ipcMain.handle('save-report', (e, logText) => saveReport(logText));
  ipcMain.handle('session-folders', (e, id) => sessionFolders(id));
  ipcMain.handle('rename-folder', (e, { from, name }) => renameFolder(from, name));
  ipcMain.handle('file-exists', (e, p) => fs.existsSync(p));
  ipcMain.handle('image-info', async (e, p) => {
    try {
      const buf = await fs.promises.readFile(p);
      const ext = path.extname(p).slice(1).toLowerCase();
      const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', ico: 'image/x-icon', svg: 'image/svg+xml' }[ext] || 'application/octet-stream';
      return await processor.process(buf, mime, { hash: false, palette: true });
    } catch { return null; }
  });

  ipcMain.handle('get-session-images', (e, id) => store.sessionImages(id));
  ipcMain.handle('get-library', (e, limit) => store.library(limit || 3000));
  ipcMain.handle('get-history', () => store.history);
  ipcMain.handle('delete-session', (e, id) => { store.deleteSession(id); return store.history; });
  ipcMain.handle('export-report', async (e, id) => {
    const rec = store.history.find((h) => h.id === id);
    const r = await dialog.showSaveDialog(mainWin, { title: 'Export scan report', defaultPath: `slim-reaper-${id}.csv`, filters: [{ name: 'CSV', extensions: ['csv'] }] });
    if (r.canceled) return false;
    const rows = [['file', 'width', 'height', 'bytes', 'format', 'image_url', 'page_url', 'page_title', 'saved_at']];
    for (const i of store.sessionImages(id)) rows.push([i.path, i.w, i.h, i.bytes, i.format, i.url, i.pageUrl, i.title, new Date(i.when).toISOString()]);
    fs.writeFileSync(r.filePath, rows.map((row) => row.map(csvEscape).join(',')).join('\r\n'));
    if (rec) shell.showItemInFolder(r.filePath);
    return true;
  });
  ipcMain.handle('export-log', async (e, text) => {
    const r = await dialog.showSaveDialog(mainWin, { title: 'Save log', defaultPath: 'slim-reaper-log.txt', filters: [{ name: 'Text', extensions: ['txt'] }] });
    if (r.canceled) return false;
    fs.writeFileSync(r.filePath, text);
    return true;
  });
  ipcMain.handle('export-settings', async () => {
    const r = await dialog.showSaveDialog(mainWin, { title: 'Export settings', defaultPath: 'slim-reaper-settings.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (r.canceled) return false;
    fs.writeFileSync(r.filePath, JSON.stringify({ rules: store.settings.rules, presets: store.settings.presets, app: store.settings.app }, null, 2));
    return true;
  });
  ipcMain.handle('import-settings', async () => {
    const r = await dialog.showOpenDialog(mainWin, { title: 'Import settings', properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (r.canceled) return null;
    try {
      const data = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
      store.saveSettings({ rules: data.rules || store.settings.rules, presets: Object.assign({}, store.settings.presets, data.presets || {}), app: data.app || {} });
      return store.settings;
    } catch { return null; }
  });
  ipcMain.handle('forget-memory', () => { store.forgetAll(); return 0; });
  // Moves a scan's images to the Recycle Bin, then removes folders it left empty.
  ipcMain.handle('trash-session-files', async (e, id) => {
    const imgs = store.sessionImages(id);
    const r = await trashFiles(imgs.map((i) => i.path).filter(Boolean));
    const dirs = [...new Set(imgs.map((i) => path.dirname(i.path)))].sort((a, b) => b.length - a.length);
    for (const d of dirs) { try { if (!fs.readdirSync(d).length) fs.rmdirSync(d); } catch { /* not empty */ } }
    if (!r.failed.length) store.deleteSession(id);
    return { moved: r.moved, failed: r.failed.length, history: store.history };
  });
  // Moves the whole save folder to the Recycle Bin and starts fresh.
  ipcMain.handle('trash-all-reaped', async (e, { forget }) => {
    const dir = store.settings.app.outputDir || defaultOutDir();
    if (engine.running) return { ok: false, error: 'Stop the scan first' };
    let ok = true;
    if (fs.existsSync(dir)) { try { await shell.trashItem(dir); } catch (err) { ok = false; } }
    try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
    const all = store.allImagePaths();
    for (const h of store.history.slice()) store.deleteSession(h.id);
    store.forgetFiles(all);
    if (watcher) watcher.setKnown([]);
    send('files-removed', all);
    if (forget) store.forgetAll();
    return { ok, dir, memoryCount: store.memoryCount(), error: ok ? '' : 'Windows is still using some files. Close any folder windows showing them and try again.' };
  });

  ipcMain.handle('list-signins', () => listSignIns());
  ipcMain.handle('sign-in', (e, url) => { openSignInWindow(url); return true; });
  ipcMain.handle('sign-out', async (e, domain) => { await signOut(domain); return listSignIns(); });
  ipcMain.handle('run-schedules-now', () => { runDueSchedules(); return true; });
  ipcMain.handle('host-of', (e, u) => hostOf(u));
  ipcMain.on('play-done-sound', () => {});
}

// ---------------- startup ----------------
app.on('second-instance', (e, argv) => {
  showMainWindow();
  const urls = extractUrls(argv.slice(1).join('\n'));
  if (urls.length) send('clipboard-urls', urls);
});

app.whenReady().then(() => {
  store = new Store(app.getPath('userData'));
  if (!store.settings.app.outputDir) store.saveSettings({ app: { outputDir: defaultOutDir() } });
  // Anything that was mid-scan when the app closed goes back to "queued"
  for (const q of store.settings.queue) if (['loading', 'scanning', 'downloading'].includes(q.status)) q.status = 'queued';

  processor = new ProcessorHost();
  fetcher = makeFetcher();
  engine = new Engine({ driver: new ElectronDriver(), fetcher, processor, memory: store });
  engine.on('event', onEngineEvent);

  registerIpc();
  const hidden = process.argv.includes('--hidden');
  if (!hidden && store.settings.app.showSplash) createSplash();
  createMain();
  if (hidden) mainWin.once('ready-to-show', () => mainWin.hide());
  createTray();
  setClipboardWatch(!!store.settings.app.clipboardWatch);
  watcher = new FileWatcher({ onRemoved: (paths) => filesGone(paths) });
  watcher.setKnown(store.allImagePaths());
  watcher.watch([store.settings.app.outputDir || defaultOutDir()]);
  setTimeout(() => { watcher.sweep(); store.pruneMissing(); }, 4000); // catch anything deleted while the app was closed
  setInterval(runDueSchedules, 60000);
  setTimeout(runDueSchedules, 15000);
});

app.on('before-quit', () => { if (!shuttingDown) shutdown(); });
app.on('window-all-closed', () => shutdown());
