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
let breakActive = false;

const BREAK_MINUTES = 30;

// --- Rule building ----------------------------------------------------------
function cleanDomain(d) {
  return (d || '').replace(/^www\./, '').trim().toLowerCase();
}

// User-defined exceptions only (no built-in ALWAYS_EXCLUDED). Used as carve-outs
// for the block rule so a subdomain like studio.youtube.com can stay reachable
// while youtube.com is blocked — without ALWAYS_EXCLUDED self-excluding a block.
function customExceptionsDNR() {
  return [...new Set((settings.customExcludedDomains || []).map(cleanDomain).filter(Boolean))];
}

function excludedDNR() {
  // DNR matches a domain and its subdomains automatically. Drop IPs/localhost
  // (not valid DNR domains) to avoid rejecting the whole rule.
  const base = ALWAYS_EXCLUDED.filter((d) => d && d !== '127.0.0.1' && d !== 'localhost');
  const custom = (settings.customExcludedDomains || []).map(cleanDomain);
  return [...new Set([...base, ...custom])].filter(Boolean);
}

async function rebuildRules() {
  const breathUrl = chrome.runtime.getURL('screens/breath.html');
  const blockUrl = chrome.runtime.getURL('screens/block.html');
  const add = [];

  if (settings.navBreathEnabled && !breakActive) {
    // GET only: a cross-site POST (bank 3-D Secure, SSO form_post) carries a
    // body that a redirect-then-continue would silently drop.
    const base = { regexFilter: '^https?://.*', resourceTypes: ['main_frame'], requestMethods: ['get'] };
    let condition = null;
    if (settings.breathMode === 'all') {
      // Strict mode: every new http(s) place except the exclusions.
      condition = { ...base, excludedRequestDomains: excludedDNR() };
    } else {
      // Default: only the places the user chose. ALWAYS_EXCLUDED deliberately
      // does not apply — a chosen site (e.g. youtube.com) must win over it.
      const sites = [...new Set((settings.breathSites || []).map(cleanDomain))]
        .filter((d) => d && !/^[\d.]+$/.test(d) && !d.includes(':'));
      if (sites.length) {
        condition = { ...base, requestDomains: sites };
        // Same carve-out logic as blocking: keep studio.youtube.com breath-free
        // while youtube.com breathes, when the user kept it as an exception.
        const carve = customExceptionsDNR().filter((e) => sites.some((s) => e === s || e.endsWith('.' + s)));
        if (carve.length) condition.excludedRequestDomains = carve;
      }
    }
    if (condition) {
      add.push({
        id: RID_BREATH, priority: 1,
        action: { type: 'redirect', redirect: { regexSubstitution: breathUrl + '?target=\\0' } },
        condition
      });
    }
  }

  if (settings.nightModeEnabled && isNightTime(settings)) {
    const overrides = (settings.nightModeOverrides || []).map((d) => (d || '').replace(/^www\./, '').trim().toLowerCase()).filter(Boolean);
    // Night means night: only the user's own exceptions and night overrides stay
    // reachable. ALWAYS_EXCLUDED (Google/YouTube) is deliberately NOT carved out
    // here — it exempts sites from the breath, not from the night pause.
    const nightExcluded = [...new Set([...customExceptionsDNR(), ...overrides])];
    const condition = { regexFilter: '^https?://.*', resourceTypes: ['main_frame'] };
    if (nightExcluded.length) condition.excludedRequestDomains = nightExcluded;
    add.push({
      id: RID_NIGHT, priority: 8,
      action: { type: 'redirect', redirect: { url: blockUrl + '?night=1' } },
      condition
    });
  }

  const blockOn = !breakActive && settings.blockedSites && settings.blockedSites.length &&
    (!settings.blockDuringSessionsOnly || sessionActive);
  if (blockOn) {
    const exceptions = customExceptionsDNR();
    settings.blockedSites.forEach((d, i) => {
      const dom = cleanDomain(d);
      if (!dom) return;
      // A blocked domain matches its subdomains too. Carve out any allowed
      // exception that sits under it (e.g. studio.youtube.com under youtube.com).
      const carveOut = exceptions.filter((e) => e === dom || e.endsWith('.' + dom));
      const condition = { requestDomains: [dom], resourceTypes: ['main_frame'] };
      if (carveOut.length) condition.excludedRequestDomains = carveOut;
      add.push({
        id: RID_BLOCK_BASE + i, priority: 10,
        action: { type: 'redirect', redirect: { url: blockUrl + '?site=' + encodeURIComponent(dom) } },
        condition
      });
    });
  }

  const removeIds = [RID_BREATH, RID_NIGHT];
  for (let i = 0; i < 300; i++) removeIds.push(RID_BLOCK_BASE + i);
  await DNR.updateDynamicRules({ removeRuleIds: removeIds, addRules: add }).catch((e) => console.warn('[Miru] rules', e));
  await sweepBlockedTabs(blockOn);
}

