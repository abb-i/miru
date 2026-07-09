# Miru

**Browse with intention. A breath before every new place.**

Miru is a Chrome extension for quieter browsing. Instead of walls and alarms,
it places a brief guided breath in front of your browsing habits — a moment to
notice where you're going before you arrive.

## What it does

You name the places that pull at you, and give each a **posture** — how Miru
meets you at its door. Everything unlisted loads untouched: checkouts, banks,
work.

- **Breathe** — before you land there, an unfurling fern guides one calm
  breath. Then you choose: continue, or go back.
- **Calm** — the breath, and a quieter room behind it. On YouTube and
  Instagram the algorithmic pull rests — home feed, Shorts, Reels, Explore,
  the recommendation column — while search, messages, profiles, and the video
  you came for keep working. On sites without a calm pack, calm simply
  breathes.
- **Block** — a calm page, not a scolding one — and not a dead end: up to
  three times a day you can choose to stay five minutes, landing in the calm
  room where one exists, and the block returns when time is up.

Around the postures:

- **Focus sessions** — begin 25 or 50 minutes from the popup; optionally,
  blocking holds only while a session runs.
- **Periodic breath & time mirror** — a soft reminder to surface after a while,
  and a gentle notice when you've been in one place a long time. Breaths appear
  as a calm overlay on the page you're already on, at a natural pause (a tab
  switch, a finished navigation) — not as another window cutting in.
- **Night mode** — the browser rests when you should.
- **First light** — the first breath of the day asks for one word to carry.

## Privacy — verify it yourself

This repository is public so you don't have to take our word for it:

- **No data leaves your device.** No servers, no analytics, no tracking,
  no cookies, no remote code. Fonts are bundled locally.
- Settings live in `chrome.storage.sync`; per-site time totals stay in
  `chrome.storage.local` on your device and are deleted after 14 days.
- The only network behaviour is Chrome's own `declarativeNetRequest` engine
  redirecting *your* navigations to the extension's *own* local pages.
- The breathing overlay is drawn by the extension's own bundled script
  (`utils/overlay.js`); it reads nothing from the page it appears on and
  removes itself when the breath ends.
- Calm mode hides feed elements with bundled CSS (`utils/calm.js` — selectors
  as data, one file), injected only on the sites *you* set to calm. It reads
  no page content; its only writing is a local flag when a selector stops
  matching, so options can say a pack has gone stale.

Full details: [Privacy policy](PRIVACY.md) · [Impressum / Legal notice](IMPRESSUM.md)

## Install

From the Chrome Web Store (link coming after review), or manually:

1. Download or clone this repository.
2. Open `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and select the project folder.

## Fonts

Bundled fonts are licensed under the SIL Open Font License 1.1:
[DM Sans](assets/fonts/OFL-DMSans.txt) ·
[Cormorant Garamond](assets/fonts/OFL-CormorantGaramond.txt)

## License

© 2026 Abdulkadir Dogan. The source is public for transparency and
verification. All rights reserved — please don't republish this extension or
derivatives of it. Found a bug or have an idea? Open an issue, or use the
feedback card in the extension's settings.
