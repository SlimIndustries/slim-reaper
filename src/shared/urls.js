'use strict';
// URL helpers: pull URLs out of pasted text, expand [1-20] ranges,
// normalize for de-duplication, guess file types, wildcard matching.

const IMAGE_EXTS = ['jpg', 'jpeg', 'jfif', 'pjpeg', 'png', 'apng', 'webp', 'gif', 'svg', 'avif', 'bmp', 'ico', 'tif', 'tiff', 'heic'];
const EXT_TO_TYPE = { jpg: 'jpg', jpeg: 'jpg', jfif: 'jpg', pjpeg: 'jpg', png: 'png', apng: 'png', webp: 'webp', gif: 'gif', svg: 'svg', avif: 'avif', bmp: 'bmp', ico: 'ico', tif: 'tiff', tiff: 'tiff', heic: 'heic' };

// "https://site.com/page/[1-5]" -> 5 URLs. Supports [01-20] padding and [0-100:10] steps.
// Several ranges in one URL multiply out. Capped so a typo can't create millions.
function expandPatterns(url, cap = 5000) {
  const m = url.match(/\[(\d+)-(\d+)(?::(\d+))?\]/);
  if (!m) return [url];
  const [whole, a, b, stepStr] = m;
  const start = parseInt(a, 10), end = parseInt(b, 10);
  const step = Math.max(1, parseInt(stepStr || '1', 10));
  const pad = a.length > 1 && a.startsWith('0') ? a.length : 0;
  const out = [];
  const dir = start <= end ? 1 : -1;
  for (let i = start; dir > 0 ? i <= end : i >= end; i += step * dir) {
    const num = pad ? String(i).padStart(pad, '0') : String(i);
    for (const rest of expandPatterns(url.replace(whole, num), cap)) {
      out.push(rest);
      if (out.length >= cap) return out;
    }
  }
  return out;
}

// Find every http(s) URL in a blob of text (pasted lists, .txt, .csv, HTML, clipboard).
function extractUrls(text) {
  if (!text) return [];
  const found = [];
  const re = /https?:\/\/[^\s"'<>`,|]+/gi;
  let m;
  while ((m = re.exec(text))) {
    let u = m[0];
    // Strip trailing punctuation from prose, but keep the "]" that closes a [1-20] range.
    u = /\[\d+-\d+(?::\d+)?\][^\]]*$/.test(u) && !/\]$/.test(u.replace(/\[\d+-\d+(?::\d+)?\]/g, ''))
      ? u.replace(/[).,;:!?}]+$/, '')
      : u.replace(/[).,;:!?\]}]+$/, '');
    found.push(u);
  }
  // Bare domains like "example.com/gallery" on their own line
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || /^https?:\/\//i.test(t)) continue;
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(t)) found.push('https://' + t);
  }
  const out = [];
  const seen = new Set();
  for (const u of found) {
    for (const e of expandPatterns(u)) {
      if (!seen.has(e)) { seen.add(e); out.push(e); }
    }
  }
  return out;
}

function safeUrl(u, base) {
  try { return new URL(u, base); } catch { return null; }
}

// For de-duplication: drop the #hash, sort query keys, lower-case host.
function normalizeUrl(u) {
  const x = safeUrl(u);
  if (!x) return u;
  x.hash = '';
  x.hostname = x.hostname.toLowerCase();
  const params = [...x.searchParams.entries()].sort((p, q) => (p[0] + '=' + p[1]).localeCompare(q[0] + '=' + q[1]));
  x.search = '';
  for (const [k, v] of params) x.searchParams.append(k, v);
  return x.toString();
}

function extOf(u) {
  const x = safeUrl(u);
  const p = (x ? x.pathname : String(u)).toLowerCase();
  const m = p.match(/\.([a-z0-9]{2,5})$/);
  if (m) return m[1];
  // Some CDNs put the format in the query: ?format=jpg, ?fm=webp, ?ext=png
  if (x) {
    for (const k of ['format', 'fm', 'ext', 'type', 'f']) {
      const v = (x.searchParams.get(k) || '').toLowerCase();
      if (EXT_TO_TYPE[v]) return v;
    }
  }
  return '';
}

function typeFromUrl(u) {
  return EXT_TO_TYPE[extOf(u)] || '';
}

