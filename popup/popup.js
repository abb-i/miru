// Miru — Popup
// Four things: begin a 1-minute breath, begin or end a focus session,
// open settings, see today's time.

const SESSION_SECONDS = 60;

document.addEventListener('DOMContentLoaded', init);

function init() {
  const openOptions = () => chrome.runtime.openOptionsPage();
  const openJournal = () =>
    chrome.tabs.create({ url: chrome.runtime.getURL('screens/journal.html') }).catch(() => {});
  document.getElementById('open-options').addEventListener('click', openOptions);
  document.getElementById('open-options-2').addEventListener('click', openOptions);
  document.getElementById('open-journal').addEventListener('click', openJournal);
  document.getElementById('intention').addEventListener('click', openJournal);
  document.getElementById('begin-breath').addEventListener('click', beginBreath);
  bindFocus();
  renderIntention();
  renderFocus();
  renderUsage();
}

// --- Focus session: begin on demand, watch it count down, end early ---------
let focusTimer = null;

function bindFocus() {
  document.querySelectorAll('#focus-pills .focus-pill').forEach((p) =>
    p.addEventListener('click', async () => {
      await chrome.runtime.sendMessage({ type: 'MIRU_START_SESSION', duration: Number(p.dataset.min) })
        .catch(() => {});
      renderFocus(); // seeing the countdown appear is the confirmation
    }));
  document.getElementById('focus-end').addEventListener('click', async () => {
    // Not silent: the session closes with its focusEnd breath, as it should.
    await chrome.runtime.sendMessage({ type: 'MIRU_END_SESSION' }).catch(() => {});
    renderFocus();
    window.close(); // make room for the closing breath
  });
}

async function renderFocus() {
  clearInterval(focusTimer);
  const res = await chrome.runtime.sendMessage({ type: 'MIRU_GET_STATE' }).catch(() => null);
  const session = res && res.session;
  const active = session && session.endTime > Date.now();
  document.getElementById('focus-idle').hidden = !!active;
  document.getElementById('focus-active').hidden = !active;
  if (!active) return;
  const left = document.getElementById('focus-left');
  const tick = () => {
    const ms = session.endTime - Date.now();
    if (ms <= 0) { renderFocus(); return; }
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    left.textContent = `${m}:${String(s).padStart(2, '0')}`;
  };
  tick();
  focusTimer = setInterval(tick, 1000);
}

// The word set at first light, carried quietly through the day.
async function renderIntention() {
  const { firstLight } = await chrome.storage.local.get('firstLight').catch(() => ({}));
  if (!firstLight || !firstLight.intention) return;
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (firstLight.date !== today) return;
  document.getElementById('intention-word').textContent = firstLight.intention;
  document.getElementById('intention').hidden = false;
}

// Begins a guided breath as an overlay on the page you're viewing (a
// fullscreen window of its own where the page can't host one); it removes
// itself when the breath completes.
async function beginBreath() {
  await chrome.runtime.sendMessage({ type: 'MIRU_BEGIN_BREATH', duration: SESSION_SECONDS })
    .catch(() => {});
  window.close();
}

async function renderUsage() {
  const res = await chrome.runtime.sendMessage({ type: 'MIRU_GET_USAGE' }).catch(() => null);
  const today = (res && res.today) || {};
  const entries = Object.entries(today).sort((a, b) => b[1] - a[1]);
  const totalSecs = entries.reduce((sum, [, s]) => sum + s, 0);

  document.getElementById('usage-total').textContent = totalSecs > 0 ? fmt(totalSecs) : '—';

  const list = document.getElementById('usage-list');
  list.innerHTML = '';
  if (entries.length === 0) {
    const note = document.createElement('div');
    note.className = 'empty-note';
    note.textContent = 'No time tended yet today.';
    list.appendChild(note);
    return;
  }

  const max = entries[0][1] || 1;
  entries.slice(0, 5).forEach(([site, secs]) => {
    const li = document.createElement('li');

    const row = document.createElement('div');
    row.className = 'usage-row';
    const name = document.createElement('span');
    name.className = 'site';
    name.textContent = site;
    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = fmt(secs);
    row.append(name, time);

    const bar = document.createElement('div');
    bar.className = 'usage-bar';
    const fill = document.createElement('div');
    fill.className = 'usage-bar-fill';
    fill.style.width = Math.max(4, Math.round((secs / max) * 100)) + '%';
    bar.appendChild(fill);

    li.append(row, bar);
    list.appendChild(li);
  });
}

function fmt(totalSecs) {
  const h = Math.floor(totalSecs / 3600);
  const m = Math.round((totalSecs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${totalSecs}s`;
}
