// Miru — Options / settings
// Every control reads from and writes to chrome.storage.sync.

document.addEventListener('DOMContentLoaded', init);

async function init() {
  setupNav();
  await loadAll();
  bindControls();
  applyTheme();
  document.getElementById('about-version').textContent =
    chrome.runtime.getManifest().version;
}

// ---- Sidebar navigation -----------------------------------------------------
function setupNav() {
  const items = document.querySelectorAll('.nav-item');
  items.forEach(item => item.addEventListener('click', () => {
    items.forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById(item.dataset.target).classList.add('active');
  }));
}

// ---- Saved indicator --------------------------------------------------------
let savedTimer = null;
function flashSaved() {
  const note = document.getElementById('saved-note');
  note.classList.add('show');
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => note.classList.remove('show'), 1600);
}

// ---- Load existing settings into the UI ------------------------------------
async function loadAll() {
  const s = await getSettings();

  // Blocked sites
  document.getElementById('block-during-only').checked = s.blockDuringSessionsOnly;
  renderBlockList(s.blockedSites);
  renderAllowList(s.customExcludedDomains);

  // Tab limit
  document.getElementById('tab-enabled').checked = s.tabLimitEnabled;
  document.getElementById('tab-limit').value = s.tabLimit;

  // Breathing
  document.getElementById('nav-breath').checked = s.navBreathEnabled;
  selectPill('breath-len-pills', 'len', s.breathDuration <= 15 ? 10 : 25);
  selectPill('pattern-pills', 'pattern', s.breathPattern);
  document.getElementById('periodic-breath').checked = s.periodicBreathEnabled;
  selectPill('interval-pills', 'int', s.periodicBreathInterval);

  // Time mirror + first light
  document.getElementById('mirror-enabled').checked = s.timeMirrorEnabled;
  selectPill('mirror-pills', 'min', s.timeMirrorMinutes);
  document.getElementById('firstlight-enabled').checked = s.firstLightEnabled;

  // Night mode
  document.getElementById('night-enabled').checked = s.nightModeEnabled;
  document.getElementById('night-start').value = s.nightModeStart;
  document.getElementById('night-end').value = s.nightModeEnd;

  // Appearance
  selectPill('theme-pills', 'theme', s.theme);

  // Sessions
  renderSessions(s.focusSessions);

  // Break
  await renderBreak();
}

function selectPill(containerId, attr, value) {
  document.querySelectorAll(`#${containerId} .pill`).forEach(p => {
    p.classList.toggle('selected', String(p.dataset[attr]) === String(value));
  });
}

