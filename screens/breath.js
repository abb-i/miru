// Miru — Breath page
//   • navigation: reached via a DNR redirect "...breath.html?target=<full url>".
//     We read target as the raw tail (it may contain & and ?), breathe, then
//     ask the worker for a one-time pass and continue to the site.
//   • session: "...breath.html?session=1&pool=…&duration=…" → standalone, closes.
//   • time mirror: session breath with &mirror=<domain>&minutes=<n>.
//   • first light: the first navigation breath of the day breathes one cycle
//     longer and asks for a word to carry — then rests until tomorrow.

(async () => {
  const params = new URLSearchParams(location.search);

  // target = everything after the first "target=" (un-parsed, so query strings survive)
  let target = '';
  const m = location.search.match(/[?&]target=(.*)$/);
  if (m) target = m[1];

  const stored = await chrome.storage.sync.get({
    theme: 'dark', breathDuration: 15, breathPattern: 'settle', firstLightEnabled: true
  });
  const theme = params.get('theme') || stored.theme;
  const resolved = theme === 'auto'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : (theme || 'dark');
  const duration = Number(params.get('duration')) || stored.breathDuration || 15;
  let pool = params.get('pool') || (target ? 'navigation' : 'periodic');

  // Time mirror context (a long unbroken stay on one domain).
  const mirrorDomain = params.get('mirror') || '';
  const mirrorMinutes = Number(params.get('minutes')) || 0;

  // First light — only for navigation breaths, once per day.
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  let firstLight = false;
  if (target && stored.firstLightEnabled) {
    const { firstLight: fl } = await chrome.storage.local.get('firstLight');
    if (!fl || fl.date !== today) firstLight = true;
  }
  if (firstLight) pool = 'firstLight';

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

  // The ritual happened either way — don't ask again until tomorrow.
  async function markFirstLight(word) {
    if (!firstLight) return;
    await chrome.storage.local.set({ firstLight: { date: today, intention: (word || '').trim() } }).catch(() => {});
  }

  MiruOverlay.injectFonts();
  MiruOverlay.renderBreath(document.body, {
    theme: resolved,
    domain: mirrorDomain || target || '',
    pool,
    duration,
    pattern: stored.breathPattern,
    extraCycles: firstLight ? 1 : 0,
    subtitle: mirrorMinutes ? `You've been here ${mirrorMinutes} minutes.` : '',
    intentionPrompt: firstLight,
    askContinue: !!target,      // navigation breath ends with continue / go back
    onContinue: async (word) => { await markFirstLight(word); if (target) goToTarget(); else closeSelf(); },
    onDone: () => { if (target) goToTarget(); else closeSelf(); },
    onBack: async (word) => {
      await markFirstLight(word);
      if (history.length > 1) history.back(); else closeSelf();
    }
  });
})();
