'use strict';
/* Slim Reaper UI. Talks to the main process only through window.reaper (see preload.js). */

const R = window.reaper;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = (o) => JSON.parse(JSON.stringify(o));

// ---------------- icons ----------------
const ICONS = {
  scan: 'M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10',
  library: 'M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v4H4zM14 15h6v4h-6z',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
  rules: 'M4 6h16M7 12h10M10 18h4',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6',
  pause: 'M8 5v14M16 5v14',
  play: 'M7 4l13 8-13 8z',
  stop: 'M6 6h12v12H6z',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  back: 'M15 6l-6 6 6 6',
  chevl: 'M15 6l-6 6 6 6',
  chevr: 'M9 6l6 6-6 6',
  x: 'M6 6l12 12M18 6L6 18',
  retry: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  skip: 'M5 5l10 7-10 7zM19 5v14',
  ext: 'M14 3h7v7M21 3l-9 9M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5',
  filter: 'M4 6h16M7 12h10M10 18h4',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
  copy: 'M8 8h11v11H8zM5 16V5h11',
  save: 'M5 3h11l3 3v15H5zM8 3v6h8V3M8 21v-7h8v7',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  monitor: 'M4 5h16v11H4zM8 20h8M12 16v4',
  bell: 'M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0',
  key: 'M15 7a4 4 0 1 1-3.5 6L5 19.5V21H3v-2l7-7A4 4 0 0 1 15 7zM16 8h.01',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  brain: 'M9 3a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3h0V3zM15 3a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 3V3z',
  keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7h.01',
  clipboard: 'M9 4h6v3H9zM9 5H6v16h12V5h-3',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14',
  wand: 'M15 4V2M15 10V8M11 6h2M17 6h2M4 20l11-11 2 2L6 22z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  bug: 'M9 7a3 3 0 0 1 6 0v1H9zM7 9h10v5a5 5 0 0 1-10 0zM12 12v7M3 13h4M17 13h4M4 7l3 2M20 7l-3 2M5 19l3-2M19 19l-3-2'
};
function ico(name, size) {
  const d = ICONS[name] || '';
  const fill = name === 'play' || name === 'stop' ? 'currentColor' : 'none';
  return `<svg viewBox="0 0 24 24" width="${size || 18}" height="${size || 18}" fill="${fill}" stroke="currentColor" stroke-width="${fill === 'none' ? 1.8 : 0}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
}
function hydrateIcons(root = document) { $$('[data-ico]', root).forEach((el) => { el.outerHTML = ico(el.dataset.ico); }); }

// ---------------- state ----------------
const S = {
  st: null, rules: null, app: null, presets: {}, builtIn: {}, accents: {}, defaults: {},
  queue: [], running: false, paused: false,
  images: [], stats: null, logs: [], logFilter: 'all', chip: 'all',
  saveTimes: [], byteTimes: [], startedAt: 0, page: 'scan',

  viewer: { list: [], i: 0 },
  sel: new Set(), selAnchor: null, dragOutAt: 0,
  dupes: { dir: '', recursive: true, similarity: 90, running: false, progress: null, groups: null, ticked: new Set(), scanned: 0 }
};

const fmtBytes = (b) => (b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : b < 1073741824 ? (b / 1048576).toFixed(1) + ' MB' : (b / 1073741824).toFixed(2) + ' GB');
const fmtNum = (n) => Number(n || 0).toLocaleString('en-US');
const fmtDur = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(x).padStart(2, '0'); };
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
const shortUrl = (u) => { try { const x = new URL(u); return (x.hostname.replace(/^www\./, '') + x.pathname + x.search).replace(/\/$/, ''); } catch { return u; } };
const baseName = (p) => String(p).split(/[\\/]/).pop();
function fileUrl(p) {
  const s = String(p).replace(/\\/g, '/');
  const parts = s.split('/');
  const enc = parts.map((seg, i) => (i === 0 && /^[A-Za-z]:$/.test(seg) ? seg : encodeURIComponent(seg))).join('/');
  return s.startsWith('/') ? 'file://' + enc : 'file:///' + enc;
}
const uid = () => Math.random().toString(36).slice(2, 10);

// ---------------- toasts, modals, menus ----------------
function toast(msg, kind, action) {
  const el = document.createElement('div');
  el.className = 'toast ' + (kind || '');
  el.innerHTML = `<span>${msg}</span>`;
  if (action) {
    const b = document.createElement('button'); b.className = 'btn sm'; b.textContent = action.label;
    b.onclick = () => { action.fn(); el.remove(); };
    el.appendChild(b);
  }
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, action ? 7000 : 3600);
}

function modal({ title, body, ok = 'OK', cancel = 'Cancel', danger = false, onOpen }) {
  return new Promise((resolve) => {
    const m = $('#modal');
    m.className = 'modal';
    m.innerHTML = `<div class="mh">${esc(title)}</div><div class="mb">${body}</div><div class="mf">${cancel ? `<button class="btn ghost" data-m="cancel">${esc(cancel)}</button>` : ''}<button class="btn ${danger ? 'danger' : 'primary'}" data-m="ok">${esc(ok)}</button></div>`;
    $('#modal-bg').classList.add('on');
    const done = (v) => { $('#modal-bg').classList.remove('on'); document.removeEventListener('keydown', onKey, true); resolve(v); };
    const collect = () => { const o = {}; $$('[name]', m).forEach((i) => { o[i.name] = i.type === 'checkbox' ? i.checked : i.value; }); return o; };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); done(collect()); } };
    document.addEventListener('keydown', onKey, true);
    m.querySelector('[data-m="ok"]').onclick = () => done(collect());
    const c = m.querySelector('[data-m="cancel"]'); if (c) c.onclick = () => done(null);
    $('#modal-bg').onclick = (e) => { if (e.target.id === 'modal-bg') done(null); };
    if (onOpen) onOpen(m);
    const first = m.querySelector('input, textarea, select'); if (first) setTimeout(() => first.focus(), 30);
  });
}
const confirmBox = (title, text, ok = 'Yes', danger) => modal({ title, body: `<div style="color:var(--text2);line-height:1.5">${text}</div>`, ok, danger }).then((r) => !!r);

function contextMenu(x, y, items) {
  const c = $('#ctx');
  c.innerHTML = '';
  for (const it of items) {
    if (it === '-') { c.appendChild(document.createElement('hr')); continue; }
    const b = document.createElement('button');
    b.className = it.cls || '';
    b.innerHTML = (it.icon ? ico(it.icon, 15) : '') + `<span>${esc(it.label)}</span>`;
    b.onclick = () => { closeMenu(); it.fn(); };
    c.appendChild(b);
  }
  c.classList.add('on');
  const r = c.getBoundingClientRect();
  c.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
  c.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
}
function closeMenu() { $('#ctx').classList.remove('on'); }

// ---------------- theme ----------------
function applyAccent() {
  const a = S.accents[S.app.accent] || S.accents.ice;
  document.documentElement.style.setProperty('--accent', a.a);
  document.documentElement.style.setProperty('--accent-d', a.d);
  const sizes = { s: '120px', m: '150px', l: '210px' };
  document.documentElement.style.setProperty('--tile', sizes[S.app.thumbSize] || '150px');
}

// ---------------- persistence ----------------
let saveRulesT, saveQueueT;
function saveRules() { clearTimeout(saveRulesT); saveRulesT = setTimeout(() => R.saveSettings({ rules: S.rules }), 400); updateStatusBar(); }
function saveQueue() { clearTimeout(saveQueueT); saveQueueT = setTimeout(() => R.saveSettings({ queue: S.queue.map((q) => ({ id: q.id, url: q.url, folder: q.folder || '', dir: q.dir || '', watch: q.watch || null, status: q.status, saved: q.saved || 0, found: q.found || 0, skipped: q.skipped || 0, note: q.note || '' })) }), 300); }
function saveApp(patch) { Object.assign(S.app, patch); R.saveSettings({ app: patch }); }

// ---------------- navigation ----------------
function go(page) {
  S.page = page;
  $$('.rail button').forEach((b) => b.classList.toggle('active', b.dataset.nav === page));
  $$('main.page').forEach((m) => m.classList.toggle('active', m.id === 'page-' + page));
  const sp = $(`#page-${page} .scroll-page`); if (sp) sp.scrollTop = 0;
  if (page === 'history') renderHistory();
  if (page === 'rules') renderRules();
  if (page === 'settings') renderSettings();
  if (page === 'dupes') renderDupes();
  clearSelection();
  closeMenu();
}

// =====================================================================
// QUEUE
// =====================================================================
const ACTIVE = ['loading', 'scanning', 'downloading'];
const STATUS_TEXT = { gone: 'GONE', queued: 'QUEUED', loading: 'OPENING', scanning: 'SCANNING', downloading: 'SAVING', done: 'DONE', failed: 'FAILED', blocked: 'BLOCKED', stopped: 'STOPPED', skipped: 'SKIPPED' };

async function addUrls(urls, { silent } = {}) {
  const have = new Set(S.queue.map((q) => q.url));
  let added = 0, dup = 0;
  for (const u of urls) {
    if (have.has(u)) { dup++; continue; }
    have.add(u);
    S.queue.push({ id: uid(), url: u, status: 'queued', found: 0, saved: 0, skipped: 0, progress: 0, note: 'Waiting' });
    added++;
  }
  const newOnes = S.queue.slice(S.queue.length - added);
  if (added && S.app.watchNewThreads) {
    const now = Date.now();
    for (const q of newOnes) if (isThreadUrl(q.url)) q.watch = { every: 5, until: now + 24 * 3600000, next: now + 5 * 60000 };
  }
  if (added) { renderQueue(); saveQueue(); }
  if (added && S.app.autoStartOnAdd) setTimeout(() => startReap({ ids: newOnes.map((q) => q.id) }), 50);
  if (!silent) {
    if (added && !S.app.autoStartOnAdd) toast(`Added ${added} URL${added > 1 ? 's' : ''}${dup ? ` · ${dup} already in the queue` : ''} — press REAP`);
    else if (added && dup) toast(`${dup} already in the queue`);
    else if (dup) toast('Already in the queue', 'warn');
    else toast('No URLs found in that', 'warn');
  }
  return added;
}

async function addFromInput() {
  const inp = $('#url-input');
  const text = inp.value.trim();
  if (!text) { inp.focus(); return; }
  const urls = await R.extractUrls(text);
  if (urls.length) { await addUrls(urls); inp.value = ''; }
  else toast("That doesn't look like a web address", 'warn');
}

