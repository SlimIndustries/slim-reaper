'use strict';
// Everything the app remembers between runs, saved as JSON in the user's AppData folder:
//   settings.json  - rules, app settings, your presets, the queue, schedules
//   memory.json    - fingerprints of every image ever saved (so re-scans only grab new ones)
//   history/       - one file per scan with the list of images it saved
//                    (only when "Remember history" is on; otherwise scans live in RAM until you close the app)
const fs = require('fs');
const path = require('path');
const { DEFAULT_RULES, DEFAULT_APP, SETTINGS_VERSION, JUNK_PATTERNS, mergeRules } = require('../shared/defaults');
const { hamming } = require('./engine');

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}
function writeJsonAtomic(p, data) {
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, p);
}

class Store {
  constructor(dir) {
    this.dir = dir;
    this.histDir = path.join(dir, 'history');
    this.thumbDir = path.join(dir, 'thumbs');
    const s = readJson(path.join(dir, 'settings.json'), {});
    this.settings = {
      rules: mergeRules(DEFAULT_RULES, s.rules || {}),
      app: Object.assign({}, DEFAULT_APP, s.app || {}),
      presets: s.presets || {},          // user presets: { id: { name, rules } }
      queue: s.queue || [],              // [{ id, url }]
      schedules: s.schedules || []       // [{ id, name, urls, everyHours, presetId, outDir, enabled, lastRun }]
    };
    // Move older settings onto the photos-only defaults (only where you never changed them)
    if ((s.version || 1) < 2) {
      const r = this.settings.rules;
      if (r.minWidth === 200 && r.minHeight === 200) { r.minWidth = 400; r.minHeight = 400; }
      if (r.minFileKB === 5) r.minFileKB = 10;
      if (!r.urlExclude) r.urlExclude = JUNK_PATTERNS;
      if (!s.app || !s.app.activePreset || s.app.activePreset === 'everything') this.settings.app.activePreset = 'photos';
    }
    if ((s.version || 1) < 3) {
      const r = this.settings.rules;
      if (!r.folderLayout || r.folderLayout === 'site') r.folderLayout = 'title';
    }
    if ((s.version || 1) < 4) {
      if (this.settings.rules.pagesAtOnce === 2) this.settings.rules.pagesAtOnce = 3;
    }
    this.settings.version = SETTINGS_VERSION;
    // Scans that were cut off (crash, power loss) are marked stopped instead of "running" forever
    this._staleFixed = false;

    const m = readJson(path.join(dir, 'memory.json'), { sha: {}, dh: [] });
    this.mem = { sha: new Map(Object.entries(m.sha || {})), dh: m.dh || [] };
    this.keepHistory = !!this.settings.app.rememberHistory;
    this.liveSessions = new Map();
    if (!this.keepHistory) this._wipeHistoryFiles();
    else fs.mkdirSync(this.histDir, { recursive: true });
    this.history = this.keepHistory ? readJson(path.join(this.histDir, 'index.json'), []) : [];
    for (const h of this.history) {
      if (!h.finishedAt) {
        const imgs = readJson(path.join(this.histDir, h.id + '.json'), []);
        h.finishedAt = imgs.length ? imgs[imgs.length - 1].when : h.startedAt;
        h.stopped = true;
        h.saved = Math.max(h.saved || 0, imgs.length);
        this._staleFixed = true;
      }
    }
    // Remembered file fingerprints: path -> [size, mtime, sha, dhash, w, h, thumb]
    this.files = new Map(Object.entries(readJson(path.join(dir, 'files.json'), {})));
    this.timers = {};
    if (!this.keepHistory) for (const e of this.files.values()) e[6] = ''; // thumbnails were wiped above
    if (this._staleFixed) this._saveHistoryNow();
  }