// DNR only intercepts *new* requests, so a blocked SPA already open in a tab
// would keep working until a reload. Whenever blocking is (re)applied, walk the
// open tabs and bring any that sit on a blocked domain to the block page.
async function sweepBlockedTabs(blockOn) {
  if (!blockOn) return;
  const blockUrl = chrome.runtime.getURL('screens/block.html');
  const exceptions = customExceptionsDNR();
  const domains = settings.blockedSites.map(cleanDomain).filter(Boolean);
  let tabs = [];
  try { tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] }); } catch (e) { return; }
  for (const t of tabs) {
    let host = '';
    try { host = new URL(t.url).hostname.replace(/^www\./, '').toLowerCase(); } catch { continue; }
    const hit = domains.find((d) => host === d || host.endsWith('.' + d));
    if (!hit) continue;
    if (exceptions.some((e) => host === e || host.endsWith('.' + e))) continue;
    chrome.tabs.update(t.id, { url: blockUrl + '?site=' + encodeURIComponent(hit) }).catch(() => {});
  }
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
      if (!/^https?:\/\//i.test(u)) continue;
      const d = getRootDomain(u);
      // IPs/IPv6 aren't valid DNR requestDomains — one would reject the whole rule.
      if (d && !/^[\d.]+$/.test(d) && !d.includes(':')) s.add(d);
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
  // Restore a break that was running when the worker restarted, and re-arm
  // its end alarm so it still closes on time.
  const brk = await getBreakState();
  breakActive = !!(brk && brk.until > Date.now());
  if (breakActive) chrome.alarms.create('miru-break-end', { when: brk.until });
  // Clear any stale dynamic rules from a previous version before rebuilding.
  try {
    const existing = await DNR.getDynamicRules();
    if (existing.length) await DNR.updateDynamicRules({ removeRuleIds: existing.map((r) => r.id) });
    const sess = await DNR.getSessionRules();
    if (sess.length) await DNR.updateSessionRules({ removeRuleIds: sess.map((r) => r.id) });
  } catch (e) {}
  await rebuildRules();
  await applyAllowRule();
  applyPeriodicBreath();
  chrome.alarms.create('miru-schedule', { periodInMinutes: 1 });
  try { chrome.idle.setDetectionInterval(60); } catch (e) {}
}
async function reloadSettings() { settings = await getSettings(); }

// Periodic breath runs globally on its own rhythm — not tied to focus sessions.
// Recreating the alarm restarts the interval, so only call this when the
// enabled flag or interval actually changes (or on worker init).
function applyPeriodicBreath() {
  chrome.alarms.clear('miru-periodic');
  if (settings.periodicBreathEnabled) {
    const m = settings.periodicBreathInterval || 15;
    chrome.alarms.create('miru-periodic', { periodInMinutes: m, delayInMinutes: m });
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  const cur = await chrome.storage.sync.get(null);
  const seed = {};
  for (const [k, v] of Object.entries(DEFAULTS)) if (!(k in cur)) seed[k] = v;
  if (Object.keys(seed).length) await chrome.storage.sync.set(seed);
  await init();
  // First meeting: walk through what Miru is and tune it to the person.
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/onboarding.html') }).catch(() => {});
  }
});
chrome.runtime.onStartup.addListener(init);
reloadSettings(); // keep `settings` warm for messaging on every worker wake
// Same for the session/break flags — rebuildRules on a fresh worker must not
// see them stale-false and drop rules mid-session or re-block mid-break.
getActiveSession().then((s) => { sessionActive = !!s; });
getBreakState().then((b) => { breakActive = !!(b && b.until > Date.now()); });

chrome.storage.onChanged.addListener(async (c, area) => {
  if (area === 'sync') {
    await reloadSettings();
    await rebuildRules();
    await applyAllowRule();
    // Only restart the periodic-breath timer when its own settings change, so
    // editing unrelated settings doesn't reset the interval.
    if (c.periodicBreathEnabled || c.periodicBreathInterval) applyPeriodicBreath();
  }
  if (area === 'local' && c.activeSession) { sessionActive = !!c.activeSession.newValue; await rebuildRules(); }
  if (area === 'local' && c.breakState) {
    const b = c.breakState.newValue;
    breakActive = !!(b && b.until > Date.now());
    await rebuildRules();
  }
});