function renderQueue() {
  const list = $('#qlist');
  const done = S.queue.filter((q) => ['done', 'failed', 'blocked', 'skipped'].includes(q.status)).length;
  $('#q-meta').textContent = S.queue.length ? `${done} / ${S.queue.length} done` : 'empty';
  if (!S.queue.length) {
    list.innerHTML = `<div class="empty" style="padding:30px 10px;font-size:13px">No URLs yet.<br>Paste them above, drop a .txt file here, or press Ctrl+V anywhere.</div>`;
    return;
  }
  list.innerHTML = S.queue.map((q) => queueItemHtml(q)).join('');
}
function isThreadUrl(u) { return /^https?:\/\/[^/]+\/\w+\/thread\/\d+/i.test(u) || /reddit\.com\/r\/[^/]+\/comments\//i.test(u); }
function queueItemHtml(q) {
  const active = ACTIVE.includes(q.status);
  const pct = Math.round((q.progress || 0) * 100);
  const showBar = active || (q.status === 'queued' && S.running && false);
  const watching = q.watch && !active;
  const st = active && q.status === 'scanning' && pct ? pct + '%' : watching ? 'WATCHING' : STATUS_TEXT[q.status] || q.status.toUpperCase();
  let meta = q.status === 'queued' ? (q.note && q.note !== 'Waiting' ? q.note : 'Waiting') : q.note || '';
  if (watching) meta = `${q.note ? q.note + ' · ' : ''}next check ${new Date(q.watch.next).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  return `<div class="qitem ${active ? 'active' : ''} ${S.jobFilter === q.id ? 'filtered' : ''} ${watching ? 'watching' : ''}" data-q="${q.id}" title="${esc(q.url)}${q.dir ? '\nSaved in: ' + esc(q.dir) : ''}\nClick to show only its images · right-click for more">
    <div class="row"><span class="u">${esc(shortUrl(q.url))}</span><span class="st ${watching ? 'watching' : q.status}">${st}</span></div>
    ${showBar ? `<div class="bar ${pct ? '' : 'indet'}"><i style="width:${pct}%"></i></div>` : ''}
    <span class="m">${esc(meta)}</span>
    ${q.folder ? `<span class="fold" title="${esc(q.folder)}">→ ${esc(q.folder)}</span>` : ''}
    <div class="acts">
      <button data-qa="open" title="Open in your browser">${ico('ext')}</button>
      ${active ? `<button data-qa="skip" title="Skip this URL">${ico('skip')}</button>` : ''}
      ${q.dir ? `<button data-qa="folder" title="Open its folder">${ico('folder')}</button>` : ''}
      ${!active && q.status !== 'queued' ? `<button data-qa="retry" title="Run again">${ico('retry')}</button>` : ''}
      ${!active ? `<button data-qa="remove" title="Remove">${ico('x')}</button>` : ''}
    </div></div>`;
}
function updateQueueItem(id) {
  const q = S.queue.find((x) => x.id === id);
  const el = $(`.qitem[data-q="${id}"]`);
  if (!q || !el) return renderQueue();
  el.outerHTML = queueItemHtml(q);
  const done = S.queue.filter((x) => ['done', 'failed', 'blocked', 'skipped'].includes(x.status)).length;
  $('#q-meta').textContent = `${done} / ${S.queue.length} done`;
}

// =====================================================================
// SCAN CONTROL
// =====================================================================
function presetList() {
  const out = [];
  for (const [id, p] of Object.entries(S.builtIn)) out.push({ id, name: p.name, builtIn: true, rules: p.rules });
  for (const [id, p] of Object.entries(S.presets)) out.push({ id, name: p.name, builtIn: false, rules: p.rules });
  return out;
}
function applyPreset(id) {
  const p = presetList().find((x) => x.id === id);
  if (!p) return;
  const keepLists = { blockedDomains: S.rules.blockedDomains, rewriteRules: S.rules.rewriteRules };
  S.rules = deepMerge(clone(S.defaults), p.builtIn ? p.rules : p.rules);
  if (p.builtIn) Object.assign(S.rules, keepLists);
  saveApp({ activePreset: id });
  saveRules();
  renderPresetSelects();
  if (S.page === 'rules') renderRules();
  toast(`Preset: ${p.name}`);
}
function deepMerge(base, over) {
  for (const [k, v] of Object.entries(over || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) base[k] = Object.assign({}, base[k], v);
    else base[k] = v;
  }
  return base;
}
function markCustom() { if (S.app.activePreset !== 'custom') { saveApp({ activePreset: 'custom' }); renderPresetSelects(); } }
function renderPresetSelects() {
  const opts = presetList().map((p) => `<option value="${p.id}" ${S.app.activePreset === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')
    + `<option value="custom" ${S.app.activePreset === 'custom' ? 'selected' : ''}>Custom (my changes)</option>`;
  $$('.preset-select, #preset-quick').forEach((s) => { s.innerHTML = opts; });
}

async function joinRunningScan(items, opts = {}) {
  if (!items.length) { if (S.paused) R.resume(); return; }
  items.forEach((q) => Object.assign(q, { status: 'queued', progress: 0, note: opts.quiet ? 'Checking for new images…' : 'Starting…' }));
  renderQueue();
  const res = await R.addToScan({ urls: items.map((q) => ({ id: q.id, url: q.url, folder: q.folder || '' })) });
  if (!res.joined) return startReap(opts); // the scan finished a moment ago: start a fresh one
  if (S.paused) R.resume();
  if (!opts.quiet) S.quietRun = false;
  S.lastRunIds = [...new Set([...(S.lastRunIds || []), ...items.map((q) => q.id)])];
  if (!opts.quiet) toast(`Added ${items.length} URL${items.length > 1 ? 's' : ''} — scanning alongside the current scan`);
}

async function startReap(opts = {}) {
  if (S.running) {
    const pick = opts.ids ? S.queue.filter((q) => opts.ids.includes(q.id)) : S.queue.filter((q) => ['queued', 'failed', 'stopped', 'skipped'].includes(q.status));
    return joinRunningScan(pick.filter((q) => !ACTIVE.includes(q.status)), opts);
  }
  if (opts.ids) {
    const todo = S.queue.filter((q) => opts.ids.includes(q.id));
    if (!todo.length) return;
    todo.forEach((q) => Object.assign(q, { status: 'queued', progress: 0, note: opts.quiet ? 'Checking for new images…' : 'Waiting' }));
    if (!opts.quiet) resetLive();
    renderQueue();
    const res = await R.startScan({ urls: todo.map((q) => ({ id: q.id, url: q.url, folder: q.folder || '' })), rules: S.rules, outDir: S.app.outputDir, presetName: opts.quiet ? 'Watch re-check' : (opts.force ? 'Download again' : ''), forceAgain: !!opts.force });
    if (!res.ok) { toast(res.error || 'Could not start', 'err'); return; }
    S.running = true; S.paused = false; S.quietRun = !!opts.quiet; S.lastRunIds = todo.map((q) => q.id);
    S.currentSession = res.sessionId;
    addLog({ level: 'info', msg: opts.quiet ? `Watching: checking ${todo.map((q) => shortUrl(q.url)).join(', ')} for new images` : `${opts.force ? 'Downloading again' : 'Reaping'} ${todo.length} URL${todo.length > 1 ? 's' : ''} → ${res.outDir}`, t: Date.now() });
    updateControls();
    return;
  }
  if (!S.queue.length) {
    const v = $('#url-input').value.trim();
    if (v) await addFromInput();
    if (!S.queue.length) { toast('Add some URLs first', 'warn'); $('#url-input').focus(); return; }
  }
  let todo = S.queue.filter((q) => ['queued', 'failed', 'stopped', 'skipped'].includes(q.status));
  if (!todo.length) {
    const again = await confirmBox('Run everything again?', 'All URLs in the queue are done. Scan them all again? Images you already have are skipped automatically.', 'Run again');
    if (!again) return;
    S.queue.forEach((q) => Object.assign(q, { status: 'queued', progress: 0, note: 'Waiting', found: 0, saved: 0, skipped: 0 }));
    todo = S.queue.slice();
  }
  todo.forEach((q) => Object.assign(q, { status: 'queued', progress: 0, note: 'Waiting' }));
  resetLive();
  renderQueue();
  const presetName = (presetList().find((p) => p.id === S.app.activePreset) || { name: 'Custom' }).name;
  const res = await R.startScan({ urls: todo.map((q) => ({ id: q.id, url: q.url, folder: q.folder || '' })), rules: S.rules, outDir: S.app.outputDir, presetName });
  if (!res.ok) { toast(res.error || 'Could not start', 'err'); return; }
  S.running = true; S.paused = false; S.startedAt = Date.now(); S.quietRun = false; S.lastRunIds = todo.map((q) => q.id);
  S.currentSession = res.sessionId;
  addLog({ level: 'info', msg: `Reaping ${todo.length} URL${todo.length > 1 ? 's' : ''} → ${res.outDir}`, t: Date.now() });
  updateControls();
}

function resetLive() {
  S.images = []; S.saveTimes = []; S.byteTimes = []; S.stats = null; S.logs = [];
  $('#wall').innerHTML = ''; $('#log').innerHTML = '';
  renderStats(); renderChips(); updateWallEmpty();
}

function updateControls() {
  const reap = $('#btn-reap');
  reap.classList.toggle('running', S.running && !S.paused);
  reap.classList.toggle('paused', S.paused);
  $('#reap-label').textContent = S.running ? (S.paused ? 'PAUSED' : 'REAPING…') : 'REAP';
  $('#btn-pause').disabled = !S.running;
  $('#btn-stop').disabled = !S.running;
  $('#btn-pause').innerHTML = ico(S.paused ? 'play' : 'pause');
  $('#btn-pause').title = S.paused ? 'Resume (Space)' : 'Pause (Space)';
  const live = $('#live');
  live.classList.toggle('off', !S.running);
  $('#live-text').textContent = S.running ? (S.paused ? 'paused' : 'saving as found') : (S.images.length ? 'finished' : 'idle');
  $('#tb-pill').classList.toggle('on', S.running);
  $('#tb-pill-text').textContent = S.paused ? 'Paused' : `Reaping · ${fmtNum(S.stats ? S.stats.saved : 0)} saved`;
  $('#sb-state').textContent = S.running ? (S.paused ? '❚❚ paused' : '● writing') : '● ready';
  $$('[data-q]').forEach(() => {});
}

// =====================================================================
// ENGINE EVENTS
// =====================================================================
function onEvents(batch) {
  let queueChanged = new Set(), statsChanged = false, newImages = [];
  for (const e of batch) {
    switch (e.type) {
      case 'state':
        S.running = e.running; S.paused = e.paused; updateControls(); break;
      case 'job': {
        const q = S.queue.find((x) => x.id === e.id);
        if (q) {
          Object.assign(q, { status: e.status, found: e.found, saved: e.saved, skipped: e.skipped, progress: e.progress, note: e.note });
          if (e.dir) q.dir = e.dir; q.allDupes = !!e.allDupes;
          if (q.watch && ['done', 'gone', 'failed', 'stopped', 'skipped', 'blocked'].includes(e.status)) watchJobFinished(q);
          queueChanged.add(q.id);
        }
        break;
      }
      case 'image':
        newImages.push(e); S.saveTimes.push(Date.now()); S.byteTimes.push([Date.now(), e.bytes]);
        $('#sb-path').textContent = e.path; break;
      case 'stats': S.stats = e; statsChanged = true; break;
      case 'log': addLog(e); break;
      case 'done': onDone(e); break;
      default: break;
    }
  }
  if (newImages.length) { for (const img of newImages) S.images.push(img); addTiles(newImages); }
  queueChanged.forEach((id) => updateQueueItem(id));
  if (queueChanged.size) saveQueue();
  if (statsChanged) renderStats();
}

function onDone(e) {
  S.running = false; S.paused = false;
  updateControls(); renderQueue(); saveQueue(); renderStats();
  const s = e.stats;
  addLog({ level: 'info', msg: `${e.stopped ? 'Stopped' : 'Done'} — ${s.saved} saved, ${s.skipped} skipped, ${fmtBytes(s.bytes)} in ${fmtDur(s.finishedAt - s.startedAt)}`, t: Date.now() });
  const ran = S.queue.filter((q) => (S.lastRunIds || []).includes(q.id));
  if (S.quietRun) {
    if (s.saved) toast(`Watching: <b>${fmtNum(s.saved)}</b> new image${s.saved > 1 ? 's' : ''} grabbed`);
  } else if (e.stopReason) {
    toast(`Stopped: ${esc(e.stopReason)} · <b>${fmtNum(s.saved)}</b> saved`, 'warn');
  } else if (!e.stopped && !s.saved && s.dupes) {
    const dirs = ran.map((q) => q.dir).filter(Boolean);
    toast(`Nothing new — all <b>${fmtNum(s.dupes)}</b> images are already saved`, 'warn', { label: 'Download again anyway', fn: () => startReap({ ids: ran.map((q) => q.id), force: true }) });
    if (dirs.length === 1) addLog({ level: 'info', msg: `They're in ${dirs[0]}`, t: Date.now() });
  } else if (!e.stopped && !s.saved && !s.found) {
    toast(ran.some((q) => q.status === 'gone') ? 'That page is gone (deleted or archived)' : 'No images found on that page', 'warn');
  } else {
    const one = ran.length === 1 && ran[0].dir;
    toast(`${e.stopped ? 'Stopped' : 'Reaping complete'}: <b>${fmtNum(s.saved)}</b> images saved`, e.stopped ? 'warn' : '', { label: 'Open folder', fn: () => R.openPath(one || S.app.outputDir) });
  }
  const wasQuiet = S.quietRun;
  S.quietRun = false;
  if (S.app.soundWhenDone && !e.stopped && (!wasQuiet || s.saved)) playDoneSound();
  // Watch checks interrupted by Stop try again on their normal timer
  for (const q of S.queue) if (q.watch && q.watch.checking) { q.watch.checking = false; q.watch.next = Date.now() + q.watch.every * 60000; }
  // Anything added in the split second the scan was finishing starts now
  const late = S.queue.filter((q) => q.status === 'queued' && (q.note === 'Starting…' || q.note === 'Checking for new images…') && !(S.lastRunIds || []).includes(q.id));
  S.lastRunIds = [];
  if (late.length && !e.stopped) setTimeout(() => startReap({ ids: late.map((q) => q.id) }), 500);
  renderQueue(); saveQueue();
}

function playDoneSound() {
  try {
    const ctx = new AudioContext();
    [[523, 0], [784, 0.12], [1047, 0.24]].forEach(([f, t]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.35);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.4);
    });
  } catch { /* no audio */ }
}

// =====================================================================
// LIVE WALL
// =====================================================================
const FMT_CHIPS = [['all', 'All'], ['jpg', 'JPG'], ['png', 'PNG'], ['webp', 'WEBP'], ['gif', 'GIF'], ['other', 'Other'], ['4k', '4K+'], ['hd', 'HD+']];
function chipMatch(img, chip) {
  if (chip === 'all') return true;
  if (chip === '4k') return img.w >= 3840 || img.h >= 3840;
  if (chip === 'hd') return img.w >= 1920 || img.h >= 1920;
  if (chip === 'other') return !['jpg', 'png', 'webp', 'gif'].includes(img.format);
  return img.format === chip;
}
function wallMatch(img) { return chipMatch(img, S.chip) && (!S.jobFilter || img.jobId === S.jobFilter); }
function setJobFilter(id) {
  S.jobFilter = id;
  $$('.qitem').forEach((el) => el.classList.toggle('filtered', el.dataset.q === id));
  clearSelection(); renderChips(); rerenderWall();
}
function renderChips() {
  const counts = {};
  for (const [k] of FMT_CHIPS) counts[k] = 0;
  for (const img of S.images) if (!S.jobFilter || img.jobId === S.jobFilter) for (const [k] of FMT_CHIPS) if (chipMatch(img, k)) counts[k]++;
  const jq = S.jobFilter && S.queue.find((q) => q.id === S.jobFilter);
  $('#chips').innerHTML = (jq ? `<button class="chip on" data-jobclear title="Show everything again">Only: ${esc(shortUrl(jq.url).slice(0, 34))} ✕</button>` : '') + FMT_CHIPS.filter(([k]) => k === 'all' || counts[k]).map(([k, label]) => `<button class="chip ${S.chip === k ? 'on' : ''}" data-chip="${k}">${label}${k === 'all' ? ' ' + fmtNum(counts.all) : ''}</button>`).join('')
    + `<span style="width:8px"></span><div class="seg" title="Thumbnail size">${['s', 'm', 'l'].map((z) => `<button data-thumb="${z}" class="${S.app.thumbSize === z ? 'on' : ''}">${z.toUpperCase()}</button>`).join('')}</div>`;
}
let chipT;
function renderChipsSoon() { clearTimeout(chipT); chipT = setTimeout(renderChips, 250); }

function tileHtml(img, fresh) {
  const label = `${img.w && img.h ? img.w + '×' + img.h : '?'} · ${String(img.format || '').toUpperCase()}`;
  return `<button class="tile ${fresh ? 'fresh' : ''} ${S.sel.has(img.id) ? 'sel' : ''}" data-img="${esc(img.id)}" draggable="true" title="${esc(baseName(img.path))}"><img src="${fileUrl(img.thumb || img.path)}" loading="lazy" decoding="async" draggable="false" alt="${esc(img.alt || baseName(img.path))}"><span class="new">NEW</span><span class="cap">${esc(label)}</span></button>`;
}
const WALL_MAX = 500;
function addTiles(imgs) {
  const wall = $('#wall');
  $$('.tile.fresh', wall).forEach((t, i) => { if (i >= 0) t.classList.remove('fresh'); });
  const html = imgs.filter(wallMatch).reverse().map((img, i, arr) => tileHtml(img, i >= arr.length - 3 || arr.length <= 3)).join('');
  if (html) wall.insertAdjacentHTML('afterbegin', html);
  const tiles = $$('.tile', wall);
  tiles.forEach((t, i) => t.classList.toggle('fresh', i < 3 && S.running));
  if (tiles.length > WALL_MAX) tiles.slice(WALL_MAX).forEach((t) => t.remove());
  updateWallEmpty();
  renderChipsSoon();
}
function rerenderWall() {
  const list = S.images.filter(wallMatch).slice(-WALL_MAX).reverse();
  $('#wall').innerHTML = list.map((img) => tileHtml(img, false)).join('') + (S.images.length > WALL_MAX ? `<div class="more">Showing the newest ${WALL_MAX}. Everything is in your folder.</div>` : '');
  updateWallEmpty();
}
function updateWallEmpty() { $('#wall-empty').classList.toggle('hidden', S.images.length > 0); }
function imgById(id) { return S.images.find((x) => x.id === id); }

