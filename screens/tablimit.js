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

  // Proceed: dismiss the pause and reveal a calm, usable new-tab surface.
  // (Extensions can't restore chrome://newtab, so we offer our own quiet page;
  // the user types their destination in the address bar.)
  document.getElementById('anyway').addEventListener('click', () => {
    document.getElementById('scrim').classList.add('hidden');
    document.getElementById('newtab').classList.add('show');
  });
})();