// --- Allow-once (post-breath continue) --------------------------------------
// Scoped to the destination's domain: the pass outranks even block rules, so an
// unscoped one would let the tab reach any blocked site until the page settles.
// IPs can't go in requestDomains — those fall back to the plain tab-wide pass.
async function allowOnce(tabId, targetUrl) {
  const id = RID_ALLOWONCE_BASE + tabId;
  const condition = { tabIds: [tabId], resourceTypes: ['main_frame'] };
  const dom = targetUrl ? getRootDomain(targetUrl) : '';
  if (dom && !/^[\d.]+$/.test(dom) && !dom.includes(':')) condition.requestDomains = [dom];
  await DNR.updateSessionRules({
    removeRuleIds: [id],
    addRules: [{ id, priority: 100, action: { type: 'allow' }, condition }]
  }).catch((e) => console.warn('[Miru] allowOnce', e));
  setTimeout(() => DNR.updateSessionRules({ removeRuleIds: [id] }).catch(() => {}), 15000);
}

// --- Tab tracking (keeps the allow-rule current) ----------------------------
chrome.tabs.onUpdated.addListener((id, info) => {
  if (info.status === 'complete') DNR.updateSessionRules({ removeRuleIds: [RID_ALLOWONCE_BASE + id] }).catch(() => {});
  if (info.url || info.status === 'complete') { scheduleAllow(); updateActive(); }
});
chrome.tabs.onRemoved.addListener((id) => { DNR.updateSessionRules({ removeRuleIds: [RID_ALLOWONCE_BASE + id] }).catch(() => {}); scheduleAllow(); });
// Resolve with a tab's destination URL once it commits, or null if it isn't a
// real http(s) link. Tells a link's new tab (opened blank, navigated a beat
// later) apart from a genuinely empty new tab. Resolves as soon as *any*
// destination commits — an http(s) URL → that link; anything else (e.g.
// chrome://newtab) → null — so an empty new tab never waits out the timeout.
// about:blank/empty are the transient pre-navigation state, so we keep waiting.
function waitForNav(tabId, ms) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; chrome.tabs.onUpdated.removeListener(onUpd); clearTimeout(timer); resolve(v); };
    const decide = (u) => { if (u && u !== 'about:blank') finish(/^https?:\/\//i.test(u) ? u : null); };
    const onUpd = (id, info) => { if (id === tabId) decide(info.url || ''); };
    chrome.tabs.onUpdated.addListener(onUpd);
    // The navigation may have already populated the tab before we attached.
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) return; // tab gone
      decide(tab && (tab.pendingUrl || tab.url) || '');
    });
    const timer = setTimeout(() => finish(null), ms);
  });
}

chrome.tabs.onCreated.addListener(async (tab) => {
  scheduleAllow();
  const u = tab.pendingUrl || tab.url || '';
  if (u.startsWith(SELF)) return;
  if (!settings.tabLimitEnabled) return;
  const tabs = await chrome.tabs.query({ currentWindow: true });
  if (tabs.length <= (settings.tabLimit || 3)) return;
  // Over the limit: show the gentle reminder ("go deep, not wide"). But a tab
  // opened with a real destination (link target=_blank, window.open) must not
  // lose it — capture the URL so "Continue" can still take the user there. The
  // tab is often created blank and navigates a beat later, so if the URL isn't
  // on it yet (openerTabId means it came from a page), wait briefly for it.
  let target = /^https?:\/\//i.test(u) ? u : '';
  if (!target && tab.openerTabId != null) target = (await waitForNav(tab.id, 1500)) || '';
  const url = chrome.runtime.getURL('screens/tablimit.html') +
    '?count=' + tabs.length + '&theme=' + settings.theme +
    (target ? '&target=' + encodeURIComponent(target) : '');
  chrome.tabs.update(tab.id, { url }).catch(() => {});
});
chrome.tabs.onActivated.addListener(() => updateActive());

// --- Breaks -------------------------------------------------------------------
// One 30-minute break per day: blocked sites open again and the navigation
// breath rests. Ending early doesn't refund the day's break.
async function startBreak() {
  const prev = await getBreakState();
  if (prev && prev.usedOn === todayKey()) {
    return prev.until > Date.now()
      ? { ok: true, until: prev.until }
      : { ok: false, reason: 'used' };
  }
  const until = Date.now() + BREAK_MINUTES * 60 * 1000;
  await setBreakState({ until, usedOn: todayKey() });
  breakActive = true;
  await rebuildRules();
  chrome.alarms.create('miru-break-end', { when: until });
  return { ok: true, until };
}

