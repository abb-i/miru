// Miru — Breath page
//   • navigation: reached via a DNR redirect "...breath.html?target=<full url>".
//     We read target as the raw tail (it may contain & and ?), breathe, then
//     ask the worker for a one-time pass and continue to the site.
//   • session: "...breath.html?session=1&pool=…&duration=…" → standalone, closes.
//
// A place set to 'calm' ends its breath with the stay dial instead of a plain
// continue: you name how long you mean to be there — the dial opens at zero
// and reaches as far as calmStayMax — and the worker holds that length: the
// last minute in grayscale, then another breath asks again.

(async () => {
  const params = new URLSearchParams(location.search);

  // target = everything after the first "target=" (un-parsed, so query strings survive)
  let target = '';
  const m = location.search.match(/[?&]target=(.*)$/);
  if (m) target = m[1];

  const stored = await chrome.storage.sync.get({
    theme: 'dark', breathDuration: 10, breathPattern: 'settle', places: [], calmStayMax: 60
  });
  const theme = params.get('theme') || stored.theme;
  const resolved = theme === 'auto'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : (theme || 'dark');
  const duration = Number(params.get('duration')) || stored.breathDuration || 10;
  const pool = params.get('pool') || (target ? 'navigation' : 'periodic');

  // Is this door a calmed place? Matched on the host so a subdomain under a
  // calmed domain (m.youtube.com) gets the same treatment as the bare one.
  let host = '';
  try { host = new URL(target).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) {}
  const place = (stored.places || []).find((p) => {
    const d = (p && p.domain || '').replace(/^www\./, '').trim().toLowerCase();
    return d && (host === d || host.endsWith('.' + d));
  });
  const askStay = !!target && !!place && place.posture === 'calm';

  const bg = resolved === 'light' ? '#f7f5ef' : '#16160f';
  document.documentElement.style.background = bg;
  document.body.style.background = bg;

  function closeSelf() {
    if (chrome.tabs && chrome.tabs.getCurrent) {
      chrome.tabs.getCurrent((t) => { if (t) chrome.tabs.remove(t.id); else window.close(); });
    } else { window.close(); }
  }

  async function goToTarget() {
    // Ask the worker to let this exact tab through once (so DNR doesn't re-breathe).
    // The target scopes the pass to that domain only.
    try { await chrome.runtime.sendMessage({ type: 'MIRU_CONTINUE', target }); } catch (e) {}
    location.replace(target);
  }

  // Same pass, plus the stay the worker will hold for this tab. The stay is
  // registered before the navigation so its clock starts at the door.
  async function stayThen(minutes) {
    if (!(Number(minutes) >= 1)) return;   // zero names no visit; the door holds
    try {
      await chrome.runtime.sendMessage({ type: 'MIRU_CALM_CONTINUE', target, minutes });
    } catch (e) {}
    location.replace(target);
  }

  MiruOverlay.injectFonts();
  MiruOverlay.renderBreath(document.body, {
    theme: resolved,
    domain: target || '',
    pool,
    duration,
    pattern: stored.breathPattern,
    askContinue: !!target && !askStay,   // navigation breath ends with continue / go back
    askStay,                             // a calmed place ends with the stay slider
    stayMax: stored.calmStayMax,
    onStay: (minutes) => stayThen(minutes),
    onContinue: () => { if (target) goToTarget(); else closeSelf(); },
    onDone: () => { if (target) goToTarget(); else closeSelf(); },
    onBack: () => { if (history.length > 1) history.back(); else closeSelf(); }
  });
})();
