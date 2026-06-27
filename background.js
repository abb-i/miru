// Miru — Background service worker (declarativeNetRequest interception)
//
// Interception happens at Chrome's NETWORK layer via DNR, not in JS. This means
// it cannot be out-raced by fast/SPA sites and works even when the service
// worker is asleep — the reliability ceiling of webNavigation+tabs.update is gone.
//
// Rules (priority high→low):
//   block (10)    redirect blocked domains → block.html
//   night (8)     during night hours, redirect all → block.html?night=1
//   allow-once    (session, 100) per-tab pass-through right after "continue"
//   allow (5)     domains currently open in some tab → no breath (internal nav)
//   breath (1)    redirect every other new http(s) main_frame → breath.html?target=…

importScripts('utils/domains.js', 'utils/storage.js', 'utils/words.js');

const DNR = chrome.declarativeNetRequest;
const SELF = chrome.runtime.getURL('');
console.log('[Miru] background loaded');

const RID_BREATH = 1, RID_ALLOW = 2, RID_NIGHT = 3, RID_BLOCK_BASE = 100, RID_ALLOWONCE_BASE = 5000;

let settings = { ...DEFAULTS };
let sessionActive = false;

// --- Rule building ----------------------------------------------------------
function excludedDNR() {
  // DNR matches a domain and its subdomains automatically. Drop IPs/localhost
  // (not valid DNR domains) to avoid rejecting the whole rule.
  const base = ALWAYS_EXCLUDED.filter((d) => d && d !== '127.0.0.1' && d !== 'localhost');
  const custom = (settings.customExcludedDomains || []).map((d) => (d || '').replace(/^www\./, '').trim().toLowerCase());
  return [...new Set([...base, ...custom])].filter(Boolean);
}

async function rebuildRules() {
  const breathUrl = chrome.runtime.getURL('screens/breath.html');
  const blockUrl = chrome.runtime.getURL('screens/block.html');
  const add = [];

  if (settings.navBreathEnabled) {
    add.push({
      id: RID_BREATH, priority: 1,
      action: { type: 'redirect', redirect: { regexSubstitution: breathUrl + '?target=\\0' } },
      condition: { regexFilter: '^https?://.*', resourceTypes: ['main_frame'], excludedRequestDomains: excludedDNR() }
    });
  }

  if (settings.nightModeEnabled && isNightTime(settings)) {
    const overrides = (settings.nightModeOverrides || []).map((d) => (d || '').replace(/^www\./, '').trim().toLowerCase()).filter(Boolean);
    add.push({
      id: RID_NIGHT, priority: 8,
      action: { type: 'redirect', redirect: { url: blockUrl + '?night=1' } },
      condition: { regexFilter: '^https?://.*', resourceTypes: ['main_frame'], excludedRequestDomains: [...excludedDNR(), ...overrides] }
    });
  }

  const blockOn = settings.blockedSites && settings.blockedSites.length &&
    (!settings.blockDuringSessionsOnly || sessionActive);
  if (blockOn) {
    settings.blockedSites.forEach((d, i) => {
      const dom = (d || '').replace(/^www\./, '').trim().toLowerCase();
      if (!dom) return;
      add.push({
        id: RID_BLOCK_BASE + i, priority: 10,
        action: { type: 'redirect', redirect: { url: blockUrl + '?site=' + encodeURIComponent(dom) } },
        condition: { requestDomains: [dom], resourceTypes: ['main_frame'] }
      });
    });
  }

  const removeIds = [RID_BREATH, RID_NIGHT];
  for (let i = 0; i < 300; i++) removeIds.push(RID_BLOCK_BASE + i);
  await DNR.updateDynamicRules({ removeRuleIds: removeIds, addRules: add }).catch((e) => console.warn('[Miru] rules', e));
}