async function endBreak({ silent } = {}) {
  const wasActive = breakActive;
  const prev = await getBreakState();
  if (prev && prev.until > Date.now()) await setBreakState({ ...prev, until: Date.now() });
  breakActive = false;
  chrome.alarms.clear('miru-break-end');
  await rebuildRules();
  if (wasActive && !silent) openBreathTab('breakEnd', settings.breathDuration || 10);
}

// --- Focus sessions ---------------------------------------------------------
async function startSession({ name, duration }) {
  const startedAt = Date.now();
  const endTime = startedAt + duration * 60 * 1000;
  await setActiveSession({ name: name || '', duration, startedAt, endTime });
  sessionActive = true;
  await rebuildRules();
  chrome.alarms.create('miru-session-end', { when: endTime });
  // Periodic breath is global (see applyPeriodicBreath) — not started here.
  return { name, duration, startedAt, endTime };
}
async function endSession({ silent } = {}) {
  await clearActiveSession();
  sessionActive = false;
  await rebuildRules();
  chrome.alarms.clear('miru-session-end');
  if (!silent) openBreathTab('focusEnd', 8);
}

chrome.alarms.onAlarm.addListener(async (a) => {
  // The worker may have just woken for this alarm; make sure settings are fresh.
  await reloadSettings();
  if (a.name === 'miru-session-end') await endSession();
  else if (a.name === 'miru-break-end') await endBreak();
  else if (a.name === 'miru-periodic') {
    if (!settings.periodicBreathEnabled) { chrome.alarms.clear('miru-periodic'); return; }
    if (breakActive) return; // the break is a rest from the rhythm too
    // Don't pile up breath tabs while the user is away from the machine.
    let state = 'active';
    try { state = await chrome.idle.queryState(60); } catch (e) {}
    if (state !== 'active') return;
    openBreathTab('periodic', settings.breathDuration || 10);
  } else if (a.name === 'miru-schedule') {
    await checkScheduled();
    await checkTimeMirror();
    await rebuildRules(); // re-evaluate night-mode window
  }
});

// --- Time mirror --------------------------------------------------------------
// A long unbroken stay on one domain meets a gentle notice — awareness, not
// judgment. `tracker.start` marks when the current continuous stay began
// (recordElapsed resets `since` for accounting but preserves `start`).
async function checkTimeMirror() {
  if (!settings.timeMirrorEnabled || breakActive) return;
  const { tracker } = await chrome.storage.local.get('tracker');
  if (!tracker || !tracker.domain || !tracker.start) return;
  const thresholdMs = Math.max(5, settings.timeMirrorMinutes || 20) * 60000;
  const anchor = tracker.mirrorAt || tracker.start;
  if (Date.now() - anchor < thresholdMs) return;
  // Only when the person is actually there.
  let state = 'active';
  try { state = await chrome.idle.queryState(60); } catch (e) {}
  if (state !== 'active') return;
  const minutes = Math.round((Date.now() - tracker.start) / 60000);
  await chrome.storage.local.set({ tracker: { ...tracker, mirrorAt: Date.now() } });
  openBreathTab('timeMirror', settings.breathDuration || 10, {
    mirror: tracker.domain, minutes: String(minutes)
  });
}

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

// Standalone breath in its own tab (manual / periodic / session end / mirror).
function openBreathTab(pool, duration, extra = {}) {
  const u = chrome.runtime.getURL('screens/breath.html') + '?' +
    new URLSearchParams({ session: '1', pool, duration: String(duration), theme: settings.theme, ...extra }).toString();
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
    await chrome.storage.local.set({ tracker: { ...tracker, since: now } });
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
  if (!domain) { await chrome.storage.local.set({ tracker: null }); return; }
  // Preserve the continuous-stay marker while the domain hasn't changed (the
  // time mirror measures unbroken presence, not accumulated totals).
  const { tracker: prev } = await chrome.storage.local.get('tracker');
  const sameStay = prev && prev.domain === domain && prev.start;
  await chrome.storage.local.set({ tracker: {
    domain,
    since: Date.now(),
    start: sameStay ? prev.start : Date.now(),
    mirrorAt: sameStay ? prev.mirrorAt : undefined
  } });
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
        if (id != null) await allowOnce(id, msg.target);
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
      case 'MIRU_START_BREAK': sendResponse(await startBreak()); break;
      case 'MIRU_END_BREAK': await endBreak({ silent: msg.silent }); sendResponse({ ok: true }); break;
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
