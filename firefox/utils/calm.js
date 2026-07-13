// Miru — Calm packs: the quiet room behind the breath.
//
// A calm pack describes, as data, which parts of a site are algorithmic pull
// (feeds, Shorts, Reels, Explore, recommendations) so they can be hidden with
// CSS while everything purposeful (search, messages, profiles, the video you
// came for) keeps working. Data-not-code on purpose: when a site redesign
// breaks a selector, the repair is an edit to this one file.
//
// The file runs in two worlds:
//   - the service worker (importScripts) — only the data + helpers are used
//   - as a registered content script on calm/peeked sites — the runtime below
//     injects the CSS at document_start, mirrors the SPA path onto <html>,
//     shows a small note where a whole surface rests, and reports selector
//     health to storage.local.calmHealth so breakage is seen, not silent.
//
// Packs tend the main site only (www + bare domain). Subdomains like
// studio.youtube.com or music.youtube.com are working tools and stay untouched
// — that also keeps the health check honest, since their DOM differs.
(() => {
  const root = typeof self !== 'undefined' ? self : window;
  if (root.MiruCalm) return; // already seeded in this world

  const CALM_PACKS = {
    'youtube.com': {
      matches: ['*://youtube.com/*', '*://www.youtube.com/*'],
      // The note appears only where a whole surface rests (home), not on
      // watch pages where hiding the related column should just feel calm.
      note: { text: 'The feed is resting. Search still works.', paths: [/^\/$/] },
      hooks: [
        // page-subtype scoping is essential: ytd-rich-grid-renderer also
        // renders a channel's Videos tab, which must stay usable.
        { id: 'homeFeed', critical: true, path: /^\/$/,
          selectors: ['ytd-browse[page-subtype="home"] ytd-rich-grid-renderer'] },
        // Shelves are legitimately absent on many pages — never diagnosed.
        // grid-shelf-view-model is the newer Polymer-less shelf element; it
        // appears on browse surfaces AND search results, so instead of a page
        // scope it's keyed on containing /shorts links — non-Shorts shelves
        // (courses, playlists) never match.
        { id: 'shortsShelves',
          selectors: ['ytd-reel-shelf-renderer',
                      'ytd-rich-shelf-renderer[is-shorts]',
                      'grid-shelf-view-model:has(a[href^="/shorts"])'] },
        // Search results: individual Shorts slip in as ordinary video results
        // — href-keyed like shortsNav, so it survives every locale.
        { id: 'shortsSearch',
          selectors: ['ytd-search ytd-video-renderer:has(a[href^="/shorts"])',
                      'ytd-search yt-lockup-view-model:has(a[href^="/shorts"])'] },
        // href-keyed instead of title text, so it survives every locale.
        // A direct /shorts/… link still plays — the pack removes the pull
        // toward Shorts, not a deliberately followed link.
        { id: 'shortsNav',
          selectors: ['ytd-guide-entry-renderer:has(a[href^="/shorts"])',
                      'ytd-mini-guide-entry-renderer:has(a[href^="/shorts"])'] }
        // The related column on /watch stays: calm rests only the feed and
        // Shorts — the video you came for keeps its surroundings.
      ]
    },
    'instagram.com': {
      matches: ['*://instagram.com/*', '*://www.instagram.com/*'],
      note: { text: 'The feed is resting. Stories, messages and search still work.',
              paths: [/^\/$/, /^\/explore/, /^\/reels/] },
      // Instagram's class names are obfuscated and churn constantly, so the
      // pack keys off routes and roles instead: the runtime mirrors
      // location.pathname onto html[data-miru-path] and the CSS keys off it.
      // /direct/ (messages), profiles, and search never match — untouched.
      hooks: [
        // Only the endless post feed rests on home — each post is an
        // <article>. The stories row above it stays visible and usable.
        { id: 'homeFeed', critical: true, path: /^\/$/,
          selectors: ['html[data-miru-path="/"] main[role="main"] article'] },
        { id: 'explore', critical: true, path: /^\/explore/,
          selectors: ['html[data-miru-path^="/explore"] main[role="main"]'] },
        { id: 'reels', critical: true, path: /^\/reels/,
          selectors: ['html[data-miru-path^="/reels"] main[role="main"]'] }
      ]
    }
  };

  // `domain` is a cleaned root domain (e.g. 'youtube.com').
  function hasPack(domain) {
    return !!CALM_PACKS[(domain || '').replace(/^www\./, '').toLowerCase()];
  }

  function packKeyFor(host) {
    const h = (host || '').replace(/^www\./, '').toLowerCase();
    return Object.keys(CALM_PACKS).find((d) => h === d || h.endsWith('.' + d)) || null;
  }

  const NOTE_CSS = `
.miru-calm-note{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);
  display:flex;align-items:center;gap:9px;font:300 13px 'DM Sans',system-ui,sans-serif;
  letter-spacing:.01em;color:#b9b7ac;background:rgba(22,22,15,.85);
  border:.5px solid rgba(255,255,255,.09);border-radius:999px;padding:9px 18px;
  z-index:2147483646;pointer-events:none;opacity:0;transition:opacity .8s ease;}
.miru-calm-note.miru-show{opacity:1;}
.miru-calm-note svg{flex-shrink:0;}`;

  function buildCSS(pack) {
    const hide = pack.hooks
      .map((h) => h.selectors.join(',\n') + '{display:none !important;}')
      .join('\n');
    return hide + '\n' + NOTE_CSS;
  }

  root.MiruCalm = { CALM_PACKS, hasPack, packKeyFor, buildCSS };

  // ---- Content-script runtime (never reached in the service worker) ---------
  if (typeof document === 'undefined') return;
  const domainKey = packKeyFor(location.hostname);
  if (!domainKey) return;
  const pack = CALM_PACKS[domainKey];

  // CSS first, at document_start, before first paint — no flash of the feed.
  // A constructable stylesheet survives strict page CSP; <style> is the fallback.
  (function injectCSS(css) {
    try {
      if (document.adoptedStyleSheets && 'replaceSync' in CSSStyleSheet.prototype) {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(css);
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
        return;
      }
    } catch (e) { /* fall through */ }
    const s = document.createElement('style');
    s.setAttribute('data-miru-calm', '1');
    s.textContent = css;
    document.documentElement.appendChild(s);
  })(buildCSS(pack));

  // ---- Path mirror: SPA navigations toggle the route-scoped rules -----------
  // noteEl must be initialized before the first mirrorPath() below — it calls
  // updateNote(), and a later `let` would still be in its temporal dead zone.
  let noteEl = null;
  let lastPath = null;
  function mirrorPath() {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    document.documentElement.setAttribute('data-miru-path', location.pathname);
    updateNote();
    scheduleHealth(3000); // the new route needs a beat to render before judging
  }
  mirrorPath();
  if (root.navigation && root.navigation.addEventListener) {
    root.navigation.addEventListener('currententrychange', mirrorPath);
  }
  addEventListener('popstate', mirrorPath);
  setInterval(mirrorPath, 1000); // light fallback; no-ops while the path holds

  // ---- The note: one quiet line where a whole surface rests -----------------
  function ensureNote() {
    if (noteEl || !document.body) return;
    // Built with DOM APIs, not innerHTML: Instagram enforces Trusted Types
    // (require-trusted-types-for 'script'), where an innerHTML sink throws.
    noteEl = document.createElement('div');
    noteEl.className = 'miru-calm-note';
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 48 56');
    svg.setAttribute('width', '15');
    svg.setAttribute('height', '17');
    svg.setAttribute('fill', 'none');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M24 28 C24 28 24 20 28 16 C32 12 36 14 36 20 C36 28 30 36 22 40 C14 44 10 40 12 34 C14 26 20 18 28 14 C36 10 42 14 42 22 C42 32 36 42 26 48');
    path.setAttribute('stroke', '#2da96e');
    path.setAttribute('stroke-width', '2.4');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('fill', 'none');
    path.setAttribute('opacity', '0.9');
    svg.appendChild(path);
    const span = document.createElement('span');
    span.textContent = pack.note.text;
    noteEl.append(svg, span);
    document.body.appendChild(noteEl);
    updateNote();
  }
  function updateNote() {
    if (!noteEl) return;
    noteEl.classList.toggle('miru-show', pack.note.paths.some((re) => re.test(location.pathname)));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureNote);
  else ensureNote();

  // ---- Health: a hook that should match here but doesn't means the site
  // moved under us. Written to storage.local so options can show a quiet note
  // — breakage becomes a visible prompt instead of a silently returned feed.
  // Only critical, path-scoped hooks are judged: Shorts shelves may be
  // legitimately absent, and off-route hooks prove nothing.
  let healthTimer = null;
  function scheduleHealth(delay) {
    clearTimeout(healthTimer);
    healthTimer = setTimeout(checkHealth, delay);
  }
  async function checkHealth() {
    if (document.visibilityState !== 'visible') return;
    const misses = pack.hooks.filter((h) =>
      h.critical && h.path && h.path.test(location.pathname) &&
      document.querySelectorAll(h.selectors.join(',')).length === 0);
    try {
      const { calmHealth = {} } = await chrome.storage.local.get('calmHealth');
      const next = { ...calmHealth };
      if (misses.length) {
        next[domainKey] = { hook: misses[0].id, path: location.pathname,
          at: Date.now(), version: chrome.runtime.getManifest().version };
      } else {
        delete next[domainKey]; // healthy again — clear the note
      }
      if (JSON.stringify(next) !== JSON.stringify(calmHealth)) {
        await chrome.storage.local.set({ calmHealth: next });
      }
    } catch (e) { /* extension context gone (update mid-visit) — never break the page */ }
  }
  // First check well after load: custom elements hydrate late on both sites.
  if (document.readyState === 'complete') scheduleHealth(3500);
  else addEventListener('load', () => scheduleHealth(3500));
})();
