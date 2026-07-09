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

  // Breathing
  document.getElementById('nav-breath').checked = s.navBreathEnabled;
  selectPill('breath-mode-pills', 'mode', s.breathMode || 'list');
  applyBreathMode(s.breathMode || 'list');
  renderBreathList(s.breathSites || []);
  renderBreathSuggestions(s.breathSites || []);
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

  // Breathing
  document.getElementById('nav-breath').addEventListener('change', async (e) => {
    await saveSetting('navBreathEnabled', e.target.checked); flashSaved();
  });
  bindPills('breath-mode-pills', 'mode', async (val) => {
    await saveSetting('breathMode', val); applyBreathMode(val); flashSaved();
  });
  document.getElementById('breath-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('breath-input');
    const val = normalizeDomain(input.value);
    if (!val) return;
    await addBreathSite(val);
    input.value = '';
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

// ---- Breath sites (where the navigation breath lives) ------------------------
function applyBreathMode(mode) {
  document.getElementById('breath-sites-ui').hidden = mode === 'all';
  document.getElementById('breath-mode-desc').textContent = mode === 'all'
    ? 'Strict: every new domain begins with a breath. Checkouts and banks included — choose knowingly.'
    : 'The breath greets only the places you name here. Everything else loads freely.';
}

async function addBreathSite(domain) {
  const s = await getSettings();
  const list = s.breathSites || [];
  if (!list.includes(domain)) {
    list.push(domain);
    await saveSetting('breathSites', list);
    renderBreathList(list);
    renderBreathSuggestions(list);
    flashSaved();
  }
}

async function removeBreathSite(domain) {
  const s = await getSettings();
  const next = (s.breathSites || []).filter(d => d !== domain);
  await saveSetting('breathSites', next);
  renderBreathList(next);
  renderBreathSuggestions(next);
  flashSaved();
}

// Suggestion pills come from COMMONLY_DISTRACTING (utils/domains.js). A pill
// already on the list shows selected; tapping toggles membership.
function renderBreathSuggestions(current) {
  const wrap = document.getElementById('breath-suggest-pills');
  wrap.innerHTML = '';
  COMMONLY_DISTRACTING.forEach(({ domain, label }) => {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'pill' + (current.includes(domain) ? ' selected' : '');
    pill.textContent = label;
    pill.addEventListener('click', () =>
      current.includes(domain) ? removeBreathSite(domain) : addBreathSite(domain));
    wrap.appendChild(pill);
  });
}

function renderBreathList(sites) {
  const list = document.getElementById('breath-list');
  list.innerHTML = '';
  if (!sites.length) {
    const note = document.createElement('div');
    note.className = 'empty-note';
    note.textContent = 'No places named yet — the breath is resting.';
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
    btn.addEventListener('click', () => removeBreathSite(site));
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