  // ----- file fingerprint cache (makes folder checks and the Duplicate Finder fast) -----
  fileHash(p, size, mtime) {
    const e = this.files.get(p);
    return e && e[0] === size && Math.abs(e[1] - mtime) < 2 ? e[2] : null;
  }
  fileInfo(p, size, mtime) {
    const e = this.files.get(p);
    if (!e || e[0] !== size || Math.abs(e[1] - mtime) >= 2) return null;
    return { sha: e[2], dhash: e[3] || '', w: e[4] || 0, h: e[5] || 0, thumb: e[6] || '' };
  }
  setFileHash(p, size, mtime, sha, extra) {
    const x = extra || {};
    const old = this.files.get(p);
    const keep = old && old[2] === sha ? old : [];
    this.files.set(p, [size, mtime, sha, x.dhash || keep[3] || '', x.w || keep[4] || 0, x.h || keep[5] || 0, x.thumb || keep[6] || '']);
    this._later('files', () => this._saveFilesNow(), 3000);
  }
  forgetFiles(paths) { for (const p of paths) this.files.delete(p); this._later('files', () => this._saveFilesNow(), 3000); }
  _saveFilesNow() { try { writeJsonAtomic(path.join(this.dir, 'files.json'), Object.fromEntries(this.files)); } catch (e) { console.error(e); } }

  _later(key, fn, ms = 800) {
    clearTimeout(this.timers[key]);
    this.timers[key] = setTimeout(fn, ms);
  }
  flushAll() {
    for (const k of Object.keys(this.timers)) clearTimeout(this.timers[k]);
    this._saveSettingsNow(); this._saveMemoryNow(); this._saveHistoryNow(); this._saveFilesNow();
    for (const id of this.liveSessions.keys()) this._saveSessionNow(id);
  }

  // ----- settings -----
  saveSettings(patch) {
    if (patch.rules) this.settings.rules = mergeRules(DEFAULT_RULES, patch.rules);
    if (patch.app) this.settings.app = Object.assign({}, this.settings.app, patch.app);
    if (patch.presets) this.settings.presets = patch.presets;
    if (patch.queue) this.settings.queue = patch.queue;
    if (patch.schedules) this.settings.schedules = patch.schedules;
    this._later('settings', () => this._saveSettingsNow());
  }
  _saveSettingsNow() { try { writeJsonAtomic(path.join(this.dir, 'settings.json'), this.settings); } catch (e) { console.error(e); } }