// =====================================================================
// STATS + LOG
// =====================================================================
function renderStats() {
  const s = S.stats || { saved: 0, found: 0, skipped: 0, dupes: 0, small: 0, bytes: 0 };
  $('#s-saved').textContent = fmtNum(s.saved);
  $('#s-found').textContent = fmtNum(s.found);
  $('#s-skipped').textContent = fmtNum(s.skipped);
  $('#s-dupes').textContent = fmtNum(s.dupes);
  $('#s-small').textContent = fmtNum(s.small);
  $('#s-bytes').textContent = fmtBytes(s.bytes || 0);
  $('#tb-pill-text').textContent = S.paused ? 'Paused' : `Reaping · ${fmtNum(s.saved)} saved`;
}
function tick() {
  const now = Date.now();
  if (S.running && S.stats) {
    const el = now - S.stats.startedAt;
    $('#s-elapsed').textContent = fmtDur(el);
    S.byteTimes = S.byteTimes.filter(([t]) => now - t < 5000);
    const bps = S.byteTimes.reduce((a, [, b]) => a + b, 0) / 5;
    $('#s-speed').textContent = bps ? fmtBytes(bps) + '/s' : '—';
    const qs = S.queue.filter((q) => q.status !== 'queued' || true);
    const total = qs.filter((q) => ACTIVE.includes(q.status) || ['done', 'failed', 'blocked', 'stopped', 'skipped'].includes(q.status) || q.status === 'queued');
    const p = total.length ? total.reduce((a, q) => a + (['done', 'failed', 'blocked', 'skipped'].includes(q.status) ? 1 : q.progress || 0), 0) / total.length : 0;
    $('#s-eta').textContent = p > 0.04 && p < 1 ? '~' + fmtDur((el / p) * (1 - p)) : '—';
  }
  // sparkline: saves per second over 30s
  S.saveTimes = S.saveTimes.filter((t) => now - t < 30000);
  const bins = new Array(30).fill(0);
  for (const t of S.saveTimes) { const i = 29 - Math.floor((now - t) / 1000); if (i >= 0 && i < 30) bins[i]++; }
  const max = Math.max(1, ...bins);
  const sp = $('#spark');
  if (sp.children.length !== 30) sp.innerHTML = '<i></i>'.repeat(30);
  bins.forEach((b, i) => { const el = sp.children[i]; el.style.height = Math.max(4, (b / max) * 100) + '%'; el.classList.toggle('hot', b > 0 && i >= 25); });
}

const LOG_TAG = { save: 'SAVE', skip: 'SKIP', info: 'INFO', warn: 'WARN', wait: 'WAIT', error: 'ERR', scroll: 'SCRL', src: 'SRC' };
function logMatches(l) {
  const f = S.logFilter;
  if (f === 'all') return true;
  if (f === 'save') return l.level === 'save';
  if (f === 'skip') return l.level === 'skip';
  return ['warn', 'wait', 'error'].includes(l.level);
}
function logLine(l) {
  const d = new Date(l.t || Date.now());
  const t = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  return `<div class="lv-${l.level}"><span class="t">${t}</span><span class="g">${LOG_TAG[l.level] || l.level.toUpperCase()}</span><span class="m" title="${esc(l.msg)}">${esc(l.msg)}</span></div>`;
}
function addLog(l) {
  S.logs.push(l);
  if (S.logs.length > 3000) S.logs.splice(0, 500);
  if (!logMatches(l)) return;
  const box = $('#log');
  const atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
  box.insertAdjacentHTML('beforeend', logLine(l));
  while (box.children.length > 600) box.firstChild.remove();
  if (atBottom) box.scrollTop = box.scrollHeight;
}
function rerenderLog() {
  const box = $('#log');
  box.innerHTML = S.logs.filter(logMatches).slice(-600).map(logLine).join('');
  box.scrollTop = box.scrollHeight;
}

// =====================================================================
// IMAGE VIEWER
// =====================================================================
const V = { scale: 1, fit: 1, x: 0, y: 0, w: 0, h: 0 };
function openViewer(list, index) {
  S.viewer = { list, i: Math.max(0, Math.min(index, list.length - 1)) };
  $('#viewer').classList.add('on');
  showViewerImage();
}
function closeViewer() { $('#viewer').classList.remove('on'); $('#v-img').removeAttribute('src'); }
async function showViewerImage() {
  const { list, i } = S.viewer;
  const img = list[i];
  if (!img) return closeViewer();
  $('#v-name').textContent = baseName(img.path);
  $('#v-count').textContent = `${fmtNum(i + 1)} of ${fmtNum(list.length)}`;
  const el = $('#v-img');
  el.onload = () => { V.w = el.naturalWidth; V.h = el.naturalHeight; fitImage(); if (!img.w) { img.w = V.w; img.h = V.h; renderFacts(img); } };
  el.onerror = () => { toast('That file is gone (moved or deleted)', 'warn'); };
  el.src = fileUrl(img.path);
  renderFacts(img);
  $('#v-page').innerHTML = img.pageUrl ? `<a data-ext="${esc(img.pageUrl)}">${esc(img.pageUrl)}</a>` : '—';
  $('#v-url').innerHTML = img.url && !img.url.startsWith('data:') ? `<a data-ext="${esc(img.url)}">${esc(img.url)}</a>` : '(embedded in the page)';
  $('#v-path').textContent = img.path;
  $('#v-palette').innerHTML = '';
  R.imageInfo(img.path).then((info) => {
    if (S.viewer.list[S.viewer.i] !== img || !info || !info.palette) return;
    $('#v-palette').innerHTML = info.palette.map((c) => `<button style="background:${c}" title="${c}" data-color="${c}"></button>`).join('');
  }).catch(() => {});
  // filmstrip
  const from = Math.max(0, i - 6), to = Math.min(list.length, from + 14);
  $('#v-strip').innerHTML = list.slice(from, to).map((x, k) => `<button class="${from + k === i ? 'on' : ''}" data-vi="${from + k}" aria-label="Image ${from + k + 1}"><img src="${fileUrl(x.thumb || x.path)}" loading="lazy" alt=""></button>`).join('');
}
function renderFacts(img) {
  const ratio = (w, h) => { if (!w || !h) return '—'; const g = (a, b) => (b ? g(b, a % b) : a); const d = g(w, h); const r = `${w / d}:${h / d}`; return r.length > 7 ? (w / h).toFixed(2) + ':1' : r; };
  const found = img.when ? new Date(img.when) : null;
  $('#v-facts').innerHTML = [
    ['Size', img.w ? `${img.w}×${img.h}` : '—'], ['File', img.bytes ? fmtBytes(img.bytes) : '—'],
    ['Format', String(img.format || '?').toUpperCase()], ['Ratio', ratio(img.w, img.h)],
    ['Saved', found ? found.toLocaleTimeString() : '—'], ['Site', hostOf(img.pageUrl || img.url) || '—']
  ].map(([k, v]) => `<div><span class="label">${k}</span><b title="${esc(v)}">${esc(v)}</b></div>`).join('');
}
function fitImage() {
  const st = $('#v-stage').getBoundingClientRect();
  V.fit = Math.min((st.width - 160) / V.w, (st.height - 60) / V.h, 1);
  setZoom(V.fit, true);
}
function setZoom(s, center, cx, cy) {
  const st = $('#v-stage').getBoundingClientRect();
  const old = V.scale;
  V.scale = Math.max(0.05, Math.min(16, s));
  if (center) { V.x = (st.width - V.w * V.scale) / 2; V.y = (st.height - V.h * V.scale) / 2; }
  else { const px = cx == null ? st.width / 2 : cx, py = cy == null ? st.height / 2 : cy; V.x = px - ((px - V.x) * V.scale) / old; V.y = py - ((py - V.y) * V.scale) / old; }
  $('#v-img').style.transform = `translate(${V.x}px, ${V.y}px) scale(${V.scale})`;
  $('#v-zlabel').textContent = Math.abs(V.scale - V.fit) < 0.001 ? 'Fit' : Math.round(V.scale * 100) + '%';
}
function viewerStep(d) { const n = S.viewer.list.length; if (!n) return; S.viewer.i = (S.viewer.i + d + n) % n; showViewerImage(); }
function currentViewerImg() { return S.viewer.list[S.viewer.i]; }

// Removing an image only takes it out of the app. The file stays in File Explorer.
async function removeImage(img, fromViewer) {
  if (!img) return;
  await R.removeFromApp([img.path]);
  S.images = S.images.filter((x) => x.path !== img.path);
  $$(`[data-img="${CSS.escape(img.id)}"]`).forEach((t) => t.remove());
  S.sel.delete(img.id);
  if (fromViewer) {
    S.viewer.list = S.viewer.list.filter((x) => x.path !== img.path);
    if (!S.viewer.list.length) closeViewer(); else { S.viewer.i = Math.min(S.viewer.i, S.viewer.list.length - 1); showViewerImage(); }
  }
  updateWallEmpty(); renderChipsSoon(); updateSelBar();
  toast('Removed from the app · file kept');
}
async function blockSite(img) {
  const host = hostOf(img.url && !img.url.startsWith('data:') ? img.url : img.pageUrl);
  if (!host) return;
  const ok = await confirmBox('Never grab from here?', `Images from <b>${esc(host)}</b> will be skipped from now on. You can undo this in Rules → URL filters.`, 'Block site');
  if (!ok) return;
  S.rules.blockedDomains = Array.from(new Set([...(S.rules.blockedDomains || []), host]));
  saveRules(); markCustom();
  toast(`Blocked ${host}`);
}
function imageMenu(img, x, y, list, idx) {
  contextMenu(x, y, [
    { label: 'Preview', icon: 'scan', fn: () => openViewer(list, idx) },
    { label: 'Open', icon: 'ext', fn: () => R.openPath(img.path) },
    { label: 'Show in folder', icon: 'folder', fn: () => R.showInFolder(img.path) },
    '-',
    { label: 'Copy image', icon: 'copy', fn: async () => toast((await R.copyImage(img.path)) ? 'Image copied' : "Couldn't copy that image", 'warn') },
    { label: 'Copy image URL', icon: 'link', fn: () => { R.copyText(img.url); toast('URL copied'); } },
    { label: 'Copy file path', icon: 'file', fn: () => { R.copyText(img.path); toast('Path copied'); } },
    { label: 'Open source page', icon: 'globe', fn: () => R.openExternal(img.pageUrl) },
    { label: 'Set as wallpaper', icon: 'monitor', fn: async () => toast((await R.setWallpaper(img.path)) ? 'Wallpaper set' : "Couldn't set wallpaper", 'warn') },
    '-',
    { label: 'Never grab from this site', icon: 'shield', cls: 'warn', fn: () => blockSite(img) },
    { label: 'Remove from app', icon: 'x', fn: () => removeImage(img, false) }
  ]);
}

