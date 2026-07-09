# Chrome Web Store — submission notes for Miru v1.2.0

Everything the dashboard will ask for, ready to paste.

## Single purpose description

Miru is a mindful-browsing companion: it places a brief guided breath before
sites the user marks as distracting, lets users block chosen sites, limits
open tabs, and offers focus sessions and a nightly quiet period. All features
serve the single purpose of intentional, calmer browsing.

## Permission justifications

**declarativeNetRequest** — Core mechanism. Redirects navigations to the
extension's own breathing pause, block page, or night page, according to the
user's settings. No request data is read or modified beyond these redirects.

**host_permissions (`<all_urls>`)** — Users may block or add a breathing pause
to any site they choose (plus an optional strict mode that breathes before
every new domain); the redirect rules therefore need to match any host, and
the breathing overlay (see `scripting`) must be able to appear on whatever
page the user is viewing. No page content is read.

**scripting** — Renders the extension's own breathing exercise as a temporary
overlay on the user's current tab (instead of opening a separate window) for
the manual breath, the optional periodic reminder, session/break endings, and
the time mirror. Only bundled extension files are injected
(`utils/words.js`, `utils/overlay.js`); no page content is read, evaluated,
or transmitted, and nothing persists after the overlay dismisses itself.

**tabs** — Used to (1) count open tabs for the user's tab limit, (2) know which
site is active so the popup can show today's per-site time, (3) redirect a tab
to the block page when the user blocks a site that is already open, and (4)
exempt already-open sites from the breathing pause.

**storage** — Saves the user's settings (sync) and local state (today's usage
totals, the running focus session or break, the daily counter for brief
"stay five minutes" unblocks). Nothing is transmitted.

**alarms** — Ends focus sessions and breaks on time, starts scheduled sessions,
runs the optional periodic breathing reminder, ends the five-minute unblock of
a blocked site, and re-evaluates the night-mode window once per minute.

**idle** — Suppresses breathing reminders while the user is away from the
computer, so prompts don't pile up.

## Data-use disclosures (Privacy tab)

- Collects: **Web history — No** (per-site time totals stay on-device, never
  transmitted; still disclose "User activity" if you prefer maximum caution:
  the honest answer is that nothing is collected *by the developer*).
- Data is **not** sold, **not** used for unrelated purposes, **not** transferred.
- Remote code: **No** (all scripts, styles, and fonts are bundled).
- Privacy policy URL: `https://github.com/abb-i/miru/blob/main/PRIVACY.md`
  (bilingual DE/EN, German authoritative).

## German legal requirements (Impressumspflicht)

- The full Impressum + Datenschutzerklärung are built into the extension
  (Settings → Legal, DE/EN toggle) and exist as `IMPRESSUM.md` / `PRIVACY.md`.
- The Impressum must also be reachable from where the service is *offered*:
  add a line at the end of the Chrome Web Store description:
  `Impressum / Legal notice: https://github.com/abb-i/miru/blob/main/IMPRESSUM.md`
  — the listing itself is a Telemedium and Abmahn-lawyers do check store pages.
- The in-extension Legal section satisfies "leicht erkennbar und unmittelbar
  erreichbar" (§ 5 DDG) for the extension itself.

## Listing copy (short description, 132-char limit)

Browse with intention. A breath before the sites that pull at you, gentle
blocking, tab limits, focus sessions, quiet nights.

## Reviewer notes (optional but speeds review)

The extension uses declarativeNetRequest redirect rules to show its own
breathing/block pages before user-chosen sites. It makes no external network
requests and collects no data. The only script injection (scripting
permission, no manifest content scripts) is the extension's own bundled
overlay, executed on demand to draw its breathing exercise over the active
tab; it reads nothing from the page. The `<all_urls>` host permission exists
solely so users can apply the pause/block — and see the breathing overlay —
on any site they pick. The block page offers a rationed escape hatch ("stay
five minutes", at most three per day) implemented as a temporary session DNR
allow rule scoped to that tab and domain.

## Assets still needed (cannot be generated from code)

- At least one 1280×800 or 640×400 screenshot (popup, options, breath screen).
- 440×280 small promo tile (optional but recommended).
- A hosted privacy-policy URL and a hosted Impressum URL (see above).
- **Ko-fi:** ✅ done — `options/options.html` (About section) links to
  `https://ko-fi.com/abbidogan`. Keep it a plain voluntary link — no perks, no
  unlocks.
