// Miru — Domain logic
// Decides which URLs are exempt from any screen, what counts as a new domain,
// and which domains are blocked.

// Google ecosystem + common internals — never trigger any Miru screen.
const ALWAYS_EXCLUDED = [
  'google.com', 'gmail.com', 'youtube.com',
  'docs.google.com', 'drive.google.com', 'sheets.google.com',
  'slides.google.com', 'calendar.google.com', 'maps.google.com',
  'photos.google.com', 'meet.google.com', 'chat.google.com',
  'accounts.google.com', 'mail.google.com',
  'localhost', '127.0.0.1'
];

// URL schemes Miru must never touch.
const EXCLUDED_SCHEMES = ['chrome:', 'chrome-extension:', 'about:', 'edge:', 'brave:', 'devtools:', 'view-source:'];

function _hostname(url) {
  return new URL(url).hostname.replace(/^www\./, '');
}

function isExcluded(url, customExclusions = []) {
  try {
    const u = new URL(url);
    if (EXCLUDED_SCHEMES.includes(u.protocol)) return true;
    const hostname = u.hostname.replace(/^www\./, '');
    if (!hostname) return true;
    const all = [...ALWAYS_EXCLUDED, ...customExclusions];
    return all.some(d => {
      const clean = d.replace(/^www\./, '').trim().toLowerCase();
      if (!clean) return false;
      return hostname === clean || hostname.endsWith('.' + clean);
    });
  } catch {
    return true;
  }
}

function getRootDomain(url) {
  try {
    const hostname = _hostname(url);
    const parts = hostname.split('.');
    if (parts.length <= 2) return hostname;
    return parts.slice(-2).join('.');
  } catch {
    return '';
  }
}

function isNewDomain(prevUrl, newUrl) {
  const next = getRootDomain(newUrl);
  if (!next) return false;
  return getRootDomain(prevUrl) !== next;
}

function isBlocked(url, blockedList = []) {
  try {
    const hostname = _hostname(url);
    return blockedList.some(d => {
      const clean = (d || '').replace(/^www\./, '').trim().toLowerCase();
      if (!clean) return false;
      return hostname === clean || hostname.endsWith('.' + clean);
    });
  } catch {
    return false;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ALWAYS_EXCLUDED, isExcluded, getRootDomain, isNewDomain, isBlocked };
}