// =====================================================================
// RULES PAGE
// =====================================================================
const UA = {
  '': 'Default (Chrome on Windows)',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0': 'Firefox on Windows',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0': 'Edge on Windows',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15': 'Safari on Mac',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1': 'iPhone (mobile sites)',
  'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36': 'Android phone (mobile sites)'
};
const RULE_SECTIONS = [
  { title: 'IMAGE FILTERS', icon: 'filter', rows: [
    { type: 'pair', keys: ['minWidth', 'minHeight'], label: 'Minimum size', sub: 'Skips icons, avatars and tracking pixels' },
    { type: 'pair', keys: ['maxWidth', 'maxHeight'], label: 'Maximum size', sub: '0 × 0 = no limit' },
    { type: 'types', label: 'File types' },
    { type: 'num', key: 'minFileKB', label: 'Minimum file size', unit: 'KB' },
    { type: 'num', key: 'maxFileMB', label: 'Maximum file size', unit: 'MB', sub: '0 = no limit' },
    { type: 'seg', key: 'orientation', label: 'Orientation', opts: [['any', 'Any'], ['landscape', 'Landscape'], ['portrait', 'Portrait'], ['square', 'Square']] },
    { type: 'num', key: 'minAspect', label: 'Stretched shapes only', sub: 'e.g. 1.6 = only very wide or tall images · 0 = off', step: 0.1 },
    { type: 'num', key: 'maxImagesPerUrl', label: 'Max images per URL', sub: '0 = no limit' }
  ] },
  { title: 'WHAT TO GRAB', icon: 'target', rows: [
    { type: 'toggle', key: 'grabLargest', label: 'Grab the largest version', sub: 'Picks the biggest size a site offers (srcset)' },
    { type: 'toggle', key: 'includeLinkedImages', label: 'Full-size images behind thumbnails', sub: 'Follows thumbnail links straight to the big file' },
    { type: 'toggle', key: 'smartFullSize', label: 'Smart full-size', sub: 'Tries the original of resized copies first (WordPress, CDNs)' },
    { type: 'toggle', key: 'siteBoosters', label: 'Big-site boosters', sub: 'Full-size originals on Reddit, Imgur, Pinterest, X, Tumblr, Flickr, ArtStation, DeviantArt, Wallhaven, Wikipedia and image boards' },
    { type: 'toggle', key: 'skipPreviewsOfLinked', label: 'Skip previews when the full image is linked', sub: 'Stops thread pages saving every picture twice (preview + full size)' },
    { type: 'toggle', key: 'includeCssBackgrounds', label: 'CSS background images' },
    { type: 'toggle', key: 'includeNetworkImages', label: 'Anything the page loaded', sub: 'Catches images built by scripts' },
    { type: 'toggle', key: 'includeSharePreviews', label: 'Share-preview images', sub: 'og:image and twitter:image' },
    { type: 'toggle', key: 'includeInlineSvg', label: 'Inline SVG drawings', sub: 'Saves logos/icons drawn in the page as .svg' },
    { type: 'toggle', key: 'includeDataUris', label: 'Embedded (data:) images' },
    { type: 'toggle', key: 'includeFavicons', label: 'Site icons (favicons)' }
  ] },
  { title: 'DUPLICATES', icon: 'copy', rows: [
    { type: 'toggle', key: 'skipExactDupes', label: 'Skip images you already have', sub: 'Same file in your folder or saved before. Delete an image and it can be grabbed again.' },
    { type: 'toggle', key: 'skipNearDupes', label: 'Skip look-alikes', sub: 'Resized or recompressed copies of an image you already have' }
  ] },
  { title: 'SAVING', icon: 'save', rows: [
    { type: 'seg', key: 'folderLayout', label: 'Folders', sub: 'Page title = one folder per thread or page', opts: [['title', 'Page title'], ['site-title', 'Site → page'], ['site', 'Per site'], ['site-date', 'Site + date'], ['one', 'One folder']] },
    { type: 'text', key: 'namePattern', label: 'File name pattern', sub: 'Tokens: {original} {site} {date} {time} {n} {n:3} {wxh} {title} {alt} {page} {hash}', width: 200 },
    { type: 'seg', key: 'onConflict', label: 'If the name exists', opts: [['rename', 'Rename'], ['skip', 'Skip'], ['overwrite', 'Overwrite']] },
    { type: 'toggle', key: 'fixExtensions', label: 'Fix wrong file extensions', sub: 'A ".jpg" that is really WEBP gets the right name' },
    { type: 'seg', key: 'convertModern', label: 'Convert WEBP / AVIF', sub: 'For apps that can\'t open the newer formats', opts: [['off', 'Keep'], ['jpg', 'To JPG'], ['png', 'To PNG']] },
    { type: 'toggle', key: 'keepServerDate', label: 'Keep the original file date', sub: 'Uses the date the server says the image was made' },
    { type: 'toggle', key: 'saveSidecarJson', label: 'Save source info next to each image', sub: '.json with page URL, image URL, size, date' },
    { type: 'toggle', key: 'scanSubfolder', label: 'New folder for each scan', sub: 'Every scan saves into its own dated folder' },
    { type: 'seg', key: 'autoSort', label: 'Auto-sort into subfolders', opts: [['off', 'Off'], ['orientation', 'Landscape / Portrait'], ['resolution', '4K / HD / smaller'], ['format', 'By format']] },
    { type: 'note', label: 'Per-URL folders: right-click any URL in the queue → "Save this one to a folder…"' }
  ] },
  { title: 'SAFETY LIMITS', icon: 'shield', rows: [
    { type: 'num', key: 'stopAfterImages', label: 'Stop after this many images', sub: '0 = no limit' },
    { type: 'num', key: 'stopAfterMB', label: 'Stop after this much data', unit: 'MB', sub: '0 = no limit' },
    { type: 'num', key: 'minFreeGB', label: 'Stop when the drive has less than', unit: 'GB free', sub: 'Protects your PC from filling up' }
  ] },
  { title: 'PAGE LOADING', icon: 'download', rows: [
    { type: 'toggle', key: 'autoScroll', label: 'Auto-scroll to load lazy images', sub: 'Infinite feeds and lazy galleries' },
    { type: 'num', key: 'maxScrollScreens', label: 'Max scroll per page', unit: 'screens' },
    { type: 'num', key: 'settleMs', label: 'Wait after each scroll', unit: 'ms', sub: 'Raise it for slow sites' },
    { type: 'toggle', key: 'clickLoadMore', label: 'Click "Load more" buttons' },
    { type: 'toggle', key: 'followPagination', label: 'Follow "Next page" links' },
    { type: 'num', key: 'maxPages', label: 'Max next pages per URL' },
    { type: 'seg', key: 'followLinks', label: 'Follow links', sub: 'Also scan pages this page links to', opts: [[0, 'Off'], [1, '1 deep'], [2, '2 deep']] },
    { type: 'toggle', key: 'followSameSiteOnly', label: 'Stay on the same site' },
    { type: 'area', key: 'linkInclude', label: 'Only follow links matching', sub: 'One per line. * = anything, /regex/ works', ph: '*/gallery/*' },
    { type: 'area', key: 'linkExclude', label: 'Never follow links matching', ph: '*/tag/*\n*/comments/*' },
    { type: 'num', key: 'pageTimeoutSec', label: 'Page timeout', unit: 'sec' },
    { type: 'toggle', key: 'useSignIns', label: 'Use my saved sign-ins', sub: 'Log in once in Settings → Sign-ins; scans reuse it' }
  ] },
  { title: 'URL FILTERS', icon: 'shield', rows: [
    { type: 'area', key: 'urlInclude', label: 'Only grab image URLs matching', sub: 'Leave empty to allow everything', ph: '*/uploads/*\n/\\/full\\//' },
    { type: 'area', key: 'urlExclude', label: 'Never grab image URLs matching (junk filter)', sub: 'Skips logos, icons, avatars, ads, banners… edit freely', ph: '*avatar*\n*logo*\n*/ads/*' },
    { type: 'blocked', label: 'Blocked sites', sub: '"Never grab from here" adds sites to this list' },
    { type: 'rewrites', label: 'URL rewrite rules', sub: 'Turn thumbnail URLs into full-size ones. Find (regex) → replace' }
  ] },
  { title: 'SPEED & POLITENESS', icon: 'bolt', rows: [
    { type: 'num', key: 'pagesAtOnce', label: 'Pages at once', min: 1, max: 8 },
    { type: 'num', key: 'downloadsAtOnce', label: 'Downloads at once', min: 1, max: 32 },
    { type: 'num', key: 'delayMs', label: 'Delay between requests (per site)', unit: 'ms' },
    { type: 'num', key: 'retries', label: 'Retries on failure', sub: 'Backs off automatically on 429 / 503', max: 10 },
    { type: 'num', key: 'bandwidthKBs', label: 'Bandwidth cap', unit: 'KB/s', sub: '0 = unlimited' },
    { type: 'toggle', key: 'respectRobots', label: 'Respect robots.txt' }
  ] },
  { title: 'IDENTITY & NETWORK', icon: 'globe', rows: [
    { type: 'ua', key: 'userAgent', label: 'Browse as', sub: 'Some sites show bigger images to desktop browsers' },
    { type: 'seg', key: 'referrerMode', label: 'Send referrer', sub: 'Many sites block hotlinking without it', opts: [['page', 'Page URL'], ['none', 'None']] },
    { type: 'area', key: 'customHeaders', label: 'Extra request headers', sub: 'One per line, "Name: value"', ph: 'Authorization: Bearer …' },
    { type: 'text', key: 'proxy', label: 'Proxy', sub: 'http://host:port or socks5://host:port · empty = system', width: 220 }
  ] }
];

function ruleRow(row) {
  const r = S.rules;
  const lbl = `<div class="lbl"><div>${esc(row.label)}</div>${row.sub ? `<div class="sub">${esc(row.sub)}</div>` : ''}</div>`;
  switch (row.type) {
    case 'toggle': return `<div class="rowx">${lbl}<div class="ctl"><button class="toggle" aria-pressed="${!!r[row.key]}" aria-label="${esc(row.label)}" data-rk="${row.key}" data-rt="toggle"></button></div></div>`;
    case 'num': return `<div class="rowx">${lbl}<div class="ctl"><input class="input num" type="number" min="${row.min ?? 0}" ${row.max ? `max="${row.max}"` : ''} step="${row.step || 1}" value="${r[row.key]}" data-rk="${row.key}" data-rt="num" aria-label="${esc(row.label)}">${row.unit ? `<span class="times">${row.unit}</span>` : ''}</div></div>`;
    case 'pair': return `<div class="rowx">${lbl}<div class="ctl"><input class="input num" style="width:80px" type="number" min="0" value="${r[row.keys[0]]}" data-rk="${row.keys[0]}" data-rt="num" aria-label="Width"><span class="times">×</span><input class="input num" style="width:80px" type="number" min="0" value="${r[row.keys[1]]}" data-rk="${row.keys[1]}" data-rt="num" aria-label="Height"><span class="times">px</span></div></div>`;
    case 'seg': return `<div class="rowx">${lbl}<div class="ctl"><div class="seg">${row.opts.map(([v, t]) => `<button class="${String(r[row.key]) === String(v) ? 'on' : ''}" data-rk="${row.key}" data-rt="seg" data-v="${v}">${t}</button>`).join('')}</div></div></div>`;
    case 'text': return `<div class="rowx">${lbl}<div class="ctl"><input class="input mono" style="width:${row.width || 200}px;font-size:12.5px" value="${esc(r[row.key])}" data-rk="${row.key}" data-rt="text" spellcheck="false" aria-label="${esc(row.label)}"></div></div>`;
    case 'area': return `<div class="rowx stack">${lbl}<div class="ctl"><textarea class="textarea" rows="2" placeholder="${esc(row.ph || '')}" data-rk="${row.key}" data-rt="text" spellcheck="false" aria-label="${esc(row.label)}">${esc(r[row.key])}</textarea></div></div>`;
    case 'types': return `<div class="rowx stack">${lbl}<div class="ctl"><div class="seg">${Object.keys(r.types).map((t) => `<button class="${r.types[t] ? 'on' : ''}" data-rt="type" data-v="${t}">${t.toUpperCase()}</button>`).join('')}</div></div></div>`;
    case 'ua': {
      const known = Object.prototype.hasOwnProperty.call(UA, r.userAgent || '');
      return `<div class="rowx">${lbl}<div class="ctl"><select class="select" data-rt="ua" style="width:230px">${Object.entries(UA).map(([v, t]) => `<option value="${esc(v)}" ${(r.userAgent || '') === v ? 'selected' : ''}>${t}</option>`).join('')}<option value="__custom" ${known ? '' : 'selected'}>Custom…</option></select></div></div>${known ? '' : `<div class="rowx"><div class="lbl"><div>Custom user agent</div></div><div class="ctl"><input class="input mono" style="width:330px;font-size:12px" value="${esc(r.userAgent)}" data-rk="userAgent" data-rt="text"></div></div>`}`;
    }
    case 'blocked': return `<div class="rowx stack">${lbl}<div class="ctl" style="flex-direction:column;align-items:stretch;gap:8px"><div class="taglist">${(r.blockedDomains || []).map((d) => `<span class="tag">${esc(d)}<button data-unblock="${esc(d)}" aria-label="Unblock ${esc(d)}">${ico('x', 12)}</button></span>`).join('') || '<span class="times" style="font-size:12px">Nothing blocked</span>'}</div><div style="display:flex;gap:6px"><input class="input mono" id="block-input" placeholder="ads.example.com" style="flex:1;font-size:12.5px"><button class="btn" id="block-add">Block</button></div></div></div>`;
    case 'rewrites': return `<div class="rowx stack">${lbl}<div class="ctl" style="flex-direction:column;align-items:stretch;gap:8px">${(r.rewriteRules || []).map((x, i) => `<div style="display:flex;gap:6px;align-items:center"><input class="input mono" style="flex:1;font-size:12px" value="${esc(x.find)}" data-rw="${i}" data-rwk="find" placeholder="find (regex)"><span class="times">→</span><input class="input mono" style="flex:1;font-size:12px" value="${esc(x.replace)}" data-rw="${i}" data-rwk="replace" placeholder="replace"><button class="btn icon sm ghost" data-rwdel="${i}" aria-label="Remove rule">${ico('x', 14)}</button></div>`).join('')}<div><button class="btn sm" id="rw-add">+ Add rule</button> <span class="times" style="font-size:11.5px;margin-left:8px">e.g. <code>/thumbs/</code> → <code>/originals/</code></span></div></div></div>`;
    case 'note': return `<div class="rowx"><div class="lbl"><div class="sub" style="color:var(--text2)">${esc(row.label)}</div></div></div>`;
    default: return '';
  }
}

function renderRules() {
  const root = $('#rules-root');
  const sel = presetList().find((p) => p.id === S.app.activePreset);
  root.innerHTML = `
    <div class="page-head">
      <div><h1>Rules &amp; filters</h1><p>Everything here applies to the next scan. Save setups as presets and switch in one click.</p></div>
      <div class="tools">
        <label class="times" for="preset-rules" style="font-size:12px">Preset</label>
        <select class="select preset-select" id="preset-rules" style="width:230px"></select>
        <button class="btn" id="preset-save">Save as preset</button>
        ${sel && !sel.builtIn ? '<button class="btn danger" id="preset-del">Delete preset</button>' : ''}
        <button class="btn ghost" id="rules-reset">Reset to defaults</button>
      </div>
    </div>
    <div class="cards">${RULE_SECTIONS.map((s) => `<section class="card"><div class="ch">${ico(s.icon)}<h2>${s.title}</h2></div>${s.rows.map(ruleRow).join('')}</section>`).join('')}</div>
    <div class="preview-name"><span class="label">File name preview</span><span class="p" id="name-preview"></span></div>`;
  renderPresetSelects();
  updateNamePreview();
}
function updateNamePreview() {
  const el = $('#name-preview'); if (!el) return;
  const r = S.rules, d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const site = 'wallhaven-cc';
  const folder = { one: '', url: 'wallhaven.cc_toplist\\', site: site + '\\', 'site-date': `${site}\\${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}\\`, title: 'Wallhaven - Toplist\\', 'site-title': 'Wallhaven\\Toplist\\' }[r.folderLayout] || '';
  let name = (r.namePattern || '{original}').replace(/\{n(?::(\d))?\}/g, (_, w) => String(418).padStart(+(w || 4), '0'))
    .replace(/\{original\}/g, 'wallhaven-6d7xmx').replace(/\{site\}/g, site).replace(/\{date\}/g, `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`)
    .replace(/\{time\}/g, `${p2(d.getHours())}-${p2(d.getMinutes())}-${p2(d.getSeconds())}`).replace(/\{wxh\}/g, '3840x2160').replace(/\{w\}/g, '3840').replace(/\{h\}/g, '2160')
    .replace(/\{title\}/g, 'Toplist Wallpapers').replace(/\{alt\}/g, 'mountain lake').replace(/\{page\}/g, 'toplist').replace(/\{hash\}/g, '9f2c1ab07e');
  const ext = r.convertModern !== 'off' ? r.convertModern : 'jpg';
  el.innerHTML = `${esc(S.app.outputDir || '')}\\<em>${esc(folder)}</em><em>${esc(name)}</em>.${ext}`;
}

