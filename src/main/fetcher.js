'use strict';
// Downloads with retries, back-off on "too many requests", timeouts, size caps and a bandwidth limit.
// The actual fetch function is passed in: in the app it's Electron's session.fetch
// (so saved sign-ins/cookies apply); in tests it's Node's fetch.

const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const sleep = (ms, signal) => new Promise((resolve) => {
  if (signal && signal.aborted) return resolve();
  const t = setTimeout(resolve, ms);
  if (signal) signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
});

function parseHeaders(text) {
  const out = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) { const k = line.slice(0, i).trim(); const v = line.slice(i + 1).trim(); if (k) out[k] = v; }
  }
  return out;
}

class Bandwidth {
  constructor() { this.kbs = 0; this.next = 0; }
  set(kbs) { this.kbs = Math.max(0, Number(kbs) || 0); }
  async take(bytes, signal) {
    if (!this.kbs) return;
    const now = Date.now();
    const cost = (bytes / 1024 / this.kbs) * 1000;
    const start = Math.max(now, this.next);
    this.next = start + cost;
    if (this.next - now > 0) await sleep(this.next - now, signal);
  }
}

class Fetcher {
  constructor(fetchImpl) {
    this.fetchImpl = fetchImpl || ((...a) => fetch(...a));
    this.bandwidth = new Bandwidth();
  }

  async get(url, o = {}) {
    const retries = Math.max(0, o.retries == null ? 3 : o.retries);
    let lastErr = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (o.signal && o.signal.aborted) return { ok: false, status: 0, error: 'stopped' };
      const ctrl = new AbortController();
      const onAbort = () => ctrl.abort();
      if (o.signal) o.signal.addEventListener('abort', onAbort, { once: true });
      const timer = setTimeout(() => ctrl.abort(), (o.timeoutSec || 30) * 1000);
      try {
        const headers = Object.assign({
          'User-Agent': o.userAgent || DEFAULT_UA,
          Accept: o.accept || 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        }, o.headers || {});
        if (o.referer) headers.Referer = o.referer;
        const res = await this.fetchImpl(url, { headers, signal: ctrl.signal, redirect: 'follow' });
        const status = res.status;
        if (status === 429 || status === 503 || (status >= 500 && status < 600)) {
          const ra = res.headers.get('retry-after');
          let wait = ra ? (isNaN(Number(ra)) ? Math.max(0, Date.parse(ra) - Date.now()) : Number(ra) * 1000) : 0;
          if (!wait) wait = Math.min(60000, 1500 * Math.pow(2, attempt));
          wait = Math.min(wait, 90000);
          lastErr = { ok: false, status, error: `HTTP ${status}`, retryIn: wait };
          if (o.onRetry) o.onRetry(lastErr, attempt + 1);
          try { await res.arrayBuffer(); } catch { /* drain */ }
          if (attempt < retries) { await sleep(wait, o.signal); continue; }
          return lastErr;
        }
        if (!res.ok) {
          try { await res.arrayBuffer(); } catch { /* drain */ }
          return { ok: false, status, error: `HTTP ${status}` };
        }
        const len = Number(res.headers.get('content-length') || 0);
        if (o.maxBytes && len && len > o.maxBytes) {
          try { ctrl.abort(); } catch { /* ignore */ }
          return { ok: false, status, error: 'too-big', size: len };
        }
        const buf = Buffer.from(await res.arrayBuffer());
        await this.bandwidth.take(buf.length, o.signal);
        return {
          ok: true, status, buf,
          contentType: res.headers.get('content-type') || '',
          lastModified: res.headers.get('last-modified') || '',
          finalUrl: res.url || url
        };
      } catch (e) {
        const stopped = o.signal && o.signal.aborted;
        lastErr = { ok: false, status: 0, error: stopped ? 'stopped' : (e && e.name === 'AbortError' ? 'timeout' : String((e && e.message) || e)) };
        if (stopped) return lastErr;
        if (attempt < retries) { await sleep(Math.min(20000, 1000 * Math.pow(2, attempt)), o.signal); continue; }
        return lastErr;
      } finally {
        clearTimeout(timer);
        if (o.signal) o.signal.removeEventListener('abort', onAbort);
      }
    }
    return lastErr || { ok: false, status: 0, error: 'failed' };
  }
}

module.exports = { Fetcher, DEFAULT_UA, parseHeaders, sleep };
