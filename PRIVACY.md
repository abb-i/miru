# Datenschutzerklärung für die Browser-Erweiterung „Miru"

_Stand: 7. Juli 2026 — die deutsche Fassung ist maßgeblich; an English translation follows below._

## 1. Verantwortlicher

Verantwortlicher im Sinne der Datenschutz-Grundverordnung (DSGVO):

Abdulkadir Dogan
Arnoldsweilerstraße 52
52351 Düren
Deutschland
E-Mail: akadirdogan2727@gmail.com

## 2. Der Grundsatz: keine Datenerhebung

Miru ist so entwickelt, dass sämtliche Funktionen vollständig lokal in Ihrem
Browser arbeiten. Die Erweiterung

- überträgt **keine Daten** an den Entwickler oder an Dritte,
- betreibt **keine eigenen Server**,
- verwendet **keine Analyse-, Tracking- oder Werbedienste**,
- lädt **keine Inhalte aus dem Internet nach** (auch Schriftarten sind in der
  Erweiterung gebündelt),
- setzt **keine Cookies**.

Der Entwickler erhält zu keinem Zeitpunkt Zugriff auf Ihre Daten. Die
nachfolgend beschriebenen Verarbeitungen finden ausschließlich lokal auf Ihrem
Endgerät statt.

## 3. Lokal gespeicherte Daten

Zur Bereitstellung ihrer Funktionen speichert die Erweiterung folgende Daten im
Speicher Ihres Browsers (`chrome.storage`):

**a) Einstellungen** — Ihre Konfiguration (z. B. blockierte Websites,
Tab-Limit, Atemmuster, Nachtmodus-Zeiten, Design).
Speicherort: `chrome.storage.sync` (siehe Ziffer 4).
Speicherdauer: bis zur Änderung oder Löschung durch Sie bzw. bis zur
Deinstallation.

**b) Nutzungszeiten** — die je Website verbrachte Zeit (Domain und Sekunden),
damit das Popup Ihnen Ihren Tag anzeigen kann.
Speicherort: `chrome.storage.local` (nur dieses Gerät).
Speicherdauer: maximal 14 Tage, danach automatische Löschung.

