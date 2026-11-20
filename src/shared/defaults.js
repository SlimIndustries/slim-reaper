'use strict';
// Every setting the app has, with its default value.
// The Rules screen and the engine both read from this shape.

// Addresses that are almost never "real" pictures (site graphics, ads, avatars…)
const JUNK_PATTERNS = ['*logo*', '*icon*', '*favicon*', '*sprite*', '*avatar*', '*badge*', '*emoji*', '*emoticon*', '*/ads/*', '*/ad/*', '*advert*', '*banner*', '*button*', '*placeholder*', '*spinner*', '*loading*', '*tracking*', '*1x1*', '*blank.*', '*spacer*'].join('\n');

const DEFAULT_RULES = {
  // Image filters
  minWidth: 400,
  minHeight: 400,
  maxWidth: 0,              // 0 = no limit
  maxHeight: 0,
  minFileKB: 10,
  maxFileMB: 0,             // 0 = no limit
  types: { jpg: true, png: true, webp: true, gif: true, svg: false, avif: true, bmp: false, ico: false, tiff: false },
  orientation: 'any',       // any | landscape | portrait | square
  minAspect: 0,             // e.g. 1.5 for wide only; 0 = off
  grabLargest: true,        // pick the biggest srcset candidate
  includeCssBackgrounds: true,
  includeSharePreviews: false, // og:image / twitter:image
  includeLinkedImages: true,   // <a href="big.jpg"> around thumbnails
  includeNetworkImages: true,  // anything the page actually loaded
  includeInlineSvg: false,
  includeDataUris: false,
  includeFavicons: false,
  smartFullSize: true,      // try the original-size version of resized CDN URLs first
  urlInclude: '',           // one pattern per line; * wildcards or /regex/
  urlExclude: JUNK_PATTERNS,
  blockedDomains: [],       // "Never grab from here"
  rewriteRules: [],         // [{ find: 'regex', replace: '...' }]
  maxImagesPerUrl: 0,       // 0 = no limit
  skipPreviewsOfLinked: true, // a thumbnail that links to its full image: keep only the full one
  siteBoosters: true,       // built-in full-size tricks for Reddit, Imgur, Pinterest, X, Tumblr, Flickr…

  // Duplicates
  skipExactDupes: true,
  skipNearDupes: true,
  nearDupeSensitivity: 92,  // % similarity that counts as the same picture
  checkExistingFolder: true,
  rememberAcrossScans: true,

  // Saving
  folderLayout: 'title',    // title (one folder per page/thread) | site-title | site | site-date | url | one
  namePattern: '{original}',
  onConflict: 'rename',     // rename | skip | overwrite
  fixExtensions: true,
  saveSidecarJson: false,
  convertModern: 'off',     // off | jpg | png  (WEBP/AVIF -> classic format)
  keepServerDate: true,     // set file date to the server's Last-Modified
  scanSubfolder: false,     // each scan gets its own dated folder
  autoSort: 'off',          // off | orientation | resolution | format

  // Safety limits
  stopAfterImages: 0,       // 0 = no limit
  stopAfterMB: 0,           // 0 = no limit
  minFreeGB: 2,             // stop if the drive gets this full

  // Page loading
  autoScroll: true,
  maxScrollScreens: 50,
  clickLoadMore: true,
  followLinks: 0,           // 0 | 1 | 2 levels deep
  followSameSiteOnly: true,
  linkInclude: '',
  linkExclude: '',
  followPagination: true,
  maxPages: 10,             // "Next page" hops per URL
  pageTimeoutSec: 45,
  settleMs: 1200,           // wait after each scroll for new images
  useSignIns: true,

  // Speed & politeness
  pagesAtOnce: 3,
  downloadsAtOnce: 6,
  delayMs: 400,             // per-site gap between requests
  retries: 3,
  respectRobots: false,
  bandwidthKBs: 0,          // 0 = unlimited
  userAgent: '',            // blank = normal Chrome UA
  referrerMode: 'page',     // page | none
  customHeaders: '',        // "Header: value" per line
  proxy: ''                 // e.g. http://127.0.0.1:8080 or socks5://...
};

const DEFAULT_APP = {
  accent: 'ice',            // ice | toxic | violet | blood | gold
  thumbSize: 'm',           // s | m | l
  outputDir: '',
  notifyWhenDone: true,
  soundWhenDone: false,
  openFolderWhenDone: false,
  minimizeToTray: true,
  closeToTray: false,
  launchAtStartup: false,
  clipboardWatch: false,
  confirmDelete: true,
  showSplash: true,
  activePreset: 'photos',
  autoStartOnAdd: true,     // paste a URL and it starts reaping right away
  watchNewThreads: false    // automatically watch image-board / Reddit threads you add
};

const BUILT_IN_PRESETS = {
  photos: { name: 'Photos & wallpapers', builtIn: true, rules: {} },
  everything: { name: 'Everything (incl. small)', builtIn: true, rules: { minWidth: 120, minHeight: 120, minFileKB: 3, urlExclude: '' } },
  wallpapers: { name: 'Wallpapers (4K only)', builtIn: true, rules: { minWidth: 3840, minHeight: 2160, orientation: 'landscape', minFileKB: 300, types: { jpg: true, png: true, webp: true, gif: false, svg: false, avif: true, bmp: false, ico: false, tiff: false } } },
  hd: { name: 'HD and up (1080p+)', builtIn: true, rules: { minWidth: 1920, minHeight: 1080, minFileKB: 100 } },
  products: { name: 'Product photos', builtIn: true, rules: { minWidth: 600, minHeight: 600, orientation: 'any', includeCssBackgrounds: false, includeSharePreviews: false } },
  gifs: { name: 'GIFs only', builtIn: true, rules: { minWidth: 100, minHeight: 100, types: { jpg: false, png: false, webp: false, gif: true, svg: false, avif: false, bmp: false, ico: false, tiff: false } } },
  icons: { name: 'Icons & logos', builtIn: true, rules: { urlExclude: '', minWidth: 16, minHeight: 16, maxWidth: 512, maxHeight: 512, minFileKB: 0, includeInlineSvg: true, includeFavicons: true, types: { jpg: false, png: true, webp: true, gif: false, svg: true, avif: false, bmp: false, ico: true, tiff: false } } },
  gentle: { name: 'Gentle (slow, polite)', builtIn: true, rules: { pagesAtOnce: 1, downloadsAtOnce: 2, delayMs: 2000, respectRobots: true } }
};

const ACCENTS = {
  ice: { a: '#3BE3FF', d: '#0B5370', name: 'Ice' },
  toxic: { a: '#B6FF3B', d: '#3E6B00', name: 'Toxic' },
  violet: { a: '#B46BFF', d: '#4A1A8C', name: 'Violet' },
  blood: { a: '#FF3B3B', d: '#7A0E0E', name: 'Blood' },
  gold: { a: '#FFC233', d: '#7A4E00', name: 'Gold' }
};

function mergeRules(base, over) {
  const out = JSON.parse(JSON.stringify(base));
  for (const [k, v] of Object.entries(over || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
      out[k] = Object.assign({}, out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

const SETTINGS_VERSION = 4;

module.exports = { SETTINGS_VERSION, JUNK_PATTERNS, DEFAULT_RULES, DEFAULT_APP, BUILT_IN_PRESETS, ACCENTS, mergeRules };
