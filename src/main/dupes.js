'use strict';
// Duplicate Finder: walks a folder, fingerprints every image (exact SHA-256 + visual dHash),
// groups exact copies and look-alikes (resized / recompressed / re-saved), and picks the best
// copy in each group to keep. Fingerprints are cached, so re-checking a folder is fast.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const IMG = /\.(jpe?g|jfif|png|gif|webp|avif|bmp|ico|tiff?)$/i;

async function listImages(dir, recursive, signal, limit = 200000) {
  const out = [];
  const walk = async (d, depth) => {
    if (signal && signal.aborted) return;
    let ents = [];
    try { ents = await fsp.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (out.length >= limit) return;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (recursive && depth < 12 && !e.name.startsWith('.') && e.name !== '$RECYCLE.BIN') await walk(p, depth + 1); }
      else if (IMG.test(e.name)) out.push(p);
    }
  };
  await walk(dir, 0);
  return out;
}

// 16-hex-char dHash -> two 32-bit numbers so comparisons are fast
function splitHash(hex) { return [parseInt(hex.slice(0, 8), 16) >>> 0, parseInt(hex.slice(8, 16), 16) >>> 0]; }
function pop32(x) { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; }

function pickBest(items) {
  return items.slice().sort((a, b) =>
    (b.w * b.h) - (a.w * a.h) || b.bytes - a.bytes || a.name.length - b.name.length || a.mtime - b.mtime)[0];
}

// items: [{ path, name, sha, dhash, w, h, bytes, mtime, thumb }]
// similarity: 100 = exact copies only; 95/90/85 = how alike look-alikes must be
function groupDuplicates(items, similarity) {
  const groups = [];
  // 1) exact copies
  const bySha = new Map();
  for (const it of items) { if (!it.sha) continue; const g = bySha.get(it.sha) || []; g.push(it); bySha.set(it.sha, g); }
  const reps = [];
  for (const g of bySha.values()) reps.push(g);
  // 2) look-alikes between different files (union-find over one representative per exact group)
  const parent = reps.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  if (similarity < 100) {
    const maxDist = Math.round(64 * (100 - similarity) / 100);
    const H = reps.map((g) => (g[0].dhash && g[0].dhash.length === 16 ? splitHash(g[0].dhash) : null));
    const AR = reps.map((g) => (g[0].w && g[0].h ? g[0].w / g[0].h : 0));
    for (let i = 0; i < reps.length; i++) {
      const a = H[i]; if (!a) continue;
      for (let j = i + 1; j < reps.length; j++) {
        const b = H[j]; if (!b) continue;
        if (AR[i] && AR[j] && Math.abs(AR[i] - AR[j]) / Math.max(AR[i], AR[j]) > 0.12) continue; // different shapes
        if (pop32(a[0] ^ b[0]) + pop32(a[1] ^ b[1]) <= maxDist) { const ri = find(i), rj = find(j); if (ri !== rj) parent[rj] = ri; }
      }
    }
  }
  const merged = new Map();
  reps.forEach((g, i) => { const r = find(i); const m = merged.get(r) || []; m.push(...g); merged.set(r, m); });
  for (const list of merged.values()) {
    if (list.length < 2) continue;
    const best = pickBest(list);
    const shaCount = new Set(list.map((x) => x.sha)).size;
    const reclaim = list.filter((x) => x !== best).reduce((s, x) => s + x.bytes, 0);
    groups.push({ id: best.sha.slice(0, 12) + '-' + list.length, kind: shaCount === 1 ? 'exact' : 'similar', best: best.path, items: list.sort((a, b) => (a === best ? -1 : b === best ? 1 : (b.w * b.h) - (a.w * a.h))), reclaim });
  }
  groups.sort((a, b) => b.reclaim - a.reclaim);
  return groups;
}

// getInfo(file, stat) -> { sha, dhash, w, h, thumb } (uses the cache or reads the file)
async function findDuplicates({ dir, recursive, similarity, getInfo, onProgress, signal }) {
  const files = await listImages(dir, recursive !== false, signal);
  const items = [];
  let done = 0, lastPing = 0;
  const queue = files.slice();
  const worker = async () => {
    while (queue.length) {
      if (signal && signal.aborted) return;
      const f = queue.shift();
      try {
        const st = await fsp.stat(f);
        const info = await getInfo(f, st);
        if (info && info.sha) items.push({ path: f, name: path.basename(f), sha: info.sha, dhash: info.dhash || '', w: info.w || 0, h: info.h || 0, bytes: st.size, mtime: st.mtimeMs, thumb: info.thumb || '', format: (path.extname(f).slice(1) || '').toLowerCase().replace('jpeg', 'jpg') });
      } catch { /* unreadable file */ }
      done++;
      if (onProgress && (Date.now() - lastPing > 150 || done === files.length)) { lastPing = Date.now(); onProgress({ phase: 'reading', done, total: files.length }); }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  if (signal && signal.aborted) return { cancelled: true, groups: [], scanned: done };
  if (onProgress) onProgress({ phase: 'comparing', done: files.length, total: files.length });
  const groups = groupDuplicates(items, similarity);
  return { groups, scanned: items.length, files: files.length };
}

module.exports = { findDuplicates, groupDuplicates, listImages, pickBest };
