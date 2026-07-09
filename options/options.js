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

  // Places
  document.getElementById('block-during-only').checked = s.blockDuringSessionsOnly;
  renderPlaces(s.places || []);
  renderPlaceSuggestions(s.places || []);
  renderAllowList(s.customExcludedDomains);

  // Breathing
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
  // Places: add (a new place starts gentle — posture 'breathe')
  document.getElementById('place-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('place-input');
    const val = normalizeDomain(input.value);
    if (val) await addPlace(val);
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

// ---- Places (one list, each with a posture) -----------------------------------
const POSTURES = [
  { key: 'breathe', label: 'breathe' },
  { key: 'calm', label: 'calm' },
  { key: 'block', label: 'block' }
];

async function savePlaces(next) {
  await saveSetting('places', next);
  renderPlaces(next);
  renderPlaceSuggestions(next);
  flashSaved();
}

async function addPlace(domain, posture = 'breathe') {
  const s = await getSettings();
  const places = s.places || [];
  if (places.some(p => p.domain === domain)) return;
  await savePlaces([...places, { domain, posture }]);
}

async function removePlace(domain) {
  const s = await getSettings();
  await savePlaces((s.places || []).filter(p => p.domain !== domain));
}

async function setPosture(domain, posture) {
  const s = await getSettings();
  await savePlaces((s.places || []).map(p => p.domain === domain ? { ...p, posture } : p));
}

// Suggestion pills come from COMMONLY_DISTRACTING (utils/domains.js). A pill
// already on the list shows selected; tapping toggles membership.
function renderPlaceSuggestions(places) {
  const wrap = document.getElementById('place-suggest-pills');
  const listed = new Set(places.map(p => p.domain));
  wrap.innerHTML = '';
  COMMONLY_DISTRACTING.forEach(({ domain, label }) => {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'pill' + (listed.has(domain) ? ' selected' : '');
    pill.textContent = label;
    pill.addEventListener('click', () =>
      listed.has(domain) ? removePlace(domain) : addPlace(domain));
    wrap.appendChild(pill);
  });
}

function renderPlaces(places) {
  const list = document.getElementById('place-list');
  list.innerHTML = '';
  if (!places.length) {
    const note = document.createElement('div');
    note.className = 'empty-note';
    note.textContent = 'No places named yet — everything loads freely.';
    list.appendChild(note);
    return;
  }
  places.forEach(({ domain, posture }) => {
    const li = document.createElement('li');
    li.className = 'place-row';
    const span = document.createElement('span');
    span.className = 'place-domain';
    span.textContent = domain;

    const seg = document.createElement('div');
    seg.className = 'posture-pills';
    POSTURES.forEach(({ key, label }) => {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'pill small' + (posture === key ? ' selected' : '');
      pill.textContent = label;
      pill.addEventListener('click', () => { if (posture !== key) setPosture(domain, key); });
      seg.appendChild(pill);
    });

    const btn = document.createElement('button');
    btn.className = 'remove';
    btn.textContent = '×';
    btn.addEventListener('click', () => removePlace(domain));

    li.append(span, seg, btn);
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
