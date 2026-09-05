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
  setStayMaxUI(readStayMax(s.calmStayMax) || 60);

  // Breathing
  selectPill('breath-len-pills', 'len', s.breathDuration <= 15 ? 10 : 25);
  selectPill('pattern-pills', 'pattern', s.breathPattern);
  document.getElementById('periodic-breath').checked = s.periodicBreathEnabled;
  // 45m was offered before v2.2 — anything above half an hour lands on the hour.
  selectPill('interval-pills', 'int', s.periodicBreathInterval > 30 ? 60 : 30);

  // Night mode
  document.getElementById('night-enabled').checked = s.nightModeEnabled;
  document.getElementById('night-start').value = s.nightModeStart;
  document.getElementById('night-end').value = s.nightModeEnd;

  // Appearance
  selectPill('theme-pills', 'theme', s.theme);

  await renderLookback();

  // Calm health: surface selector breakage reported by utils/calm.js.
  await renderCalmHealth();
  chrome.storage.onChanged.addListener((c, area) => {
    if (area === 'local' && c.calmHealth) renderCalmHealth();
  });
}

// The longest stay is a plain text field — a number input grows spinner arrows
// that sit badly against the rest of the page — so the digits are checked here
// instead. Whole minutes only, one minute to eight hours; anything else is not
// a length, and the field simply returns to the value already saved.
let stayMaxSaved = 60;

function readStayMax(raw) {
  const v = String(raw == null ? '' : raw).trim();
  if (!/^\d{1,3}$/.test(v)) return null;
  const n = Number(v);
  return (n >= 1 && n <= 480) ? n : null;
}

function setStayMaxUI(minutes) {
  stayMaxSaved = minutes;
  document.getElementById('calm-stay-max').value = String(minutes);
}

// ---- Looking back -----------------------------------------------------------
// Seven days, assembled by the worker so the arithmetic lives in one place.
// Two panels, in this order on purpose: what you named against what it took
// (which only Miru can show, because only Miru asked), and then the ordinary
// totals. Neither is framed as a target met or missed.
const LOOKBACK_WINDOW = 7;

function lastDays(todayKey, n) {
  const out = [];
  const d = new Date(todayKey + 'T12:00:00');
  for (let i = 0; i < n; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    d.setDate(d.getDate() - 1);
  }
  return out;
}

function fmtMins(mins) {
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  return `${mins}m`;
}

function emptyNote(text) {
  const note = document.createElement('div');
  note.className = 'empty-note';
  note.textContent = text;
  return note;
}

async function renderLookback() {
  const res = await chrome.runtime.sendMessage({ type: 'MIRU_GET_LOOKBACK' }).catch(() => null);
  const named = document.getElementById('lookback-named');
  const time = document.getElementById('lookback-time');
  named.innerHTML = '';
  time.innerHTML = '';
  if (!res) {
    named.appendChild(emptyNote('Nothing to show yet.'));
    time.appendChild(emptyNote('Nothing to show yet.'));
    return;
  }

  const days = lastDays(res.today, LOOKBACK_WINDOW);
  const spent = {};       // domain -> minutes
  const asked = {};       // domain -> { named, visits }
  days.forEach((key) => {
    Object.entries((res.usage || {})[key] || {}).forEach(([dom, secs]) => {
      spent[dom] = (spent[dom] || 0) + Math.round(secs / 60);
    });
    Object.entries((res.stayLog || {})[key] || {}).forEach(([dom, e]) => {
      const a = asked[dom] || (asked[dom] = { named: 0, visits: 0 });
      a.named += e.named || 0;
      a.visits += e.visits || 0;
    });
  });

  // Panel one: the places you named a length for.
  const namedRows = Object.entries(asked)
    .filter(([, a]) => a.named > 0)
    .sort((a, b) => b[1].named - a[1].named);
  if (!namedRows.length) {
    named.appendChild(emptyNote(
      'No lengths named yet. Set a place to calm, and the dial at its door starts the record.'));
  } else {
    namedRows.forEach(([dom, a]) => {
      const took = spent[dom] || 0;
      named.appendChild(lookbackRow(dom,
        `<b>${fmtMins(a.named)}</b> named · <b>${fmtMins(took)}</b> spent · ${a.visits} ${a.visits === 1 ? 'visit' : 'visits'}`,
        a.named, took));
    });
  }

  // Panel two: the plain totals.
  const timeRows = Object.entries(spent).filter(([, m]) => m > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!timeRows.length) {
    time.appendChild(emptyNote('No time tended in the last seven days.'));
  } else {
    const max = timeRows[0][1] || 1;
    timeRows.forEach(([dom, mins]) => {
      time.appendChild(lookbackRow(dom, `<b>${fmtMins(mins)}</b>`, 0, mins, max));
    });
  }
}

