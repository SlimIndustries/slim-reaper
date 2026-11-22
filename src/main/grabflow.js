'use strict';
// The page window's steps for getting a video from its page, kept apart from the window itself so
// the exact same steps can be tested in a real browser against mock sites.
//
// driver: {
//   open(url) -> { status }            load the page (status: the page's HTTP status, if known)
//   here() -> url                      where the window is now
//   js(code) -> result                 run code in the page
//   probeAll() -> info                 run the video finder in the page and every frame inside it
//   clickAt(x, y)                      a real mouse click at that point of the page
//   media() -> [{ url, type, len }]    video files the page has asked for so far
//   requests() -> [url]                everything the page has asked for so far (for copy-protection checks)
//   fetchStart(url) -> { bytes, type, total }   the first few bytes of a link (and the file's full size, if the site says)
//   settle(ms)                         wait for the page to calm down
//   wakeUp()  (optional)               make a hidden window behave like a shown one (some players won't start otherwise)
// }

const { CF_CHECK, AGE_CLICK, mediaProbe, rankMedia, firstRealMedia, isVideoPage, explainNoMedia } = require('./scanlogic');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const siteError = (message, props) => Object.assign(new Error(message), props);

function sameAddress(a, b) {
  try {
    const x = new URL(a), y = new URL(b);
    return x.host.replace(/^www\./, '') === y.host.replace(/^www\./, '') && x.pathname.replace(/\/+$/, '') === y.pathname.replace(/\/+$/, '');
  } catch { return false; }
}

// Where to click to start the main player: the middle of the biggest player on the page (a video,
// a player frame, or a player box). Scrolls it into view first. Returns null if there's no player.
const PLAYER_POINT = String.raw`(() => {
  const els = [...document.querySelectorAll('video, iframe, [class*="player" i], [id*="player" i], .video-js, .jwplayer, .plyr, .flowplayer')];
  let best = null, bestArea = 0;
  for (const el of els) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const area = r.width * r.height;
    if (r.width < 240 || r.height < 135 || area <= bestArea) continue;
    best = el; bestArea = area;
  }
  if (!best) return null;
  best.scrollIntoView({ block: 'center', inline: 'center' });
  const r = best.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height), tag: best.tagName.toLowerCase() };
})()`;

/** A file this much smaller than its video's length needs (about 200 kbit/s) is a preview, not the video. */
function minBytesFor(pageDuration) {
  return pageDuration > 120 ? Math.round(pageDuration * 25000) : 0;
}

/**
 * Get the video from its page. Returns { media, info, videoPage }.
 * opts: { url, log (or null in Private mode), timeoutMs, check (only say whether it's a video page), clicks }
 */
async function grabFlow(driver, url, { log = null, timeoutMs = 30000, check = false, clicks = 3 } = {}) {
  const say = (m) => { if (log) log('Page window: ' + m); };
  const open = async () => {
    const r = (await driver.open(url)) || {};
    if (r.status === 429) throw siteError('The site asked Slim Takes to slow down (too many requests).', { rateLimited: true });
    if (r.status === 404 || r.status === 410) throw siteError('This video page doesn\'t exist any more.', { final: true });
    if (r.status === 451) throw siteError('This video isn\'t available in your country.', { final: true });
  };
  if (!sameAddress(driver.here(), url)) await open();

  // The site's "are you human" check: some clear themselves in a few seconds.
  const until = Date.now() + 8000;
  while (await driver.js(CF_CHECK).catch(() => false) && Date.now() < until) await driver.settle(2000);
  if (await driver.js(CF_CHECK).catch(() => false)) {
    throw siteError('The site\'s "are you human" check came up. Use Open the page (or your normal browser) to get past it, then try again.', { siteCheck: true });
  }

  // Clear age checks and cookie banners first, so the click lands on the player.
  for (let i = 0; i < 2; i++) {
    const clicked = await driver.js(AGE_CLICK).catch(() => null);
    if (!clicked) break;
    say(`clicked past "${clicked}"`);
    await driver.settle(2000);
    if (!sameAddress(driver.here(), url)) { say('that went to another page, going back'); await open(); break; }
  }

  let info = null;
  let decoys = false;
  let woke = false;
  const started = Date.now();
  const seenLinks = new Set();

  const look = async () => {
    info = (await driver.probeAll()) || info;
    return rankMedia(info ? info.out : [], driver.media());
  };
  const describe = (ranked) => {
    for (const c of ranked.slice(0, 8)) {
      if (seenLinks.has(c.url)) continue;
      seenLinks.add(c.url);
      say(`saw ${c.hls ? 'a stream' : 'a file'} from ${c.from === 'net' ? 'the player' : 'the page\'s code'}${c.height ? ' (' + c.height + 'p)' : ''}: ${c.url.slice(0, 160)}`);
    }
  };
  const tryPick = async (ranked) => {
    if (!ranked.length) return null;
    const real = await firstRealMedia(ranked, driver.fetchStart, { minBytes: minBytesFor(info && info.duration), log: (m) => say(m) });
    if (real.none) { decoys = true; return null; }
    return real;
  };

  // Press play like a person (a real click, up to `clicks` times: the first click on many sites only
  // opens an ad), and wait for the file the player itself asks for.
  for (let pass = 0; pass < 2; pass++) {
    for (let attempt = 0; attempt < clicks && Date.now() - started < timeoutMs; attempt++) {
      const before = driver.media().length;
      const pt = await driver.js(PLAYER_POINT).catch(() => null);
      if (pt) {
        await driver.clickAt(pt.x, pt.y);
        say(`pressed play (click ${attempt + 1}, on the ${pt.tag})`);
      } else {
        await driver.js(mediaProbe(true)).catch(() => null); // no player box found: try the page's own play button
        say(`pressed play (click ${attempt + 1}, page button)`);
      }
      // A click that opened an ad page instead: go back.
      await wait(300);
      if (!sameAddress(driver.here(), url)) { say('the click went to another page (an ad), going back'); await open(); continue; }
      // Wait for the player to ask for its video (up to about 6 seconds per click).
      const waitUntil = Date.now() + 6000;
      while (Date.now() < waitUntil && driver.media().length <= before) await wait(400);
      const ranked = await look();
      describe(ranked);
      const fromPlayer = ranked.filter((c) => c.from === 'net');
      const pick = await tryPick(fromPlayer);
      if (pick) return finish(pick);
    }
    // Nothing from the player itself: use the best real link written in the page's code, if any.
    const ranked = await look();
    describe(ranked);
    const pick = await tryPick(ranked);
    if (pick) return finish(pick);
    // Some players won't start in a hidden window: wake the window up and try once more.
    if (woke || !driver.wakeUp || Date.now() - started > timeoutMs) break;
    woke = true;
    say('nothing yet, trying again with the window awake');
    await driver.wakeUp();
  }

  if (check) return { media: null, info, videoPage: isVideoPage(info) };
  if (decoys) throw siteError('The video links on that page all led to web pages or short previews, not the video. This site may need you to be logged in, or it hides its videos from apps.', { notVideo: true });
  throw explainNoMedia(info, driver.requests());

  function finish(pick) {
    say(`using ${pick.hls ? 'the stream' : 'the file'}${pick.height ? ' (' + pick.height + 'p)' : ''}${pick.total ? ', ' + Math.round(pick.total / 1e6) + ' MB' : ''}`);
    return { media: pick, info: info || {}, videoPage: isVideoPage(info) || pick.from === 'net' };
  }
}

module.exports = { grabFlow, PLAYER_POINT, minBytesFor, sameAddress };
