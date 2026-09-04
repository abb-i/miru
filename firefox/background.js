// Miru — Background service worker (declarativeNetRequest interception)
//
// Interception happens at Chrome's NETWORK layer via DNR, not in JS. This means
// it cannot be out-raced by fast/SPA sites and works even when the service
// worker is asleep — the reliability ceiling of webNavigation+tabs.update is gone.
//
// Rules (priority high→low):
//   block (10)    redirect places with posture 'block' → block.html
//   allow-once    (session, 100) per-tab pass-through right after "continue"
//   peek (60)     (session) five-minute pass into a blocked domain, per tab
//   allow (5)     domains currently open in some tab → no breath (internal nav)
//   breath (1)    redirect places with posture 'breathe'/'calm' → breath.html?target=…
//
// Night is not a rule: during the night window the whole web fades to
// grayscale instead (see applyNightGray) — a wind-down, not a wall.
//
// Neither is the periodic breath, nor the calm stay. The breath rides its own
// interval across the whole browser (see maybeDeliverBreath); a calm place adds
// a length the person names at the door and Miru then holds (see Calm stays).

// Chrome runs this file as a service worker and pulls the utils in here.
// Firefox runs it as an event page, where importScripts doesn't exist — there
// the same files load via the manifest's background.scripts list instead.
if (typeof importScripts === 'function') {
  importScripts('utils/domains.js', 'utils/storage.js', 'utils/words.js', 'utils/calm.js');
}

const DNR = chrome.declarativeNetRequest;

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

function isCustomExcepted(url) {
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return false; }
  return customExceptionsDNR().some((e) => host === e || host.endsWith('.' + e));
}

// --- Night gray (the web loses its color until morning) ----------------------
// Everything stays reachable at night; it just renders gray. All applications
// go through insertCSS with the same bundled file, so leaving the window can
// removeCSS them again — a registered content script's CSS would outlive its
// own unregistration on already-loaded pages. New pages are grayed from the
// tabs.onUpdated listener while the window holds.
let nightGrayOn = false;
chrome.storage.local.get('nightGrayOn').then(({ nightGrayOn: v }) => { nightGrayOn = !!v; });

async function applyNightGray() {
  const on = !!(settings.nightModeEnabled && isNightTime(settings));
  const { nightGrayOn: stored = false } = await chrome.storage.local.get('nightGrayOn');
  nightGrayOn = on;
  if (on === stored) return;
  await chrome.storage.local.set({ nightGrayOn: on });
  let tabs = [];
  try { tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] }); } catch (e) { return; }
  for (const t of tabs) {
    if (on) grayNightTab(t);
    else chrome.scripting.removeCSS({ target: { tabId: t.id }, files: ['utils/gray.css'] }).catch(() => {});
  }
}

function grayNightTab(tab) {
  if (!tab || tab.id == null || !/^https?:\/\//i.test(tab.url || '')) return;
  if (isCustomExcepted(tab.url)) return;  // exceptions keep their color
  chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['utils/gray.css'] }).catch(() => {});
}

// --- Calm stays (a named length of time inside a calmed place) ---------------
// A place set to 'calm' is not rationed by the day and never fades slowly to
// gray. Instead: a breath at the door, then you name how long you mean to stay
// (1–60 minutes, the slider on the breath screen). Miru holds that length —
// the last minute of it in grayscale, so the end is visible before it arrives —
// and when it runs out another breath lands in the page and asks again. The
// site keeps working throughout; what's interrupted is the drift, not the visit.
//
// One stay per tab, keyed by tab id in storage.local so it survives the worker
// sleeping. Alarms (not setTimeout) carry the clock for the same reason.
const STAY_GRAY_CSS = 'html{filter:grayscale(1) !important;transition:filter 2.5s ease !important;}';
const STAY_GRAY_LEAD_MS = 60 * 1000;   // the last minute goes gray

// Which tabs hold a stay, mirrored in memory: onUpdated fires for every
// navigation in every tab, and most of them have nothing to do with a stay.
// Hydrated on each worker wake (below), so a sleep doesn't lose the mirror.
let stayTabs = new Set();