// ---- Bind controls ----------------------------------------------------------
function bindControls() {
  // Blocked: add
  document.getElementById('block-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('block-input');
    const val = normalizeDomain(input.value);
    if (!val) return;
    const s = await getSettings();
    if (!s.blockedSites.includes(val)) {
      s.blockedSites.push(val);
      await saveSetting('blockedSites', s.blockedSites);
      renderBlockList(s.blockedSites);
      flashSaved();
    }
    input.value = '';
  });

  // Allowed exceptions: add
  document.getElementById('allow-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('allow-input');
    const val = normalizeDomain(input.value);
    if (!val) return;
    const s = await getSettings();
    const list = s.customExcludedDomains || [];
    if (!list.includes(val)) {
      list.push(val);
      await saveSetting('customExcludedDomains', list);
      renderAllowList(list);
      flashSaved();
    }
    input.value = '';
  });

  document.getElementById('block-during-only').addEventListener('change', async (e) => {
    await saveSetting('blockDuringSessionsOnly', e.target.checked);
    flashSaved();
  });

  // Tab limit
  document.getElementById('tab-enabled').addEventListener('change', async (e) => {
    await saveSetting('tabLimitEnabled', e.target.checked); flashSaved();
  });
  document.getElementById('tab-limit').addEventListener('change', async (e) => {
    let v = clampInt(e.target.value, 1, 20, 3);
    e.target.value = v;
    await saveSetting('tabLimit', v); flashSaved();
  });

  // Breathing
  document.getElementById('nav-breath').addEventListener('change', async (e) => {
    await saveSetting('navBreathEnabled', e.target.checked); flashSaved();
  });
  bindPills('breath-len-pills', 'len', async (val) => {
    await saveSetting('breathDuration', Number(val)); flashSaved();
  });
  bindPills('pattern-pills', 'pattern', async (val) => {
    await saveSetting('breathPattern', val); flashSaved();
  });
  document.getElementById('periodic-breath').addEventListener('change', async (e) => {
    await saveSetting('periodicBreathEnabled', e.target.checked); flashSaved();
  });
  bindPills('interval-pills', 'int', async (val) => {
    await saveSetting('periodicBreathInterval', Number(val)); flashSaved();
  });

  // Time mirror + first light
  document.getElementById('mirror-enabled').addEventListener('change', async (e) => {
    await saveSetting('timeMirrorEnabled', e.target.checked); flashSaved();
  });
  bindPills('mirror-pills', 'min', async (val) => {
    await saveSetting('timeMirrorMinutes', Number(val)); flashSaved();
  });
  document.getElementById('firstlight-enabled').addEventListener('change', async (e) => {
    await saveSetting('firstLightEnabled', e.target.checked); flashSaved();
  });

  // Night mode
  document.getElementById('night-enabled').addEventListener('change', async (e) => {
    await saveSetting('nightModeEnabled', e.target.checked); flashSaved();
  });
  document.getElementById('night-start').addEventListener('change', async (e) => {
    await saveSetting('nightModeStart', e.target.value); flashSaved();
  });
  document.getElementById('night-end').addEventListener('change', async (e) => {
    await saveSetting('nightModeEnd', e.target.value); flashSaved();
  });

  // Appearance
  bindPills('theme-pills', 'theme', async (val) => {
    await saveSetting('theme', val); applyTheme(val); flashSaved();
  });

  // Sessions: day selection + add
  document.querySelectorAll('#fs-days .day').forEach(d =>
    d.addEventListener('click', () => d.classList.toggle('selected')));
  document.getElementById('fs-add').addEventListener('click', addSession);

  // Break: start, or end early
  document.getElementById('break-btn').addEventListener('click', async () => {
    const b = await getBreakState();
    if (b && b.until > Date.now()) {
      await chrome.runtime.sendMessage({ type: 'MIRU_END_BREAK', silent: true });
    } else {
      await chrome.runtime.sendMessage({ type: 'MIRU_START_BREAK' });
    }
    await renderBreak();
    flashSaved();
  });
  // Keep the card current when the break ends on its own.
  chrome.storage.onChanged.addListener((c, area) => {
    if (area === 'local' && c.breakState) renderBreak();
  });

  // About: walk the welcome again
  document.getElementById('revisit-welcome').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/onboarding.html') });
  });

  // Feedback: opens the user's own mail app with the message prefilled —
  // Miru itself sends nothing over the network.
  const FEEDBACK_EMAIL = 'akadirdogan2727@gmail.com';
  document.getElementById('feedback-send').addEventListener('click', () => {
    const text = document.getElementById('feedback-text').value.trim();
    const version = chrome.runtime.getManifest().version;
    location.href = 'mailto:' + FEEDBACK_EMAIL +
      '?subject=' + encodeURIComponent(`Miru feedback (v${version})`) +
      '&body=' + encodeURIComponent(text);
  });
  document.getElementById('feedback-copy').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    try { await navigator.clipboard.writeText(FEEDBACK_EMAIL); } catch (err) { return; }
    btn.textContent = 'copied — ' + FEEDBACK_EMAIL;
    setTimeout(() => { btn.textContent = 'or copy my address'; }, 2600);
  });

  // Legal: language toggle (defaults to the browser's language) + About shortcut
  const legalLang = (navigator.language || '').toLowerCase().startsWith('de') ? 'de' : 'en';
  selectPill('legal-lang-pills', 'lang', legalLang);
  setLegalLang(legalLang);
  bindPills('legal-lang-pills', 'lang', setLegalLang);
  document.getElementById('open-legal').addEventListener('click', () => {
    document.querySelector('.nav-item[data-target="sec-legal"]').click();
    window.scrollTo(0, 0);
  });
}

function setLegalLang(lang) {
  document.querySelectorAll('.legal-lang').forEach((el) => { el.hidden = el.dataset.lang !== lang; });
}

function bindPills(containerId, attr, onPick) {
  document.querySelectorAll(`#${containerId} .pill`).forEach(p => {
    p.addEventListener('click', () => {
      document.querySelectorAll(`#${containerId} .pill`).forEach(x => x.classList.remove('selected'));
      p.classList.add('selected');
      onPick(p.dataset[attr]);
    });
  });
}

// ---- Blocked list rendering -------------------------------------------------
function renderBlockList(sites) {
  const list = document.getElementById('block-list');
  list.innerHTML = '';
  if (!sites.length) {
    const note = document.createElement('div');
    note.className = 'empty-note';
    note.textContent = 'Nothing planted yet.';
    list.appendChild(note);
    return;
  }
  sites.forEach(site => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = site;
    const btn = document.createElement('button');
    btn.className = 'remove';
    btn.textContent = '×';
    btn.addEventListener('click', async () => {
      const s = await getSettings();
      const next = s.blockedSites.filter(d => d !== site);
      await saveSetting('blockedSites', next);
      renderBlockList(next);
      flashSaved();
    });
    li.append(span, btn);
    list.appendChild(li);
  });
}

