'use strict';
// Runs imageproc.js in a hidden window and hands it images to measure / fingerprint / convert.
const path = require('path');
const { BrowserWindow, ipcMain } = require('electron');

class ProcessorHost {
  constructor() {
    this.pending = new Map();
    this.seq = 0;
    this.win = null;
    this.ready = null;
    ipcMain.on('proc-done', (e, msg) => {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new Error(msg.error));
      else {
        const r = msg.result || {};
        if (r.converted) r.converted = Buffer.from(r.converted);
        p.resolve(r);
      }
    });
  }

  _ensure() {
    if (this.win && !this.win.isDestroyed()) return this.ready;
    this.win = new BrowserWindow({
      show: false, width: 200, height: 200,
      webPreferences: { preload: path.join(__dirname, '..', 'processor', 'processor-preload.js'), sandbox: false, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
    });
    this.ready = this.win.loadFile(path.join(__dirname, '..', 'processor', 'processor.html'));
    this.win.on('closed', () => { this.win = null; });
    // If the helper window crashes, answer everything waiting right away and start a fresh one next time
    this.win.webContents.on('render-process-gone', () => {
      for (const [id, p] of this.pending) { clearTimeout(p.timer); p.resolve({ w: 0, h: 0, dhash: '' }); this.pending.delete(id); }
      try { this.win.destroy(); } catch { /* ignore */ }
      this.win = null;
    });
    return this.ready;
  }

  async process(buf, mime, opts) {
    await this._ensure();
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); resolve({ w: 0, h: 0, dhash: '' }); }, 20000);
      this.pending.set(id, { resolve, reject, timer });
      this.win.webContents.send('proc', { id, data: buf, mime, opts });
    });
  }

  destroy() { try { if (this.win && !this.win.isDestroyed()) this.win.destroy(); } catch { /* ignore */ } }
}

module.exports = { ProcessorHost };