function onRulesInput(e) {
  const t = e.target;
  const rt = t.dataset.rt;
  if (rt === 'num') {
    let v = parseFloat(t.value); if (isNaN(v)) v = 0;
    if (t.min !== '' && v < +t.min) v = +t.min;
    if (t.max !== '' && v > +t.max) v = +t.max;
    S.rules[t.dataset.rk] = v;
  } else if (rt === 'text') {
    S.rules[t.dataset.rk] = t.value;
  } else if (t.dataset.rw != null) {
    const i = +t.dataset.rw; S.rules.rewriteRules[i][t.dataset.rwk] = t.value;
  } else if (rt === 'ua') {
    if (t.value === '__custom') { S.rules.userAgent = S.rules.userAgent && !UA[S.rules.userAgent] ? S.rules.userAgent : 'Mozilla/5.0 '; renderRules(); }
    else { S.rules.userAgent = t.value; renderRules(); }
  } else return;
  markCustom(); saveRules(); updateNamePreview();
}
function onRulesClick(e) {
  const b = e.target.closest('button'); if (!b) return;
  const rt = b.dataset.rt;
  if (rt === 'toggle') { S.rules[b.dataset.rk] = !S.rules[b.dataset.rk]; b.setAttribute('aria-pressed', String(S.rules[b.dataset.rk])); markCustom(); saveRules(); return; }
  if (rt === 'seg') {
    let v = b.dataset.v; if (/^\d+$/.test(v)) v = +v;
    S.rules[b.dataset.rk] = v; $$(`[data-rk="${b.dataset.rk}"][data-rt="seg"]`).forEach((x) => x.classList.toggle('on', x === b)); markCustom(); saveRules(); updateNamePreview(); return;
  }
  if (rt === 'type') { const k = b.dataset.v; S.rules.types[k] = !S.rules.types[k]; b.classList.toggle('on', S.rules.types[k]); markCustom(); saveRules(); return; }
  if (b.dataset.unblock) { S.rules.blockedDomains = S.rules.blockedDomains.filter((d) => d !== b.dataset.unblock); saveRules(); renderRules(); return; }
  if (b.id === 'block-add') { const v = $('#block-input').value.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, ''); if (v) { S.rules.blockedDomains = Array.from(new Set([...(S.rules.blockedDomains || []), v])); saveRules(); renderRules(); } return; }
  if (b.id === 'rw-add') { S.rules.rewriteRules = [...(S.rules.rewriteRules || []), { find: '', replace: '' }]; saveRules(); renderRules(); return; }
  if (b.dataset.rwdel != null) { S.rules.rewriteRules.splice(+b.dataset.rwdel, 1); saveRules(); renderRules(); return; }
  if (b.id === 'preset-save') { savePresetDialog(); return; }
  if (b.id === 'preset-del') {
    const id = S.app.activePreset; const p = S.presets[id];
    confirmBox('Delete preset?', `Delete <b>${esc(p ? p.name : id)}</b>? Your current settings stay as they are.`, 'Delete', true).then((ok) => {
      if (!ok) return; delete S.presets[id]; R.saveSettings({ presets: S.presets }); saveApp({ activePreset: 'custom' }); renderRules(); renderPresetSelects();
    });
    return;
  }
  if (b.id === 'rules-reset') {
    confirmBox('Reset all rules?', 'Every filter and option goes back to its default. Blocked sites and rewrite rules are kept.', 'Reset').then((ok) => {
      if (!ok) return; const keep = { blockedDomains: S.rules.blockedDomains, rewriteRules: S.rules.rewriteRules };
      S.rules = Object.assign(clone(S.defaults), keep); saveApp({ activePreset: 'everything' }); saveRules(); renderRules(); toast('Rules reset');
    });
  }
}
async function savePresetDialog() {
  const r = await modal({ title: 'Save as preset', ok: 'Save preset', body: `<label>Preset name<input class="input" name="name" placeholder="e.g. Reddit wallpapers" maxlength="40"></label><div class="times" style="font-size:12px">Saves every rule and filter exactly as they are now.</div>` });
  if (!r || !r.name.trim()) return;
  const id = 'u-' + uid();
  S.presets[id] = { name: r.name.trim(), rules: clone(S.rules) };
  await R.saveSettings({ presets: S.presets });
  saveApp({ activePreset: id });
  renderPresetSelects(); if (S.page === 'rules') renderRules();
  toast(`Saved preset "${esc(r.name.trim())}"`);
}

// =====================================================================
// HISTORY
// =====================================================================
async function renderHistory() {
  const root = $('#history-root');
  const hist = await R.getHistory();
  const totals = hist.reduce((a, h) => ({ saved: a.saved + (h.saved || 0), bytes: a.bytes + (h.bytes || 0) }), { saved: 0, bytes: 0 });
  root.innerHTML = `
    <div class="page-head"><div><h1>History</h1><p>${hist.length ? `${fmtNum(hist.length)} scan${hist.length === 1 ? '' : 's'} · ${fmtNum(totals.saved)} images · ${fmtBytes(totals.bytes)} this session` : 'Scans you run show up here until you close Slim Reaper.'}</p></div>
      <div style="display:flex;gap:8px;align-items:center">${hist.length ? `<button class="btn sm danger" data-hclear>${ico('x', 14)} Clear</button>` : ''}</div></div>
    <div class="hlist">${hist.map((h) => `
      <div class="hitem" data-h="${esc(h.id)}">
        <div class="thumbs" data-hthumbs="${esc(h.id)}"></div>
        <div class="info">
          <span class="when">${new Date(h.startedAt).toLocaleString()}${h.finishedAt ? ` · took ${fmtDur(h.finishedAt - h.startedAt)}` : ' · <span style="color:var(--accent)">running</span>'} ${h.stopped ? '<span class="pill warn">stopped</span>' : ''} ${h.presetName ? `<span class="pill">${esc(h.presetName)}</span>` : ''}</span>
          <span class="urls" title="${esc((h.urls || []).join('\n'))}">${esc(shortUrl((h.urls || [])[0] || ''))}${(h.urls || []).length > 1 ? ` <span class="times">+${h.urls.length - 1} more</span>` : ''}</span>
          <span class="nums"><span><b>${fmtNum(h.saved)}</b> saved</span><span>${fmtNum(h.skipped)} skipped</span><span>${fmtBytes(h.bytes || 0)}</span><span class="times" title="${esc(h.outDir)}">${esc(h.outDir)}</span></span>
        </div>
        <div class="acts">
          <button class="btn sm" data-ha="folder">${ico('folder', 14)} Open folder</button>
          <button class="btn sm" data-ha="rerun" title="Put these URLs back in the queue">Re-run</button>
          <button class="btn sm" data-ha="rename" title="Rename the folder these images are in">Rename</button>
          <button class="btn sm icon" data-ha="report" title="Export CSV report">${ico('download', 15)}</button>
          <button class="btn sm icon ghost" data-ha="delete" title="Remove from History (files stay)">${ico('x', 15)}</button>
        </div>
      </div>`).join('') || `<div class="empty"><div class="big">NOTHING REAPED YET</div><div>Run a scan and it'll show here until you close the app. Nothing is saved to your PC.</div></div>`}</div>`;
  for (const h of hist.slice(0, 40)) {
    R.getSessionImages(h.id).then((imgs) => {
      const box = $(`[data-hthumbs="${CSS.escape(h.id)}"]`); if (!box) return;
      box.innerHTML = imgs.slice(-4).reverse().map((i) => `<img src="${fileUrl(i.thumb || i.path)}" loading="lazy" alt="" onerror="this.style.visibility='hidden'">`).join('');
    });
  }
}
async function onHistoryClick(e) {
  if (e.target.closest('[data-hclear]')) { await R.clearHistory(); toast('History cleared · files kept'); return renderHistory(); }
  const b = e.target.closest('[data-ha]'); if (!b) return;
  const id = b.closest('[data-h]').dataset.h;
  const hist = await R.getHistory(); const h = hist.find((x) => x.id === id); if (!h) return;
  const a = b.dataset.ha;
  if (a === 'rerun') { await addUrls(h.urls || [], { silent: true }); S.queue.forEach((q) => { if ((h.urls || []).includes(q.url) && !ACTIVE.includes(q.status)) Object.assign(q, { status: 'queued', note: 'Waiting', progress: 0 }); }); renderQueue(); saveQueue(); go('scan'); toast(`${(h.urls || []).length} URL(s) back in the queue — hit REAP`); }
  if (a === 'folder') { const f = await R.sessionFolders(id); R.openPath(f.length === 1 && f[0].exists ? f[0].dir : h.outDir); }
  if (a === 'rename') {
    const folders = (await R.sessionFolders(id)).filter((f) => f.exists);
    if (!folders.length) return toast('Those folders are gone', 'warn');
    const r = await modal({ title: 'Rename folder', ok: 'Rename',
      body: `${folders.length > 1 ? `<label>Which folder<select class="select" name="which">${folders.map((f, i) => `<option value="${i}">${esc(f.name)} (${f.count})</option>`).join('')}</select></label>` : `<div class="times" style="font-size:12px;word-break:break-all">${esc(folders[0].dir)}</div>`}
        <label>New name<input class="input" name="name" value="${esc(folders[0].name)}" spellcheck="false"></label>` });
    if (!r) return;
    const f = folders[+(r.which || 0)];
    const res = await R.renameFolder({ from: f.dir, name: r.name });
    if (!res.ok) return toast(esc(res.error), 'warn');
    toast('Renamed to ' + esc(res.to.split(/[\\/]/).pop()));
    renderHistory();
  }
  if (a === 'report') R.exportReport(id);
  if (a === 'delete') { await R.deleteSession(id); renderHistory(); }

}

// =====================================================================
// SETTINGS
// =====================================================================
async function renderSettings() {
  const root = $('#settings-root');
  const a = S.app;
  const signins = await R.listSignIns().catch(() => []);
  const sched = S.st.settings.schedules || [];
  const tog = (k, label, sub) => `<div class="rowx"><div class="lbl"><div>${label}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div><div class="ctl"><button class="toggle" aria-pressed="${!!a[k]}" data-ak="${k}" aria-label="${esc(label)}"></button></div></div>`;
  const mem = S.memoryCount || 0;
  root.innerHTML = `
    <div class="page-head"><div><h1>Settings</h1><p>How Slim Reaper looks and behaves. Scan rules live on the Rules page.</p></div>
      <div class="tools"><button class="btn" id="set-export">Export settings</button><button class="btn" id="set-import">Import settings</button></div></div>
    <div class="cards">
      <section class="card"><div class="ch">${ico('monitor')}<h2>APPEARANCE</h2></div>
        <div class="rowx"><div class="lbl"><div>Accent color</div><div class="sub">Matches the logo versions</div></div><div class="ctl"><div class="seg">${Object.entries(S.accents).map(([k, v]) => `<button class="${a.accent === k ? 'on' : ''}" data-accent="${k}" style="${a.accent === k ? '' : `color:${v.a}`}">${v.name}</button>`).join('')}</div></div></div>
        <div class="rowx"><div class="lbl"><div>Thumbnail size</div></div><div class="ctl"><div class="seg">${[['s', 'Small'], ['m', 'Medium'], ['l', 'Large']].map(([k, t]) => `<button class="${a.thumbSize === k ? 'on' : ''}" data-thumb="${k}">${t}</button>`).join('')}</div></div></div>
        ${tog('showSplash', 'Show the splash screen on launch')}
      </section>
      <section class="card"><div class="ch">${ico('link')}<h2>WHEN I ADD A URL</h2></div>
        ${tog('autoStartOnAdd', 'Start scanning right away', 'Paste a link, press Enter, done. Joins any scan already running.')}
        ${tog('watchNewThreads', 'Watch every thread I add', 'Thread pages (forums, image boards, Reddit) get re-checked every 5 min for 24 hours, stopping when the thread dies')}
      </section>
      <section class="card"><div class="ch">${ico('bell')}<h2>WHEN A SCAN FINISHES</h2></div>
        ${tog('notifyWhenDone', 'Windows notification', 'Click it to open the folder')}
        ${tog('soundWhenDone', 'Play a sound')}
        ${tog('openFolderWhenDone', 'Open the folder automatically')}
      </section>
      <section class="card"><div class="ch">${ico('monitor')}<h2>WINDOW & STARTUP</h2></div>
        ${tog('minimizeToTray', 'Minimize to tray', 'Keeps scanning in the background; the tray icon has pause/stop')}
        ${tog('closeToTray', 'Close button hides to tray', 'Quit from the tray icon instead')}
        ${tog('launchAtStartup', 'Start with Windows', 'Starts hidden in the tray so scheduled scans can run')}
      </section>
      <section class="card"><div class="ch">${ico('clipboard')}<h2>CLIPBOARD</h2></div>
        ${tog('clipboardWatch', 'Watch the clipboard', 'Any URL you copy anywhere gets added to the queue automatically')}
        <div class="rowx"><div class="lbl"><div>Paste shortcut</div><div class="sub">Ctrl+V anywhere in the app adds the URLs you copied</div></div></div>
      </section>
      <section class="card"><div class="ch">${ico('key')}<h2>SIGN-INS</h2><span class="x times" style="font-size:12px">${signins.length} site${signins.length === 1 ? '' : 's'}</span></div>
        <div class="rowx stack"><div class="lbl"><div>Sign in to a site</div><div class="sub">Opens a browser window. Log in normally, close it, and scans can see what you can see.</div></div>
          <div class="ctl" style="display:flex;gap:6px"><input class="input" id="signin-url" placeholder="https://site.com/login" style="flex:1"><button class="btn primary" id="signin-go">Open</button></div></div>
        ${signins.map((s) => `<div class="rowx"><div class="lbl"><div class="mono" style="font-size:13px">${esc(s.domain)}</div><div class="sub">${s.count} cookie${s.count === 1 ? '' : 's'} saved</div></div><div class="ctl"><button class="btn sm" data-signout="${esc(s.domain)}">Sign out</button></div></div>`).join('') || '<div class="rowx"><div class="lbl"><div class="sub">No saved sign-ins yet.</div></div></div>'}
      </section>
      <section class="card"><div class="ch">${ico('clock')}<h2>SCHEDULED SCANS</h2><button class="btn sm x" id="sched-add">+ New schedule</button></div>
        ${sched.map((s) => `<div class="rowx"><div class="lbl"><div>${esc(s.name)}</div><div class="sub">${s.urls.length} URL${s.urls.length === 1 ? '' : 's'} · every ${s.everyHours}h · ${s.lastRun ? 'last ran ' + new Date(s.lastRun).toLocaleString() : 'not run yet'}</div></div><div class="ctl"><button class="btn sm ghost" data-sedit="${s.id}">Edit</button><button class="btn sm ghost icon" data-sdel="${s.id}" aria-label="Delete schedule">${ico('trash', 14)}</button><button class="toggle" aria-pressed="${!!s.enabled}" data-stog="${s.id}" aria-label="Enabled"></button></div></div>`).join('') || '<div class="rowx"><div class="lbl"><div class="sub">Re-scan your favorite pages automatically and only save new images. Needs the app running (tray is fine).</div></div></div>'}
      </section>
      <section class="card"><div class="ch">${ico('brain')}<h2>FILES & DATA</h2></div>
        <div class="rowx"><div class="lbl"><div>Nothing is remembered</div><div class="sub">History lasts until you close the app. Removing things in Slim Reaper never deletes files from your PC. Only your settings are saved.</div></div></div>
        <div class="rowx"><div class="lbl"><div>Default save folder</div><div class="sub mono" style="word-break:break-all">${esc(a.outputDir || S.st.defaultOutDir)}</div></div><div class="ctl"><button class="btn sm" id="set-folder">Change</button></div></div>
      </section>
      <section class="card"><div class="ch">${ico('keyboard')}<h2>KEYBOARD SHORTCUTS</h2></div>
        ${[['Start reaping', 'Ctrl + Enter'], ['Pause / resume', 'Space'], ['Stop', 'Ctrl + Shift + X'], ['Paste URLs from clipboard', 'Ctrl + V'], ['Import a URL list', 'Ctrl + O'], ['Scan · Dupes · History · Rules', 'Ctrl + 1 … 4'], ['Select several images', 'Ctrl/Shift + click · Ctrl + A'], ['Remove selected from the app', 'Delete'], ['Settings', 'Ctrl + ,'], ['Viewer: previous / next', '← →'], ['Viewer: zoom', 'Mouse wheel · + / − · 0 fit · 1 actual size'], ['Viewer: remove from the app', 'Delete']].map(([k, v]) => `<div class="rowx"><div class="lbl"><div>${k}</div></div><div class="ctl"><span class="times" style="font-size:12px">${v}</span></div></div>`).join('')}
      </section>
      <section class="card"><div class="ch">${ico('info')}<h2>ABOUT</h2></div>
        <div class="rowx" style="gap:18px;justify-content:flex-start"><div style="width:84px;height:96px">${window.reaperSvg({ text: true })}</div><div class="lbl"><div class="brand" style="font-size:22px;transform:skewX(-8deg);transform-origin:left"><b>SLIM</b> REAPER</div><div class="sub">Version ${esc(S.st.version)} · A Slim Industries app</div><div class="sub">slimindustries.apps@gmail.com</div></div></div>
        <div class="rowx"><div class="lbl"><div>Something not working?</div><div class="sub">Saves one file with the log and settings (no passwords) to send to Claude</div></div><div class="ctl"><button class="btn sm" id="report-btn">${ico('bug', 15)} Report a problem</button></div></div>
        <div class="rowx"><div class="lbl"><div class="sub" style="line-height:1.5">Images you save belong to their creators. Grab for personal use, and check a site's terms before reposting anything.</div></div></div>
      </section>
    </div>`;
}

