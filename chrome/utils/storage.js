// Miru — Storage helpers
// Settings live in chrome.storage.sync; ephemeral session state in .local.

const DEFAULTS = {
  // One list of places, each with a posture for how Miru meets you there:
  //   'breathe' — a breath at the door, the site untouched inside
  //   'calm'    — a breath at the door, then a length you name on a dial that
  //               always starts at zero (up to calmStayMax; the last minute
  //               grayscale, then another breath), and the feeds quieted
  //               inside where a calm pack exists (utils/calm.js)
  //   'block'   — the block page, with the rationed five-minute peek
  // The whole array is a single sync item (~45 bytes per place against the
  // 8 KB per-item quota) — no chunking needed.
  places: [],                        // [{ domain: 'youtube.com', posture: 'calm' }]
  blockDuringSessionsOnly: false,    // false = places set to block are always blocked
  calmStayMax: 60,                   // minutes — the longest stay the dial offers (1–480)
  periodicBreathEnabled: true,
  periodicBreathInterval: 30,        // minutes — 30 or 60
  breathDuration: 10,                // seconds (rounded to whole breath cycles)
  breathPattern: 'settle',           // 'settle' | 'sigh' | 'box'
  nightModeEnabled: false,
  nightModeStart: '22:00',
  nightModeEnd: '07:00',
  customExcludedDomains: [],         // carve-outs under blocked/breathing domains
  theme: 'dark'                      // 'dark' | 'light' | 'auto' — dark by default
};

async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...stored };
}

async function getSetting(key) {
  const stored = await chrome.storage.sync.get({ [key]: DEFAULTS[key] });
  return stored[key];
}

async function saveSetting(key, value) {
  return chrome.storage.sync.set({ [key]: value });
}

async function saveSettings(obj) {
  return chrome.storage.sync.set(obj);
}

// --- Looking back (what a place was named, against what it took) -------------
// One record per day per place: the minutes named across every stay begun
// there, and how many times the dial was answered. The time actually spent is
// not measured again — it is the same per-site usage the popup already shows.
// What is new here is the *intention*, which nothing else in a browser knows.
//
// Kept for the same fourteen days as usage, and pruned by the same rule.
const LOOKBACK_DAYS = 14;

function miruDayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function getStayLog() {
  const { stayLog = {} } = await chrome.storage.local.get('stayLog');
  return stayLog;
}

// A stay was just begun: add its named minutes to the day, and count the visit.
async function recordNamedStay(domain, minutes) {
  if (!domain || !(minutes >= 1)) return;
  const log = await getStayLog();
  const key = miruDayKey();
  const day = log[key] || (log[key] = {});
  const entry = day[domain] || (day[domain] = { named: 0, visits: 0 });
  entry.named += Math.round(minutes);
  entry.visits += 1;
  const days = Object.keys(log).sort();
  while (days.length > LOOKBACK_DAYS) delete log[days.shift()];
  await chrome.storage.local.set({ stayLog: log }).catch(() => {});
}

// What today looks like for one place: minutes named, visits, minutes spent.
async function todayForPlace(domain) {
  const key = miruDayKey();
  const [log, { usage = {} }] = await Promise.all([
    getStayLog(), chrome.storage.local.get('usage')
  ]);
  const entry = ((log[key] || {})[domain]) || { named: 0, visits: 0 };
  const spentSecs = (usage[key] || {})[domain] || 0;
  return { named: entry.named, visits: entry.visits, spent: Math.round(spentSecs / 60) };
}

// The line the breath carries, or nothing at all.
//
// Silence is the default and the reward: on a first visit there is no second
// number to set beside the first, and a person who named a length and kept to
// it should not be congratulated for it. Miru speaks only once a place has
// been returned to today — the one thing a per-tab clock cannot see — and it
// speaks in their own numbers, adding only the arithmetic. The phrasing
// rotates because a sentence in a fixed form stops being read by its third
// appearance.
const STAY_NOTE_FORMS = [
  (o, n) => `${n} time here today. You named ${o.named} minutes; it has been ${o.spent}.`,
  (o, n) => `This is the ${n.toLowerCase()} time today — ${o.named} minutes named, ${o.spent} spent.`,
  (o, n) => `Today: the ${n.toLowerCase()} visit here, ${o.named} minutes named, ${o.spent} spent.`
];
const ORDINALS = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth'];

function composeStayNote(o) {
  if (!o || o.visits < 2) return '';                 // nothing true to say yet
  const n = ORDINALS[o.visits] || `${o.visits}th`;
  const form = STAY_NOTE_FORMS[Math.floor(Math.random() * STAY_NOTE_FORMS.length)];
  return form(o, n);
}

async function stayNoteFor(domain) {
  try { return composeStayNote(await todayForPlace(domain)); } catch (e) { return ''; }
}

// Active focus session state (ephemeral, per-device).
async function getActiveSession() {
  const { activeSession } = await chrome.storage.local.get('activeSession');
  return activeSession || null;
}

async function setActiveSession(session) {
  return chrome.storage.local.set({ activeSession: session });
}

async function clearActiveSession() {
  return chrome.storage.local.remove('activeSession');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULTS, getSettings, getSetting, saveSetting, saveSettings,
    getActiveSession, setActiveSession, clearActiveSession,
    miruDayKey, getStayLog, recordNamedStay, todayForPlace, composeStayNote, stayNoteFor
  };
}