// Domains currently open anywhere → allowed (so internal navigation / reloads /
// already-open sites don't trigger the breath).
async function applyAllowRule() {
  if (!settings.navBreathEnabled) { await DNR.updateDynamicRules({ removeRuleIds: [RID_ALLOW] }).catch(() => {}); return; }
  let domains = [];
  try {
    const tabs = await chrome.tabs.query({});
    const s = new Set();
    for (const t of tabs) {
      const u = t.url || '';
      if (/^https?:\/\//i.test(u)) { const d = getRootDomain(u); if (d) s.add(d); }
    }
    domains = [...s];
  } catch (e) {}
  const rules = domains.length ? [{
    id: RID_ALLOW, priority: 5, action: { type: 'allow' },
    condition: { requestDomains: domains, resourceTypes: ['main_frame'] }
  }] : [];
  await DNR.updateDynamicRules({ removeRuleIds: [RID_ALLOW], addRules: rules }).catch((e) => console.warn('[Miru] allow', e));
}

let allowTimer = null;
function scheduleAllow() { clearTimeout(allowTimer); allowTimer = setTimeout(applyAllowRule, 400); }

function isNightTime(s) {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = (s.nightModeStart || '22:00').split(':').map(Number);
  const [eh, em] = (s.nightModeEnd || '07:00').split(':').map(Number);
  const start = sh * 60 + sm, end = eh * 60 + em;
  if (start === end) return false;
  return start < end ? (mins >= start && mins < end) : (mins >= start || mins < end);
}

// --- Lifecycle --------------------------------------------------------------
async function init() {
  await reloadSettings();
  sessionActive = !!(await getActiveSession());
  // Clear any stale dynamic rules from a previous version before rebuilding.
  try {
    const existing = await DNR.getDynamicRules();
    if (existing.length) await DNR.updateDynamicRules({ removeRuleIds: existing.map((r) => r.id) });
    const sess = await DNR.getSessionRules();
    if (sess.length) await DNR.updateSessionRules({ removeRuleIds: sess.map((r) => r.id) });
  } catch (e) {}
  await rebuildRules();
  await applyAllowRule();
  chrome.alarms.create('miru-schedule', { periodInMinutes: 1 });
  try { chrome.idle.setDetectionInterval(60); } catch (e) {}
}
async function reloadSettings() { settings = await getSettings(); }

chrome.runtime.onInstalled.addListener(async () => {
  const cur = await chrome.storage.sync.get(null);
  const seed = {};
  for (const [k, v] of Object.entries(DEFAULTS)) if (!(k in cur)) seed[k] = v;
  if (Object.keys(seed).length) await chrome.storage.sync.set(seed);
  await init();
});
chrome.runtime.onStartup.addListener(init);
reloadSettings(); // keep `settings` warm for messaging on every worker wake

chrome.storage.onChanged.addListener(async (c, area) => {
  if (area === 'sync') { await reloadSettings(); await rebuildRules(); await applyAllowRule(); }
  if (area === 'local' && c.activeSession) { sessionActive = !!c.activeSession.newValue; await rebuildRules(); }
});

// --- Allow-once (post-breath continue) --------------------------------------
async function allowOnce(tabId) {
  const id = RID_ALLOWONCE_BASE + tabId;
  await DNR.updateSessionRules({
    removeRuleIds: [id],
    addRules: [{ id, priority: 100, action: { type: 'allow' }, condition: { tabIds: [tabId], resourceTypes: ['main_frame'] } }]
  }).catch((e) => console.warn('[Miru] allowOnce', e));
  setTimeout(() => DNR.updateSessionRules({ removeRuleIds: [id] }).catch(() => {}), 15000);
}

// --- Tab tracking (keeps the allow-rule current) ----------------------------
chrome.tabs.onUpdated.addListener((id, info) => {
  if (info.status === 'complete') DNR.updateSessionRules({ removeRuleIds: [RID_ALLOWONCE_BASE + id] }).catch(() => {});
  if (info.url || info.status === 'complete') { scheduleAllow(); updateActive(); }
});
chrome.tabs.onRemoved.addListener((id) => { DNR.updateSessionRules({ removeRuleIds: [RID_ALLOWONCE_BASE + id] }).catch(() => {}); scheduleAllow(); });
chrome.tabs.onCreated.addListener(async (tab) => {
  scheduleAllow();
  const u = tab.url || tab.pendingUrl || '';
  if (u.startsWith(SELF)) return;
  if (!settings.tabLimitEnabled) return;
  const tabs = await chrome.tabs.query({ currentWindow: true });
  if (tabs.length > (settings.tabLimit || 3)) {
    const url = chrome.runtime.getURL('screens/tablimit.html') + '?count=' + tabs.length + '&theme=' + settings.theme;
    chrome.tabs.update(tab.id, { url }).catch(() => {});
  }
});
chrome.tabs.onActivated.addListener(() => updateActive());

// --- Focus sessions ---------------------------------------------------------
async function startSession({ name, duration }) {
  const startedAt = Date.now();
  const endTime = startedAt + duration * 60 * 1000;
  await setActiveSession({ name: name || '', duration, startedAt, endTime });
  sessionActive = true;
  await rebuildRules();
  chrome.alarms.create('miru-session-end', { when: endTime });
  if (settings.periodicBreathEnabled) {
    chrome.alarms.create('miru-periodic', {
      periodInMinutes: settings.periodicBreathInterval || 15,
      delayInMinutes: settings.periodicBreathInterval || 15
    });
  }
  return { name, duration, startedAt, endTime };
}
async function endSession({ silent } = {}) {
  await clearActiveSession();
  sessionActive = false;
  await rebuildRules();
  chrome.alarms.clear('miru-session-end');
  chrome.alarms.clear('miru-periodic');
  if (!silent) openBreathTab('focusEnd', 8);
}

chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name === 'miru-session-end') await endSession();
  else if (a.name === 'miru-periodic') {
    if (!(await getActiveSession())) { chrome.alarms.clear('miru-periodic'); return; }
    openBreathTab('periodic', settings.breathDuration || 15);
  } else if (a.name === 'miru-schedule') {
    await checkScheduled();
    await rebuildRules(); // re-evaluate night-mode window
  }
});

