// Miru — Domain logic
// Decides which URLs are exempt from any screen, what counts as a new domain,
// and which domains are blocked.

// Google workspace + common internals — exempt from time tracking (the only
// remaining consumer of isExcluded). youtube.com is deliberately NOT here:
// it's a flagship calm-mode site, and its time should count.
const ALWAYS_EXCLUDED = [
  'google.com', 'gmail.com',
  'docs.google.com', 'drive.google.com', 'sheets.google.com',
  'slides.google.com', 'calendar.google.com', 'maps.google.com',
  'photos.google.com', 'meet.google.com', 'chat.google.com',
  'accounts.google.com', 'mail.google.com',
  'localhost', '127.0.0.1'
];

// Opt-in suggestions for the breath list — commonly distracting places, offered
// as pills the user actively taps. Never activated without that choice.
const COMMONLY_DISTRACTING = [
  { domain: 'instagram.com', label: 'Instagram' },
  { domain: 'tiktok.com', label: 'TikTok' },
  { domain: 'youtube.com', label: 'YouTube' },
  { domain: 'x.com', label: 'X' },
  { domain: 'reddit.com', label: 'Reddit' },
  { domain: 'facebook.com', label: 'Facebook' },
  { domain: 'twitch.tv', label: 'Twitch' },
  { domain: 'netflix.com', label: 'Netflix' },
  { domain: 'pinterest.com', label: 'Pinterest' },
  { domain: 'linkedin.com', label: 'LinkedIn' }
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

// Common two-level public suffixes. Without these, bbc.co.uk would collapse to
// "co.uk" — which DNR's requestDomains then matches as *all* of .co.uk. A short
// list covers the frequent ccTLDs; obscure ones degrade to the old behaviour.
const TWO_LEVEL_TLDS = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'net.uk', 'ltd.uk', 'plc.uk',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'asn.au', 'id.au',
  'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp', 'ad.jp',
  'co.nz', 'net.nz', 'org.nz', 'govt.nz', 'ac.nz',
  'co.in', 'net.in', 'org.in', 'firm.in', 'gen.in', 'ind.in', 'ac.in', 'edu.in', 'gov.in',
  'co.za', 'org.za', 'net.za', 'web.za', 'gov.za', 'ac.za',
  'com.br', 'net.br', 'org.br', 'gov.br', 'edu.br',
  'com.mx', 'org.mx', 'net.mx', 'gob.mx', 'edu.mx',
  'com.ar', 'com.tr', 'gov.tr', 'edu.tr', 'org.tr', 'net.tr',
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn',
  'com.tw', 'org.tw', 'net.tw', 'edu.tw', 'gov.tw',
  'com.hk', 'org.hk', 'net.hk', 'edu.hk', 'gov.hk',
  'com.sg', 'org.sg', 'net.sg', 'edu.sg', 'gov.sg',
  'co.kr', 'or.kr', 'ne.kr', 'go.kr', 'ac.kr', 're.kr',
  'com.my', 'org.my', 'net.my', 'edu.my', 'gov.my',
  'co.id', 'or.id', 'ac.id', 'go.id', 'web.id',
  'co.th', 'or.th', 'ac.th', 'go.th', 'in.th',
  'com.vn', 'net.vn', 'org.vn', 'edu.vn', 'gov.vn',
  'com.ph', 'org.ph', 'net.ph', 'edu.ph', 'gov.ph',
  'com.pk', 'org.pk', 'net.pk', 'edu.pk', 'gov.pk',
  'com.eg', 'com.sa', 'com.ae', 'co.il', 'org.il', 'ac.il', 'gov.il',
  'com.ua', 'net.ua', 'org.ua', 'edu.ua', 'gov.ua',
  'com.pl', 'net.pl', 'org.pl', 'edu.pl', 'gov.pl',
  'co.ke', 'or.ke', 'ac.ke', 'go.ke',
  'com.ng', 'org.ng', 'net.ng', 'edu.ng', 'gov.ng',
  'com.co', 'net.co', 'org.co', 'com.pe', 'com.ve', 'com.ec', 'com.uy', 'com.bd'
]);

function getRootDomain(url) {
  try {
    const hostname = _hostname(url);
    // IP addresses have no registrable "root" — return them whole.
    if (/^[\d.]+$/.test(hostname) || hostname.includes(':')) return hostname;
    const parts = hostname.split('.');
    if (parts.length <= 2) return hostname;
    const lastTwo = parts.slice(-2).join('.');
    if (TWO_LEVEL_TLDS.has(lastTwo)) return parts.slice(-3).join('.');
    return lastTwo;
  } catch {
    return '';
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ALWAYS_EXCLUDED, COMMONLY_DISTRACTING, isExcluded, getRootDomain };
}