async function getStays() {
  const { calmStays = {} } = await chrome.storage.local.get('calmStays');
  return calmStays;
}
async function setStays(stays) {
  await chrome.storage.local.set({ calmStays: stays }).catch(() => {});
}

function stayAlarm(tabId) { return 'miru-stay-' + tabId; }
function stayGrayAlarm(tabId) { return 'miru-stay-gray-' + tabId; }

async function ungrayStay(tabId) {
  await chrome.scripting.removeCSS({ target: { tabId }, css: STAY_GRAY_CSS }).catch(() => {});
}

// Begin (or renew) a stay on this tab. Renewing lifts the gray of the one
// before it, so the fresh stretch starts in full color.
async function startStay(tabId, domain, minutes) {
  if (!Number.isInteger(tabId) || !domain) return;
  const mins = Math.min(60, Math.max(1, Math.round(Number(minutes)) || 15));
  const endsAt = Date.now() + mins * 60000;
  const stays = await getStays();
  stays[tabId] = { domain, endsAt, minutes: mins };
  stayTabs.add(tabId);
  await setStays(stays);
  await chrome.storage.local.set({ calmLastMinutes: mins }).catch(() => {});
  await ungrayStay(tabId);
  chrome.alarms.create(stayAlarm(tabId), { when: endsAt });
  // A one-minute stay is *all* last minute — an alarm already due fires at once.
  chrome.alarms.create(stayGrayAlarm(tabId), { when: endsAt - STAY_GRAY_LEAD_MS });
}

// Drop a stay: the tab left the place, closed, or the place is no longer calmed.
async function clearStay(tabId, { ungray = true } = {}) {
  chrome.alarms.clear(stayAlarm(tabId));
  chrome.alarms.clear(stayGrayAlarm(tabId));
  stayTabs.delete(tabId);
  const stays = await getStays();
  if (tabId in stays) { delete stays[tabId]; await setStays(stays); }
  if (ungray) await ungrayStay(tabId);
}

// After a reload, restore the gray if this tab's stay is already in its last
// minute — the CSS went with the old document, the clock did not.
async function restayGray(tabId) {
  if (!stayTabs.has(tabId)) return;
  const stays = await getStays();
  const st = stays[tabId];
  if (!st) return;
  if (st.endsAt - Date.now() > STAY_GRAY_LEAD_MS) return;
  chrome.scripting.insertCSS({ target: { tabId }, css: STAY_GRAY_CSS }).catch(() => {});
}

async function grayStayTab(tabId) {
  const stays = await getStays();
  if (!stays[tabId]) return;                       // stay ended early
  chrome.scripting.insertCSS({ target: { tabId }, css: STAY_GRAY_CSS }).catch(() => {});
}