**c) Sitzungsdaten** — eine laufende Fokus-Sitzung, eine laufende Pause
(„Break") und das Tageswort.
Speicherort: `chrome.storage.local`.
Speicherdauer: bis zum jeweiligen Ablauf bzw. Tagesende.

Soweit hierbei eine Verarbeitung personenbezogener Daten im Sinne der DSGVO
vorliegt, ist Rechtsgrundlage Art. 6 Abs. 1 lit. b DSGVO (Bereitstellung der
von Ihnen gewünschten Funktionen).

## 4. Synchronisierung durch Ihren Browser (Google)

Ihre Einstellungen werden über die Browser-Schnittstelle `chrome.storage.sync`
gespeichert. Sind Sie in Chrome mit einem Google-Konto angemeldet und haben die
Chrome-Synchronisierung aktiviert, gleicht **Ihr Browser** diese Einstellungen
über Google-Server zwischen Ihren Geräten ab. Diese Synchronisierung ist eine
Funktion Ihres Browsers und erfolgt durch Google (Google Ireland Limited,
Gordon House, Barrow Street, Dublin 4, Irland) auf Grundlage Ihrer Vereinbarung
mit Google; es gilt die Datenschutzerklärung von Google
(https://policies.google.com/privacy). Der Entwickler hat hierauf weder Zugriff
noch Einfluss. Ohne aktivierte Chrome-Synchronisierung verbleiben die
Einstellungen ausschließlich auf Ihrem Gerät.

## 5. Chrome Web Store

Installation und Updates der Erweiterung erfolgen über den Chrome Web Store von
Google. Dabei verarbeitet Google Daten (z. B. IP-Adresse, Kontodaten) in
eigener datenschutzrechtlicher Verantwortung; es gilt die Datenschutzerklärung
von Google.

## 6. Spenden (Ko-fi)

Die Erweiterung bzw. ihre Store-Seite kann einen freiwilligen Spendenlink zu
Ko-fi enthalten. Beim Anklicken verlassen Sie die Erweiterung und gelangen auf
die Website von Ko-fi (Ko-fi Labs Limited, Vereinigtes Königreich); dort gelten
die Datenschutzbestimmungen von Ko-fi (https://more.ko-fi.com/privacy). Die
Erweiterung übermittelt dabei keinerlei Daten an Ko-fi. Für das Vereinigte
Königreich besteht ein Angemessenheitsbeschluss der EU-Kommission (Art. 45
DSGVO). Spenden sind freiwillig und mit keiner Gegenleistung verbunden.

## 7. Feedback und Kontakt per E-Mail

Die Erweiterung enthält eine Feedback-Funktion, die Ihr eigenes E-Mail-Programm
mit einem vorbereiteten Entwurf öffnet (mailto-Link). Der Versand erfolgt
ausschließlich durch Sie über Ihr E-Mail-Programm; die Erweiterung selbst
übermittelt keinerlei Daten. Wenn Sie mir per E-Mail schreiben, verarbeite ich
die von Ihnen mitgeteilten Daten (Ihre E-Mail-Adresse und den Inhalt Ihrer
Nachricht) zur Bearbeitung Ihres Anliegens. Rechtsgrundlage ist Art. 6 Abs. 1
lit. f DSGVO (berechtigtes Interesse an der Beantwortung von Anfragen und der
Verbesserung der Erweiterung). Die E-Mails werden gelöscht, sobald sie für
diesen Zweck nicht mehr erforderlich sind.

## 8. Berechtigungen der Erweiterung

Miru fordert Browser-Berechtigungen ausschließlich zur lokalen
Funktionserbringung an:

- **declarativeNetRequest** und Zugriff auf alle Websites: Umleitung von
  Navigationen auf die erweiterungseigene Atem-, Blockier- oder Nachtseite
  gemäß Ihren Einstellungen. Seiteninhalte werden weder gelesen noch verändert.
- **tabs**: Zählen offener Tabs (Tab-Limit), Erkennen der aktiven Website
  (Zeitanzeige), Umleiten bereits geöffneter blockierter Seiten.
- **storage**: lokale Speicherung gemäß Ziffer 3.
- **alarms**: zeitgesteuerte Funktionen (Sitzungs-/Pausenende, geplante
  Sitzungen, Nachtmodus, Atem-Erinnerungen).
- **idle**: Unterdrückung von Erinnerungen, während Sie abwesend sind.

## 9. Ihre Rechte

Ihnen stehen gegenüber dem Verantwortlichen die Rechte aus Art. 15 bis 21 DSGVO
zu (Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung,
Datenübertragbarkeit, Widerspruch). Da der Entwickler keine personenbezogenen
Daten von Ihnen erhebt, speichert oder empfängt, können diese Rechte
regelmäßig nur dahingehend beantwortet werden, dass keine Daten vorliegen.
Sämtliche lokal gespeicherten Daten löschen Sie jederzeit selbst — einzelne
Einstellungen über die Optionsseite, alles Übrige durch Deinstallation der
Erweiterung.

## 10. Beschwerderecht

Sie haben das Recht auf Beschwerde bei einer Datenschutz-Aufsichtsbehörde
(Art. 77 DSGVO). Für den Verantwortlichen zuständig ist die Landesbeauftragte
für Datenschutz und Informationsfreiheit Nordrhein-Westfalen, Kavalleriestraße
2–4, 40213 Düsseldorf. Sie können sich auch an die Aufsichtsbehörde Ihres
gewöhnlichen Aufenthaltsorts wenden.

## 11. Keine automatisierte Entscheidungsfindung

Eine automatisierte Entscheidungsfindung einschließlich Profiling (Art. 22
DSGVO) findet nicht statt.

## 12. Änderungen dieser Datenschutzerklärung

Diese Datenschutzerklärung wird angepasst, wenn sich die Erweiterung oder die
Rechtslage ändert. Die jeweils aktuelle Fassung ist in den Einstellungen der
Erweiterung (Bereich „Legal") und unter der im Chrome Web Store angegebenen
Adresse abrufbar.

---

# Privacy Policy for the "Miru" browser extension (English translation)

_Last updated: July 7, 2026. The German version above is the legally
authoritative one._

## 1. Controller

Controller within the meaning of the EU General Data Protection Regulation
(GDPR):

Abdulkadir Dogan
Arnoldsweilerstraße 52
52351 Düren, Germany
Email: akadirdogan2727@gmail.com

## 2. The principle: no data collection

Miru is built so that every feature works entirely locally in your browser.
The extension transmits **no data** to the developer or any third party,
operates **no servers**, uses **no analytics, tracking, or advertising
services**, loads **nothing from the internet** (fonts are bundled), and sets
**no cookies**. The developer never has access to your data. All processing
described below happens exclusively on your device.

## 3. Locally stored data

To provide its features, the extension keeps the following in your browser's
storage (`chrome.storage`):

- **Settings** — your configuration (blocked sites, tab limit, breathing
  pattern, night hours, theme). Stored in `chrome.storage.sync` (see section
  4) until you change or delete them, or uninstall.
- **Usage times** — time spent per site (domain and seconds) so the popup can
  show you your day. Stored in `chrome.storage.local` (this device only) for a
  maximum of 14 days, then deleted automatically.
- **Session state** — a running focus session, a running break, and the daily
  intention word. Stored locally until it expires.

Where this constitutes processing of personal data under the GDPR, the legal
basis is Art. 6(1)(b) GDPR (providing the features you requested).

## 4. Synchronization by your browser (Google)

Settings are stored via the browser API `chrome.storage.sync`. If you are
signed into Chrome and have Chrome sync enabled, **your browser** synchronizes
these settings between your devices via Google's servers. This is a browser
feature performed by Google (Google Ireland Limited, Gordon House, Barrow
Street, Dublin 4, Ireland) under your agreement with Google and Google's
privacy policy (https://policies.google.com/privacy). The developer has no
access to and no influence over this. Without Chrome sync, settings never
leave your device.

## 5. Chrome Web Store

Installation and updates happen through Google's Chrome Web Store, where
Google processes data (e.g. IP address, account data) under its own
responsibility and privacy policy.

## 6. Donations (Ko-fi)

The extension or its store page may contain a voluntary donation link to
Ko-fi. Clicking it takes you to the Ko-fi website (Ko-fi Labs Limited, United
Kingdom), where Ko-fi's privacy policy applies
(https://more.ko-fi.com/privacy). The extension transmits no data to Ko-fi.
The UK is covered by an EU adequacy decision (Art. 45 GDPR). Donations are
voluntary and buy nothing.

## 7. Feedback and contact by email

The extension includes a feedback feature that opens your own email
application with a prepared draft (a mailto link). Sending is done entirely by
you through your own email program; the extension itself transmits no data. If
you write to me by email, I process the data you provide (your email address
and the content of your message) to handle your request. The legal basis is
Art. 6(1)(f) GDPR (legitimate interest in answering inquiries and improving
the extension). Emails are deleted once they are no longer needed for this
purpose.

## 8. Extension permissions

Miru requests browser permissions solely to work locally:
**declarativeNetRequest** + access to all sites (redirecting navigations to
its own breath/block/night pages per your settings; page content is never read
or modified), **tabs** (tab count, active site for the time display,
redirecting already-open blocked tabs), **storage** (section 3), **alarms**
(timed features), **idle** (no reminders while you're away).

## 9. Your rights

You have the rights under Art. 15–21 GDPR (access, rectification, erasure,
restriction, data portability, objection) against the controller. Since the
developer collects, stores, and receives no personal data, such requests can
generally only be answered with "no data held." You can delete all locally
stored data yourself at any time — individual settings via the options page,
everything else by uninstalling the extension.

## 10. Right to lodge a complaint

You may complain to a data protection supervisory authority (Art. 77 GDPR).
The authority responsible for the controller is the Landesbeauftragte für
Datenschutz und Informationsfreiheit Nordrhein-Westfalen, Kavalleriestraße
2–4, 40213 Düsseldorf, Germany. You may also contact the authority of your
habitual residence.

## 11. No automated decision-making

No automated decision-making, including profiling (Art. 22 GDPR), takes place.

## 12. Changes to this privacy policy

This policy will be updated if the extension or the legal situation changes.
The current version is always available in the extension's settings ("Legal"
section) and at the address given in the Chrome Web Store.
