// Miru — Block page (full extension page; calm, firm, never punishing)

(async () => {
  const p = new URLSearchParams(location.search);
  const site = p.get('site') || '';
  const night = p.get('night') === '1';

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
  MiruOverlay.renderBlock(document.body, {
    theme: resolved,
    domain: site,
    night,
    onBack: () => { if (history.length > 1) history.back(); else closeSelf(); }
  });
})();
