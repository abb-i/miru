// Miru — Journal
// The words carried at first light, one per day, newest first. Read straight
// from storage.local.journal ({ 'YYYY-MM-DD': word }) — nothing leaves the device.

(async () => {
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  const d = new Date();
  const todayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const { journal = {} } = await chrome.storage.local.get('journal').catch(() => ({}));
  const entries = Object.entries(journal)
    .filter(([, word]) => word && String(word).trim())
    .sort((a, b) => b[0].localeCompare(a[0]));

  if (!entries.length) {
    document.getElementById('empty').hidden = false;
    return;
  }

  const list = document.getElementById('entries');
  let lastYear = String(d.getFullYear()); // the current year needs no divider
  for (const [key, word] of entries) {
    const [y, m, day] = key.split('-');
    if (y !== lastYear) {
      lastYear = y;
      const divider = document.createElement('li');
      divider.className = 'year';
      divider.textContent = y;
      list.appendChild(divider);
    }
    const li = document.createElement('li');
    li.className = 'entry' + (key === todayKey ? ' today' : '');
    const date = document.createElement('span');
    date.className = 'entry-date';
    date.textContent = key === todayKey ? 'today' : `${Number(day)} ${MONTHS[Number(m) - 1] || ''}`;
    const w = document.createElement('span');
    w.className = 'entry-word';
    w.textContent = String(word).trim();
    li.append(date, w);
    list.appendChild(li);
  }
})();
