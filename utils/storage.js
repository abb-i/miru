// Miru — Storage helpers
// Settings live in chrome.storage.sync; ephemeral session state in .local.

const DEFAULTS = {
  enabled: true,                     // master switch (Miru tending vs resting)
  navBreathEnabled: true,            // navigation breath before new domains
  tabLimit: 3,
  tabLimitEnabled: true,
  periodicBreathEnabled: true,
  periodicBreathInterval: 15,        // minutes
  blockedSites: [],                  // array of domain strings
  blockDuringSessionsOnly: false,    // false = always block
  focusSessions: [],                 // array of {id, name, duration, days, startTime, enabled}
  breathDuration: 15,                // seconds
  nightModeEnabled: false,
  nightModeStart: '22:00',
  nightModeEnd: '07:00',
  nightModeOverrides: [],            // domains allowed during night
  customExcludedDomains: [],
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