function looksLikeImageUrl(u) {
  if (/^data:image\//i.test(u)) return true;
  return !!typeFromUrl(u);
}

function hostOf(u) {
  const x = safeUrl(u);
  return x ? x.hostname.toLowerCase().replace(/^www\./, '') : '';
}

// Same "site" = same registrable-ish domain (last two labels, or three for co.uk style).
function siteOf(u) {
  const h = hostOf(u);
  const parts = h.split('.');
  if (parts.length <= 2) return h;
  const sl = parts[parts.length - 2];
  const twoPartTld = ['co', 'com', 'org', 'net', 'gov', 'ac', 'edu'].includes(sl) && parts[parts.length - 1].length === 2;
  return parts.slice(twoPartTld ? -3 : -2).join('.');
}

// Patterns: one per line. "*" is a wildcard, "/.../" is a regex. Blank list = matches nothing.
function compilePatterns(text) {
  const lines = String(text || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  return lines.map((line) => {
    if (line.length > 2 && line.startsWith('/') && line.lastIndexOf('/') > 0) {
      const last = line.lastIndexOf('/');
      try { return new RegExp(line.slice(1, last), line.slice(last + 1) || 'i'); } catch { return null; }
    }
    const esc = line.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(esc, 'i');
  }).filter(Boolean);
}

function matchesAny(u, compiled) {
  return compiled.some((re) => re.test(u));
}

// Site boosters: known ways popular sites hide the original behind a resized copy.
// Each returns full-size alternatives to try first; the found URL is always the fallback.
function siteBoosters(x) {
  const h = x.hostname.toLowerCase();
  const out = [];
  const href = x.toString();
  const add = (v) => { if (v && v !== href) out.push(v); };
  // Reddit: preview.redd.it/title-v0-abc123.jpeg?width=640&... -> i.redd.it/abc123.jpeg
  if (h === 'preview.redd.it') {
    const m = x.pathname.match(/\/(?:.*-v0-)?([a-z0-9]+\.(?:jpe?g|png|gif|webp))$/i);
    if (m) add('https://i.redd.it/' + m[1]);
  }
  // Imgur: abc1234s.jpg / abc1234m.jpg / abc1234h.jpg -> abc1234.jpg
  if (h === 'i.imgur.com') {
    const m = x.pathname.match(/^\/([A-Za-z0-9]{5,7})[smtlhb]\.(jpe?g|png|gif|webp)$/);
    if (m) add(`https://i.imgur.com/${m[1]}.${m[2]}`);
  }
  // Pinterest: i.pinimg.com/236x/.. or /564x/.. -> /originals/.. then /736x/..
  if (h === 'i.pinimg.com') {
    const m = x.pathname.match(/^\/(\d+x(?:\d+)?|\d+x\d+_RS)\/(.+)$/);
    if (m) { add(`https://i.pinimg.com/originals/${m[2]}`); if (!/^736x/.test(m[1])) add(`https://i.pinimg.com/736x/${m[2]}`); }
  }
  // Twitter / X: ?name=small|medium|900x900 -> ?name=orig ; old style :large -> ?name=orig
  if (h === 'pbs.twimg.com' && x.pathname.startsWith('/media/')) {
    const y = new URL(href);
    const old = y.pathname.match(/^(\/media\/[^.:]+)\.(jpg|png|webp):\w+$/);
    if (old) { y.pathname = old[1]; y.search = ''; y.searchParams.set('format', old[2]); }
    else if (/\.(jpg|png|webp)$/.test(y.pathname)) { const e = y.pathname.split('.').pop(); y.pathname = y.pathname.replace(/\.\w+$/, ''); y.searchParams.set('format', e); }
    y.searchParams.set('name', 'orig');
    add(y.toString());
  }
  // Tumblr: old _500.jpg -> _1280.jpg ; new /s640x960/ -> /s2048x3072/
  if (/(^|\.)media\.tumblr\.com$/.test(h)) {
    if (/_\d{2,4}\.(jpe?g|png|gif)$/.test(x.pathname)) add(href.replace(/_\d{2,4}\.(jpe?g|png|gif)(\?.*)?$/, '_1280.$1'));
    if (/\/s\d+x\d+\//.test(x.pathname)) add(href.replace(/\/s\d+x\d+\//, '/s2048x3072/'));
  }
  // Flickr: _m/_n/_q/_s/_t/_w/_z/_c.jpg -> _b.jpg (1024px, always public)
  if (/(^|\.)staticflickr\.com$/.test(h)) {
    const m = x.pathname.match(/^(.+_[0-9a-f]+)_[mnqstwzc]\.jpg$/);
    if (m) add(`${x.origin}${m[1]}_b.jpg`); else if (/_[0-9a-f]+\.jpg$/.test(x.pathname) && !/_[a-z0-9]\.jpg$/.test(x.pathname.replace(/_[0-9a-f]{10}\.jpg$/, ''))) add(href.replace(/\.jpg$/, '_b.jpg'));
  }
  // ArtStation: /smaller_square/, /small/, /medium/, /large/ -> /4k/ then /large/
  if (/(^|\.)artstation\.com$/.test(h) && /\/(smaller_square|micro_square|small_square|small|medium|large)\//.test(x.pathname)) {
    add(href.replace(/\/(smaller_square|micro_square|small_square|small|medium|large)\//, '/4k/'));
    add(href.replace(/\/(smaller_square|micro_square|small_square|small|medium)\//, '/large/'));
  }
  // DeviantArt (wixmp): drop the /v1/fill/... resize step
  if (/wixmp\.com$/.test(h) && /\/v1\/(fill|fit|crop)\//.test(x.pathname)) add(href.replace(/\/v1\/(fill|fit|crop)\/[^/]+\/[^/?]+/, ''));
  // Wallhaven: th.wallhaven.cc/small/ab/abcdef.jpg -> w.wallhaven.cc/full/ab/wallhaven-abcdef.jpg (+ .png)
  if (h === 'th.wallhaven.cc') {
    const m = x.pathname.match(/^\/(?:small|lg|orig)\/([a-z0-9]{2})\/([a-z0-9]+)\.(jpg|png|webp)$/);
    if (m) { add(`https://w.wallhaven.cc/full/${m[1]}/wallhaven-${m[2]}.jpg`); add(`https://w.wallhaven.cc/full/${m[1]}/wallhaven-${m[2]}.png`); }
  }
  // Wikipedia / Wikimedia: /thumb/a/ab/File.jpg/220px-File.jpg -> /a/ab/File.jpg
  if (h === 'upload.wikimedia.org' && x.pathname.includes('/thumb/')) {
    const m = x.pathname.match(/^(.*)\/thumb(\/[0-9a-f]\/[0-9a-f]{2}\/[^/]+)\/[^/]+$/);
    if (m) add(`${x.origin}${m[1]}${m[2]}`);
  }
  // Image boards: /board/1700000000000s.jpg (thumbnail) -> /board/1700000000000.jpg / .png / .gif / .webp
  {
    const m = x.pathname.match(/^\/(\w+)\/(\d{10,})s\.jpg$/);
    if (m) for (const e of ['jpg', 'png', 'gif', 'webp']) add(`${x.origin}/${m[1]}/${m[2]}.${e}`);
  }
  // Steam / Shopify / Squarespace style size suffixes
  if (/cdn\.shopify\.com$/.test(h)) add(href.replace(/_(\d+x\d*|\d*x\d+|pico|icon|thumb|small|compact|medium|large|grande)(@2x)?(?=\.(jpe?g|png|gif|webp))/i, ''));
  if (/squarespace-cdn\.com$/.test(h) && x.searchParams.has('format')) { const y = new URL(href); y.searchParams.set('format', '2500w'); add(y.toString()); }
  return out;
}

// Try to get the original-size version of a resized image URL.
// Returns a list of alternatives to try first (the original URL is always the fallback).
function fullSizeCandidates(u, opts) {
  const x = safeUrl(u);
  if (!x || x.protocol === 'data:') return [];
  const alts = new Set();
  if (!opts || opts.boosters !== false) for (const a of siteBoosters(x)) alts.add(a);
  // WordPress / many CMSs: photo-300x200.jpg -> photo.jpg
  const wp = x.pathname.replace(/-\d{2,5}x\d{2,5}(?=\.[a-z0-9]{2,5}$)/i, '');
  if (wp !== x.pathname) { const y = new URL(x); y.pathname = wp; alts.add(y.toString()); }
  // "_thumb", "-thumb", "_small", "_medium" before the extension
  const th = x.pathname.replace(/[-_](thumb|thumbnail|small|medium|preview|th|sm|md)(?=\.[a-z0-9]{2,5}$)/i, '');
  if (th !== x.pathname) { const y = new URL(x); y.pathname = th; alts.add(y.toString()); }
  // Resize query parameters: ?w=300&h=200, ?width=, ?resize=, ?size=
  const resizeKeys = ['w', 'h', 'width', 'height', 'resize', 'size', 'fit', 'crop', 'quality', 'q', 'dpr', 'auto'];
  if (resizeKeys.some((k) => x.searchParams.has(k))) {
    const y = new URL(x);
    for (const k of resizeKeys) y.searchParams.delete(k);
    alts.add(y.toString());
  }
  alts.delete(x.toString());
  return [...alts];
}

function applyRewrites(u, rules) {
  let out = u;
  for (const r of rules || []) {
    if (!r || !r.find) continue;
    try { out = out.replace(new RegExp(r.find, 'g'), r.replace || ''); } catch { /* bad regex: ignore */ }
  }
  return out;
}

module.exports = {
  IMAGE_EXTS, EXT_TO_TYPE, expandPatterns, extractUrls, safeUrl, normalizeUrl, extOf, typeFromUrl,
  looksLikeImageUrl, hostOf, siteOf, compilePatterns, matchesAny, fullSizeCandidates, siteBoosters, applyRewrites
};
