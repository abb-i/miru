// Miru — Background service worker (declarativeNetRequest interception)
//
// Interception happens at Chrome's NETWORK layer via DNR, not in JS. This means
// it cannot be out-raced by fast/SPA sites and works even when the service
// worker is asleep — the reliability ceiling of webNavigation+tabs.update is gone.
//
// Rules (priority high→low):
//   block (10)    redirect places with posture 'block' → block.html
//   night (8)     during night hours, redirect all → block.html?night=1
//   allow-once    (session, 100) per-tab pass-through right after "continue"
//   peek (60)     (session) five-minute pass into a blocked domain, per tab
//   allow (5)     domains currently open in some tab → no breath (internal nav)
//   breath (1)    redirect places with posture 'breathe'/'calm' → breath.html?target=…

importScripts('utils/domains.js', 'utils/storage.js', 'utils/words.js', 'utils/calm.js');

const DNR = chrome.declarativeNetRequest;
console.log('[Miru] background loaded');

const RID_BREATH = 1, RID_ALLOW = 2, RID_NIGHT = 3, RID_BLOCK_BASE = 100, RID_ALLOWONCE_BASE = 5000, RID_PEEK_BASE = 1000000;

const PEEK_MINUTES = 5;
const PEEK_DAILY_LIMIT = 3;   // at most three five-minute peeks a day

let settings = { ...DEFAULTS };
let sessionActive = false;

// --- Rule building ----------------------------------------------------------
function cleanDomain(d) {
  return (d || '').replace(/^www\./, '').trim().toLowerCase();
}

// The domains whose place has one of the given postures, cleaned and deduped.
// IPs/IPv6 are dropped — they aren't valid DNR requestDomains and one would
// reject the whole rule.
function placeDomains(...postures) {
  return [...new Set((settings.places || [])
    .filter((p) => p && postures.includes(p.posture))
    .map((p) => cleanDomain(p.domain))
    .filter((d) => d && !/^[\d.]+$/.test(d) && !d.includes(':')))];
}

// User-defined exceptions only (no built-in ALWAYS_EXCLUDED). Used as carve-outs
// for the block rule so a subdomain like studio.youtube.com can stay reachable
// while youtube.com is blocked — without ALWAYS_EXCLUDED self-excluding a block.
function customExceptionsDNR() {
  return [...new Set((settings.customExcludedDomains || []).map(cleanDomain).filter(Boolean))];
}

