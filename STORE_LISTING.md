# Store submission notes for Miru v2.1.0 — Chrome Web Store & Firefox Add-ons (AMO)

Everything the dashboards will ask for, ready to paste. The Chrome sections
apply to AMO too unless the AMO section below says otherwise.

## Single purpose description

Miru is a mindful-browsing companion: users name the sites that pull at them
and give each a posture — a brief guided breath before entry; a "calm" mode
that additionally hides algorithmic feed elements (currently on YouTube and
Instagram) while search, messages, and profiles keep working; or a gentle
block with a rationed five-minute stay. Focus sessions and a nightly
grayscale wind-down round it out. All features serve the single purpose of
intentional, calmer browsing.

## Permission justifications

**declarativeNetRequest** — Core mechanism. Redirects navigations to the
extension's own breathing pause or block page, according to the user's
settings. No request data is read or modified beyond these redirects.

**host_permissions (`<all_urls>`)** — Users may give any site they choose a
breathing pause or a block; the redirect rules therefore need to match any
host, and the breathing overlay (see `scripting`) must be able to appear on
whatever page the user is viewing. No page content is read.

**scripting** — Two uses, both bundled code only. (1) Renders the extension's
own breathing exercise as a temporary overlay on the user's current tab
(instead of opening a separate window) for the manual breath, the optional
periodic reminder, session endings, and the time mirror (`utils/words.js`,
`utils/overlay.js`). (2) For sites the user sets to "calm" (packs currently
exist for YouTube and Instagram), registers `utils/calm.js` as a content
script scoped to exactly those hosts; it hides feed/Shorts/Reels/Explore
elements with CSS and shows a small note. (3) Applies a bundled grayscale
stylesheet during the user's chosen night hours, and briefly to the current
tab in the minute before an optional periodic breathing reminder. No page
content is read, evaluated, or transmitted; the only storage write is a local
flag when a hiding selector no longer matches, so the options page can say
the pack is out of date.

**tabs** — Used to (1) know which site is active so the popup can show today's
per-site time, (2) redirect a tab to the block page when the user blocks a
site that is already open, and (3) exempt already-open sites from the
breathing pause.

**storage** — Saves the user's settings (sync) and local state (today's usage
totals, the running focus session, the daily intention words shown on the
local journal page, the daily counter for brief "stay five minutes" unblocks,
and a local flag when a calm-mode selector stops matching).
Nothing is transmitted.

**alarms** — Ends focus sessions on time, runs the optional periodic breathing
reminder, ends the five-minute unblock of a blocked site, and re-evaluates the
night-mode window once per minute.

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
- License: open source under **GPL-3.0** (`LICENSE` at the repo root).

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

Browse with intention. A breath before sites that pull at you, calmer feeds
on YouTube & Instagram, gentle blocking, quiet nights.

## Reviewer notes (optional but speeds review)

The extension uses declarativeNetRequest redirect rules to show its own
breathing/block pages before user-chosen sites. It makes no external network
requests and collects no data. There are no manifest content scripts; all
injection is bundled code via the scripting permission: (1) an on-demand
overlay that draws the breathing exercise over the active tab, and (2) for
sites the user explicitly sets to "calm" (currently YouTube and Instagram),
a registered content script scoped to those hosts that hides feed/Shorts/
Reels/recommendation elements with CSS — it reads nothing from the page. The
`<all_urls>` host permission exists solely so users can apply the pause/block
— and see the breathing overlay — on any site they pick. The block page
offers a rationed escape hatch ("stay five minutes", at most three per day)
implemented as a temporary session DNR allow rule scoped to that tab and
domain; on calm-pack sites the stay lands in the calmed version.

## Firefox Add-ons (AMO) — what differs from the Chrome submission

- **Package:** `dist/miru-firefox-v2.1.0.zip` (built from the `firefox/`
  folder; only its `manifest.json` differs from Chrome's).
- **Add-on ID:** `miru@abb-i.github.io` (`browser_specific_settings.gecko.id`
  in the Firefox manifest — required for `storage.sync` and stable updates).
- **Minimum Firefox version:** 140.0 (current ESR; covers every
  declarativeNetRequest feature Miru uses, and the
  `data_collection_permissions` manifest key AMO requires of new submissions —
  Miru declares `"required": ["none"]`, the truthful answer).
- **Host permissions on Firefox:** Firefox treats MV3 site access as
  user-controllable. It is granted in the install prompt by default, but a
  user can revoke or decline it — if Miru seems inert, check
  about:addons → Miru → Permissions → "Access your data for all websites".
  Temporary add-ons loaded via about:debugging need this granted manually.
- **`web-ext lint`:** 0 errors. Expected warnings, safe to mention to
  reviewers: three UNSAFE_VAR_ASSIGNMENT hits (onboarding.js, overlay.js) are
  template literals interpolating only bundled constants, URL hostnames, and
  extension-built numeric strings — never page or user free-text; the
  Android min-version warning doesn't apply (desktop-only).
- **Background:** Firefox runs the background as an event page
  (`background.scripts`) instead of Chrome's service worker; same code, the
  utility files are simply loaded via the manifest instead of `importScripts`.
- **Source code:** no source-code upload needed — the package *is* the source
  (no build step, no minification). Reviewer link: `https://github.com/abb-i/miru`.
- **Data collection questions:** answer **No** throughout — no data collected,
  transmitted, or shared (same facts as the Chrome privacy tab above).
- **Listing copy:** reuse the short description and reviewer notes below;
  replace "Chrome" with "Firefox" where the text names the browser. In the
  privacy sentence, note that settings sync (if enabled) goes through Firefox
  Sync rather than Chrome sync.
- **Impressum:** the German Impressumspflicht applies to the AMO listing page
  as well — end the AMO description with the same line:
  `Impressum / Legal notice: https://github.com/abb-i/miru/blob/main/IMPRESSUM.md`

## Assets still needed (cannot be generated from code)

- At least one 1280×800 or 640×400 screenshot (popup, options, breath screen).
- 440×280 small promo tile (optional but recommended).
- A hosted privacy-policy URL and a hosted Impressum URL (see above).
- **Ko-fi:** ✅ done — `options/options.html` (About section) links to
  `https://ko-fi.com/abbidogan`. Keep it a plain voluntary link — no perks, no
  unlocks.
