'use strict';
// The Reaper engine: visits each URL in a real browser, scrolls, clicks "load more",
// follows pagination/links, and saves every image the moment it's found.
//
// It talks to the outside world only through four things passed in, which keeps it testable:
//   driver    - opens pages in a browser and runs the extractor scripts
//   fetcher   - downloads files (fetcher.js)
//   processor - reads image size, fingerprint and converts formats (imageproc.js in a hidden window)
//   memory    - remembers hashes of images saved in earlier scans (store.js)

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const U = require('../shared/urls');
const N = require('./naming');
const { extractCall, scrollCall, loadMoreCall, dismissCall } = require('../page/extractor');
const { parseHeaders, sleep } = require('./fetcher');
const { Robots } = require('./robots');

const ENABLED_TYPE = (rules, t) => {
  const key = t === 'jpg' ? 'jpg' : t;
  return rules.types && rules.types[key] !== undefined ? !!rules.types[key] : true;
};

function hamming(a, b) {
  if (!a || !b || a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

class Pool {
  constructor(size) { this.size = Math.max(1, size); this.active = 0; this.q = []; }
  setSize(n) { this.size = Math.max(1, n); this._pump(); }
  run(fn) {
    return new Promise((resolve, reject) => { this.q.push({ fn, resolve, reject }); this._pump(); });
  }
  _pump() {
    while (this.active < this.size && this.q.length) {
      const { fn, resolve, reject } = this.q.shift();
      this.active++;
      Promise.resolve().then(fn).then(resolve, reject).finally(() => { this.active--; this._pump(); });
    }
  }
  get pending() { return this.active + this.q.length; }
}

class Engine extends EventEmitter {
  constructor({ driver, fetcher, processor, memory }) {
    super();
    this.driver = driver;
    this.fetcher = fetcher;
    this.processor = processor;
    this.memory = memory || null;
    this.running = false;
    this.paused = false;
    this._pauseWaiters = [];
  }

  // ---------- controls ----------
  pause() { if (this.running && !this.paused) { this.paused = true; this._emitState(); this.log('info', 'Paused'); } }
  resume() {
    if (!this.paused) return;
    this.paused = false;
    const w = this._pauseWaiters; this._pauseWaiters = [];
    w.forEach((r) => r());
    this._emitState();
    this.log('info', 'Resumed');
  }
  stop() {
    if (!this.running) return;
    this.stopped = true;
    this.abort.abort();
    this.resume();
    this.log('warn', 'Stopping…');
  }
  skipJob(jobId) {
    const j = this.jobs && [...this.jobs].reverse().find((x) => x.id === jobId && !x.finished);
    if (j && !j.finished) { j.skipRequested = true; this.log('warn', `Skipping ${j.url}`); }
  }
  async _waitIfPaused() {
    if (!this.paused) return;
    await new Promise((r) => this._pauseWaiters.push(r));
  }
  _emitState() { this.emit('event', { type: 'state', running: this.running, paused: this.paused }); }
  log(level, msg, extra) { this.emit('event', Object.assign({ type: 'log', level, msg, t: Date.now() }, extra || {})); }
  _stats() { this.emit('event', Object.assign({ type: 'stats' }, this.stats)); }
  _job(j, extra) {
    Object.assign(j, extra || {});
    this.emit('event', { type: 'job', id: j.id, url: j.url, status: j.status, found: j.found, saved: j.saved, skipped: j.skipped, dupes: j.dupes || 0, progress: j.progress, note: j.note || '', pages: j.pagesDone, title: j.title || '', dir: j.dir || '', gone: !!j.gone, allDupes: !!j.allDupes, httpStatus: j.httpStatus || 0 });
  }

  _newJob(j) {
    return { id: j.id, url: j.url, folder: j.folder || '', status: 'queued', found: 0, saved: 0, skipped: 0, progress: 0, pagesDone: 0, pending: 0, idleWaiters: [], note: 'Waiting for a free slot' };
  }
  _startJob(j) {
    this._jobRuns.push(this.pages.run(() => this._runJob(j)).catch((e) => this.log('error', 'Job error: ' + ((e && e.message) || e))));
  }
  // Add URLs to the scan that's already running. They start as soon as a page slot is free.
  addJobs(jobs) {
    if (!this.running || this.stopped) return [];
    const added = [];
    for (const spec of jobs) {
      if (this.jobs.some((x) => x.id === spec.id && !x.finished)) continue; // already running
      const j = this._newJob(spec);
      this.jobs.push(j);
      this.stats.jobsTotal++;
      this._job(j);
      this._startJob(j);
      added.push(j.id);
    }
    if (added.length) { this.log('info', `Added ${added.length} URL${added.length > 1 ? 's' : ''} to the running scan`); this._stats(); }
    return added;
  }

  // ---------- main entry ----------
  // jobs: [{ id, url }]  rules: merged rules  outDir: output folder
  async run({ jobs, rules, outDir, sessionId, thumbDir }) {
    if (this.running) throw new Error('Already running');
    this.running = true; this.paused = false; this.stopped = false;
    this.abort = new AbortController();
    this.rules = rules;
    this.outDir = outDir;
    this.thumbDir = thumbDir || '';
    this.stopReason = '';
    this._diskOkUntil = 0;
    this.sessionId = sessionId || String(Date.now());
    this.stats = { found: 0, saved: 0, skipped: 0, dupes: 0, small: 0, errors: 0, bytes: 0, startedAt: Date.now(), jobsTotal: jobs.length, jobsDone: 0 };
    this.seenUrls = new Set();
    this.sessionSha = new Set();
    this.sessionDhash = [];
    this.reservedPaths = new Set();
    this.folderSha = new Set();
    this.counter = 0;
    this.hostNext = new Map();
    this.robots = new Robots(this.fetcher);
    this.fetcher.bandwidth.set(rules.bandwidthKBs);
    this.include = U.compilePatterns(rules.urlInclude);
    this.exclude = U.compilePatterns(rules.urlExclude);
    this.linkInclude = U.compilePatterns(rules.linkInclude);
    this.linkExclude = U.compilePatterns(rules.linkExclude);
    this.headers = parseHeaders(rules.customHeaders);
    this.maxDist = Math.round(64 * (100 - Math.min(100, Math.max(50, rules.nearDupeSensitivity || 92))) / 100);
    this.downloads = new Pool(rules.downloadsAtOnce || 6);
    this.pages = new Pool(rules.pagesAtOnce || 2);
    this.jobs = jobs.map((j) => this._newJob(j));
    this._jobRuns = [];
    this._emitState();
    this.jobs.forEach((j) => this._job(j));

    try {
      await fsp.mkdir(outDir, { recursive: true });
      if (rules.checkExistingFolder) await this._indexFolder(outDir);
      this._stats();
      for (const j of this.jobs) this._startJob(j);
      // Wait for every job, including ones added while the scan is running
      let seen = 0;
      while (seen < this._jobRuns.length) { seen = this._jobRuns.length; await Promise.all(this._jobRuns.slice()); }
    } catch (e) {
      this.log('error', 'Scan error: ' + (e && e.message ? e.message : e));
    } finally {
      this.running = false;
      this.paused = false;
      this._emitState();
      const result = { type: 'done', stopped: !!this.stopped, stopReason: this.stopReason, stats: Object.assign({}, this.stats, { finishedAt: Date.now() }), sessionId: this.sessionId };
      this.emit('event', result);
    }
  }

  async _indexFolder(dir) {
    let count = 0;
    const walk = async (d, depth) => {
      if (depth > 6 || count > 50000) return;
      let ents = [];
      try { ents = await fsp.readdir(d, { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) await walk(p, depth + 1);
        else if (/\.(jpe?g|png|gif|webp|avif|bmp|ico|svg|tiff?)$/i.test(e.name)) {
          try {
            const st = await fsp.stat(p);
            let sha = this.memory && this.memory.fileHash ? this.memory.fileHash(p, st.size, st.mtimeMs) : null;
            if (!sha) {
              const buf = await fsp.readFile(p);
              sha = crypto.createHash('sha256').update(buf).digest('hex');
              if (this.memory && this.memory.setFileHash) this.memory.setFileHash(p, st.size, st.mtimeMs, sha);
            }
            this.folderSha.add(sha);
            count++;
          } catch { /* unreadable */ }
        }
        if (this.stopped) return;
      }
    };
    await walk(dir, 0);
    if (count) this.log('info', `Checked ${count} files already in the folder (won't save them twice)`);
  }

  // Politeness: page loads wait the full per-site delay, image downloads a third of it.
  async _gateHost(url, factor = 1) {
    const host = U.hostOf(url);
    const delay = Math.round((this.rules.delayMs || 0) * factor);
    if (!host || !delay) return;
    const now = Date.now();
    const at = Math.max(now, this.hostNext.get(host) || 0);
    this.hostNext.set(host, at + delay);
    if (at > now) await sleep(at - now, this.abort.signal);
  }

  _jobIdle(j) {
    if (j.pending === 0) return Promise.resolve();
    return new Promise((r) => j.idleWaiters.push(r));
  }

  async _runJob(j) {
    if (this.stopped) { this._job(j, { status: 'stopped' }); return; }
    const r = this.rules;
    this._job(j, { status: 'loading', note: 'Opening page…' });
    const visited = new Set();
    const queue = [{ url: j.url, depth: 0, pageNo: 1 }];
    let paginationHops = 0;
    const maxTotalPages = 1 + (r.followPagination ? r.maxPages : 0) + (r.followLinks ? 400 : 0);

    while (queue.length && !this.stopped && !j.skipRequested && !j.limitHit) {
      await this._waitIfPaused();
      const item = queue.shift();
      const key = U.normalizeUrl(item.url);
      if (visited.has(key)) continue;
      visited.add(key);
      if (visited.size > maxTotalPages) break;

      if (r.respectRobots && !(await this.robots.allowed(item.url, { userAgent: r.userAgent, signal: this.abort.signal }))) {
        this.log('warn', `robots.txt asks not to visit ${item.url}`);
        if (item.depth === 0 && item.pageNo === 1) { this._job(j, { status: 'blocked', note: 'Blocked by robots.txt' }); return; }
        continue;
      }

      const res = await this._processPage(j, item, queue.length);
      j.pagesDone++;
      if (!res) continue;
      if (res.title && !j.title) j.title = res.title;

      if (r.followPagination && res.next && paginationHops < r.maxPages && !visited.has(U.normalizeUrl(res.next))) {
        paginationHops++;
        queue.unshift({ url: res.next, depth: item.depth, pageNo: item.pageNo + 1 });
        this.log('info', `Next page → ${res.next}`, { jobId: j.id });
      }
      if (item.depth < (r.followLinks || 0) && res.links && res.links.length) {
        const baseSite = U.siteOf(j.url);
        let added = 0;
        for (const l of res.links) {
          if (added >= 150) break;
          if (r.followSameSiteOnly && U.siteOf(l) !== baseSite) continue;
          if (this.linkInclude.length && !U.matchesAny(l, this.linkInclude)) continue;
          if (this.linkExclude.length && U.matchesAny(l, this.linkExclude)) continue;
          if (/\/(login|logout|signin|signup|register|cart|checkout|account)(\/|$|\?)/i.test(l)) continue;
          const k = U.normalizeUrl(l);
          if (visited.has(k)) continue;
          queue.push({ url: l, depth: item.depth + 1, pageNo: 1 });
          added++;
        }
        if (added) this.log('info', `Following ${added} links from ${U.hostOf(item.url)} (level ${item.depth + 1})`, { jobId: j.id });
      }
      const doneRatio = j.pagesDone / (j.pagesDone + queue.length);
      this._job(j, { progress: Math.min(0.97, doneRatio) });
    }

    if (j.pending) this._job(j, { status: 'downloading', note: `Finishing ${j.pending} downloads…` });
    await this._jobIdle(j);
    this.stats.jobsDone++;
    j.finished = true;
    const status = this.stopped ? 'stopped' : j.skipRequested ? 'skipped' : j.gone ? 'gone' : (j.failedOpen && !j.found) ? 'failed' : 'done';
    let note = `${j.saved} saved · ${j.skipped} skipped`;
    if (status === 'failed') note = j.note || 'Could not open page';
    else if (status === 'gone') note = j.note;
    else if (status === 'done' && !j.saved && j.dupes) note = `Nothing new — all ${j.dupes} already saved`;
    else if (status === 'done' && !j.saved && !j.found) note = 'No images found on this page';
    this._job(j, { status, progress: 1, note, allDupes: status === 'done' && !j.saved && !!j.dupes });
    this._stats();
  }

  async _processPage(j, item) {
    const r = this.rules;
    await this._gateHost(item.url);
    let page;
    try {
      page = await this.driver.open(item.url, { timeoutSec: r.pageTimeoutSec, userAgent: r.userAgent, useSignIns: r.useSignIns, headers: this.headers, signal: this.abort.signal });
    } catch (e) {
      const msg = (e && e.message) || String(e);
      this.stats.errors++;
      this.log('error', `Couldn't open ${item.url}: ${msg}`, { jobId: j.id });
      if (item.depth === 0 && item.pageNo === 1) { j.failedOpen = true; j.note = msg.slice(0, 120); }
      return null;
    }
    const firstPage = item.depth === 0 && item.pageNo === 1;
    if (page.status && page.status >= 400) {
      try { await page.close(); } catch { /* ignore */ }
      if (firstPage) {
        j.httpStatus = page.status;
        if (page.status === 404 || page.status === 410) { j.gone = true; j.note = 'Page is gone (404) — deleted or archived'; }
        else { j.failedOpen = true; j.note = `The site answered with error ${page.status}`; }
      }
      this.log(page.status === 404 || page.status === 410 ? 'warn' : 'error', `${item.url} → ${page.status === 404 || page.status === 410 ? 'gone (404)' : 'error ' + page.status}`, { jobId: j.id });
      return null;
    }
    const opts = {
      grabLargest: r.grabLargest, includeCssBackgrounds: r.includeCssBackgrounds, includeSharePreviews: r.includeSharePreviews,
      includeLinkedImages: r.includeLinkedImages, includeNetworkImages: r.includeNetworkImages, includeInlineSvg: r.includeInlineSvg,
      includeDataUris: r.includeDataUris, includeFavicons: r.includeFavicons, wantLinks: false, wantNext: false
    };
    let title = '';
    const feed = (res) => {
      if (!res) return 0;
      if (res.title) title = res.title;
      if (firstPage && res.title && !j.folderTitle) j.folderTitle = res.title;
      let n = 0;
      for (const c of res.candidates || []) { if (this._candidate(j, c, item.url, title)) n++; }
      return n;
    };
    try {
      this._job(j, { status: 'scanning', note: item.pageNo > 1 ? `Page ${item.pageNo}` : 'Reading page…' });
      try { await page.eval(dismissCall()); } catch { /* ignore */ }
      feed(await page.eval(extractCall(opts)));

      if (r.autoScroll) {
        let stable = 0, lastH = 0;
        for (let i = 0; i < (r.maxScrollScreens || 0); i++) {
          if (this.stopped || j.skipRequested || j.limitHit) break;
          await this._waitIfPaused();
          const s = await page.eval(scrollCall());
          await sleep(r.settleMs || 1000, this.abort.signal);
          let clicked = 0;
          if (r.clickLoadMore) { clicked = await page.eval(loadMoreCall()).catch(() => 0); if (clicked) await sleep(r.settleMs || 1000, this.abort.signal); }
          const added = feed(await page.eval(extractCall(opts)));
          this._job(j, { status: 'scanning', note: `Scrolling… ${j.found} found so far` });
          if (i % 4 === 3) this.log('scroll', `${U.hostOf(item.url)}: scrolled ${i + 1} screens, ${j.found} found`, { jobId: j.id });
          const h = (s && s.height) || 0;
          if (s && s.atBottom && !added && !clicked && h === lastH) stable++; else stable = 0;
          lastH = h;
          if (stable >= 2) break;
        }
      }
      const final = await page.eval(extractCall(Object.assign({}, opts, { wantLinks: (r.followLinks || 0) > item.depth, wantNext: !!r.followPagination })));
      feed(final);
      return { links: final ? final.links : [], next: final ? final.next : null, title: final ? final.title : title };
    } catch (e) {
      this.stats.errors++;
      this.log('error', `Problem reading ${item.url}: ${(e && e.message) || e}`, { jobId: j.id });
      return null;
    } finally {
      try { await page.close(); } catch { /* ignore */ }
    }
  }

  // A candidate image URL was found on a page. Quick checks now; download happens in the pool.
  _candidate(j, c, pageUrl, title) {
    const r = this.rules;
    let url = U.applyRewrites(c.url, r.rewriteRules);
    const isData = url.startsWith('data:');
    const norm = isData ? 'data:' + crypto.createHash('sha1').update(url).digest('hex') : U.normalizeUrl(url);
    if (this.seenUrls.has(norm)) return false;
    this.seenUrls.add(norm);
    if (j.limitHit) return false;
    if (c.kind === 'thumb' && r.skipPreviewsOfLinked !== false) return false; // the linked full-size file is grabbed instead
    this.stats.found++; j.found++;
    const skip = (reason, msg) => { this._skip(j, url, reason, msg); return true; };
    if (!isData) {
      const host = U.hostOf(url);
      if ((r.blockedDomains || []).some((d) => host === d || host.endsWith('.' + d))) return skip('blocked', `blocked site ${host}`);
      if (this.include.length && !U.matchesAny(url, this.include)) return skip('filter', 'not in "only URLs matching"');
      if (this.exclude.length && U.matchesAny(url, this.exclude)) return skip('filter', 'matches an excluded pattern');
      const t = U.typeFromUrl(url);
      if (t && !ENABLED_TYPE(r, t)) return skip('type', `${t.toUpperCase()} is turned off`);
    }
    j.pending++;
    this.downloads.run(() => this._download(j, Object.assign({}, c, { url }), pageUrl, title))
      .catch((e) => { this.stats.errors++; this.log('error', `Download error: ${(e && e.message) || e}`); })
      .finally(() => {
        j.pending--;
        if (j.pending === 0) { const w = j.idleWaiters; j.idleWaiters = []; w.forEach((f) => f()); }
      });
    return true;
  }

  _skip(j, url, reason, msg) {
    this.stats.skipped++; j.skipped++;
    if (reason === 'duplicate' || reason === 'near-duplicate') this.stats.dupes++;
    if (reason === 'small' || reason === 'tiny') this.stats.small++;
    this.emit('event', { type: 'skip', jobId: j.id, url, reason, msg });
    this.log('skip', `${msg}  ${url.startsWith('data:') ? '(embedded image)' : shortName(url)}`, { jobId: j.id, reason });
    this._stats();
  }

  async _download(j, c, pageUrl, title) {
    const r = this.rules;
    if (this.stopped || j.skipRequested) return;
    await this._waitIfPaused();
    if (this.stopped || j.skipRequested || j.limitHit) return;

    let res;
    if (c.url.startsWith('data:')) {
      res = decodeDataUri(c.url);
      if (!res) return this._skip(j, c.url, 'not-image', 'unreadable embedded image');
    } else {
      const tries = r.smartFullSize ? [...U.fullSizeCandidates(c.url, { boosters: r.siteBoosters !== false }), c.url] : [c.url];
      for (let i = 0; i < tries.length; i++) {
        const u = tries[i];
        const isLast = i === tries.length - 1;
        await this._gateHost(u, 1 / 3);
        const got = await this.fetcher.get(u, {
          referer: r.referrerMode === 'none' ? '' : pageUrl,
          userAgent: r.userAgent, headers: this.headers, retries: isLast ? r.retries : 0, timeoutSec: 60,
          maxBytes: r.maxFileMB ? r.maxFileMB * 1024 * 1024 : 0, signal: this.abort.signal,
          onRetry: (e, n) => this.log('wait', `${U.hostOf(u)} ${e.error} → waiting ${Math.round(e.retryIn / 1000)}s (try ${n})`, { jobId: j.id })
        });
        if (got.ok && N.sniffType(got.buf) && N.sniffType(got.buf) !== 'html') {
          res = got;
          res.usedUrl = u;
          if (!isLast) this.log('src', `Got the full-size original instead of the resized copy`, { jobId: j.id });
          break;
        }
        if (isLast) res = got;
      }
      if (!res || !res.ok) {
        if (res && res.error === 'stopped') return;
        if (res && res.error === 'too-big') return this._skip(j, c.url, 'big', `bigger than ${r.maxFileMB} MB`);
        this.stats.errors++;
        return this._skip(j, c.url, 'failed', `download failed (${res ? res.error : 'error'})`);
      }
    }

    const buf = res.buf;
    if (res.usedUrl && res.usedUrl !== c.url) c = Object.assign({}, c, { url: res.usedUrl, resizedUrl: c.url });
    let type = N.sniffType(buf) || N.typeFromContentType(res.contentType) || N.guessTypeForUrl(c.url);
    if (!type || type === 'html') return this._skip(j, c.url, 'not-image', 'not an image');
    if (!ENABLED_TYPE(r, type)) return this._skip(j, c.url, 'type', `${type.toUpperCase()} is turned off`);
    if (r.minFileKB && buf.length < r.minFileKB * 1024) return this._skip(j, c.url, 'tiny', `under ${r.minFileKB} KB`);
    if (r.maxFileMB && buf.length > r.maxFileMB * 1024 * 1024) return this._skip(j, c.url, 'big', `bigger than ${r.maxFileMB} MB`);

    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    if (r.skipExactDupes) {
      let why = '';
      if (this.sessionSha.has(sha)) why = 'same image twice in this scan';
      else if (this.folderSha.has(sha)) why = 'already in your folder';
      else if (r.rememberAcrossScans && this.memory && this.memory.hasSha(sha)) {
        const where = this.memory.shaPath ? this.memory.shaPath(sha) : '';
        why = where ? `already saved (${path.basename(path.dirname(where))}\\${path.basename(where)})` : 'already saved before';
      }
      if (why) { j.dupes = (j.dupes || 0) + 1; return this._skip(j, c.url, 'duplicate', why); }
    }
    this.sessionSha.add(sha);

    const wantConvert = r.convertModern && r.convertModern !== 'off' && (type === 'webp' || type === 'avif');
    let info = { w: 0, h: 0, dhash: '' };
    try {
      info = await this.processor.process(buf, N.MIME[type] || 'application/octet-stream', { hash: true, convert: wantConvert ? r.convertModern : 'off', thumb: this.thumbDir ? 360 : 0 });
    } catch (e) {
      this.log('warn', `Couldn't read image details: ${(e && e.message) || e}`);
    }
    const w = info.w || 0, h = info.h || 0;
    if (w && h) {
      const fail = (reason, msg) => { this.sessionSha.delete(sha); return this._skip(j, c.url, reason, msg); };
      if ((r.minWidth && w < r.minWidth) || (r.minHeight && h < r.minHeight)) return fail('small', `${w}×${h} is under ${r.minWidth}×${r.minHeight}`);
      if ((r.maxWidth && w > r.maxWidth) || (r.maxHeight && h > r.maxHeight)) return fail('size', `${w}×${h} is over the max size`);
      if (r.orientation === 'landscape' && w <= h) return fail('shape', 'not landscape');
      if (r.orientation === 'portrait' && h <= w) return fail('shape', 'not portrait');
      if (r.orientation === 'square' && Math.abs(w - h) / Math.max(w, h) > 0.05) return fail('shape', 'not square');
      if (r.minAspect && w / h < r.minAspect && h / w < r.minAspect) return fail('shape', 'aspect ratio filter');
    }
    if (r.skipNearDupes && info.dhash) {
      const hit = this.sessionDhash.find((d) => hamming(d, info.dhash) <= this.maxDist);
      const memHit = !hit && r.rememberAcrossScans && this.memory && this.memory.nearDupe(info.dhash, this.maxDist);
      if (hit || memHit) { this.sessionSha.delete(sha); j.dupes = (j.dupes || 0) + 1; return this._skip(j, c.url, 'near-duplicate', hit ? 'look-alike of one saved in this scan' : 'look-alike of one you already have'); }
      this.sessionDhash.push(info.dhash);
    }
    if (r.maxImagesPerUrl && j.saved >= r.maxImagesPerUrl) {
      if (!j.limitHit) { j.limitHit = true; this.log('info', `Reached ${r.maxImagesPerUrl} images for ${U.hostOf(j.url)}`, { jobId: j.id }); }
      return;
    }

    // Last check before writing: a stop (button, limit, low disk) means nothing more lands on disk
    if (this.stopped || j.skipRequested) return;
    if (r.stopAfterImages && this.stats.saved >= r.stopAfterImages) return;
    if (!(await this._diskOk())) return;
    let outBuf = buf, outType = type;
    if (wantConvert && info.converted) { outBuf = Buffer.from(info.converted); outType = info.convertedType; }
    const when = new Date();
    let dir = j.folder ? j.folder : N.folderFor(this.outDir, r.folderLayout, j, title, when);
    const sub = N.sortFolder(r.autoSort, w, h, outType);
    if (sub) dir = path.join(dir, sub);
    await fsp.mkdir(dir, { recursive: true });
    if (!j.dir) { j.dir = j.folder || (sub ? path.dirname(dir) : dir); this._job(j); }
    const n = ++this.counter;
    const base = N.fileBase(r.namePattern, { n, url: c.url, pageUrl, w, h, title, alt: c.alt, sha, when });
    const urlExt = U.extOf(c.url);
    const ext = r.fixExtensions || !urlExt || !U.EXT_TO_TYPE[urlExt] ? N.EXT_FOR_TYPE[outType] || outType : urlExt;
    const file = N.resolveConflict(dir, base, ext, r.onConflict, this.reservedPaths);
    if (!file) return this._skip(j, c.url, 'exists', 'a file with that name already exists');
    this.reservedPaths.add(file.toLowerCase());
    await fsp.writeFile(file, outBuf);
    if (r.keepServerDate && res.lastModified) {
      const t = Date.parse(res.lastModified);
      if (!isNaN(t)) { try { await fsp.utimes(file, new Date(t), new Date(t)); } catch { /* ignore */ } }
    }
    if (r.saveSidecarJson) {
      const meta = { source: c.url, page: pageUrl, pageTitle: title, alt: c.alt, foundAs: c.kind, width: w, height: h, bytes: outBuf.length, type: outType, sha256: sha, savedAt: when.toISOString() };
      await fsp.writeFile(file.replace(/\.[^.]+$/, '') + '.json', JSON.stringify(meta, null, 2));
    }
    if (this.memory) this.memory.add(sha, info.dhash, file);
    let thumb = '';
    if (this.thumbDir && info.thumb) {
      thumb = path.join(this.thumbDir, sha.slice(0, 40) + '.jpg');
      try { await fsp.mkdir(this.thumbDir, { recursive: true }); await fsp.writeFile(thumb, Buffer.from(info.thumb)); } catch { thumb = ''; }
    }
    if (this.memory && this.memory.setFileHash) { try { const st = await fsp.stat(file); this.memory.setFileHash(file, st.size, st.mtimeMs, sha, { dhash: info.dhash, w, h, thumb }); } catch { /* ignore */ } }

    this.stats.saved++; this.stats.bytes += outBuf.length;
    j.saved++;
    const img = { type: 'image', id: `${this.sessionId}-${n}`, jobId: j.id, sessionId: this.sessionId, path: file, thumb, url: c.url, pageUrl, title, alt: c.alt || '', w, h, bytes: outBuf.length, format: outType, kind: c.kind, sha, when: when.getTime() };
    this.emit('event', img);
    this.log('save', `${path.basename(file)}  ${w && h ? w + '×' + h : ''}  ${fmtBytes(outBuf.length)}`, { jobId: j.id });
    this._stats();
    await this._checkLimits(dir);
  }

  // Safety limits: stop after N images / N MB, or when the drive is nearly full.
  async _checkLimits(dir) {
    const r = this.rules;
    if (this.stopped) return;
    if (r.stopAfterImages && this.stats.saved >= r.stopAfterImages) return this._limitStop(`Reached your limit of ${r.stopAfterImages} images`);
    if (r.stopAfterMB && this.stats.bytes >= r.stopAfterMB * 1048576) return this._limitStop(`Reached your limit of ${r.stopAfterMB} MB`);
  }
  // Free-space check before each write (re-checked at most every few seconds)
  async _diskOk() {
    const r = this.rules;
    if (!r.minFreeGB || !fsp.statfs) return true;
    if (this._diskOkUntil && Date.now() < this._diskOkUntil) return true;
    try {
      const st = await fsp.statfs(this.outDir);
      const freeGB = (st.bavail * st.bsize) / 1073741824;
      if (freeGB < r.minFreeGB) { this._limitStop(`Drive almost full (${freeGB.toFixed(1)} GB left)`); return false; }
      this._diskOkUntil = Date.now() + 4000;
    } catch { /* can't tell: carry on */ }
    return !this.stopped;
  }
  _limitStop(reason) {
    if (this.stopped) return;
    this.stopReason = reason;
    this.log('warn', reason + ' — stopping');
    this.stop();
  }

  // "Test this URL": open the page, scroll, list what would be grabbed. Downloads nothing.
  async preview(url, rules) {
    const r = Object.assign({}, rules, { maxScrollScreens: Math.min(rules.maxScrollScreens || 0, 12) });
    const include = U.compilePatterns(r.urlInclude), exclude = U.compilePatterns(r.urlExclude);
    const abort = new AbortController();
    const page = await this.driver.open(url, { timeoutSec: r.pageTimeoutSec, userAgent: r.userAgent, useSignIns: r.useSignIns, headers: parseHeaders(r.customHeaders), signal: abort.signal });
    const opts = {
      grabLargest: r.grabLargest, includeCssBackgrounds: r.includeCssBackgrounds, includeSharePreviews: r.includeSharePreviews,
      includeLinkedImages: r.includeLinkedImages, includeNetworkImages: r.includeNetworkImages, includeInlineSvg: r.includeInlineSvg,
      includeDataUris: false, includeFavicons: r.includeFavicons, wantLinks: false, wantNext: !!r.followPagination
    };
    const all = new Map();
    let title = '', next = null;
    const take = (res) => {
      if (!res) return;
      title = res.title || title; next = res.next || next;
      for (const c of res.candidates || []) { const u = U.applyRewrites(c.url, r.rewriteRules); if (!all.has(u)) all.set(u, Object.assign({}, c, { url: u })); }
    };
    try {
      try { await page.eval(dismissCall()); } catch { /* ignore */ }
      take(await page.eval(extractCall(opts)));
      if (r.autoScroll) {
        for (let i = 0; i < r.maxScrollScreens; i++) {
          const s = await page.eval(scrollCall());
          await sleep(Math.min(r.settleMs || 800, 1200));
          if (r.clickLoadMore) await page.eval(loadMoreCall()).catch(() => 0);
          take(await page.eval(extractCall(opts)));
          if (s && s.atBottom) break;
        }
      }
      take(await page.eval(extractCall(opts)));
    } finally { try { await page.close(); } catch { /* ignore */ } }
    const items = [...all.values()].map((c) => {
      let verdict = 'grab', why = '';
      const host = U.hostOf(c.url);
      const t = U.typeFromUrl(c.url);
      if (c.kind === 'thumb' && r.skipPreviewsOfLinked !== false) { verdict = 'skip'; why = 'preview (full size linked)'; }
      else if ((r.blockedDomains || []).some((d) => host === d || host.endsWith('.' + d))) { verdict = 'skip'; why = 'blocked site'; }
      else if (include.length && !U.matchesAny(c.url, include)) { verdict = 'skip'; why = 'not in "only matching"'; }
      else if (exclude.length && U.matchesAny(c.url, exclude)) { verdict = 'skip'; why = 'junk / excluded pattern'; }
      else if (t && !ENABLED_TYPE(r, t)) { verdict = 'skip'; why = `${t.toUpperCase()} off`; }
      else if (c.w && c.h && c.kind !== 'link' && c.w < 80 && c.h < 80) { verdict = 'maybe'; why = 'probably small'; }
      const full = r.smartFullSize ? U.fullSizeCandidates(c.url, { boosters: r.siteBoosters !== false })[0] || '' : '';
      return { url: c.url, kind: c.kind, w: c.w, h: c.h, verdict, why, full };
    });
    return { url, title, next, items };
  }
}

function decodeDataUri(u) {
  const m = u.match(/^data:([^;,]+)?(;charset=[^;,]+)?(;base64)?,(.*)$/s);
  if (!m) return null;
  try {
    const buf = m[3] ? Buffer.from(m[4], 'base64') : Buffer.from(decodeURIComponent(m[4]), 'utf8');
    return { ok: true, status: 200, buf, contentType: m[1] || '', lastModified: '' };
  } catch { return null; }
}

function shortName(u) {
  const x = U.safeUrl(u);
  if (!x) return u;
  const last = x.pathname.split('/').filter(Boolean).pop() || x.hostname;
  return last.length > 60 ? last.slice(0, 57) + '…' : last;
}
function fmtBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
  return (b / 1024 / 1024).toFixed(1) + ' MB';
}

module.exports = { Engine, hamming, decodeDataUri, Pool };
