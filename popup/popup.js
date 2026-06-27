// Miru — Popup
// Three things: begin a 1-minute breath, open settings, see today's time.

const SESSION_SECONDS = 60;

document.addEventListener('DOMContentLoaded', init);

function init() {
  const openOptions = () => chrome.runtime.openOptionsPage();
  document.getElementById('open-options').addEventListener('click', openOptions);
  document.getElementById('open-options-2').addEventListener('click', openOptions);
  document.getElementById('begin-breath').addEventListener('click', beginBreath);
  renderUsage();
}

// Show a guided breath over the current page; fall back to a dedicated tab
// Opens a guided breath in its own tab (a real extension page).
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