async function scheduleDialog(existing) {
  const s = existing || { name: '', urls: [], everyHours: 24, presetId: '', outDir: '', enabled: true };
  const presets = presetList();
  const r = await modal({
    title: existing ? 'Edit schedule' : 'New scheduled scan', ok: existing ? 'Save' : 'Create schedule',
    body: `<label>Name<input class="input" name="name" value="${esc(s.name)}" placeholder="e.g. Daily wallpapers"></label>
      <label>URLs (one per line)<textarea class="textarea" name="urls" rows="5" placeholder="https://…">${esc(s.urls.join('\n'))}</textarea></label>
      <div style="display:flex;gap:12px"><label style="flex:1">Run every<select class="select" name="everyHours">${[[1, '1 hour'], [3, '3 hours'], [6, '6 hours'], [12, '12 hours'], [24, 'day'], [72, '3 days'], [168, 'week']].map(([v, t]) => `<option value="${v}" ${+s.everyHours === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label style="flex:1">Preset<select class="select" name="presetId"><option value="">My current rules</option>${presets.map((p) => `<option value="${p.id}" ${s.presetId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label></div>
      <label>Save to (empty = default folder)<input class="input mono" name="outDir" value="${esc(s.outDir)}" placeholder="${esc(S.app.outputDir)}" style="font-size:12.5px"></label>
      <div class="times" style="font-size:12px;line-height:1.5">Scheduled scans only save images you don't already have.</div>`
  });
  if (!r) return;
  const urls = await R.extractUrls(r.urls || '');
  if (!urls.length) return toast('A schedule needs at least one URL', 'warn');
  const rec = Object.assign({}, s, { id: s.id || uid(), name: r.name.trim() || hostOf(urls[0]), urls, everyHours: +r.everyHours, presetId: r.presetId, outDir: r.outDir.trim() });
  const list = (S.st.settings.schedules || []).filter((x) => x.id !== rec.id);
  list.push(rec);
  S.st.settings.schedules = list;
  await R.saveSettings({ schedules: list });
  renderSettings();
  toast(existing ? 'Schedule saved' : `Scheduled "${esc(rec.name)}" every ${rec.everyHours}h`);
}

async function onSettingsClick(e) {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.ak) { const k = b.dataset.ak; saveApp({ [k]: !S.app[k] }); b.setAttribute('aria-pressed', String(S.app[k])); return; }
  if (b.dataset.accent) { saveApp({ accent: b.dataset.accent }); applyAccent(); renderSettings(); return; }
  if (b.dataset.thumb) { saveApp({ thumbSize: b.dataset.thumb }); applyAccent(); renderSettings(); renderChips(); return; }
  if (b.id === 'signin-go') { const u = $('#signin-url').value.trim(); if (!u) return toast('Type the site address first', 'warn'); R.signIn(u); return; }
  if (b.dataset.signout) { await R.signOut(b.dataset.signout); toast(`Signed out of ${esc(b.dataset.signout)}`); renderSettings(); return; }
  if (b.id === 'sched-add') return scheduleDialog();
  if (b.dataset.sedit) return scheduleDialog((S.st.settings.schedules || []).find((s) => s.id === b.dataset.sedit));
  if (b.dataset.sdel) { if (!(await confirmBox('Delete schedule?', 'It stops running. Images already saved stay.', 'Delete', true))) return; S.st.settings.schedules = S.st.settings.schedules.filter((s) => s.id !== b.dataset.sdel); await R.saveSettings({ schedules: S.st.settings.schedules }); renderSettings(); return; }
  if (b.dataset.stog) { const s = S.st.settings.schedules.find((x) => x.id === b.dataset.stog); s.enabled = !s.enabled; b.setAttribute('aria-pressed', String(s.enabled)); await R.saveSettings({ schedules: S.st.settings.schedules }); return; }
  if (b.id === 'mem-forget') { if (!(await confirmBox('Forget all remembered images?', 'Future scans may save images you already have (unless they\'re still in the output folder).', 'Forget', true))) return; S.memoryCount = await R.forgetMemory(); renderSettings(); updateStatusBar(); return; }
  if (b.id === 'set-folder') return changeFolder().then(renderSettings);
  if (b.id === 'report-btn') return reportProblem();

  if (b.id === 'set-export') return R.exportSettings();
  if (b.id === 'set-import') { const s = await R.importSettings(); if (s) { S.rules = s.rules; S.presets = s.presets; Object.assign(S.app, s.app); applyAccent(); renderSettings(); renderPresetSelects(); toast('Settings imported'); } }
}

// =====================================================================
// FOLDER
// =====================================================================
function renderFolder() { $('#folder-path').textContent = S.app.outputDir || S.st.defaultOutDir; $('#folder-path').title = S.app.outputDir; }
async function changeFolder() {
  const p = await R.pickFolder(S.app.outputDir);
  if (p) { saveApp({ outputDir: p }); renderFolder(); toast('Saving to ' + esc(p)); }
}
async function newFolder() {
  const r = await modal({ title: 'New folder', ok: 'Create & use', body: `<label>Folder name<input class="input" name="name" placeholder="e.g. Wallpapers"></label><label>Inside<input class="input mono" name="parent" value="${esc(S.app.outputDir || S.st.defaultOutDir)}" style="font-size:12.5px"></label>` });
  if (!r || !r.name.trim()) return;
  try { const p = await R.makeFolder({ parent: r.parent, name: r.name }); saveApp({ outputDir: p }); renderFolder(); toast('Created and saving to ' + esc(p)); }
  catch (err) { toast("Couldn't create that folder", 'err'); }
}

function updateStatusBar() {
  const r = S.rules;
  $('#sb-conc').textContent = `${r.pagesAtOnce} page${r.pagesAtOnce > 1 ? 's' : ''} · ${r.downloadsAtOnce} downloads at once`;
  $('#sb-polite').textContent = r.delayMs ? `polite: ${r.delayMs}ms per site` : 'no delay';
  $('#sb-mem').textContent = '';
}

// =====================================================================
// FILES DELETED OUTSIDE THE APP (live)
// =====================================================================
let removedToastN = 0, removedToastT = null;
function onFilesRemoved(paths) {
  const gone = new Set(paths);
  const ids = new Set();
  for (const x of S.images) if (gone.has(x.path)) ids.add(x.id);
  S.images = S.images.filter((x) => !gone.has(x.path));
  ids.forEach((id) => { $$(`[data-img="${CSS.escape(id)}"]`).forEach((t) => t.remove()); S.sel.delete(id); });
  if (S.dupes.groups) {
    S.dupes.groups = S.dupes.groups.map((g) => Object.assign({}, g, { items: g.items.filter((i) => !gone.has(i.path)) })).filter((g) => g.items.length > 1);
    paths.forEach((p) => S.dupes.ticked.delete(p));
    if (S.page === 'dupes') renderDupes();
  }
  if ($('#viewer').classList.contains('on')) {
    const cur = currentViewerImg();
    S.viewer.list = S.viewer.list.filter((x) => !gone.has(x.path));
    if (!S.viewer.list.length) closeViewer();
    else if (cur && gone.has(cur.path)) { S.viewer.i = Math.min(S.viewer.i, S.viewer.list.length - 1); showViewerImage(); }
    else S.viewer.i = Math.max(0, S.viewer.list.indexOf(cur));
  }
  updateWallEmpty(); renderChipsSoon(); updateSelBar();
  removedToastN += paths.length;
  clearTimeout(removedToastT);
  removedToastT = setTimeout(() => { if (removedToastN && !S.quietRemoval) toast(`${fmtNum(removedToastN)} image${removedToastN > 1 ? 's' : ''} removed`); removedToastN = 0; S.quietRemoval = false; }, 700);
}

// =====================================================================
// MULTI-SELECT (Ctrl/Shift click, Ctrl+A)
// =====================================================================
function gridList() { return S.images.filter(wallMatch).slice().reverse(); }
function selectedImages() { const all = gridList(); return all.filter((x) => S.sel.has(x.id)); }
function updateSelBar() {
  const n = S.sel.size;
  $('#selbar').classList.toggle('on', n > 0 && S.page === 'scan');
  $('#sel-count').textContent = `${fmtNum(n)} selected`;
}
function paintSelection() { $$('.tile[data-img]').forEach((t) => t.classList.toggle('sel', S.sel.has(t.dataset.img))); updateSelBar(); }
function clearSelection() { if (!S.sel.size) return; S.sel.clear(); S.selAnchor = null; paintSelection(); }
function tileClick(e, id) {
  const list = gridList();
  if (e.ctrlKey || e.metaKey) { S.sel.has(id) ? S.sel.delete(id) : S.sel.add(id); S.selAnchor = id; paintSelection(); return true; }
  if (e.shiftKey) {
    const a = list.findIndex((x) => x.id === (S.selAnchor || id)), b = list.findIndex((x) => x.id === id);
    const [from, to] = a < b ? [a, b] : [b, a];
    for (let i = Math.max(0, from); i <= to; i++) S.sel.add(list[i].id);
    paintSelection(); return true;
  }
  if (S.sel.size) { clearSelection(); }
  return false;
}
async function removeSelected() {
  const imgs = selectedImages(); if (!imgs.length) return;
  const gone = new Set(imgs.map((x) => x.path));
  await R.removeFromApp([...gone]);
  S.images = S.images.filter((x) => !gone.has(x.path));
  imgs.forEach((x) => $$(`[data-img="${CSS.escape(x.id)}"]`).forEach((t) => t.remove()));
  clearSelection(); updateWallEmpty(); renderChipsSoon();
  toast(`Removed ${fmtNum(imgs.length)} from the app · files kept`);
}
async function copyMoveSelected(move) {
  const imgs = selectedImages(); if (!imgs.length) return;
  S.quietRemoval = true;
  const r = await R.copyFiles({ paths: imgs.map((x) => x.path), move });
  if (!r) return;
  if (move) clearSelection();
  toast(`${move ? 'Moved' : 'Copied'} ${fmtNum(r.done)} image${r.done === 1 ? '' : 's'} to ${esc(r.dest)}${r.failed.length ? ` · ${r.failed.length} failed` : ''}`, r.failed.length ? 'warn' : '', { label: 'Open', fn: () => R.openPath(r.dest) });
}

// =====================================================================
// QUEUE ITEM MENU (per-URL folders, test)
// =====================================================================
function queueMenu(q, x, y) {
  const active = ACTIVE.includes(q.status);
  contextMenu(x, y, [
    { label: 'Open in browser', icon: 'ext', fn: () => R.openExternal(q.url) },
    { label: 'Test this URL', icon: 'target', fn: () => testUrl(q.url) },
    { label: 'Copy URL', icon: 'link', fn: () => { R.copyText(q.url); toast('URL copied'); } },
    ...(q.dir ? [{ label: 'Open its folder', icon: 'folder', fn: () => R.openPath(q.dir) }] : []),
    { label: S.jobFilter === q.id ? 'Show all images again' : 'Show only its images', icon: 'library', fn: () => setJobFilter(S.jobFilter === q.id ? null : q.id) },
    '-',
    q.watch ? { label: 'Stop watching', icon: 'x', fn: () => { delete q.watch; q.note = 'Stopped watching'; renderQueue(); saveQueue(); } }
      : { label: 'Watch for new images…', icon: 'clock', fn: () => watchDialog(q) },
    '-',
    { label: 'Save this one to a folder…', icon: 'folder', fn: async () => { const p = await R.pickAnyFolder({ title: 'Save images from this URL to…' }); if (p) { q.folder = p; renderQueue(); saveQueue(); } } },
    { label: 'Give it its own folder name…', icon: 'folder', fn: async () => {
      const r = await modal({ title: 'Folder for this URL', ok: 'Set folder', body: `<label>Folder name (inside your save folder)<input class="input" name="name" value="${esc(q.folder && !/[\\/]/.test(q.folder) ? q.folder : hostOf(q.url))}"></label><div class="times" style="font-size:12px">Images from <b>${esc(shortUrl(q.url))}</b> go straight into this folder.</div>` });
      if (r && r.name.trim()) { q.folder = r.name.trim(); renderQueue(); saveQueue(); }
    } },
    ...(q.folder ? [{ label: 'Use the normal folder again', icon: 'x', fn: () => { q.folder = ''; renderQueue(); saveQueue(); } }] : []),
    '-',
    ...(active ? [{ label: 'Skip this URL', icon: 'skip', fn: () => R.skipJob(q.id) }] : [
      { label: 'Run again', icon: 'retry', fn: () => { Object.assign(q, { status: 'queued', progress: 0, note: 'Waiting' }); renderQueue(); saveQueue(); if (S.running || S.app.autoStartOnAdd) startReap({ ids: [q.id] }); } },
      { label: 'Remove', icon: 'trash', cls: 'danger', fn: () => { S.queue = S.queue.filter((x) => x.id !== q.id); renderQueue(); saveQueue(); } }
    ])
  ]);
}

// =====================================================================
// WATCH A THREAD / PAGE (re-check for new images until it dies)
// =====================================================================
async function watchDialog(q) {
  const r = await modal({ title: 'Watch for new images', ok: 'Start watching',
    body: `<div style="color:var(--text2);line-height:1.5">Slim Reaper re-checks <b>${esc(shortUrl(q.url))}</b> and grabs only the new images, until the page is gone or the time runs out.</div>
      <div style="display:flex;gap:12px"><label style="flex:1">Check every<select class="select" name="every">${[[2, '2 minutes'], [5, '5 minutes'], [10, '10 minutes'], [30, '30 minutes'], [60, 'hour']].map(([v, t]) => `<option value="${v}" ${v === 5 ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label style="flex:1">Keep watching for<select class="select" name="hours">${[[3, '3 hours'], [12, '12 hours'], [24, '24 hours'], [72, '3 days'], [168, 'a week']].map(([v, t]) => `<option value="${v}" ${v === 24 ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
      <div class="times" style="font-size:12px">Keep the app open (minimized to the tray is fine).</div>` });
  if (!r) return;
  const now = Date.now();
  q.watch = { every: +r.every, until: now + +r.hours * 3600000, next: now };
  q.note = '';
  renderQueue(); saveQueue();
  toast(`Watching ${esc(shortUrl(q.url))} every ${r.every} min`);
  watchTick();
}
function watchTick() {
  const now = Date.now();
  for (const q of S.queue) if (q.watch && now > q.watch.until) { delete q.watch; q.note = 'Finished watching'; }
  const due = S.queue.filter((q) => q.watch && !q.watch.checking && q.watch.next <= now && !ACTIVE.includes(q.status));
  due.forEach((q) => { q.watch.checking = true; });
  if (due.length) startReap({ ids: due.map((q) => q.id), quiet: true });
  else if (S.queue.some((q) => q.watch)) renderQueue();
}
function watchJobFinished(q) {
  if (!q.watch) return;
  if (q.status === 'gone') { delete q.watch; q.note = 'Thread is gone — stopped watching'; toast(`${esc(shortUrl(q.url))} is gone — stopped watching`, 'warn'); saveQueue(); return; }
  q.watch.checking = false;
  q.watch.next = Date.now() + q.watch.every * 60000;
  q.note = q.saved ? `+${q.saved} new last check` : 'No new images last check';
  saveQueue();
}

// =====================================================================
// TEST A URL (dry run)
// =====================================================================
async function testUrl(url) {
  if (!url) {
    const v = $('#url-input').value.trim();
    const urls = v ? await R.extractUrls(v) : [];
    url = urls[0] || (S.queue.find((q) => q.status === 'queued') || S.queue[0] || {}).url;
  }
  if (!url) return toast('Type or paste a URL first, then press Test', 'warn');
  let result = null;
  const done = modal({ title: 'Test: ' + shortUrl(url).slice(0, 60), ok: 'Add to queue', cancel: 'Close',
    body: `<div id="test-body" class="empty" style="padding:50px"><div class="dot pulse" style="width:12px;height:12px"></div><div>Opening the page and scrolling, like a real scan. Nothing is downloaded.<br>This takes 10–40 seconds.</div></div>`,
    onOpen: (m) => m.classList.add('wide') });
  R.previewUrl({ url, rules: S.rules }).then((r) => {
    result = r;
    const box = $('#test-body'); if (!box) return;
    box.className = ''; box.style.padding = '0';
    if (r.error) { box.innerHTML = `<div style="color:var(--err)">Couldn't open the page: ${esc(r.error)}</div>`; return; }
    const grab = r.items.filter((i) => i.verdict === 'grab'), skip = r.items.filter((i) => i.verdict === 'skip'), maybe = r.items.filter((i) => i.verdict === 'maybe');
    const boosted = r.items.filter((i) => i.full).length;
    const order = [...grab, ...maybe, ...skip].slice(0, 300);
    box.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;align-items:center">
      <span class="pill" style="color:var(--accent);border-color:var(--accent)">${grab.length} would be grabbed</span>
      ${maybe.length ? `<span class="pill">${maybe.length} probably too small</span>` : ''}
      <span class="pill">${skip.length} skipped by your filters</span>
      ${boosted ? `<span class="pill" style="color:var(--accent)">${boosted} upgraded to full size</span>` : ''}
      ${r.next ? '<span class="pill">has a next page</span>' : ''}
      <span class="times" style="font-size:12px;margin-left:auto">Final size checks happen during the real scan</span></div>
      <div class="pgrid">${order.map((i) => `<div class="pcell ${i.verdict}" title="${esc(i.url + (i.why ? '\n' + i.why : ''))}"><img src="${i.url.startsWith('data:') ? '' : esc(i.url)}" loading="lazy" referrerpolicy="no-referrer" alt="" onerror="this.style.display='none'"><span class="k">${esc(i.kind)}</span>${i.full ? '<span class="b">FULL</span>' : ''}<span class="v">${i.verdict === 'grab' ? esc(i.w && i.h ? i.w + '×' + i.h : 'size checked on download') : esc(i.why || 'maybe')}</span></div>`).join('')}</div>`;
  });
  const ok = await done;
  if (ok) addUrls([url]);
}

// =====================================================================
// DUPLICATE FINDER
// =====================================================================
function renderDupes() {
  const D = S.dupes;
  if (!D.dir) D.dir = S.app.outputDir || S.st.defaultOutDir;
  const root = $('#dupes-root');
  const groups = D.groups || [];
  const extra = groups.reduce((n, g) => n + g.items.length - 1, 0);
  const tickedBytes = groups.flatMap((g) => g.items).filter((i) => D.ticked.has(i.path)).reduce((a, i) => a + i.bytes, 0);
  const pct = D.progress && D.progress.total ? Math.round((D.progress.done / D.progress.total) * 100) : 0;
  root.innerHTML = `
    <div class="page-head"><div><h1>Duplicate Finder</h1><p>Finds exact copies <i>and</i> look-alikes (resized, recompressed, re-saved as another format) in any folder.</p></div></div>
    <section class="card">
      <div class="rowx"><div class="lbl"><div>Folder to check</div><div class="sub mono" style="word-break:break-all">${esc(D.dir)}</div></div><div class="ctl"><button class="btn sm" id="d-folder">Change</button><button class="btn sm ghost" id="d-default">Save folder</button></div></div>
      <div class="rowx"><div class="lbl"><div>Include subfolders</div></div><div class="ctl"><button class="toggle" id="d-rec" aria-pressed="${D.recursive}" aria-label="Include subfolders"></button></div></div>
      <div class="rowx"><div class="lbl"><div>What counts as a duplicate</div><div class="sub">Look-alikes catches the same picture at a different size or quality</div></div><div class="ctl"><div class="seg">${[[100, 'Exact copies'], [95, 'Near-identical'], [90, 'Look-alikes'], [85, 'Loose']].map(([v, t]) => `<button data-dsim="${v}" class="${D.similarity === v ? 'on' : ''}">${t}</button>`).join('')}</div></div></div>
      <div class="rowx">${D.running
        ? `<div style="flex:1;display:flex;flex-direction:column;gap:8px"><div class="progress"><i style="width:${D.progress && D.progress.phase === 'comparing' ? 100 : pct}%"></i></div><span class="times" style="font-size:12px">${D.progress ? (D.progress.phase === 'comparing' ? 'Comparing fingerprints…' : `Reading images… ${fmtNum(D.progress.done)} / ${fmtNum(D.progress.total)}`) : 'Listing images…'}</span></div><button class="btn" id="d-cancel">Cancel</button>`
        : `<div class="lbl"><div class="sub">Already-checked images are remembered, so the next check is much faster.</div></div><button class="btn primary" id="d-scan">${ico('scan', 16)} Find duplicates</button>`}</div>
    </section>
    ${D.groups ? `
    <section class="card dsum">
      ${groups.length ? `<div><div class="n">${fmtNum(groups.length)}</div><div class="label">Groups</div></div><div><div class="n">${fmtNum(extra)}</div><div class="label">Extra copies</div></div><div><div class="n">${fmtBytes(tickedBytes)}</div><div class="label">Freed by ticked</div></div>
      <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap"><button class="btn ghost" id="d-smart">Tick all but the best</button><button class="btn ghost" id="d-untick">Untick all</button><button class="btn danger" id="d-delete" ${D.ticked.size ? '' : 'disabled'}>${ico('trash', 15)} Delete ticked (${fmtNum(D.ticked.size)})</button></div>`
      : `<div class="big" style="font-family:var(--display);font-size:22px;letter-spacing:1px">NO DUPLICATES FOUND</div><div class="times">Checked ${fmtNum(D.scanned)} images.</div>`}
    </section>
    <div style="display:flex;flex-direction:column;gap:12px">${groups.slice(0, 300).map((g, gi) => `
      <div class="dgroup"><div class="gh"><span class="pill ${g.kind === 'exact' ? '' : 'warn'}">${g.kind === 'exact' ? 'Exact copies' : 'Look-alikes'}</span><span>${g.items.length} files</span><span class="x">${fmtBytes(g.reclaim)} extra</span></div>
        <div class="ditems">${g.items.map((it, ii) => { const keep = !D.ticked.has(it.path) && it.path === g.best; const t = D.ticked.has(it.path); return `
          <div class="ditem ${t ? 'ticked' : ''} ${it.path === g.best ? 'keep' : ''}">
            <button class="pic" data-dview="${gi}:${ii}" aria-label="Preview ${esc(it.name)}"><img src="${fileUrl(it.thumb || it.path)}" loading="lazy" alt=""><span class="badge">${t ? 'DELETE' : it.path === g.best ? 'KEEP · BEST' : 'KEEP'}</span></button>
            <div class="nm" title="${esc(it.path)}">${esc(it.name)}</div>
            <div class="mt">${it.w}×${it.h} · ${fmtBytes(it.bytes)} · ${esc(String(it.format).toUpperCase())}</div>
            <div class="mt" title="${esc(it.path)}">${esc(it.path.split(/[\\/]/).slice(-2, -1)[0] || '')}</div>
            <label><input type="checkbox" data-dtick="${esc(it.path)}" ${t ? 'checked' : ''}> Delete this one</label>
          </div>`; }).join('')}</div></div>`).join('')}
      ${groups.length > 300 ? `<div class="times" style="text-align:center">Showing the 300 biggest groups. Delete these and check again for the rest.</div>` : ''}
    </div>` : ''}`;
}
function smartTick() { const D = S.dupes; D.ticked = new Set(); for (const g of D.groups || []) for (const it of g.items) if (it.path !== g.best) D.ticked.add(it.path); }
async function runDupes() {
  const D = S.dupes;
  D.running = true; D.progress = null; D.groups = null; renderDupes();
  const r = await R.dupesScan({ dir: D.dir, recursive: D.recursive, similarity: D.similarity });
  D.running = false;
  if (r.cancelled) { D.groups = null; renderDupes(); return; }
  if (r.error) toast(esc(r.error), 'err');
  D.groups = r.groups || []; D.scanned = r.scanned || 0;
  smartTick();
  renderDupes();
}
async function onDupesClick(e) {
  const D = S.dupes;
  const b = e.target.closest('button, input'); if (!b) return;
  if (b.id === 'd-folder') { const p = await R.pickAnyFolder({ title: 'Check which folder for duplicates?', current: D.dir }); if (p) { D.dir = p; D.groups = null; renderDupes(); } return; }
  if (b.id === 'd-default') { D.dir = S.app.outputDir || S.st.defaultOutDir; D.groups = null; renderDupes(); return; }
  if (b.id === 'd-rec') { D.recursive = !D.recursive; b.setAttribute('aria-pressed', String(D.recursive)); return; }
  if (b.dataset.dsim) { D.similarity = +b.dataset.dsim; renderDupes(); return; }
  if (b.id === 'd-scan') return runDupes();
  if (b.id === 'd-cancel') { R.dupesCancel(); return; }
  if (b.id === 'd-smart') { smartTick(); renderDupes(); return; }
  if (b.id === 'd-untick') { D.ticked = new Set(); renderDupes(); return; }
  if (b.dataset.dtick != null) { const p = b.dataset.dtick; b.checked ? D.ticked.add(p) : D.ticked.delete(p); renderDupes(); return; }
  if (b.dataset.dview) {
    const [gi, ii] = b.dataset.dview.split(':').map(Number);
    const g = D.groups[gi];
    openViewer(g.items.map((it) => ({ id: 'd-' + it.path, path: it.path, thumb: it.thumb, w: it.w, h: it.h, bytes: it.bytes, format: it.format, url: '', pageUrl: '', when: it.mtime })), ii);
    return;
  }
  if (b.id === 'd-delete') {
    const paths = [...D.ticked];
    const allOfGroup = (D.groups || []).some((g) => g.items.every((i) => D.ticked.has(i.path)));
    const ok = await confirmBox(`Delete ${fmtNum(paths.length)} duplicate${paths.length > 1 ? 's' : ''}?`, `They go to the Recycle Bin.${allOfGroup ? '<br><b style="color:var(--warn)">Heads up: in at least one group every copy is ticked, so that picture would be gone completely.</b>' : ''}`, 'Delete', true);
    if (!ok) return;
    S.quietRemoval = true;
    const r = await R.trashFiles(paths);
    toast(`Deleted ${fmtNum(r.moved + r.gone)} duplicates${r.failed.length ? ` · ${r.failed.length} in use, not deleted` : ''}`, r.failed.length ? 'warn' : '');
  }
}

async function reportProblem() {
  const text = S.logs.map((l) => `${new Date(l.t).toISOString()}  ${(LOG_TAG[l.level] || l.level).padEnd(5)} ${l.msg}`).join('\n');
  const ok = await R.saveReport(text);
  if (ok) toast('Report saved — send that file to Claude', '', null);
}

// =====================================================================
// WIRING
// =====================================================================
function wire() {
  $$('.rail button').forEach((b) => b.addEventListener('click', () => go(b.dataset.nav)));
  $('#btn-add').onclick = addFromInput;
  $('#url-input').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.ctrlKey) { e.preventDefault(); addFromInput(); } });
  $('#url-input').addEventListener('paste', async (e) => {
    const text = e.clipboardData.getData('text');
    if (text && /\n/.test(text.trim())) { e.preventDefault(); const urls = await R.extractUrls(text); if (urls.length) addUrls(urls); }
  });
  $('#btn-import').onclick = async () => { const urls = await R.importUrls(); if (urls.length) addUrls(urls); };
  $('#btn-folder').onclick = changeFolder;
  $('#btn-newfolder').onclick = newFolder;
  $('#folder-open').onclick = () => R.openPath(S.app.outputDir);
  $('#btn-reap').onclick = startReap;
  $('#btn-pause').onclick = () => (S.paused ? R.resume() : R.pause());
  $('#btn-stop').onclick = () => R.stop();
  $('#btn-clear-done').onclick = () => { S.queue = S.queue.filter((q) => !['done', 'failed', 'blocked', 'skipped'].includes(q.status)); renderQueue(); saveQueue(); };
  $('#btn-clear-all').onclick = async () => {
    if (S.running) return toast('Stop the scan first', 'warn');
    if (S.queue.length > 3 && !(await confirmBox('Clear the queue?', `Remove all ${S.queue.length} URLs?`, 'Clear'))) return;
    S.queue = []; renderQueue(); saveQueue();
  };
  $('#preset-quick').onchange = (e) => { if (e.target.value !== 'custom') applyPreset(e.target.value); };
  $('#qlist').addEventListener('click', (e) => {
    const b = e.target.closest('[data-qa]');
    if (!b) { const it = e.target.closest('[data-q]'); if (it) setJobFilter(S.jobFilter === it.dataset.q ? null : it.dataset.q); return; }
    const id = b.closest('[data-q]').dataset.q; const q = S.queue.find((x) => x.id === id); if (!q) return;
    const a = b.dataset.qa;
    if (a === 'open') R.openExternal(q.url);
    if (a === 'folder') R.openPath(q.dir);
    if (a === 'skip') R.skipJob(id);
    if (a === 'retry') { Object.assign(q, { status: 'queued', progress: 0, note: 'Waiting' }); renderQueue(); saveQueue(); if (S.running || S.app.autoStartOnAdd) startReap({ ids: [q.id] }); }
    if (a === 'remove') { S.queue = S.queue.filter((x) => x.id !== id); renderQueue(); saveQueue(); }
  });
  $('#chips').addEventListener('click', (e) => {
    if (e.target.closest('[data-jobclear]')) { setJobFilter(null); return; }
    const c = e.target.closest('[data-chip]'); if (c) { S.chip = c.dataset.chip; renderChips(); rerenderWall(); return; }
    const t = e.target.closest('[data-thumb]'); if (t) { saveApp({ thumbSize: t.dataset.thumb }); applyAccent(); renderChips(); }
  });
  const wallList = () => S.images.filter(wallMatch).slice().reverse();
  $('#wall').addEventListener('click', (e) => { const t = e.target.closest('[data-img]'); if (!t) return; if (tileClick(e, t.dataset.img)) return; const list = wallList(); openViewer(list, list.findIndex((x) => x.id === t.dataset.img)); });
  document.addEventListener('dragstart', (e) => {
    const t = e.target.closest && e.target.closest('.tile[data-img]'); if (!t) return;
    e.preventDefault();
    const all = S.images || [];
    const img = all.find((x) => x.id === t.dataset.img); if (!img) return;
    const paths = S.sel.has(img.id) ? selectedImages().map((x) => x.path) : [img.path];
    S.dragOutAt = Date.now();
    R.startDrag(paths);
  });
  $('#qlist').addEventListener('contextmenu', (e) => { const el = e.target.closest('[data-q]'); if (!el) return; e.preventDefault(); const q = S.queue.find((x) => x.id === el.dataset.q); if (q) queueMenu(q, e.clientX, e.clientY); });
  $('#btn-test').onclick = () => testUrl();
  $('#btn-report').onclick = reportProblem;
  $('#sel-copy').onclick = () => copyMoveSelected(false);
  $('#sel-move').onclick = () => copyMoveSelected(true);
  $('#sel-del').onclick = removeSelected;
  $('#sel-clip').onclick = () => { R.copyText(selectedImages().map((x) => x.path).join('\r\n')); toast('File paths copied'); };
  $('#sel-clear').onclick = clearSelection;
  $('#dupes-root').addEventListener('click', onDupesClick);
  R.onFilesRemoved(onFilesRemoved);
  R.onPathsRenamed(({ from, to }) => {
    const fix = (p) => (p && (p === from || p.startsWith(from + '\\') || p.startsWith(from + '/')) ? to + p.slice(from.length) : p);
    for (const list of [S.images, S.viewer.list]) for (const x of list) x.path = fix(x.path);
    for (const q of S.queue) { q.dir = fix(q.dir); if (q.folder && /[\\/]/.test(q.folder)) q.folder = fix(q.folder); }
    saveQueue(); renderQueue();
  });
  setInterval(watchTick, 15000);
  R.onDupesProgress((p) => { S.dupes.progress = p; if (S.page === 'dupes' && S.dupes.running) renderDupes(); });
  $('#wall').addEventListener('contextmenu', (e) => { const t = e.target.closest('[data-img]'); if (!t) return; e.preventDefault(); const list = wallList(); const i = list.findIndex((x) => x.id === t.dataset.img); imageMenu(list[i], e.clientX, e.clientY, list, i); });
  $('#log-filters').addEventListener('click', (e) => { const b = e.target.closest('[data-lf]'); if (!b) return; S.logFilter = b.dataset.lf; $$('#log-filters button').forEach((x) => x.classList.toggle('on', x === b)); rerenderLog(); });
  $('#btn-log-export').onclick = () => R.exportLog(S.logs.map((l) => `${new Date(l.t).toISOString()}  ${(LOG_TAG[l.level] || l.level).padEnd(5)} ${l.msg}`).join('\r\n'));

  // rules / settings / history
  $('#rules-root').addEventListener('input', onRulesInput);
  $('#rules-root').addEventListener('change', (e) => { if (e.target.dataset.rt === 'ua') onRulesInput(e); if (e.target.classList.contains('preset-select') && e.target.value !== 'custom') applyPreset(e.target.value); });
  $('#rules-root').addEventListener('click', onRulesClick);
  $('#settings-root').addEventListener('click', onSettingsClick);
  $('#history-root').addEventListener('click', onHistoryClick);

  // viewer
  $('#v-close').onclick = closeViewer;
  $('#v-prev').onclick = () => viewerStep(-1);
  $('#v-next').onclick = () => viewerStep(1);
  $('#v-fit').onclick = () => setZoom(V.fit, true);
  $('#v-1to1').onclick = () => setZoom(1, false);
  $('#v-zin').onclick = () => setZoom(V.scale * 1.25);
  $('#v-zout').onclick = () => setZoom(V.scale / 1.25);
  $('#v-strip').addEventListener('click', (e) => { const b = e.target.closest('[data-vi]'); if (b) { S.viewer.i = +b.dataset.vi; showViewerImage(); } });
  $('#v-show').onclick = () => R.showInFolder(currentViewerImg().path);
  $('#v-open').onclick = () => R.openPath(currentViewerImg().path);
  $('#v-copyimg').onclick = async () => toast((await R.copyImage(currentViewerImg().path)) ? 'Image copied' : "Couldn't copy that image", 'warn');
  $('#v-copyurl').onclick = () => { R.copyText(currentViewerImg().url); toast('URL copied'); };
  $('#v-wall').onclick = async () => toast((await R.setWallpaper(currentViewerImg().path)) ? 'Wallpaper set' : "Couldn't set wallpaper", 'warn');
  $('#v-block').onclick = () => blockSite(currentViewerImg());
  $('#v-delete').onclick = () => removeImage(currentViewerImg(), true);
  $('#v-palette').addEventListener('click', (e) => { const b = e.target.closest('[data-color]'); if (b) { R.copyText(b.dataset.color); toast(`Copied ${b.dataset.color}`); } });
  $('#viewer').addEventListener('click', (e) => { const a = e.target.closest('[data-ext]'); if (a) R.openExternal(a.dataset.ext); });
  const stage = $('#v-stage');
  stage.addEventListener('wheel', (e) => { e.preventDefault(); const r = stage.getBoundingClientRect(); setZoom(V.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), false, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  let drag = null;
  stage.addEventListener('mousedown', (e) => { if (e.target.closest('.vnav')) return; drag = { x: e.clientX - V.x, y: e.clientY - V.y }; stage.classList.add('panning'); });
  window.addEventListener('mousemove', (e) => { if (!drag) return; V.x = e.clientX - drag.x; V.y = e.clientY - drag.y; $('#v-img').style.transform = `translate(${V.x}px, ${V.y}px) scale(${V.scale})`; });
  window.addEventListener('mouseup', () => { drag = null; stage.classList.remove('panning'); });
  stage.addEventListener('dblclick', () => setZoom(Math.abs(V.scale - V.fit) < 0.01 ? 1 : V.fit, Math.abs(V.scale - V.fit) >= 0.01));
  window.addEventListener('resize', () => { if ($('#viewer').classList.contains('on') && V.w) fitImage(); });

  // global
  document.addEventListener('click', (e) => { if (!e.target.closest('#ctx')) closeMenu(); });
  document.addEventListener('keydown', onKey);
  document.addEventListener('paste', async (e) => {
    if (e.target.closest('input, textarea')) return;
    const text = e.clipboardData.getData('text');
    const urls = text ? await R.extractUrls(text) : [];
    if (urls.length) { e.preventDefault(); addUrls(urls); if (S.page !== 'scan') go('scan'); }
  });
  // drag & drop URLs / link lists anywhere
  let dragDepth = 0;
  const ownDrag = () => Date.now() - S.dragOutAt < 60000;
  window.addEventListener('dragenter', (e) => { e.preventDefault(); if (ownDrag()) return; dragDepth++; $('#dropzone').classList.add('on'); });
  window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('#dropzone').classList.remove('on'); });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', async (e) => {
    e.preventDefault(); dragDepth = 0; $('#dropzone').classList.remove('on');
    if (ownDrag()) { S.dragOutAt = 0; return; }
    let urls = [];
    for (const f of Array.from(e.dataTransfer.files || [])) { const p = R.pathForFile(f); if (p) urls = urls.concat(await R.readDroppedFile(p)); }
    const text = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/html');
    if (text) urls = urls.concat(await R.extractUrls(text));
    if (urls.length) { addUrls(urls); go('scan'); } else toast('No URLs in what you dropped', 'warn');
  });

  R.onEvents(onEvents);
  R.onClipboardUrls((urls) => { addUrls(urls); });
  R.onSignInsChanged(() => { if (S.page === 'settings') renderSettings(); });
  R.onScheduleStarted(({ schedule, result }) => {
    if (result && result.ok) {
      S.running = true; S.currentSession = result.sessionId; resetLive();
      for (const u of schedule.urls) if (!S.queue.find((q) => q.url === u)) S.queue.push({ id: uid(), url: u, status: 'queued', note: 'Scheduled' });
      renderQueue(); updateControls();
      toast(`Scheduled scan started: ${esc(schedule.name)}`);
    }
  });
}

function typing(e) { return e.target.closest && e.target.closest('input, textarea, select, [contenteditable]'); }
function onKey(e) {
  const viewerOn = $('#viewer').classList.contains('on');
  if ($('#modal-bg').classList.contains('on')) return;
  if (e.key === 'Escape') { if ($('#ctx').classList.contains('on')) return closeMenu(); if (viewerOn) return closeViewer(); }
  if (viewerOn) {
    if (e.key === 'ArrowLeft') return viewerStep(-1);
    if (e.key === 'ArrowRight') return viewerStep(1);
    if (e.key === '+' || e.key === '=') return setZoom(V.scale * 1.25);
    if (e.key === '-') return setZoom(V.scale / 1.25);
    if (e.key === '0') return setZoom(V.fit, true);
    if (e.key === '1') return setZoom(1, false);
    if (e.key === 'Delete') return removeImage(currentViewerImg(), true);
    return;
  }
  if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); return startReap(); }
  if (e.ctrlKey && e.shiftKey && (e.key === 'X' || e.key === 'x')) { e.preventDefault(); return R.stop(); }
  if (e.ctrlKey && (e.key === 'o' || e.key === 'O')) { e.preventDefault(); return $('#btn-import').click(); }
  if (e.ctrlKey && e.key === ',') { e.preventDefault(); return go('settings'); }
  if (e.ctrlKey && ['1', '2', '3', '4'].includes(e.key)) { e.preventDefault(); return go(['scan', 'dupes', 'history', 'rules'][+e.key - 1]); }
  if (e.ctrlKey && (e.key === 'a' || e.key === 'A') && !typing(e) && S.page === 'scan') { e.preventDefault(); gridList().forEach((x) => S.sel.add(x.id)); paintSelection(); return; }
  if (e.key === 'Escape' && S.sel.size) return clearSelection();
  if (e.key === 'Delete' && S.sel.size && !typing(e)) return removeSelected();
  if (e.key === ' ' && !typing(e) && S.running && S.page === 'scan') { e.preventDefault(); return S.paused ? R.resume() : R.pause(); }
}