async function rebuildRules() {
  const breathUrl = chrome.runtime.getURL('screens/breath.html');
  const blockUrl = chrome.runtime.getURL('screens/block.html');
  const add = [];

  // Breath at the door for places with posture 'breathe' or 'calm' — calm is
  // a breath plus a quieted room inside; the door is the same. ALWAYS_EXCLUDED
  // deliberately does not apply — a chosen site (e.g. youtube.com) must win.
  const breathSites = placeDomains('breathe', 'calm');
  if (breathSites.length) {
    // GET only: a cross-site POST (bank 3-D Secure, SSO form_post) carries a
    // body that a redirect-then-continue would silently drop.
    const condition = {
      regexFilter: '^https?://.*', resourceTypes: ['main_frame'],
      requestMethods: ['get'], requestDomains: breathSites
    };
    // Same carve-out logic as blocking: keep studio.youtube.com breath-free
    // while youtube.com breathes, when the user kept it as an exception.
    const carve = customExceptionsDNR().filter((e) => breathSites.some((s) => e === s || e.endsWith('.' + s)));
    if (carve.length) condition.excludedRequestDomains = carve;
    add.push({
      id: RID_BREATH, priority: 1,
      action: { type: 'redirect', redirect: { regexSubstitution: breathUrl + '?target=\\0' } },
      condition
    });
  }

  if (settings.nightModeEnabled && isNightTime(settings)) {
    // Night means night: only the user's own exceptions stay reachable.
    // ALWAYS_EXCLUDED (Google) is deliberately NOT carved out here — it exempts
    // sites from tracking, not from the night pause.
    const nightExcluded = customExceptionsDNR();
    const condition = { regexFilter: '^https?://.*', resourceTypes: ['main_frame'] };
    if (nightExcluded.length) condition.excludedRequestDomains = nightExcluded;
    add.push({
      id: RID_NIGHT, priority: 8,
      action: { type: 'redirect', redirect: { url: blockUrl + '?night=1' } },
      condition
    });
  }

  const blockDomains = placeDomains('block');
  const blockOn = blockDomains.length &&
    (!settings.blockDuringSessionsOnly || sessionActive);
  if (blockOn) {
    const exceptions = customExceptionsDNR();
    blockDomains.forEach((dom, i) => {
      // A blocked domain matches its subdomains too. Carve out any allowed
      // exception that sits under it (e.g. studio.youtube.com under youtube.com).
      const carveOut = exceptions.filter((e) => e === dom || e.endsWith('.' + dom));
      // regexFilter (with requestDomains still scoping the domain) lets the
      // substitution keep the full blocked URL as &target — so a peek returns
      // to the exact page instead of the bare site root.
      const condition = { requestDomains: [dom], regexFilter: '^https?://.*', resourceTypes: ['main_frame'] };
      if (carveOut.length) condition.excludedRequestDomains = carveOut;
      add.push({
        id: RID_BLOCK_BASE + i, priority: 10,
        action: { type: 'redirect', redirect: { regexSubstitution: blockUrl + '?site=' + encodeURIComponent(dom) + '&target=\\0' } },
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
  const domains = placeDomains('block');
  let tabs = [];
  try { tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] }); } catch (e) { return; }
  // Tabs with a live peek are deliberately inside a blocked site for a few
  // minutes — the sweep must leave them be, or it would drag them back to the
  // block (a peek → block → peek loop). endPeek re-blocks them when time's up.
  let peekIds = new Set();
  try { for (const r of await DNR.getSessionRules()) peekIds.add(r.id); } catch (e) {}
  for (const t of tabs) {
    if (peekIds.has(RID_PEEK_BASE + t.id)) continue;
    let host = '';
    try { host = new URL(t.url).hostname.replace(/^www\./, '').toLowerCase(); } catch { continue; }
    const hit = domains.find((d) => host === d || host.endsWith('.' + d));
    if (!hit) continue;
    if (exceptions.some((e) => host === e || host.endsWith('.' + e))) continue;
    chrome.tabs.update(t.id, { url: blockUrl + '?site=' + encodeURIComponent(hit) + '&target=' + encodeURIComponent(t.url) }).catch(() => {});
  }
}

// Domains currently open anywhere → allowed (so internal navigation / reloads /
// already-open sites don't trigger the breath).
async function applyAllowRule() {
  if (!placeDomains('breathe', 'calm').length) { await DNR.updateDynamicRules({ removeRuleIds: [RID_ALLOW] }).catch(() => {}); return; }
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

// --- Calm mode (the quiet room) ----------------------------------------------
// Places with posture 'calm' get utils/calm.js as a registered content script,
// scoped to exactly the hosts their pack tends. Registered scripts persist
// across worker restarts AND extension updates, so this always reconciles from
// settings instead of assuming a clean slate. Peeks get their own short-lived
// registration (see grantPeek) with ids under CALM_ID + '-peek-'.
const CALM_ID = 'miru-calm';

async function registerCalmScripts() {
  try {
    const existing = await chrome.scripting.getRegisteredContentScripts();
    const stale = existing.filter((s) => s.id === CALM_ID).map((s) => s.id);
    if (stale.length) await chrome.scripting.unregisterContentScripts({ ids: stale });
  } catch (e) {}
  const matches = placeDomains('calm')
    .filter((d) => MiruCalm.hasPack(d))
    .flatMap((d) => MiruCalm.CALM_PACKS[d].matches);
  if (!matches.length) return;
  await chrome.scripting.registerContentScripts([{
    id: CALM_ID, matches, js: ['utils/calm.js'],
    runAt: 'document_start', persistAcrossSessions: true
  }]).catch((e) => console.warn('[Miru] calm register', e));
}

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
  // Restore a periodic breath that was armed but not yet delivered before the
  // worker slept, so its rhythm survives the restart.
  const { breathDue: bd } = await chrome.storage.local.get('breathDue');
  breathDue = bd || null;
  // Clear any stale dynamic rules from a previous version before rebuilding.
  try {
    const existing = await DNR.getDynamicRules();
    if (existing.length) await DNR.updateDynamicRules({ removeRuleIds: existing.map((r) => r.id) });
    const sess = await DNR.getSessionRules();
    if (sess.length) await DNR.updateSessionRules({ removeRuleIds: sess.map((r) => r.id) });
  } catch (e) {}
  // Peek calm scripts belong to session-scoped DNR rules just cleared above —
  // sweep any that a crashed worker left behind, then reconcile calm proper.
  try {
    const regs = await chrome.scripting.getRegisteredContentScripts();
    const stalePeeks = regs.filter((s) => s.id.startsWith(CALM_ID + '-peek-')).map((s) => s.id);
    if (stalePeeks.length) await chrome.scripting.unregisterContentScripts({ ids: stalePeeks });
  } catch (e) {}
  await registerCalmScripts();
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
  } else {
    // Turned off: drop any breath that was armed but not yet delivered.
    breathDue = null;
    chrome.storage.local.remove('breathDue').catch(() => {});
  }
}

// v1 → v2: the separate breath/block lists become one list of places with a
// posture. Idempotent (guarded on `places` existing), so it's safe on install,
// update, and dev reloads alike. Block wins when a domain sat on both lists.
async function migrateToPlaces() {
  const cur = await chrome.storage.sync.get(null);
  if (Array.isArray(cur.places)) return;
  const places = [];
  const seen = new Set();
  const add = (d, posture) => {
    const dom = cleanDomain(d);
    if (dom && !seen.has(dom)) { seen.add(dom); places.push({ domain: dom, posture }); }
  };
  (cur.blockedSites || []).forEach((d) => add(d, 'block'));
  (cur.breathSites || []).forEach((d) => add(d, 'breathe'));
  await chrome.storage.sync.set({ places });
  await chrome.storage.sync.remove([
    'navBreathEnabled', 'breathMode', 'breathSites',
    'tabLimit', 'tabLimitEnabled', 'blockedSites',
    'focusSessions', 'nightModeOverrides'
  ]).catch(() => {});
  await chrome.storage.local.remove(['breakState']).catch(() => {});
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await migrateToPlaces();
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
// Same for the session flag — rebuildRules on a fresh worker must not see it
// stale-false and drop rules mid-session.
getActiveSession().then((s) => { sessionActive = !!s; });

chrome.storage.onChanged.addListener(async (c, area) => {
  if (area === 'sync') {
    await reloadSettings();
    await rebuildRules();
    await applyAllowRule();
    if (c.places) await registerCalmScripts();
    // Only restart the periodic-breath timer when its own settings change, so
    // editing unrelated settings doesn't reset the interval.
    if (c.periodicBreathEnabled || c.periodicBreathInterval) applyPeriodicBreath();
  }
  if (area === 'local' && c.activeSession) { sessionActive = !!c.activeSession.newValue; await rebuildRules(); }
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

// --- Peek (a time-boxed way past the block) ---------------------------------
// From the block screen the user can choose to step into a blocked site for a
// few minutes. Scoped to that domain in that tab: internal navigation flows (a
// channel to a video) but other blocked sites stay shut. Priority sits above
// the block (10) and night (8), below the post-breath pass (100). An alarm ends
// it — a service-worker setTimeout wouldn't survive the worker sleeping.
//
// Peeks are rationed: PEEK_DAILY_LIMIT a day, counted in storage.local as
// { day: 'YYYY-MM-DD', count }. Once the day is spent the block holds firm, so
// the site can't be browsed five minutes at a time.
async function peekRemaining() {
  const { peekUse } = await chrome.storage.local.get('peekUse');
  const used = (peekUse && peekUse.day === todayKey()) ? (peekUse.count || 0) : 0;
  return Math.max(0, PEEK_DAILY_LIMIT - used);
}

// Count one peek against today's allowance; false if the day is already spent.
async function consumePeek() {
  const { peekUse } = await chrome.storage.local.get('peekUse');
  const today = todayKey();
  const used = (peekUse && peekUse.day === today) ? (peekUse.count || 0) : 0;
  if (used >= PEEK_DAILY_LIMIT) return false;
  await chrome.storage.local.set({ peekUse: { day: today, count: used + 1 } });
  return true;
}

async function grantPeek(tabId, site) {
  const dom = cleanDomain(site);
  // An IP/host we can't put in requestDomains can't be blocked by one either,
  // so there's nothing to peek past — bail rather than build an invalid rule.
  if (!dom || /^[\d.]+$/.test(dom) || dom.includes(':')) return;
  // Prefer scoping to this tab; if the tab id is missing, fall back to a
  // domain-only pass (a shared id) so the pass still exists and can't loop.
  const hasTab = Number.isInteger(tabId);
  const id = hasTab ? RID_PEEK_BASE + tabId : RID_PEEK_BASE;
  const condition = { requestDomains: [dom], resourceTypes: ['main_frame'] };
  if (hasTab) condition.tabIds = [tabId];
  await DNR.updateSessionRules({
    removeRuleIds: [id],
    addRules: [{ id, priority: 60, action: { type: 'allow' }, condition }]
  }).catch((e) => console.warn('[Miru] peek', e));
  // A peek into a domain with a calm pack lands in the calm room, not the raw
  // feed — a short-lived registered script (a one-shot insertCSS would be lost
  // to the navigation that follows, and to SPA moves during the five minutes).
  // Registered before the MIRU_PEEK handler navigates, so there's no flash.
  if (MiruCalm.hasPack(dom)) {
    const scriptId = CALM_ID + '-peek-' + (hasTab ? tabId : 'shared');
    await chrome.scripting.unregisterContentScripts({ ids: [scriptId] }).catch(() => {});
    await chrome.scripting.registerContentScripts([{
      id: scriptId, matches: MiruCalm.CALM_PACKS[dom].matches, js: ['utils/calm.js'],
      runAt: 'document_start', persistAcrossSessions: false
    }]).catch(() => {});
  }
  console.log('[Miru] peek granted', { tabId, dom, id });
  chrome.alarms.create('miru-peek-' + (hasTab ? tabId : 'shared'), { when: Date.now() + PEEK_MINUTES * 60 * 1000 });
}

async function endPeek(tabId) {
  await DNR.updateSessionRules({ removeRuleIds: [RID_PEEK_BASE + tabId] }).catch(() => {});
  chrome.alarms.clear('miru-peek-' + tabId);
  await chrome.scripting.unregisterContentScripts({ ids: [CALM_ID + '-peek-' + tabId] }).catch(() => {});
  // If the tab is still on the peeked (blocked) domain when the window closes,
  // bring it back to the block — the peek was time-boxed, not a pass. DNR only
  // catches *new* requests, so a still-loaded page wouldn't stop on its own.
  let tab;
  try { tab = await chrome.tabs.get(tabId); } catch (e) { return; } // tab gone
  if (!tab || !/^https?:\/\//i.test(tab.url || '')) return;
  const blockDomains = placeDomains('block');
  const blockOn = blockDomains.length &&
    (!settings.blockDuringSessionsOnly || sessionActive);
  if (!blockOn) return;
  let host = '';
  try { host = new URL(tab.url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return; }
  const hit = blockDomains.find((d) => host === d || host.endsWith('.' + d));
  if (!hit) return;
  if (customExceptionsDNR().some((e) => host === e || host.endsWith('.' + e))) return;
  const blockUrl = chrome.runtime.getURL('screens/block.html');
  chrome.tabs.update(tabId, { url: blockUrl + '?site=' + encodeURIComponent(hit) + '&target=' + encodeURIComponent(tab.url) }).catch(() => {});
}

// --- Tab tracking (keeps the allow-rule current) ----------------------------
chrome.tabs.onUpdated.addListener((id, info, tab) => {
  if (info.status === 'complete') DNR.updateSessionRules({ removeRuleIds: [RID_ALLOWONCE_BASE + id] }).catch(() => {});
  if (info.url || info.status === 'complete') { scheduleAllow(); updateActive(); }
  // A finished navigation on the active tab is a natural seam for an armed breath.
  if (breathDue && info.status === 'complete' && tab && tab.active) maybeDeliverBreath();
});
chrome.tabs.onRemoved.addListener((id) => {
  DNR.updateSessionRules({ removeRuleIds: [RID_ALLOWONCE_BASE + id] }).catch(() => {});
  endPeek(id);
  scheduleAllow();
});
chrome.tabs.onCreated.addListener(() => scheduleAllow());
chrome.tabs.onActivated.addListener(() => { updateActive(); if (breathDue) maybeDeliverBreath(); });

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
  if (!silent) showBreath('focusEnd', 8);
}

chrome.alarms.onAlarm.addListener(async (a) => {
  // The worker may have just woken for this alarm; make sure settings are fresh.
  await reloadSettings();
  if (a.name === 'miru-session-end') await endSession();
  else if (a.name === 'miru-periodic') {
    if (!settings.periodicBreathEnabled) { chrome.alarms.clear('miru-periodic'); return; }
    // Arm, don't fire: the breath waits for the next natural seam (a tab switch
    // or a finished navigation) so it rides a transition instead of cutting in.
    // A single latched flag means being away just leaves it armed — no pile-up.
    await armPeriodicBreath();
  } else if (a.name.startsWith('miru-peek-')) {
    const rest = a.name.slice('miru-peek-'.length);
    if (rest === 'shared') {
      await DNR.updateSessionRules({ removeRuleIds: [RID_PEEK_BASE] }).catch(() => {});
      await chrome.scripting.unregisterContentScripts({ ids: [CALM_ID + '-peek-shared'] }).catch(() => {});
    } else { const tabId = Number(rest); if (!Number.isNaN(tabId)) await endPeek(tabId); }
  } else if (a.name === 'miru-schedule') {
    await checkTimeMirror();
    await rebuildRules(); // re-evaluate night-mode window
  }
});

// --- Time mirror --------------------------------------------------------------
// A long unbroken stay on one domain meets a gentle notice — awareness, not
// judgment. `tracker.start` marks when the current continuous stay began
// (recordElapsed resets `since` for accounting but preserves `start`).
async function checkTimeMirror() {
  if (!settings.timeMirrorEnabled) return;
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
  showBreath('timeMirror', settings.breathDuration || 10, {
    mirror: tracker.domain, minutes: String(minutes)
  });
}

// --- Standalone breath (manual / session end / mirror / periodic) -----------
// Prefer an in-page overlay painted onto the tab the user is already looking at
// — no context switch, nothing new in the app switcher, and dismissing it never
// closes their actual work. Fall back to a fullscreen window only where a page
// can't host the overlay (chrome://, the Web Store, a blank tab, injection denied).

let lastBreathAt = 0;

const WEBSTORE_RE = /^https?:\/\/(chrome\.google\.com\/webstore|chromewebstore\.google\.com)/i;

function resolveTheme() {
  // The worker has no matchMedia; pass the raw preference and let the page
  // resolve 'auto'. renderBreath only distinguishes 'light' from everything else.
  return settings.theme || 'dark';
}

// The active tab of the focused normal window, if it can host an overlay.
async function activeHostTab() {
  try {
    const win = await chrome.windows.getLastFocused();
    if (!win || !win.focused || win.type !== 'normal') return null;
    const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
    if (!tab || tab.id == null) return null;
    const u = tab.url || '';
    if (!/^https?:\/\//i.test(u)) return null;  // chrome://, extension pages, blank
    if (WEBSTORE_RE.test(u)) return null;       // the Web Store forbids injection
    return tab;
  } catch (e) { return null; }
}

// Runs *in the page* (serialized by scripting.executeScript). Must be
// self-contained — no closure references.
function injectBreath(opts) {
  try {
    if (!window.MiruOverlay || !document.body) return false;
    if (document.querySelector('.miru-overlay')) return true; // already breathing
    let theme = opts.theme;
    if (theme === 'auto') {
      theme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    window.MiruOverlay.injectFonts();
    window.MiruOverlay.renderBreath(document.body, {
      theme, pool: opts.pool, duration: opts.duration, pattern: opts.pattern,
      domain: opts.mirror || '',
      subtitle: opts.minutes ? ('You’ve been here ' + opts.minutes + ' minutes.') : '',
      askContinue: false,
      onDone: function () {}
    });
    return true;
  } catch (e) { return false; }
}

async function injectBreathInto(tabId, opts) {
  try {
    // words.js/overlay.js declare top-level consts, so re-running them in the
    // same isolated world would throw "already declared". Only load them when
    // this document hasn't been seeded yet (a fresh navigation clears them).
    const [{ result: has }] = await chrome.scripting.executeScript({
      target: { tabId }, func: () => !!window.MiruOverlay
    });
    if (!has) {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['utils/words.js', 'utils/overlay.js'] });
    }
    const [{ result: ok }] = await chrome.scripting.executeScript({
      target: { tabId }, func: injectBreath, args: [opts]
    });
    return ok !== false;
  } catch (e) { return false; }
}

function breathWindow(opts) {
  const params = { session: '1', pool: opts.pool, duration: String(opts.duration), theme: opts.theme };
  if (opts.mirror) params.mirror = opts.mirror;
  if (opts.minutes) params.minutes = String(opts.minutes);
  const u = chrome.runtime.getURL('screens/breath.html') + '?' + new URLSearchParams(params).toString();
  chrome.windows.create({ url: u, type: 'popup', state: 'fullscreen', focused: true })
    .catch(() => chrome.tabs.create({ url: u }).catch(() => {}));
}

async function showBreath(pool, duration, extra = {}) {
  lastBreathAt = Date.now();
  const opts = { theme: resolveTheme(), pool, duration, pattern: settings.breathPattern,
    mirror: extra.mirror || '', minutes: extra.minutes || '' };
  const tab = await activeHostTab();
  if (tab && await injectBreathInto(tab.id, opts)) return;
  breathWindow(opts);
}

// --- Periodic breath: armed by the interval, delivered at a natural seam ------
// The rhythm shouldn't slice into focus. When the interval elapses we *arm* the
// breath rather than fire it, then deliver at the next moment attention is
// already moving — a tab switch or a completed navigation. In unbroken deep
// flow (no seam) it simply waits; a breath is meant to catch a transition.
let breathDue = null;   // { pool, duration } when armed, else null
let delivering = false;

async function armPeriodicBreath() {
  breathDue = { pool: 'periodic', duration: settings.breathDuration || 10 };
  await chrome.storage.local.set({ breathDue }).catch(() => {});
}

async function maybeDeliverBreath() {
  if (!breathDue || delivering) return;
  if (Date.now() - lastBreathAt < 60000) return;   // just breathed — let it settle
  let state = 'active';
  try { state = await chrome.idle.queryState(60); } catch (e) {}
  if (state !== 'active') return;                  // not here — keep waiting
  const tab = await activeHostTab();
  if (!tab) return;                                // wait for a seam we can host
  delivering = true;
  const due = breathDue;
  breathDue = null;
  await chrome.storage.local.remove('breathDue').catch(() => {});
  lastBreathAt = Date.now();
  const opts = { theme: resolveTheme(), pool: due.pool, duration: due.duration,
    pattern: settings.breathPattern, mirror: '', minutes: '' };
  if (!(await injectBreathInto(tab.id, opts))) breathWindow(opts);
  delivering = false;
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
        sendResponse({ session: await getActiveSession() });
        break;
      }
      case 'MIRU_GET_USAGE': {
        await recordElapsed();
        const { usage = {} } = await chrome.storage.local.get('usage');
        sendResponse({ today: usage[todayKey()] || {} });
        break;
      }
      case 'MIRU_BEGIN_BREATH': showBreath('periodic', msg.duration || 60); sendResponse({ ok: true }); break;
      case 'MIRU_PEEK_LEFT': sendResponse({ remaining: await peekRemaining(), limit: PEEK_DAILY_LIMIT }); break;
      case 'MIRU_PEEK': {
        const id = msg.tabId != null ? msg.tabId : (sender.tab && sender.tab.id);
        // Ration first: a spent day holds the block firm, no pass granted.
        if (!(await consumePeek())) { sendResponse({ ok: false, reason: 'limit', remaining: 0 }); break; }
        await grantPeek(id, msg.site);   // grantPeek tolerates a missing id
        // Navigate here, strictly after the pass is committed, so the block
        // can't re-catch the request in the gap before the rule goes live.
        let navigated = false;
        if (Number.isInteger(id) && msg.target) {
          try { await chrome.tabs.update(id, { url: msg.target }); navigated = true; } catch (e) {}
        }
        sendResponse({ ok: true, navigated, remaining: await peekRemaining() });
        break;
      }
      case 'MIRU_START_SESSION': sendResponse({ session: await startSession({ name: msg.name, duration: msg.duration }) }); break;
      case 'MIRU_END_SESSION': await endSession({ silent: msg.silent }); sendResponse({ ok: true }); break;
      default: sendResponse({ ok: false });
    }
  })();
  return true;
});