// One row: the place, its figures, and a bar. When a length was named, the
// bar's track is that length and a faint mark sits where it ends — so running
// past it is visible without being coloured as a failure.
function lookbackRow(domain, figuresHTML, namedMins, spentMins, scaleTo) {
  const li = document.createElement('li');

  const row = document.createElement('div');
  row.className = 'lookback-row';
  const site = document.createElement('span');
  site.className = 'lookback-site';
  site.textContent = domain;
  const figures = document.createElement('span');
  figures.className = 'lookback-figures';
  figures.innerHTML = figuresHTML;      // built here from integers only
  row.append(site, figures);

  const scale = scaleTo || Math.max(namedMins, spentMins) || 1;
  const track = document.createElement('div');
  track.className = 'lookback-track';
  const fill = document.createElement('div');
  fill.className = 'lookback-fill' + (namedMins && spentMins > namedMins ? ' over' : '');
  fill.style.width = Math.max(2, Math.min(100, Math.round((spentMins / scale) * 100))) + '%';
  track.appendChild(fill);
  if (namedMins > 0 && namedMins < scale) {
    const mark = document.createElement('div');
    mark.className = 'lookback-named-mark';
    mark.style.left = Math.round((namedMins / scale) * 100) + '%';
    track.appendChild(mark);
  }

  li.append(row, track);
  return li;
}

// A calm pack whose critical selectors stopped matching means the site moved
// under us — say so quietly instead of letting the feed return in silence.
async function renderCalmHealth() {
  const el = document.getElementById('calm-health');
  const { calmHealth = {} } = await chrome.storage.local.get('calmHealth');
  const domains = Object.keys(calmHealth);
  el.hidden = !domains.length;
  el.textContent = domains.length
    ? 'Calm mode may be out of date on ' + domains.join(' and ') +
      ' — the feed may show there until Miru updates.'
    : '';
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

  // Longest stay: digits only while typing, and committed on change/blur rather
  // than per keystroke, so a half-typed "12" on the way to "120" never becomes
  // the ceiling. A field left empty or out of range reverts to what was saved.
  const stayMaxInput = document.getElementById('calm-stay-max');
  stayMaxInput.addEventListener('input', (e) => {
    const digits = e.target.value.replace(/\D/g, '');
    if (digits !== e.target.value) e.target.value = digits;
  });
  stayMaxInput.addEventListener('change', async (e) => {
    const mins = readStayMax(e.target.value);
    if (mins === null) { e.target.value = String(stayMaxSaved); return; }
    setStayMaxUI(mins);
    await saveSetting('calmStayMax', mins);
    flashSaved();
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

  // Looking back: the doors out of it, into the settings that change things.
  document.querySelectorAll('[data-goto]').forEach((b) =>
    b.addEventListener('click', () => {
      document.querySelector(`.nav-item[data-target="${b.dataset.goto}"]`).click();
      window.scrollTo(0, 0);
    }));

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
  const FEEDBACK_EMAIL = 'me@abdulkadirdogan.com';
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
// already on the list shows selected; tapping toggles membership. The chosen
// ones gather at the front, so the green never sits scattered between grays —
// sort is stable, so each group keeps its own order.
function renderPlaceSuggestions(places) {
  const wrap = document.getElementById('place-suggest-pills');
  const listed = new Set(places.map(p => p.domain));
  wrap.innerHTML = '';
  const ordered = [...COMMONLY_DISTRACTING].sort(
    (a, b) => (listed.has(b.domain) ? 1 : 0) - (listed.has(a.domain) ? 1 : 0));
  ordered.forEach(({ domain, label }) => {
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
