// Miru — Tab limit screen behaviour
// A gentle question, not a wall. Both choices are honoured immediately.

(() => {
  const params = new URLSearchParams(location.search);
  const count = params.get('count') || '';

  document.getElementById('phrase').textContent = getWord('tabLimit');
  document.getElementById('count').textContent =
    count ? `You have ${count} tabs open.` : '';

  // Close this just-opened tab, returning to where attention already was.
  document.getElementById('close').addEventListener('click', () => {
    chrome.tabs.getCurrent((tab) => {
      if (tab) chrome.tabs.remove(tab.id);
      else window.close();
    });
  });

  // Proceed: honour where the user was actually headed. If this tab was opened
  // for a real destination (a link / window.open), go straight there. Otherwise
  // (a blank new tab) reveal our own quiet new-tab surface — extensions can't
  // restore chrome://newtab — so the user can type a destination.
  document.getElementById('anyway').addEventListener('click', () => {
    const target = params.get('target');
    if (target) { location.replace(target); return; }
    document.getElementById('scrim').classList.add('hidden');
    document.getElementById('newtab').classList.add('show');
  });
})();
