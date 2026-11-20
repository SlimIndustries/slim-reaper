'use strict';
// How image files are actually downloaded.
//
// Electron's own session.fetch refuses requests that set a Referer header
// (fails with net::ERR_BLOCKED_BY_CLIENT), but many sites only serve images when the
// Referer shows which page you came from. So downloads use Node's standard fetch, which
// allows it, and copy your saved sign-in cookies from the browser session onto each request.
// Electron's fetch is only used when a proxy is set (Node's fetch ignores Electron proxies),
// and then without a Referer header so it can't trip the same error.

function makeDownloadFn({ getSession, getRules, nodeFetch }) {
  const nf = nodeFetch || ((...a) => fetch(...a));
  const noReferer = (headers) => {
    const h = Object.assign({}, headers);
    for (const k of Object.keys(h)) if (k.toLowerCase() === 'referer') delete h[k];
    return h;
  };

  return async function download(url, init = {}) {
    const rules = getRules() || {};
    const ses = getSession(rules.useSignIns !== false);
    const headers = Object.assign({}, init.headers);

    if (rules.proxy && ses && typeof ses.fetch === 'function') {
      return ses.fetch(url, Object.assign({}, init, { headers: noReferer(headers) }));
    }

    if (rules.useSignIns !== false && ses && ses.cookies) {
      try {
        const cookies = await ses.cookies.get({ url });
        if (cookies && cookies.length) headers.Cookie = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
      } catch { /* no cookies for this site */ }
    }

    try {
      return await nf(url, Object.assign({}, init, { headers }));
    } catch (e) {
      if (init.signal && init.signal.aborted) throw e;
      // Last resort: Electron's network stack (different TLS/DNS handling), without Referer.
      if (ses && typeof ses.fetch === 'function') return ses.fetch(url, Object.assign({}, init, { headers: noReferer(headers) }));
      throw e;
    }
  };
}

module.exports = { makeDownloadFn };
