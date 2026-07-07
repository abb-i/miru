// Miru — Onboarding
// A first meeting: a few quiet questions to tune Miru, ending in the first
// guided breath. Answers write straight to chrome.storage.sync; leaving early
// (keep the defaults) is always allowed and loses nothing.

(() => {
  const state = {
    why: null,
    placesAction: 'breathe', // what the chosen places meet: a breath, or a block
    blocked: new Set(),
    breath: 10,          // seconds → rounded to whole cycles by the overlay
    tab: 3,              // 0 = no limit
    periodic: 15,        // minutes, 0 = off
    night: false,
    pattern: 'settle',
    theme: 'dark'
  };

  // How the first answer shapes the suggestions that follow.
  const PRESETS = {
    scroll:   { breath: 10, tab: 5, periodic: 15, night: false },
    deep:     { breath: 25, tab: 3, periodic: 30, night: false },
    evenings: { breath: 10, tab: 5, periodic: 0,  night: true, from: '21:00' },
    all:      { breath: 10, tab: 3, periodic: 15, night: true }
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  // ---- Step navigation --------------------------------------------------
  let current = 0;
  const DOT_STEPS = [1, 2, 3, 4, 5]; // steps with a progress seed

  function goTo(step) {
    current = step;
    $$('.step').forEach((s) => s.classList.toggle('active', Number(s.dataset.step) === step));
    const dots = $('#dots');
    const corner = $('#keep-defaults');
    const di = DOT_STEPS.indexOf(step);
    dots.hidden = di === -1;
    corner.hidden = !(step >= 1 && step <= 4);
    $$('#dots i').forEach((d, i) => {
      d.classList.toggle('here', i === di);
      d.classList.toggle('past', di !== -1 && i < di);
    });
  }

  $$('[data-next]').forEach((b) => b.addEventListener('click', () => goTo(current + 1)));
  $('#keep-defaults').addEventListener('click', () => goTo(5));

  // ---- Welcome: the spiral breathes on its own ---------------------------
  (function idleBreath() {
    const p = $('#hero-path');
    const L = p.getTotalLength();
    p.style.strokeDasharray = String(L);
    p.style.strokeDashoffset = String(L);
    p.getBoundingClientRect();
    let drawn = false;
    (function swing() {
      drawn = !drawn;
      const ms = drawn ? 4000 : 6000;
      p.style.transition = `stroke-dashoffset ${ms / 1000}s cubic-bezier(.37,0,.63,1)`;
      p.style.strokeDashoffset = drawn ? '0' : String(L);
      setTimeout(swing, ms + 400);
    })();
  })();

  // ---- 1 · Why ------------------------------------------------------------
  $$('#why-grid .choice').forEach((c) => c.addEventListener('click', () => {
    $$('#why-grid .choice').forEach((x) => x.classList.remove('selected'));
    c.classList.add('selected');
    state.why = c.dataset.why;
    applyPreset(PRESETS[state.why]);
    setTimeout(() => goTo(2), 350);
  }));

  function applyPreset(p) {
    if (!p) return;
    state.breath = p.breath;
    state.tab = p.tab;
    state.periodic = p.periodic;
    state.night = p.night;
    selectPill('breath-pills', p.breath);
    selectPill('tab-pills', p.tab);
    selectPill('periodic-pills', p.periodic);
    $('#night-toggle').checked = p.night;
    $('#night-times').classList.toggle('on', p.night);
    if (p.from) $('#night-from').value = p.from;
  }

  // ---- 2 · Places ----------------------------------------------------------
  function bindPlacePill(pill) {
    pill.addEventListener('click', () => {
      const d = pill.dataset.domain;
      if (state.blocked.has(d)) { state.blocked.delete(d); pill.classList.remove('selected'); }
      else { state.blocked.add(d); pill.classList.add('selected'); }
    });
  }
  $$('#place-pills .pill').forEach(bindPlacePill);

  $$('#place-action .pill').forEach((p) => p.addEventListener('click', () => {
    $$('#place-action .pill').forEach((x) => x.classList.remove('selected'));
    p.classList.add('selected');
    state.placesAction = p.dataset.action;
  }));

  $('#no-places').addEventListener('click', () => {
    state.blocked.clear();
    $$('#place-pills .pill').forEach((p) => p.classList.remove('selected'));
    goTo(3);
  });

  $('#place-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#place-input');
    const v = (input.value || '').trim().toLowerCase()
      .replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split('?')[0];
    if (!v || !v.includes('.')) return;
    if (!state.blocked.has(v)) {
      state.blocked.add(v);
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'pill selected';
      pill.dataset.domain = v;
      pill.textContent = v;
      bindPlacePill(pill);
      $('#place-pills').appendChild(pill);
    }
    input.value = '';
  });

  // ---- 3 · Rhythm -----------------------------------------------------------
  function selectPill(containerId, value) {
    $$(`#${containerId} .pill`).forEach((p) =>
      p.classList.toggle('selected', String(p.dataset.val) === String(value)));
  }
  function bindPills(containerId, onPick) {
    $$(`#${containerId} .pill`).forEach((p) => p.addEventListener('click', () => {
      $$(`#${containerId} .pill`).forEach((x) => x.classList.remove('selected'));
      p.classList.add('selected');
      onPick(Number(p.dataset.val) || p.dataset.val);
    }));
  }
  selectPill('breath-pills', state.breath);
  selectPill('tab-pills', state.tab);
  selectPill('periodic-pills', state.periodic);
  bindPills('breath-pills', (v) => { state.breath = Number(v); });
  bindPills('tab-pills', (v) => { state.tab = Number(v) || 0; });
  bindPills('periodic-pills', (v) => { state.periodic = Number(v) || 0; });

  // ---- 4 · Evenings -----------------------------------------------------------
  $('#night-toggle').addEventListener('change', (e) => {
    state.night = e.target.checked;
    $('#night-times').classList.toggle('on', state.night);
  });

  // ---- 5 · Breath pattern + light ----------------------------------------------
  (function buildPatterns() {
    const grid = $('#pattern-grid');
    for (const [key, p] of Object.entries(MiruOverlay.PATTERNS)) {
      const c = document.createElement('button');
      c.className = 'choice' + (key === state.pattern ? ' selected' : '');
      c.dataset.pattern = key;
      c.innerHTML = `<span class="choice-title">${p.label}</span>
        <span class="choice-hint">${p.hint}</span>
        <span class="choice-desc">${p.desc}</span>`;
      c.addEventListener('click', () => {
        $$('#pattern-grid .choice').forEach((x) => x.classList.remove('selected'));
        c.classList.add('selected');
        state.pattern = key;
      });
      grid.appendChild(c);
    }
  })();

  selectPill('theme-pills', state.theme);
  bindPills('theme-pills', (v) => {
    state.theme = String(v);
    const resolved = state.theme === 'auto'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : state.theme;
    document.documentElement.setAttribute('data-theme', resolved);
  });

  // ---- Save + first breath -------------------------------------------------------
  async function save() {
    const payload = {
      breathDuration: state.breath,
      breathPattern: state.pattern,
      theme: state.theme,
      nightModeEnabled: state.night,
      nightModeStart: $('#night-from').value || '22:00',
      nightModeEnd: $('#night-until').value || '07:00',
      tabLimitEnabled: state.tab > 0,
      periodicBreathEnabled: state.periodic > 0
    };
    if (state.tab > 0) payload.tabLimit = state.tab;
    if (state.periodic > 0) payload.periodicBreathInterval = state.periodic;
    // The chosen places land on the list the user picked: breath (gentle,
    // default) or block (firm). breathMode stays 'list' — strict "every new
    // site" is an explicit opt-in from settings.
    if (state.blocked.size) {
      if (state.placesAction === 'block') payload.blockedSites = [...state.blocked];
      else payload.breathSites = [...state.blocked];
    }
    try { await chrome.storage.sync.set(payload); } catch (e) {}
  }

  $('#first-breath').addEventListener('click', async () => {
    await save();
    const resolved = state.theme === 'auto'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : state.theme;
    MiruOverlay.renderBreath(document.body, {
      theme: resolved,
      pool: 'navigation',
      pattern: state.pattern,
      duration: 1,          // rounds up to one cycle…
      extraCycles: 1,       // …plus one more: two full breaths to learn the shape
      onDone: () => goTo(6)
    });
  });

  $('#finish').addEventListener('click', () => {
    if (chrome.tabs && chrome.tabs.getCurrent) {
      chrome.tabs.getCurrent((t) => { if (t) chrome.tabs.remove(t.id); else window.close(); });
    } else { window.close(); }
  });
})();
