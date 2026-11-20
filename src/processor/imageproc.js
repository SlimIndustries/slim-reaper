'use strict';
// Runs inside a hidden Chromium window. Uses the browser's own decoders, so it can read
// JPG, PNG, WEBP, AVIF, GIF, BMP and ICO with no extra libraries.
// Returns: width, height, a 64-bit "visual fingerprint" (dHash) for near-duplicate checks,
// optionally a converted copy (WEBP/AVIF -> JPG or PNG), and a small color palette.

async function reaperProcessImage(bytes, mime, opts) {
  opts = opts || {};
  const result = { w: 0, h: 0, dhash: '', converted: null, convertedType: '', palette: [], thumb: null };
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

  if (mime === 'image/svg+xml') {
    const text = new TextDecoder().decode(u8.slice(0, 4096));
    const wm = text.match(/<svg[^>]*\swidth=["']?([\d.]+)/i);
    const hm = text.match(/<svg[^>]*\sheight=["']?([\d.]+)/i);
    const vb = text.match(/viewBox=["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
    result.w = Math.round(parseFloat(wm ? wm[1] : vb ? vb[1] : 0)) || 0;
    result.h = Math.round(parseFloat(hm ? hm[1] : vb ? vb[2] : 0)) || 0;
    return result;
  }

  let bmp;
  try {
    bmp = await createImageBitmap(new Blob([u8], { type: mime || 'application/octet-stream' }));
  } catch (e) {
    return result; // format the browser can't decode (e.g. TIFF/HEIC): keep the file, size unknown
  }
  result.w = bmp.width;
  result.h = bmp.height;

  if (opts.hash !== false) {
    const c = new OffscreenCanvas(9, 8);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0, 9, 8);
    const d = ctx.getImageData(0, 0, 9, 8).data;
    const gray = [];
    for (let i = 0; i < d.length; i += 4) gray.push(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
    let bits = '';
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += gray[y * 9 + x] > gray[y * 9 + x + 1] ? '1' : '0';
    let hex = '';
    for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    result.dhash = hex;
  }

  if (opts.palette) {
    const c = new OffscreenCanvas(32, 32);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0, 32, 32);
    const d = ctx.getImageData(0, 0, 32, 32).data;
    const buckets = new Map();
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      const key = ((d[i] >> 5) << 6) | ((d[i + 1] >> 5) << 3) | (d[i + 2] >> 5);
      const b = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
      b.n++; b.r += d[i]; b.g += d[i + 1]; b.b += d[i + 2];
      buckets.set(key, b);
    }
    result.palette = [...buckets.values()].sort((a, b) => b.n - a.n).slice(0, 6).map((b) => {
      const h = (v) => Math.round(v / b.n).toString(16).padStart(2, '0');
      return '#' + h(b.r) + h(b.g) + h(b.b);
    });
  }

  if (opts.thumb) {
    const scale = Math.min(1, opts.thumb / Math.max(bmp.width, bmp.height));
    const tw = Math.max(1, Math.round(bmp.width * scale)), th = Math.max(1, Math.round(bmp.height * scale));
    const c = new OffscreenCanvas(tw, th);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#161A22'; ctx.fillRect(0, 0, tw, th);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, tw, th);
    const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
    result.thumb = new Uint8Array(await blob.arrayBuffer());
  }

  if (opts.convert === 'jpg' || opts.convert === 'png') {
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = c.getContext('2d');
    if (opts.convert === 'jpg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.drawImage(bmp, 0, 0);
    const blob = await c.convertToBlob(opts.convert === 'jpg' ? { type: 'image/jpeg', quality: 0.93 } : { type: 'image/png' });
    result.converted = new Uint8Array(await blob.arrayBuffer());
    result.convertedType = opts.convert;
  }
  if (bmp.close) bmp.close();
  return result;
}

if (typeof module !== 'undefined') module.exports = { reaperProcessImage };
if (typeof window !== 'undefined') window.reaperProcessImage = reaperProcessImage;