// The stay ran out: color returns with a breath, and the breath ends on the
// slider again — stay longer, or leave. If the page can't host the overlay
// (it was closed, or moved on), the stay simply ends.
async function expireStay(tabId) {
  const stays = await getStays();
  const st = stays[tabId];
  if (!st) return;
  delete stays[tabId];
  stayTabs.delete(tabId);
  await setStays(stays);
  chrome.alarms.clear(stayGrayAlarm(tabId));
  await ungrayStay(tabId);
  let tab;
  try { tab = await chrome.tabs.get(tabId); } catch (e) { return; }   // tab gone
  if (!tab || !/^https?:\/\//i.test(tab.url || '')) return;
  if (getRootDomain(tab.url) !== st.domain) return;                    // moved on already
  lastBreathAt = Date.now();
  await injectBreathInto(tabId, {
    theme: resolveTheme(), pool: 'periodic', duration: settings.breathDuration || 10,
    pattern: settings.breathPattern, domain: st.domain,
    askStay: true, stayDefault: st.minutes || 15
  });
}

// A tab that navigated away from its stay's domain has left the place.
async function stayFollowTab(tabId, url) {
  if (!stayTabs.has(tabId)) return;
  const stays = await getStays();
  const st = stays[tabId];
  if (!st) return;
  if (/^https?:\/\//i.test(url || '') && getRootDomain(url) === st.domain) return;
  await clearStay(tabId);
}

// Reconcile every stay against the tabs that actually exist — after a browser
// restart the ids belong to other pages, and a crashed worker may have left
// one behind. Also drops stays on places no longer set to calm.
async function reconcileStays() {
  const stays = await getStays();
  const ids = Object.keys(stays);
  stayTabs = new Set(ids.map(Number));
  if (!ids.length) return;
  const calm = placeDomains('calm');
  const next = {};
  for (const key of ids) {
    const tabId = Number(key);
    const st = stays[key];
    if (!Number.isInteger(tabId) || !st || st.endsAt <= Date.now() || !calm.includes(st.domain)) {
      await clearStay(tabId);
      continue;
    }
    let tab;
    try { tab = await chrome.tabs.get(tabId); } catch (e) { await clearStay(tabId); continue; }
    if (!tab || !/^https?:\/\//i.test(tab.url || '') || getRootDomain(tab.url) !== st.domain) {
      await clearStay(tabId);
      continue;
    }
    next[key] = st;
    chrome.alarms.create(stayAlarm(tabId), { when: st.endsAt });
    chrome.alarms.create(stayGrayAlarm(tabId), { when: st.endsAt - STAY_GRAY_LEAD_MS });
  }
  stayTabs = new Set(Object.keys(next).map(Number));
  await setStays(next);
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
  await applyNightGray();
  // Stale bookkeeping from the two grayscale systems v2.2 replaced with stays.
  await chrome.storage.local.remove(['grayPrepTabs', 'calmGrayTabs']).catch(() => {});
  await reconcileStays();
  applyPeriodicBreath();
  chrome.alarms.create('miru-schedule', { periodInMinutes: 1 });
  try { chrome.idle.setDetectionInterval(60); } catch (e) {}
}
async function reloadSettings() {
  settings = await getSettings();
  // 45m was an option before v2.2; the rhythm is half-hourly or hourly now.
  const iv = settings.periodicBreathInterval;
  if (iv !== 30 && iv !== 60) settings.periodicBreathInterval = iv > 30 ? 60 : 30;
}

// Periodic breath runs globally on its own rhythm — not tied to focus sessions.
// Recreating the alarm restarts the interval, so only call this when the
// enabled flag or interval actually changes (or on worker init).
function applyPeriodicBreath() {
  chrome.alarms.clear('miru-periodic');
  chrome.alarms.clear('miru-periodic-prep');   // v2.1's pre-breath fade, retired
  if (settings.periodicBreathEnabled) {
    const m = settings.periodicBreathInterval || 30;
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
// And the stay mirror, so a woken worker knows which tabs are inside a place.
getStays().then((st) => { stayTabs = new Set(Object.keys(st).map(Number)); });
// And any breath still waiting to land — a worker woken by an alarm doesn't run
// init(), and without this the schedule tick would see nothing pending.
chrome.storage.local.get('breathDue').then(({ breathDue: bd }) => {
  if (bd && !breathDue) breathDue = bd;
});

chrome.storage.onChanged.addListener(async (c, area) => {
  if (area === 'sync') {
    await reloadSettings();
    await rebuildRules();
    await applyAllowRule();
    await applyNightGray();
    if (c.places) { await registerCalmScripts(); await reconcileStays(); }
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
// the block (10), below the post-breath pass (100). An alarm ends
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
  if (nightGrayOn && info.status === 'complete') grayNightTab(tab);
  // Leaving a calmed place ends its stay; staying inside it keeps the clock.
  if (info.url) stayFollowTab(id, info.url);
  // A reload takes the injected CSS with it — put the gray back if the stay is
  // already inside its last minute, so a refresh isn't a way out of it.
  if (info.status === 'complete') restayGray(id);
  // A finished navigation on the active tab is a natural seam for an armed breath.
  if (breathDue && info.status === 'complete' && tab && tab.active) maybeDeliverBreath();
});
chrome.tabs.onRemoved.addListener((id) => {
  DNR.updateSessionRules({ removeRuleIds: [RID_ALLOWONCE_BASE + id] }).catch(() => {});
  endPeek(id);
  clearStay(id, { ungray: false });   // the tab is gone; nothing left to un-gray
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
    // Arm and deliver at once. A single latched flag means anything that holds
    // the breath back (away, a call, a fullscreen video) just leaves it armed
    // for the next attempt — the rhythm never doubles up.
    await armPeriodicBreath();
  } else if (a.name === 'miru-periodic-prep') {
    chrome.alarms.clear('miru-periodic-prep');   // v2.1 leftover; the fade is gone
  } else if (a.name.startsWith('miru-stay-gray-')) {
    await grayStayTab(Number(a.name.slice('miru-stay-gray-'.length)));
  } else if (a.name.startsWith('miru-stay-')) {
    await expireStay(Number(a.name.slice('miru-stay-'.length)));
  } else if (a.name.startsWith('miru-peek-')) {
    const rest = a.name.slice('miru-peek-'.length);
    if (rest === 'shared') {
      await DNR.updateSessionRules({ removeRuleIds: [RID_PEEK_BASE] }).catch(() => {});
      await chrome.scripting.unregisterContentScripts({ ids: [CALM_ID + '-peek-shared'] }).catch(() => {});
    } else { const tabId = Number(rest); if (!Number.isNaN(tabId)) await endPeek(tabId); }
  } else if (a.name === 'miru-schedule') {
    await recordElapsed();  // flush in-progress time into today's usage
    await applyNightGray(); // re-evaluate the night window
    // A breath that couldn't land when it was due (away, a call, a fullscreen
    // video) tries again every minute until the moment is right.
    if (breathDue) await maybeDeliverBreath();
  }
});

// --- Standalone breath (manual / session end / periodic) --------------------
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
// self-contained — no closure references. It lands in the isolated world, so
// chrome.runtime is available: the stay choice reports straight back.
function injectBreath(opts) {
  try {
    if (!window.MiruOverlay || !document.body) return false;
    if (document.querySelector('.miru-overlay')) return true; // already breathing
    let theme = opts.theme;
    if (theme === 'auto') {
      theme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    var tell = function (msg) { try { chrome.runtime.sendMessage(msg); } catch (e) {} };
    window.MiruOverlay.injectFonts();
    window.MiruOverlay.renderBreath(document.body, {
      theme, pool: opts.pool, duration: opts.duration, pattern: opts.pattern,
      domain: opts.domain || '',
      askContinue: false,
      askStay: !!opts.askStay,
      stayDefault: opts.stayDefault || 15,
      backLabel: 'leave',
      onStay: function (minutes) { tell({ type: 'MIRU_STAY_AGAIN', minutes: minutes }); },
      onBack: function () {
        tell({ type: 'MIRU_STAY_LEAVE' });
        if (history.length > 1) history.back();
      },
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
  const u = chrome.runtime.getURL('screens/breath.html') + '?' + new URLSearchParams(params).toString();
  chrome.windows.create({ url: u, type: 'popup', state: 'fullscreen', focused: true })
    .catch(() => chrome.tabs.create({ url: u }).catch(() => {}));
}

async function showBreath(pool, duration) {
  lastBreathAt = Date.now();
  const opts = { theme: resolveTheme(), pool, duration, pattern: settings.breathPattern };
  const tab = await activeHostTab();
  if (tab && await injectBreathInto(tab.id, opts)) return;
  breathWindow(opts);
}

// --- Periodic breath: the whole browser, on the interval ---------------------
// When the interval elapses the breath comes — on whatever site is open, not
// only the named ones, and without waiting for a tab switch to volunteer one.
// Two things make it stand aside, and nothing else does:
//
//   • something is playing or presenting in fullscreen
//   • a microphone, camera or screen capture is live (a call, a recording)
//
// Being away from the keyboard also holds it, since a breath nobody sees is
// wasted. In any of those cases the breath stays *armed*, not skipped: the
// one-minute schedule alarm re-offers it, as does the next tab switch or
// finished navigation, so it lands the moment the way is clear.
let breathDue = null;   // { pool, duration } when armed, else null
let delivering = false;

async function armPeriodicBreath() {
  breathDue = { pool: 'periodic', duration: settings.breathDuration || 10 };
  await chrome.storage.local.set({ breathDue }).catch(() => {});
  await maybeDeliverBreath();   // due now — try to land it now
}

// Is anything on this tab playing fullscreen? Element fullscreen (a video, a
// slide deck) is the honest signal — a browser window the person simply keeps
// fullscreen all day must not cost them every breath. Frames count too: most
// embedded players go fullscreen from inside an iframe.
async function fullscreenActive(tab) {
  try {
    const res = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: () => !!document.fullscreenElement
    });
    return res.some((r) => r && r.result);
  } catch (e) { return false; }
}

// Is a microphone / camera / screen capture live anywhere? utils/media.js marks
// the page it happens in; a call in a background tab counts just as much as one
// in front, so every http(s) tab is asked.
let captureCache = { at: 0, on: false };
async function captureActive() {
  if (Date.now() - captureCache.at < 15000) return captureCache.on;
  let tabs = [];
  try { tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] }); } catch (e) { return false; }
  const checks = tabs.map((t) => chrome.scripting.executeScript({
    target: { tabId: t.id },
    func: () => document.documentElement.hasAttribute('data-miru-capture')
  }).then((r) => !!(r && r[0] && r[0].result)).catch(() => false));
  let on = false;
  try { on = (await Promise.all(checks)).some(Boolean); } catch (e) { on = false; }
  captureCache = { at: Date.now(), on };
  return on;
}

async function maybeDeliverBreath() {
  if (!breathDue || delivering) return;
  // Take the lock before any await: maybeDeliverBreath fires on every tab
  // switch, completed navigation and schedule tick, so two events could
  // otherwise both pass the guard, both await, and the second would read
  // due.pool after the first already delivered. finally always releases it.
  delivering = true;
  try {
    if (Date.now() - lastBreathAt < 60000) return;   // just breathed — let it settle
    let state = 'active';
    try { state = await chrome.idle.queryState(60); } catch (e) {}
    if (state !== 'active') return;                  // not here — keep waiting
    const tab = await activeHostTab();
    if (tab && await fullscreenActive(tab)) return;  // let it play out
    if (await captureActive()) return;               // a call, a recording — not now
    if (!breathDue) return;                          // delivered elsewhere while we awaited
    const due = breathDue;
    breathDue = null;
    await chrome.storage.local.remove('breathDue').catch(() => {});
    lastBreathAt = Date.now();
    const opts = { theme: resolveTheme(), pool: due.pool, duration: due.duration,
      pattern: settings.breathPattern };
    // A page that can host the overlay gets it; anywhere else (a new tab, the
    // settings, a chrome:// page) the breath opens as its own window, so the
    // rhythm holds no matter where the browser happens to be.
    if (!(tab && await injectBreathInto(tab.id, opts))) breathWindow(opts);
  } finally {
    delivering = false;
  }
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
  await chrome.storage.local.set({ tracker: { domain, since: Date.now() } });
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
      // A calmed place: the same one-time pass, plus the stay the person just
      // named on the slider. Registered before breath.js navigates, so the
      // clock starts at the door rather than a beat later.
      case 'MIRU_CALM_CONTINUE': {
        const id = msg.tabId || (sender.tab && sender.tab.id);
        if (id != null) {
          await allowOnce(id, msg.target);
          await startStay(id, getRootDomain(msg.target || ''), msg.minutes);
        }
        sendResponse({ ok: true });
        break;
      }
      // The stay ran out and the breath landed in the page: stay longer, or go.
      case 'MIRU_STAY_AGAIN': {
        const id = sender.tab && sender.tab.id;
        if (id != null) await startStay(id, getRootDomain(sender.tab.url || ''), msg.minutes);
        sendResponse({ ok: true });
        break;
      }
      case 'MIRU_STAY_LEAVE': {
        const id = sender.tab && sender.tab.id;
        if (id != null) await clearStay(id);
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
