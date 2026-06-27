// Miru — Breath page
//   • navigation: reached via a DNR redirect "...breath.html?target=<full url>".
//     We read target as the raw tail (it may contain & and ?), breathe, then
//     ask the worker for a one-time pass and continue to the site.
//   • session: "...breath.html?session=1&pool=…&duration=…" → standalone, closes.

(async () => {
  const params = new URLSearchParams(location.search);
  const session = params.get('session') === '1';

  // target = everything after the first "target=" (un-parsed, so query strings survive)
  let target = '';
  const m = location.search.match(/[?&]target=(.*)$/);
  if (m) target = m[1];

  const stored = await chrome.storage.sync.get({ theme: 'dark', breathDuration: 15 });
  const theme = params.get('theme') || stored.theme;
  const resolved = theme === 'auto'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : (theme || 'dark');
  const duration = Number(params.get('duration')) || stored.breathDuration || 15;
  const pool = params.get('pool') || (target ? 'navigation' : 'periodic');

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
    try { await chrome.runtime.sendMessage({ type: 'MIRU_CONTINUE' }); } catch (e) {}
    location.replace(target);
  }

  MiruOverlay.injectFonts();
  MiruOverlay.renderBreath(document.body, {
    theme: resolved,
    domain: target || '',
    pool,
    duration,
    askContinue: !!target,      // navigation breath ends with continue / go back
    skippable: session,         // session: skip anytime; navigation: skip after 5s
    session,
    onContinue: () => { if (target) goToTarget(); else closeSelf(); },
    onDone: () => { if (target) goToTarget(); else closeSelf(); },
    onBack: () => { if (history.length > 1) history.back(); else closeSelf(); }
  });
})();
