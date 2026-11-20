'use strict';
// Minimal robots.txt support for "Respect robots.txt".
const { safeUrl } = require('../shared/urls');

function parseRobots(text, agent = 'slimreaper') {
  const groups = [];
  let cur = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const i = line.indexOf(':');
    if (i < 0) continue;
    const k = line.slice(0, i).trim().toLowerCase();
    const v = line.slice(i + 1).trim();
    if (k === 'user-agent') {
      if (!cur || cur.rules.length) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(v.toLowerCase());
    } else if ((k === 'disallow' || k === 'allow') && cur) {
      cur.rules.push({ allow: k === 'allow', path: v });
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== '*' && agent.includes(a)));
  const chosen = mine.length ? mine : groups.filter((g) => g.agents.includes('*'));
  return chosen.flatMap((g) => g.rules).filter((r) => r.path !== '' || r.allow);
}

function toRegex(p) {
  const anchored = p.endsWith('$');
  const body = (anchored ? p.slice(0, -1) : p).replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp('^' + body + (anchored ? '$' : ''));
}

function isAllowed(rules, url) {
  const x = safeUrl(url);
  if (!x) return true;
  const p = x.pathname + x.search;
  let best = null;
  for (const r of rules) {
    if (!r.path) continue;
    if (toRegex(r.path).test(p)) {
      if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
    }
  }
  return !best || best.allow;
}

class Robots {
  constructor(fetcher) { this.fetcher = fetcher; this.cache = new Map(); }
  async allowed(url, opts = {}) {
    const x = safeUrl(url);
    if (!x) return true;
    const origin = x.origin;
    if (!this.cache.has(origin)) {
      const p = this.fetcher.get(origin + '/robots.txt', { retries: 1, timeoutSec: 10, accept: 'text/plain,*/*', userAgent: opts.userAgent, signal: opts.signal })
        .then((r) => (r.ok ? parseRobots(r.buf.toString('utf8')) : []))
        .catch(() => []);
      this.cache.set(origin, p);
    }
    const rules = await this.cache.get(origin);
    return isAllowed(rules, url);
  }
}

module.exports = { Robots, parseRobots, isAllowed };
