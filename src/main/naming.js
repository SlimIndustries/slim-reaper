'use strict';
// Decides where each image goes and what it's called.
const path = require('path');
const fs = require('fs');
const { safeUrl, hostOf, extOf, EXT_TO_TYPE } = require('../shared/urls');

// Read the first bytes of a file to learn what it really is (servers often lie).
function sniffType(buf) {
  if (!buf || buf.length < 12) return '';
  const b = buf;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
    if (brand === 'avif' || brand === 'avis') return 'avif';
    if (['heic', 'heix', 'mif1', 'msf1', 'hevc'].includes(brand)) return 'heic';
  }
  if (b[0] === 0x42 && b[1] === 0x4d) return 'bmp';
  if (b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00) return 'ico';
  if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a) || (b[0] === 0x4d && b[1] === 0x4d && b[3] === 0x2a)) return 'tiff';
  const head = buf.slice(0, Math.min(buf.length, 512)).toString('utf8').trim().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'svg';
  if (head.startsWith('<!doctype html') || head.startsWith('<html')) return 'html';
  return '';
}

const MIME = { jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', ico: 'image/x-icon', tiff: 'image/tiff', svg: 'image/svg+xml', heic: 'image/heic' };
const EXT_FOR_TYPE = { jpg: 'jpg', png: 'png', gif: 'gif', webp: 'webp', avif: 'avif', bmp: 'bmp', ico: 'ico', tiff: 'tif', svg: 'svg', heic: 'heic' };

function typeFromContentType(ct) {
  const m = String(ct || '').toLowerCase().match(/image\/([a-z0-9.+-]+)/);
  if (!m) return '';
  const t = m[1].replace('x-icon', 'ico').replace('vnd.microsoft.icon', 'ico').replace('svg+xml', 'svg').replace('jpeg', 'jpg').replace('pjpeg', 'jpg');
  return EXT_TO_TYPE[t] || (MIME[t] ? t : '');
}

const BAD = /[<>:"/\\|?*\u0000-\u001f]/g;
function cleanPart(s, max = 80) {
  let out = String(s || '').replace(BAD, '_').replace(/\s+/g, ' ').trim();
  out = out.replace(/^\.+/, '').replace(/[. ]+$/, '');
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(out)) out = '_' + out;
  return out.slice(0, max) || '_';
}

function originalBaseName(u) {
  const x = safeUrl(u);
  if (!x || x.protocol === 'data:') return 'image';
  let base = decodeURIComponent(x.pathname.split('/').pop() || '').replace(/\.[a-z0-9]{2,5}$/i, '');
  if (!base || base.length < 2) base = (x.pathname.split('/').filter(Boolean).slice(-2, -1)[0] || hostOf(u) || 'image');
  return cleanPart(base, 100);
}

function pad(n, w) { return String(n).padStart(w, '0'); }
function dateParts(d) {
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`, time: `${pad(d.getHours(), 2)}-${pad(d.getMinutes(), 2)}-${pad(d.getSeconds(), 2)}` };
}

// ---- Clean "page title" folder names ----
const SITE_NAMES = { 'reddit.com': 'Reddit', 'redd.it': 'Reddit', 'imgur.com': 'Imgur', 'pinterest.com': 'Pinterest', 'x.com': 'X', 'twitter.com': 'X', 'tumblr.com': 'Tumblr', 'flickr.com': 'Flickr', 'artstation.com': 'ArtStation', 'deviantart.com': 'DeviantArt', 'wallhaven.cc': 'Wallhaven', 'unsplash.com': 'Unsplash', 'pexels.com': 'Pexels', 'instagram.com': 'Instagram', 'wikipedia.org': 'Wikipedia', 'wikimedia.org': 'Wikimedia', 'nasa.gov': 'NASA' };
function siteLabel(u) {
  const h = hostOf(u);
  const parts = h.split('.');
  for (let i = 0; i < parts.length - 1; i++) { const k = parts.slice(i).join('.'); if (SITE_NAMES[k]) return SITE_NAMES[k]; }
  const core = parts.length >= 2 ? parts[parts.length - 2] : h;
  return core ? core.charAt(0).toUpperCase() + core.slice(1) : 'Site';
}
const deslug = (s) => decodeURIComponent(String(s || '')).replace(/[-_+]+/g, ' ').replace(/\s+/g, ' ').trim();
// Removes "- SiteName", "| Reddit", "– Album on Imgur", "| Download Free Images on Unsplash"…
// Splits the title on separators and drops leading/trailing parts that mention the site.
function stripSiteFromTitle(title, label, host) {
  const t = String(title || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const squash = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const keys = [squash(label), squash(host.split('.')[0]), squash(host.replace(/\.\w+$/, ''))].filter((k) => k.length >= 3);
  const parts = t.split(/\s+[-|–—•·:]\s+|\s*\|\s*/).map((x) => x.trim()).filter(Boolean);
  const mentions = (x) => keys.some((k) => squash(x).includes(k));
  while (parts.length > 1 && mentions(parts[parts.length - 1])) parts.pop();
  while (parts.length > 1 && mentions(parts[0])) parts.shift();
  if (parts.length === 1 && mentions(parts[0]) && squash(parts[0]).length <= keys[0].length + 3) return '';
  let out = parts.join(' - ');
  // "Dragon Rider on ArtStation", "… at Flickr", "… via Imgur"
  for (const k of [label, host.split('.')[0]]) if (k) out = out.replace(new RegExp('\\s+(on|at|from|via)\\s+' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'i'), '');
  // Very long SEO titles: keep the part before the first comma
  if (out.length > 60 && out.indexOf(', ') > 8) out = out.slice(0, out.indexOf(', '));
  return out.trim();
}
function pageFolderName(url, title) {
  const x = safeUrl(url);
  const label = siteLabel(url);
  if (!x) return cleanPart(label, 100);
  const host = hostOf(url);
  const seg = x.pathname.split('/').filter(Boolean);
  let name = '';
  const thread = x.pathname.match(/^\/(\w+)\/thread\/(\d+)(?:\/([^/?#]+))?/);
  if (thread) {
    // Image-board style thread: /board/thread/123456789/thread-name
    const [, board, num, slugPart] = thread;
    let subject = deslug(slugPart || '');
    if (!subject && title) { const m = String(title).match(/^\/\w+\/\s*-\s*(.*?)\s*-\s*[^-]+-\s*[^-]+$/); subject = m ? m[1] : ''; }
    name = [board, num, subject].filter(Boolean).join(' - ');  } else if (label === 'Reddit') {
    const ri = seg.indexOf('r'), ci = seg.indexOf('comments');
    if (ri >= 0 && seg[ri + 1]) {
      const sub = 'r-' + seg[ri + 1];
      if (ci >= 0) name = [sub, deslug(seg[ci + 2] || '') || seg[ci + 1]].filter(Boolean).join(' - ');
      else name = [sub, seg[ri + 2] || ''].filter(Boolean).join(' - ');
    } else if (seg[0] === 'user' || seg[0] === 'u') name = 'u-' + (seg[1] || '');
  } else if (label === 'Imgur' && (seg[0] === 'a' || seg[0] === 'gallery' || seg[0] === 'album')) {
    const t = stripSiteFromTitle(title, label, host);
    name = t && !/^imgur/i.test(t) ? `${t} - ${seg[1] || ''}` : seg[1] || '';
  } else if (label === 'Pinterest' && seg.length >= 2 && seg[0] !== 'pin' && seg[0] !== 'search') {
    name = `${seg[0]} - ${deslug(seg[1])}`;
  }
  if (!name) {
    name = stripSiteFromTitle(title, label, host);
    if (!name || name.length < 2) name = seg.length ? seg.slice(-2).map(deslug).join(' - ') : '';
  }
  name = name.replace(/\//g, '-');
  return cleanPart(name ? `${label} - ${name}` : label, 110);
}

// Folder for an image based on the chosen layout.
function folderFor(outDir, layout, job, pageTitle, when) {
  const site = cleanPart(hostOf(job.url) || 'site').replace(/\./g, '-');
  const d = dateParts(when || new Date());
  switch (layout) {
    case 'one': return outDir;
    case 'url': {
      const x = safeUrl(job.url);
      const tail = x ? cleanPart((x.hostname + x.pathname).replace(/\/+$/, '').replace(/\//g, '_'), 90) : site;
      return path.join(outDir, tail);
    }
    case 'site-date': return path.join(outDir, site, d.date);
    case 'title': return path.join(outDir, pageFolderName(job.url, job.folderTitle || pageTitle || job.title || ''));
    case 'site-title': return path.join(outDir, cleanPart(siteLabel(job.url)), pageFolderName(job.url, job.folderTitle || pageTitle || '').replace(/^[^-]+ - /, '') || '_');
    case 'site':
    default: return path.join(outDir, site);
  }
}

// Tokens: {site} {date} {time} {n} {n:4} {original} {w} {h} {wxh} {title} {hash} {alt} {page}
function fileBase(pattern, info) {
  const d = dateParts(info.when || new Date());
  let s = String(pattern || '{original}');
  s = s.replace(/\{n(?::(\d))?\}/g, (_, w) => pad(info.n, parseInt(w || '4', 10)));
  const map = {
    site: (hostOf(info.pageUrl || info.url) || 'site').replace(/\./g, '-'),
    date: d.date, time: d.time,
    original: originalBaseName(info.url),
    w: info.w || 0, h: info.h || 0, wxh: `${info.w || 0}x${info.h || 0}`,
    title: info.title || '', alt: info.alt || '', hash: (info.sha || '').slice(0, 10),
    page: (() => { const x = safeUrl(info.pageUrl); return x ? x.pathname.split('/').filter(Boolean).pop() || x.hostname : ''; })()
  };
  s = s.replace(/\{(site|date|time|original|w|h|wxh|title|alt|hash|page)\}/g, (_, k) => String(map[k]));
  return cleanPart(s, 150);
}

// Pick a free filename according to the conflict rule. Returns null when the rule says skip.
function resolveConflict(dir, base, ext, mode, reserved) {
  const name = (b) => path.join(dir, `${b}.${ext}`);
  const taken = (p) => fs.existsSync(p) || (reserved && reserved.has(p.toLowerCase()));
  let p = name(base);
  if (!taken(p)) return p;
  if (mode === 'overwrite') return p;
  if (mode === 'skip') return null;
  for (let i = 2; i < 100000; i++) {
    p = name(`${base} (${i})`);
    if (!taken(p)) return p;
  }
  return name(`${base}-${Date.now()}`);
}

// Optional sorting subfolder inside the normal folder.
function sortFolder(mode, w, h, type) {
  if (!mode || mode === 'off') return '';
  if (mode === 'orientation') { if (!w || !h) return 'Unknown'; if (Math.abs(w - h) / Math.max(w, h) <= 0.05) return 'Square'; return w > h ? 'Landscape' : 'Portrait'; }
  if (mode === 'resolution') { const m = Math.max(w || 0, h || 0); if (!m) return 'Unknown'; return m >= 3840 ? '4K+' : m >= 1920 ? 'HD' : m >= 1000 ? 'Medium' : 'Small'; }
  if (mode === 'format') return String(type || 'other').toUpperCase();
  return '';
}

function guessTypeForUrl(u) {
  return EXT_TO_TYPE[extOf(u)] || '';
}

module.exports = { pageFolderName, siteLabel, stripSiteFromTitle, sortFolder, sniffType, typeFromContentType, MIME, EXT_FOR_TYPE, cleanPart, originalBaseName, folderFor, fileBase, resolveConflict, guessTypeForUrl };