  // ----- memory (used by the engine) -----
  hasSha(s) { return this.mem.sha.has(s); }
  nearDupe(d, maxDist) {
    for (let i = this.mem.dh.length - 1; i >= 0; i--) {
      const e = this.mem.dh[i];
      if (hamming(e[0], d) <= maxDist) return e[1];
    }
    return null;
  }
  add(sha, dhash, file) {
    this.mem.sha.set(sha, file);
    if (dhash) this.mem.dh.push([dhash, file]);
    this._later('memory', () => this._saveMemoryNow(), 3000);
  }
  shaPath(s) { return this.mem.sha.get(s) || ''; }
  // Deleted images are forgotten, so scanning the same page again brings them back.
  forgetPaths(paths) {
    const gone = paths instanceof Set ? paths : new Set(paths);
    if (!gone.size) return 0;
    let n = 0;
    for (const [sha, p] of this.mem.sha) if (gone.has(p)) { this.mem.sha.delete(sha); n++; }
    const before = this.mem.dh.length;
    this.mem.dh = this.mem.dh.filter((e) => !gone.has(e[1]));
    if (n || this.mem.dh.length !== before) this._later('memory', () => this._saveMemoryNow(), 1500);
    return n;
  }
  // Forget remembered images whose files no longer exist (deleted while the app was closed).
  // Also cleans History: deleted images drop out, and a scan whose images are all gone is removed.
  pruneMissing() {
    const missing = new Set();
    for (const p of new Set([...this.mem.sha.values(), ...this.mem.dh.map((e) => e[1])])) if (p && !fs.existsSync(p)) missing.add(p);
    for (const h of this.history) for (const i of this.sessionImages(h.id)) if (i.path && !fs.existsSync(i.path)) missing.add(i.path);
    if (missing.size) this.removeImages([...missing]);
    return missing.size;
  }
  // A folder was renamed inside the app: point every record at the new place.
  renamePrefix(fromDir, toDir) {
    const fix = (p) => (p && (p === fromDir || p.startsWith(fromDir + path.sep)) ? toDir + p.slice(fromDir.length) : p);
    for (const [sha, p] of this.mem.sha) this.mem.sha.set(sha, fix(p));
    this.mem.dh = this.mem.dh.map((e) => [e[0], fix(e[1])]);
    const files = new Map();
    for (const [p, v] of this.files) files.set(fix(p), v);
    this.files = files;
    for (const h of this.history) {
      if (h.outDir) h.outDir = fix(h.outDir);
      const live = this.liveSessions.get(h.id);
      if (live) { live.forEach((i) => { i.path = fix(i.path); }); continue; }
      const f = path.join(this.histDir, h.id + '.json');
      const arr = readJson(f, null);
      if (arr && arr.some((i) => fix(i.path) !== i.path)) { arr.forEach((i) => { i.path = fix(i.path); }); try { writeJsonAtomic(f, arr); } catch { /* ignore */ } }
    }
    this._saveHistoryNow(); this._saveMemoryNow(); this._saveFilesNow();
  }
  forgetAll() { this.mem = { sha: new Map(), dh: [] }; this._saveMemoryNow(); }
  memoryCount() { return this.mem.sha.size; }
  _saveMemoryNow() {
    try { writeJsonAtomic(path.join(this.dir, 'memory.json'), { sha: Object.fromEntries(this.mem.sha), dh: this.mem.dh }); } catch (e) { console.error(e); }
  }