async function checkScheduled() {
  const sessions = settings.focusSessions || [];
  if (!sessions.length || (await getActiveSession())) return;
  const now = new Date();
  const day = now.getDay();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  for (const fs of sessions) {
    if (!fs.enabled || fs.startTime !== hhmm) continue;
    if (Array.isArray(fs.days) && fs.days.length && !fs.days.includes(day)) continue;
    await startSession({ name: fs.name, duration: fs.duration || 25 });
    break;
  }
}

// Standalone breath in its own tab (manual / periodic / session end).
function openBreathTab(pool, duration) {
  const u = chrome.runtime.getURL('screens/breath.html') + '?' +
    new URLSearchParams({ session: '1', pool, duration: String(duration), theme: settings.theme }).toString();
  chrome.tabs.create({ url: u });
}

// --- Time tracking ----------------------------------------------------------
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
async function recordElapsed() {
  const now = Date.now();
  const { tracker } = await chrome.storage.local.get('tracker');
  if (tracker && tracker.domain && tracker.since) {
    const secs = Math.round((now - tracker.since) / 1000);
    if (secs > 0 && secs < 6 * 3600) {
      const key = todayKey();
      const { usage = {} } = await chrome.storage.local.get('usage');
      usage[key] = usage[key] || {};
      usage[key][tracker.domain] = (usage[key][tracker.domain] || 0) + secs;
      const days = Object.keys(usage).sort();
      while (days.length > 14) delete usage[days.shift()];
      await chrome.storage.local.set({ usage });
    }
    await chrome.storage.local.set({ tracker: { domain: tracker.domain, since: now } });
  }
}
async function updateActive() {
  await recordElapsed();
  let domain = null;
  try {
    const win = await chrome.windows.getLastFocused();
    if (win && win.focused) {
      const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
      if (tab && /^https?:\/\//i.test(tab.url || '') && !isExcluded(tab.url, settings.customExcludedDomains)) {
        domain = getRootDomain(tab.url);
      }
    }
  } catch (e) {}
  await chrome.storage.local.set({ tracker: domain ? { domain, since: Date.now() } : null });
}
chrome.windows.onFocusChanged.addListener((wid) => {
  if (wid === chrome.windows.WINDOW_ID_NONE) recordElapsed().then(() => chrome.storage.local.set({ tracker: null }));
  else updateActive();
});
try {
  chrome.idle.onStateChanged.addListener((st) => {
    if (st === 'active') updateActive();
    else recordElapsed().then(() => chrome.storage.local.set({ tracker: null }));
  });
} catch (e) {}

// --- Messaging --------------------------------------------------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case 'MIRU_CONTINUE': {
        const id = msg.tabId || (sender.tab && sender.tab.id);
        if (id != null) await allowOnce(id);
        sendResponse({ ok: true });
        break;
      }
      case 'MIRU_GET_STATE': {
        const session = await getActiveSession();
        const tabs = await chrome.tabs.query({ currentWindow: true });
        sendResponse({ session, tabCount: tabs.length });
        break;
      }
      case 'MIRU_GET_USAGE': {
        await recordElapsed();
        const { usage = {} } = await chrome.storage.local.get('usage');
        sendResponse({ today: usage[todayKey()] || {} });
        break;
      }
      case 'MIRU_BEGIN_BREATH': openBreathTab('periodic', msg.duration || 60); sendResponse({ ok: true }); break;
      case 'MIRU_START_SESSION': sendResponse({ session: await startSession({ name: msg.name, duration: msg.duration }) }); break;
      case 'MIRU_END_SESSION': await endSession({ silent: msg.silent }); sendResponse({ ok: true }); break;
      case 'MIRU_CLOSE_TAB': {
        const id = msg.tabId || (sender.tab && sender.tab.id);
        if (id) await chrome.tabs.remove(id).catch(() => {});
        sendResponse({ ok: true });
        break;
      }
      default: sendResponse({ ok: false });
    }
  })();
  return true;
});
