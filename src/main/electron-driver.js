'use strict';
// Opens pages in hidden Chromium windows (offscreen) so scripts, lazy-loading and infinite
// scroll all work like a real visit. Pages use a throwaway in-memory session ("reaper-temp",
// gone when the app closes). Only sites you logged into in the Sign-ins window use the saved
// "persist:reaper" session, so no other site or tracker can leave cookies behind.
const { BrowserWindow, session } = require('electron');

const PERSIST = 'persist:reaper';
const TEMP = 'reaper-temp';
const prepared = new Set();

function prepareSession(ses) {
  if (prepared.has(ses)) return;
  prepared.add(ses);
  ses.on('will-download', (e, item) => { try { item.cancel(); } catch { /* ignore */ } });
  ses.setPermissionRequestHandler((wc, perm, cb) => cb(false)); // no camera, mic, notifications, location…
}

// Set by main.js: (url) => true when you signed in to that site
let isSignedIn = () => false;
function setSignedInCheck(fn) { isSignedIn = fn; }

function sessionFor(useSignIns, url) {
  const ses = session.fromPartition(useSignIns && url && isSignedIn(url) ? PERSIST : TEMP);
  prepareSession(ses);
  return ses;
}

const SILENCE_DIALOGS = 'window.alert=function(){};window.confirm=function(){return true};window.prompt=function(){return null};window.print=function(){};';

class ElectronDriver {
  async open(url, o = {}) {
    const ses = sessionFor(o.useSignIns !== false, url);
    const win = new BrowserWindow({
      show: false, width: 1366, height: 900,
      webPreferences: { session: ses, offscreen: true, backgroundThrottling: false, sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false }
    });
    const wc = win.webContents;
    try { wc.setFrameRate(30); } catch { /* ignore */ }
    wc.setAudioMuted(true);
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    wc.on('will-prevent-unload', (e) => e.preventDefault());
    wc.on('dom-ready', () => { wc.executeJavaScript(SILENCE_DIALOGS, true).catch(() => {}); });
    if (o.userAgent) wc.setUserAgent(o.userAgent);
    const extraHeaders = Object.entries(o.headers || {}).map(([k, v]) => `${k}: ${v}`).join('\n');

    let status = 0;
    wc.on('did-navigate', (e, navUrl, code) => { if (code) status = code; });
    const destroy = () => { try { if (!win.isDestroyed()) win.destroy(); } catch { /* ignore */ } };
    if (o.signal) o.signal.addEventListener('abort', destroy, { once: true });

    const timeoutMs = (o.timeoutSec || 45) * 1000;
    let timer;
    try {
      await Promise.race([
        wc.loadURL(url, extraHeaders ? { extraHeaders } : undefined).catch((e) => {
          // ERR_ABORTED often just means a client-side redirect; carry on if something loaded
          if (wc.isDestroyed() || !wc.getURL() || wc.getURL() === 'about:blank') throw e;
        }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Page took too long to load')), timeoutMs); })
      ]);
    } catch (e) {
      // A page that is still loading after the timeout is usually still usable (endless ads/trackers)
      if (!/too long/.test(String(e.message)) || wc.isDestroyed() || !wc.getURL()) { destroy(); throw e; }
    } finally { clearTimeout(timer); }
    if (wc.isDestroyed()) throw new Error('stopped');

    const ready = await wc.executeJavaScript('document.readyState', true).catch(() => '');
    if (!ready) { destroy(); throw new Error('Page could not be read'); }
    await new Promise((r) => setTimeout(r, 700));

    return {
      status,
      eval: (code) => (wc.isDestroyed() ? Promise.reject(new Error('stopped')) : wc.executeJavaScript(code, true)),
      close: async () => destroy()
    };
  }
}

module.exports = { ElectronDriver, sessionFor, setSignedInCheck, PERSIST, TEMP };