  // ----- history -----
  startSession(info) {
    const rec = Object.assign({ saved: 0, skipped: 0, found: 0, bytes: 0, finishedAt: 0, stopped: false }, info);
    this.history.unshift(rec);
    this.liveSessions.set(rec.id, []);
    this._saveHistoryNow();
    return rec;
  }
  addImage(sessionId, img) {
    const list = this.liveSessions.get(sessionId);
    if (!list) return;
    list.push({ id: img.id, path: img.path, thumb: img.thumb || '', url: img.url, pageUrl: img.pageUrl, title: img.title, w: img.w, h: img.h, bytes: img.bytes, format: img.format, when: img.when, jobId: img.jobId });
    this._later('sess-' + sessionId, () => this._saveSessionNow(sessionId), 4000);
  }
  finishSession(sessionId, stats, stopped) {
    const rec = this.history.find((h) => h.id === sessionId);
    if (rec) Object.assign(rec, { saved: stats.saved, skipped: stats.skipped, found: stats.found, bytes: stats.bytes, finishedAt: Date.now(), stopped: !!stopped });
    this._saveSessionNow(sessionId);
    if (this.keepHistory) this.liveSessions.delete(sessionId); // history off: it stays in RAM only
    this._saveHistoryNow();
  }
  _saveSessionNow(id) {
    if (!this.keepHistory) return;
    const list = this.liveSessions.get(id);
    if (list) { try { writeJsonAtomic(path.join(this.histDir, id + '.json'), list); } catch (e) { console.error(e); } }
  }
  _saveHistoryNow() { if (!this.keepHistory) return; try { writeJsonAtomic(path.join(this.histDir, 'index.json'), this.history.slice(0, 1000)); } catch (e) { console.error(e); } }
  sessionImages(id) {
    if (this.liveSessions.has(id)) return this.liveSessions.get(id).slice();
    return readJson(path.join(this.histDir, id + '.json'), []);
  }
  deleteSession(id) {
    this._deleteThumbs(this.sessionImages(id));
    this.history = this.history.filter((h) => h.id !== id);
    this.liveSessions.delete(id);
    try { fs.unlinkSync(path.join(this.histDir, id + '.json')); } catch { /* gone */ }
    this._saveHistoryNow();
  }
  // One-click "Clear history": every finished scan goes (a scan that is running right now stays).
  // Image files are never touched.
  clearHistory(runningId) {
    for (const h of this.history.slice()) if (h.id !== runningId) this.deleteSession(h.id);
    if (!runningId) this._wipeHistoryFiles();
    if (this.keepHistory) fs.mkdirSync(this.histDir, { recursive: true });
    this._saveHistoryNow();
    return this.history;
  }
  // Turn "Remember history" on or off while the app is open.
  setKeepHistory(on) {
    on = !!on;
    if (on === this.keepHistory) return;
    this.keepHistory = on;
    if (on) {
      // Start saving from now, including scans from this run
      fs.mkdirSync(this.histDir, { recursive: true });
      for (const h of this.history) if (h.finishedAt) { this._saveSessionNow(h.id); this.liveSessions.delete(h.id); }
      this._saveHistoryNow();
    } else {
      // Keep this run's scans in RAM, wipe everything on disk
      for (const h of this.history) if (!this.liveSessions.has(h.id)) this.liveSessions.set(h.id, readJson(path.join(this.histDir, h.id + '.json'), []));
      try { fs.rmSync(this.histDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
  _deleteThumbs(imgs) {
    for (const i of imgs) {
      if (i.thumb && i.thumb.startsWith(this.thumbDir)) { try { fs.unlinkSync(i.thumb); } catch { /* gone */ } }
    }
  }
  // Remove saved history and preview thumbnails from disk (image files are never touched)
  _wipeHistoryFiles() {
    try { fs.rmSync(this.histDir, { recursive: true, force: true }); } catch { /* ignore */ }
    try { fs.rmSync(this.thumbDir, { recursive: true, force: true }); } catch { /* ignore */ }
    if (this.files) { for (const e of this.files.values()) e[6] = ''; this._later('files', () => this._saveFilesNow(), 1000); }
  }
  library(limit = 3000) {
    const out = [];
    for (const h of this.history) {
      for (const img of this.sessionImages(h.id).reverse()) {
        out.push(Object.assign({ sessionId: h.id }, img));
        if (out.length >= limit) return out;
      }
    }
    return out;
  }
  // Remove many deleted files from history in one pass. Returns how many records changed.
  removeImages(paths) {
    const gone = new Set(paths);
    if (!gone.size) return 0;
    let changed = 0;
    const emptied = [];
    for (const h of this.history) {
      const live = this.liveSessions.get(h.id);
      if (live) {
        const had = live.length;
        for (let i = live.length - 1; i >= 0; i--) if (gone.has(live[i].path)) { this._deleteThumbs([live[i]]); live.splice(i, 1); changed++; }
        if (live.length !== had) h.saved = Math.max(0, (h.saved || 0) - (had - live.length));
        if (had && !live.length && h.finishedAt) emptied.push(h.id);
        continue;
      }
      const p = path.join(this.histDir, h.id + '.json');
      const arr = readJson(p, null);
      if (!arr) continue;
      const kept = arr.filter((x) => !gone.has(x.path));
      if (kept.length !== arr.length) {
        changed += arr.length - kept.length;
        this._deleteThumbs(arr.filter((x) => gone.has(x.path)));
        try { writeJsonAtomic(p, kept); } catch { /* ignore */ }
        h.saved = Math.max(0, (h.saved || 0) - (arr.length - kept.length));
        if (!kept.length) emptied.push(h.id);
      }
    }
    // A scan whose images were all deleted disappears from History
    for (const id of emptied) this.deleteSession(id);
    this.forgetFiles(paths);
    this.forgetPaths(gone);
    if (changed) this._saveHistoryNow();
    return changed;
  }
  allImagePaths() {
    const out = [];
    for (const h of this.history) for (const i of this.sessionImages(h.id)) out.push(i.path);
    return out;
  }
  removeImageEverywhere(file) { if (file) this.removeImages([file]); }

}

module.exports = { Store };
