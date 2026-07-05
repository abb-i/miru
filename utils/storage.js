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
  breathDuration: 15,                // seconds (rounded to whole breath cycles)
  breathPattern: 'settle',           // 'settle' | 'sigh' | 'box'
  timeMirrorEnabled: true,           // gentle notice after a long unbroken stay
  timeMirrorMinutes: 20,             // continuous minutes on one domain
  firstLightEnabled: true,           // slower first breath of the day + intention
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

// Break state (ephemeral, per-device). One 30-minute break per day:
// { until: epoch-ms, usedOn: 'YYYY-MM-DD' }. `usedOn` stays after the break
// ends so the day's break can't be taken twice.
async function getBreakState() {
  const { breakState } = await chrome.storage.local.get('breakState');
  return breakState || null;
}

async function setBreakState(state) {
  return chrome.storage.local.set({ breakState: state });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULTS, getSettings, getSetting, saveSetting, saveSettings,
    getActiveSession, setActiveSession, clearActiveSession,
    getBreakState, setBreakState
  };
}
