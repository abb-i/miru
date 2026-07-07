# Miru

**Browse with intention. A breath before every new place.**

Miru is a Chrome extension for quieter browsing. Instead of walls and alarms,
it places a brief guided breath in front of your browsing habits — a moment to
notice where you're going before you arrive.

## What it does

- **Navigation breath** — before you land on a new site, an unfurling fern
  guides one calm breath. Then you choose: continue, or go back.
- **Gentle site blocking** — block the places that pull at you, always or only
  during focus sessions. A calm page, not a scolding one.
- **Tab limit** — a quiet question when tabs multiply: go deep, not wide.
- **Focus sessions** — scheduled or on demand, with your blocked list enforced.
- **Periodic breath & time mirror** — a soft reminder to surface after a while,
  and a gentle notice when you've been in one place a long time.
- **Night mode** — the browser rests when you should.
- **First light** — the first breath of the day asks for one word to carry.
- **One daily break** — 30 minutes where everything opens again. Honest, not
  infinite.

## Privacy — verify it yourself

This repository is public so you don't have to take our word for it:

- **No data leaves your device.** No servers, no analytics, no tracking,
  no cookies, no remote code. Fonts are bundled locally.
- Settings live in `chrome.storage.sync`; per-site time totals stay in
  `chrome.storage.local` on your device and are deleted after 14 days.
- The only network behaviour is Chrome's own `declarativeNetRequest` engine
  redirecting *your* navigations to the extension's *own* local pages.

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
