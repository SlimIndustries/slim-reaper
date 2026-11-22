'use strict';
// Notices when reaped images are deleted outside the app (File Explorer, another program)
// so they disappear from the wall and History right away.
// Uses Windows' folder change notifications for speed, plus a light background check
// as a safety net (folders outside the save folder, network drives, renamed folders).
const fs = require('fs');
const path = require('path');

class FileWatcher {
  constructor({ onRemoved, sweepMs = 15000 }) {
    this.onRemoved = onRemoved;
    this.known = new Set();
    this.watchers = new Map();
    this.pending = new Set();
    this.timer = null;
    this.sweepTimer = setInterval(() => this.sweep(), sweepMs);
    if (this.sweepTimer.unref) this.sweepTimer.unref();
  }
  setKnown(paths) { this.known = new Set(paths); }
  add(p) { this.known.add(p); }
  forget(paths) { for (const p of paths) this.known.delete(p); }
  renamePrefix(fromDir, toDir) {
    const next = new Set();
    for (const p of this.known) next.add(p === fromDir || p.startsWith(fromDir + path.sep) ? toDir + p.slice(fromDir.length) : p);
    this.known = next;
  }

  watch(dirs) {
    const want = new Set(dirs.filter(Boolean).map((d) => path.resolve(d)));
    for (const [d, w] of this.watchers) if (!want.has(d)) { try { w.close(); } catch { /* ignore */ } this.watchers.delete(d); }
    for (const d of want) {
      if (this.watchers.has(d) || !fs.existsSync(d)) continue;
      try {
        const w = fs.watch(d, { recursive: true }, (ev, name) => { if (name) this._changed(path.join(d, String(name))); else this._changed(d); });
        w.on('error', () => { try { w.close(); } catch { /* ignore */ } this.watchers.delete(d); this._changed(d); });
        this.watchers.set(d, w);
      } catch { /* folder can't be watched: the background check still covers it */ }
    }
  }

  _changed(p) {
    this.pending.add(p);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this._flush(), 400);
  }
  _flush() {
    const changed = [...this.pending];
    this.pending.clear();
    const gone = [];
    for (const p of changed) {
      if (this.known.has(p)) { if (!fs.existsSync(p)) gone.push(p); continue; }
      // A folder was deleted or renamed: check everything that lived inside it
      const prefix = p.endsWith(path.sep) ? p : p + path.sep;
      for (const k of this.known) if (k.startsWith(prefix) && !fs.existsSync(k)) gone.push(k);
    }
    this._report(gone);
  }
  sweep() {
    const gone = [];
    for (const k of this.known) if (!fs.existsSync(k)) gone.push(k);
    this._report(gone);
  }
  _report(gone) {
    const uniq = [...new Set(gone)];
    if (!uniq.length) return;
    this.forget(uniq);
    try { this.onRemoved(uniq); } catch { /* ignore */ }
  }
  close() {
    clearInterval(this.sweepTimer);
    clearTimeout(this.timer);
    for (const w of this.watchers.values()) { try { w.close(); } catch { /* ignore */ } }
    this.watchers.clear();
  }
}

module.exports = { FileWatcher };
