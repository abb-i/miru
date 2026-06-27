// Miru — Theme applier (shared by all screens, popup, options)
// Sets data-theme on <html> from the stored preference. Default: dark.
(function () {
  function resolve(theme) {
    let r = theme || 'dark';
    if (r === 'auto') {
      r = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
        ? 'dark' : 'light';
    }
    return r;
  }
  function apply(theme) {
    document.documentElement.setAttribute('data-theme', resolve(theme));
  }
  try {
    chrome.storage.sync.get({ theme: 'dark' }, (s) => apply(s.theme));
    chrome.storage.onChanged.addListener((c, area) => {
      if (area === 'sync' && c.theme) apply(c.theme.newValue);
    });
  } catch (e) { /* default dark already on <html> */ }
})();
