// Miru — Storage helpers
// Settings live in chrome.storage.sync; ephemeral session state in .local.

const DEFAULTS = {
  // One list of places, each with a posture for how Miru meets you there:
  //   'breathe' — a breath at the door, the site untouched inside
  //   'calm'    — a breath at the door AND the feeds quieted inside (where a
  //               calm pack exists — utils/calm.js; elsewhere it just breathes)
  //   'block'   — the block page, with the rationed five-minute peek
  // The whole array is a single sync item (~45 bytes per place against the
  // 8 KB per-item quota) — no chunking needed.
  places: [],                        // [{ domain: 'youtube.com', posture: 'calm' }]
  blockDuringSessionsOnly: false,    // false = places set to block are always blocked
  periodicBreathEnabled: true,
  periodicBreathInterval: 15,        // minutes
  breathDuration: 10,                // seconds (rounded to whole breath cycles)
  breathPattern: 'settle',           // 'settle' | 'sigh' | 'box'
  timeMirrorEnabled: true,           // gentle notice after a long unbroken stay
  timeMirrorMinutes: 20,             // continuous minutes on one domain
  firstLightEnabled: true,           // slower first breath of the day + intention
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
    getActiveSession, setActiveSession, clearActiveSession
  };
}
