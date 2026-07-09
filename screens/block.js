// Miru — Block page (full extension page; calm, firm, never punishing)

(async () => {
  const p = new URLSearchParams(location.search);
  const site = p.get('site') || '';
  const night = p.get('night') === '1';
  // target = the raw tail after "&target=" (it carries its own ? and & from the
  // blocked URL), so a peek can return to the exact page, not just the site root.
  let target = '';
  const tm = location.search.match(/[?&]target=(.*)$/);
  if (tm) target = tm[1];

  let theme = p.get('theme');
  if (!theme) { const s = await chrome.storage.sync.get({ theme: 'dark' }); theme = s.theme; }
  const resolved = theme === 'auto'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : (theme || 'dark');

  const bg = resolved === 'light' ? '#f7f5ef' : '#16160f';
  document.documentElement.style.background = bg;
  document.body.style.background = bg;

  function closeSelf() {
    chrome.tabs.getCurrent((t) => { if (t) chrome.tabs.remove(t.id); else window.close(); });
  }

  MiruOverlay.injectFonts();
  // The block is firm, but not a dead end: a chosen, time-boxed way in. The
  // worker opens a 5-minute pass for this domain in this tab, then re-blocks —
  // enough to follow a link through (a channel to a video) without it becoming
  // an open-ended stay. Only offered for a site block, never during night.
  function currentTabId() {
    return new Promise((resolve) => {
      try { chrome.tabs.getCurrent((t) => resolve(t && t.id)); } catch (e) { resolve(undefined); }
    });
  }

  async function peek() {
    // Let the worker grant the pass AND navigate, in that order, from one
    // place: doing the redirect here (a beat before the DNR rule is live) is
    // what let the block re-catch us — the loop. Pass the tab id explicitly
    // too, since sender.tab can be absent for an extension page.
    const tabId = await currentTabId();
    try {
      const res = await chrome.runtime.sendMessage({ type: 'MIRU_PEEK', site, tabId, target });
      if (res && res.ok === false) return;            // day's peeks are spent — stay blocked
      if (res && res.navigated) return;               // the worker moved us in
    } catch (e) {}
    location.replace(target || ('https://' + site));  // fallback if it didn't
  }

  // Only offer the peek if the site allows it and today's ration isn't spent.
  let peeksLeft = 0, peekLimit = 0;
  if (site && !night) {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'MIRU_PEEK_LEFT' });
      peeksLeft = (res && res.remaining) || 0;
      peekLimit = (res && res.limit) || 0;
    } catch (e) {}
  }

  MiruOverlay.renderBlock(document.body, {
    theme: resolved,
    domain: site,
    night,
    onBack: () => { if (history.length > 1) history.back(); else closeSelf(); },
    onPeek: peeksLeft > 0 ? peek : null,
    peekNote: peeksLeft > 0 ? (peeksLeft + ' of ' + peekLimit + ' left today') : ''
  });
})();