// ---- Allowed exceptions rendering -------------------------------------------
function renderAllowList(domains) {
  const list = document.getElementById('allow-list');
  list.innerHTML = '';
  domains = domains || [];
  if (!domains.length) {
    const note = document.createElement('div');
    note.className = 'empty-note';
    note.textContent = 'No exceptions kept.';
    list.appendChild(note);
    return;
  }
  domains.forEach(domain => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = domain;
    const btn = document.createElement('button');
    btn.className = 'remove';
    btn.textContent = '×';
    btn.addEventListener('click', async () => {
      const s = await getSettings();
      const next = (s.customExcludedDomains || []).filter(d => d !== domain);
      await saveSetting('customExcludedDomains', next);
      renderAllowList(next);
      flashSaved();
    });
    li.append(span, btn);
    list.appendChild(li);
  });
}

// ---- Break --------------------------------------------------------------------
let breakTimer = null;

async function renderBreak() {
  clearInterval(breakTimer);
  const btn = document.getElementById('break-btn');
  const status = document.getElementById('break-status');
  const b = await getBreakState();
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  if (b && b.until > Date.now()) {
    btn.disabled = false;
    btn.textContent = 'End the break early';
    const tick = () => {
      const left = b.until - Date.now();
      if (left <= 0) { renderBreak(); return; }
      const m = Math.floor(left / 60000);
      const s = Math.floor((left % 60000) / 1000);
      status.textContent = `On a break — ${m}:${String(s).padStart(2, '0')} left. Blocked sites are open; breaths are resting.`;
    };
    tick();
    breakTimer = setInterval(tick, 1000);
  } else if (b && b.usedOn === today) {
    btn.disabled = true;
    btn.textContent = 'Take a break · 30 minutes';
    status.textContent = 'Today’s break is spent. It returns tomorrow.';
  } else {
    btn.disabled = false;
    btn.textContent = 'Take a break · 30 minutes';
    status.textContent = '';
  }
}

// ---- Focus sessions ---------------------------------------------------------
async function addSession() {
  const name = document.getElementById('fs-name').value.trim();
  const duration = clampInt(document.getElementById('fs-duration').value, 1, 600, 45);
  const startTime = document.getElementById('fs-start').value || '09:00';
  const days = [...document.querySelectorAll('#fs-days .day.selected')]
    .map(d => Number(d.dataset.day));

  const s = await getSettings();
  const session = {
    id: 'fs_' + Date.now(),
    name: name || 'Focus',
    duration,
    startTime,
    days,
    enabled: true
  };
  s.focusSessions.push(session);
  await saveSetting('focusSessions', s.focusSessions);
  renderSessions(s.focusSessions);
  flashSaved();

  // Reset form
  document.getElementById('fs-name').value = '';
  document.querySelectorAll('#fs-days .day').forEach(d => d.classList.remove('selected'));
}

const DAY_LABELS = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };

function renderSessions(sessions) {
  const list = document.getElementById('session-list');
  list.innerHTML = '';
  if (!sessions.length) {
    const note = document.createElement('div');
    note.className = 'empty-note';
    note.textContent = 'No seasons planted yet.';
    list.appendChild(note);
    return;
  }
  sessions.forEach(sess => {
    const li = document.createElement('li');

    const info = document.createElement('div');
    info.className = 'session-info';
    const title = document.createElement('span');
    title.textContent = sess.name;
    const meta = document.createElement('span');
    meta.className = 'session-meta';
    const dayStr = (sess.days && sess.days.length)
      ? sess.days.map(d => DAY_LABELS[d]).join(' · ')
      : 'every day';
    meta.textContent = `${sess.duration}m · ${sess.startTime} · ${dayStr}`;
    info.append(title, meta);

    const actions = document.createElement('div');
    actions.className = 'session-actions';

    const sw = document.createElement('label');
    sw.className = 'switch';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = sess.enabled;
    cb.addEventListener('change', async () => {
      const s = await getSettings();
      const target = s.focusSessions.find(x => x.id === sess.id);
      if (target) target.enabled = cb.checked;
      await saveSetting('focusSessions', s.focusSessions);
      flashSaved();
    });
    const slider = document.createElement('span');
    slider.className = 'slider';
    sw.append(cb, slider);

    const del = document.createElement('button');
    del.className = 'remove';
    del.textContent = '×';
    del.addEventListener('click', async () => {
      const s = await getSettings();
      const next = s.focusSessions.filter(x => x.id !== sess.id);
      await saveSetting('focusSessions', next);
      renderSessions(next);
      flashSaved();
    });

    actions.append(sw, del);
    li.append(info, actions);
    list.appendChild(li);
  });
}

// ---- Theme ------------------------------------------------------------------
function applyTheme(theme) {
  const setting = theme
    || document.querySelector('#theme-pills .pill.selected')?.dataset.theme
    || 'dark';
  let resolved = setting;
  if (setting === 'auto') {
    resolved = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
      ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', resolved);
}

// ---- Helpers ----------------------------------------------------------------
function normalizeDomain(raw) {
  let v = (raw || '').trim().toLowerCase();
  if (!v) return '';
  v = v.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split('?')[0];
  return v;
}

function clampInt(value, min, max, fallback) {
  let n = parseInt(value, 10);
  if (isNaN(n)) n = fallback;
  return Math.min(max, Math.max(min, n));
}