// =====================================================================
// INIT
// =====================================================================
async function init() {
  hydrateIcons();
  const st = await R.getState();
  S.st = st;
  S.rules = st.settings.rules; S.app = st.settings.app; S.presets = st.settings.presets || {};
  S.builtIn = st.builtInPresets; S.accents = st.accents; S.defaults = st.defaults;
  S.memoryCount = st.memoryCount;
  S.running = st.running; S.paused = st.paused;
  S.queue = (st.settings.queue || []).map((q) => Object.assign({ progress: 0, found: 0, saved: 0, skipped: 0 }, q, ACTIVE.includes(q.status) ? { status: 'queued', note: 'Waiting' } : {}));
  if (!S.app.outputDir) S.app.outputDir = st.defaultOutDir;
  $('#ver').textContent = 'v' + st.version;
  $('#tb-logo').innerHTML = window.reaperSvg({ text: false, crop: 'head' });
  $('#empty-logo').innerHTML = window.reaperSvg({ text: true });
  applyAccent();
  renderFolder(); renderQueue(); renderChips(); renderStats(); renderPresetSelects(); updateControls(); updateStatusBar(); tick();
  wire();
  setInterval(tick, 1000);
  setInterval(async () => { const s = await R.getState().catch(() => null); if (s) { S.memoryCount = s.memoryCount; updateStatusBar(); } }, 30000);
  const queued = S.queue.filter((q) => q.status === 'queued').length;
  if (queued) toast(`${queued} URL${queued > 1 ? 's' : ''} waiting from last time`, '', { label: 'Reap now', fn: startReap });
  $('#url-input').focus();
}
init().catch((e) => { document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;bottom:40px;left:90px;color:#FF7B7B;z-index:999">${esc(e.stack || e)}</pre>`); });
