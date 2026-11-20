'use strict';
// These functions are injected into each web page the reaper visits.
// They run inside the page (like browser devtools), so they can see lazy-loaded,
// script-built and CSS images that a plain HTML download would miss.

/* eslint-disable no-undef */
function reaperExtract(opts) {
  opts = opts || {};
  const seen = (window.__reaperSeen = window.__reaperSeen || new Set());
  const out = [];
  const IMG_RE = /\.(jpe?g|jfif|png|apng|webp|gif|svg|avif|bmp|ico|tiff?|heic)(\?|#|$)/i;
  const abs = (u) => { try { return new URL(u, document.baseURI).href; } catch (e) { return null; } };
  const add = (u, kind, w, h, alt) => {
    if (!u) return;
    u = String(u).trim();
    if (!u || u === 'about:blank') return;
    if (u.startsWith('data:')) {
      if (!opts.includeDataUris || !/^data:image\//i.test(u) || u.length < 1500) return;
    } else {
      u = abs(u);
      if (!u || !/^https?:/i.test(u)) return;
    }
    const key = kind + '|' + u;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ url: u, kind: kind, w: w || 0, h: h || 0, alt: alt ? String(alt).slice(0, 200) : '' });
  };
  const parseSrcset = (s) => {
    if (!s) return [];
    return s.split(/,\s+(?=\S)/).map((part) => {
      const bits = part.trim().split(/\s+/);
      const url = bits[0];
      const d = bits[1] || '1x';
      const n = parseFloat(d) || 1;
      return { url: url, score: /w$/i.test(d) ? n : n * 1000 };
    }).filter((c) => c.url);
  };
  const pickFromSrcset = (s) => {
    const c = parseSrcset(s);
    if (!c.length) return null;
    c.sort((a, b) => b.score - a.score);
    return opts.grabLargest === false ? c[c.length - 1].url : c[0].url;
  };
  const LAZY = ['data-src', 'data-lazy-src', 'data-original', 'data-lazy', 'data-url', 'data-hi-res-src', 'data-full', 'data-fullsrc', 'data-large', 'data-large-file', 'data-orig-file', 'data-zoom-image', 'data-zoom', 'data-highres', 'data-image', 'data-img', 'data-src-large'];
  const LAZY_SET = ['data-srcset', 'data-lazy-srcset'];

  // 1) <img> tags, including lazy-load attributes and srcset
  for (const img of Array.from(document.images)) {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, alt = img.alt;
    // A small preview that links straight to its full-size file is marked 'thumb'
    const wrap = img.closest('a[href]');
    const wrapHref = wrap ? wrap.getAttribute('href') || '' : '';
    if (wrap && IMG_RE.test(wrapHref) && opts.includeLinkedImages !== false) {
      const full = abs(wrapHref);
      const src = abs(img.currentSrc || img.src);
      if (full && src && full !== src) { add(src, 'thumb', w, h, alt); continue; }
    }
    let best = null;
    const ss = img.getAttribute('srcset') || '';
    if (ss) best = pickFromSrcset(ss);
    for (const a of LAZY_SET) { const v = img.getAttribute(a); if (v) best = pickFromSrcset(v) || best; }
    add(best || img.currentSrc || img.src, 'img', w, h, alt);
    if (!best && img.currentSrc && img.currentSrc !== img.src) add(img.src, 'img', w, h, alt);
    for (const a of LAZY) { const v = img.getAttribute(a); if (v && !/^\s*$/.test(v)) add(v, 'img', 0, 0, alt); }
  }
  // 2) <picture><source srcset>
  for (const s of Array.from(document.querySelectorAll('picture source[srcset], picture source[data-srcset]'))) {
    add(pickFromSrcset(s.getAttribute('srcset') || s.getAttribute('data-srcset')), 'img', 0, 0, '');
  }
  // 3) Links straight to image files (full-size behind thumbnails)
  if (opts.includeLinkedImages !== false) {
    for (const a of Array.from(document.querySelectorAll('a[href]'))) {
      const href = a.getAttribute('href');
      if (href && IMG_RE.test(href)) {
        const t = a.querySelector('img');
        add(href, 'link', 0, 0, (t && t.alt) || a.title || '');
      }
    }
  }
  // 4) CSS background images (inline and computed)
  if (opts.includeCssBackgrounds !== false) {
    const els = document.body ? document.body.getElementsByTagName('*') : [];
    const limit = Math.min(els.length, 12000);
    for (let i = 0; i < limit; i++) {
      const el = els[i];
      let bg = '';
      try { bg = getComputedStyle(el).backgroundImage; } catch (e) { bg = ''; }
      if (bg && bg !== 'none' && bg.indexOf('url(') !== -1) {
        const re = /url\((['"]?)(.*?)\1\)/g;
        let m;
        while ((m = re.exec(bg))) add(m[2], 'css', el.clientWidth, el.clientHeight, el.getAttribute('aria-label') || '');
      }
    }
  }
  // 5) Share previews and icons
  if (opts.includeSharePreviews) {
    for (const m of Array.from(document.querySelectorAll('meta[property="og:image"], meta[property="og:image:url"], meta[property="og:image:secure_url"], meta[name="twitter:image"], meta[name="twitter:image:src"], link[rel="image_src"]'))) {
      add(m.getAttribute('content') || m.getAttribute('href'), 'meta', 0, 0, '');
    }
  }
  if (opts.includeFavicons) {
    for (const l of Array.from(document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="mask-icon"]'))) add(l.getAttribute('href'), 'icon', 0, 0, '');
  }
  // 6) Video posters
  for (const v of Array.from(document.querySelectorAll('video[poster]'))) add(v.getAttribute('poster'), 'img', v.videoWidth, v.videoHeight, '');
  // 7) Inline <svg> drawings
  if (opts.includeInlineSvg) {
    for (const svg of Array.from(document.querySelectorAll('svg'))) {
      const r = svg.getBoundingClientRect();
      if (r.width < 48 || r.height < 48 || svg.closest('svg') !== svg) continue;
      let src = svg.outerHTML;
      if (!/xmlns=/.test(src)) src = src.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      if (src.length > 400000) continue;
      const key = 'svg|' + src.length + '|' + src.slice(0, 200);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ url: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src), kind: 'svg', w: Math.round(r.width), h: Math.round(r.height), alt: svg.getAttribute('aria-label') || '' });
    }
  }
  // 8) Everything the page actually downloaded (catches images built by scripts)
  if (opts.includeNetworkImages !== false && window.performance && performance.getEntriesByType) {
    for (const e of performance.getEntriesByType('resource')) {
      if (e.initiatorType === 'img' || e.initiatorType === 'image' || (IMG_RE.test(e.name) && ['css', 'other', 'fetch', 'xmlhttprequest', 'link'].indexOf(e.initiatorType) !== -1)) {
        add(e.name, 'net', 0, 0, '');
      }
    }
  }

  // Links (for "follow links") and the next page (for pagination)
  let links = [];
  if (opts.wantLinks) {
    const ls = new Set();
    for (const a of Array.from(document.querySelectorAll('a[href]'))) {
      const u = abs(a.getAttribute('href'));
      if (u && /^https?:/i.test(u) && !IMG_RE.test(u)) ls.add(u.split('#')[0]);
      if (ls.size >= 3000) break;
    }
    links = Array.from(ls);
  }
  let next = null;
  if (opts.wantNext) {
    const rel = document.querySelector('link[rel="next"][href], a[rel~="next"][href]');
    if (rel) next = abs(rel.getAttribute('href'));
    if (!next) {
      const cands = Array.from(document.querySelectorAll('a[href]'));
      const NEXT_RE = /^\s*(next|next page|next ›|next »|next →|older posts|older|›|»|→|weiter|suivant|siguiente|próxima|volgende)\s*$/i;
      for (const a of cands) {
        const label = (a.getAttribute('aria-label') || a.textContent || a.title || '').trim();
        if (NEXT_RE.test(label) || /^next/i.test(a.getAttribute('aria-label') || '') || /(^|\s)(next|pagination-next|nav-next)(\s|$)/i.test(a.className || '')) {
          const u = abs(a.getAttribute('href'));
          if (u && /^https?:/i.test(u) && u.split('#')[0] !== location.href.split('#')[0]) { next = u; break; }
        }
      }
    }
  }

  return {
    candidates: out,
    links: links,
    next: next,
    title: document.title || '',
    url: location.href,
    scrollY: window.scrollY,
    viewport: window.innerHeight,
    height: Math.max(document.body ? document.body.scrollHeight : 0, document.documentElement ? document.documentElement.scrollHeight : 0)
  };
}

function reaperScroll() {
  const before = window.scrollY;
  const step = Math.max(400, Math.round(window.innerHeight * 0.9));
  window.scrollBy(0, step);
  // Also nudge the biggest inner scroll box (feeds, galleries that scroll inside a div)
  let box = null, best = 0;
  for (const el of Array.from(document.querySelectorAll('div, main, section, ul'))) {
    if (el.scrollHeight > el.clientHeight + 200 && el.clientHeight > 300) {
      const st = getComputedStyle(el).overflowY;
      if ((st === 'auto' || st === 'scroll') && el.scrollHeight > best) { best = el.scrollHeight; box = el; }
    }
  }
  if (box) box.scrollTop += Math.round(box.clientHeight * 0.9);
  const height = Math.max(document.body ? document.body.scrollHeight : 0, document.documentElement.scrollHeight);
  return { moved: window.scrollY !== before || !!box, atBottom: window.scrollY + window.innerHeight >= height - 4, height: height };
}

function reaperClickLoadMore() {
  const RE = /^\s*(load more|show more|see more|view more|more results|more images|more photos|load more images|load more photos|show all|mehr laden|plus|ver más|cargar más|carica altri)\s*$/i;
  let clicked = 0;
  for (const el of Array.from(document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]'))) {
    const label = (el.getAttribute('aria-label') || el.value || el.textContent || '').trim();
    if (!label || label.length > 40 || !RE.test(label)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (el.tagName === 'A') {
      const href = el.getAttribute('href') || '';
      if (href && !href.startsWith('#') && !href.startsWith('javascript')) continue; // real navigation: pagination handles it
    }
    if (el.__reaperClicks > 40) continue;
    el.__reaperClicks = (el.__reaperClicks || 0) + 1;
    try { el.scrollIntoView({ block: 'center' }); el.click(); clicked++; } catch (e) { /* ignore */ }
  }
  return clicked;
}

// Dismiss the most common cookie banners so they don't block scrolling.
function reaperDismissBanners() {
  const RE = /^\s*(accept|accept all|accept all cookies|i agree|agree|got it|allow all|ok|okay|alle akzeptieren|tout accepter|aceptar|aceptar todo)\s*$/i;
  let n = 0;
  for (const el of Array.from(document.querySelectorAll('button, [role="button"], a'))) {
    const t = (el.textContent || '').trim();
    if (t && t.length < 30 && RE.test(t)) {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) { try { el.click(); n++; } catch (e) { /* ignore */ } }
    }
    if (n >= 2) break;
  }
  return n;
}

const call = (fn, arg) => `(${fn.toString()})(${arg === undefined ? '' : JSON.stringify(arg)})`;

module.exports = {
  reaperExtract, reaperScroll, reaperClickLoadMore, reaperDismissBanners,
  extractCall: (opts) => call(reaperExtract, opts),
  scrollCall: () => call(reaperScroll),
  loadMoreCall: () => call(reaperClickLoadMore),
  dismissCall: () => call(reaperDismissBanners)
};
