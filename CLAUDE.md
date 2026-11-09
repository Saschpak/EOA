# Projektnotizen

Dieses Repo enthält zwei Dinge:

1. **Drum Sheet Editor** (`index.html` im Hauptverzeichnis, dazu die MP3s): Der Besitzer nutzt ihn aktiv. Nicht verschieben, nicht löschen. Er wird über die bestehende Netlify-Seite `darling-biscuit-788a7b` und die Vercel-Projekte aus dem Hauptverzeichnis veröffentlicht. Es darf keine `netlify.toml` im Hauptverzeichnis geben, die das ändert.
2. **Playback Coaching Plattform** (`site/` und `supabase/`): live unter `https://coaching.saschpak.de` (Netlify-Projekt `deluxe-rabanadas-926740`, Publish directory `site`).

## Plattform: Aufbau

- `site/index.html`, `site/app.js`, `site/styles.css`: statische Single-Page-App ohne Build-Schritt. `supabase-js` liegt unter `site/vendor/`, Schriften (Archivo, JetBrains Mono, OFL) unter `site/fonts/`.
- `site/config.js`: **alle Inhalte und Einstellungen der Startseite** (Preis, Paket, Plätze, Early-Bird, Setlist, „Kennst du das?“, Über mich, Stimmen, FAQ, Geschenk-PDF, Calendly-Links, Impressum- und Datenschutz-Links). Texte bevorzugt hier ändern, nicht in `app.js`.
- `supabase/migrations/`: Datenbankschema. Die Supabase-GitHub-Integration spielt neue Dateien beim Merge auf `main` automatisch ins Produktionsprojekt ein. Eingespielte Migrationen nie ändern, immer eine neue Datei mit Zeitstempel anlegen.
- `supabase/email-vorlagen/`: deutsche Auth-Mail-Texte zum Einfügen im Supabase-Dashboard.
- `rechtliches-entwurf/`: Entwürfe für Impressum und Datenschutz mit Platzhaltern `[[…]]`. Erst nach `site/` verschieben und verlinken (`impressumUrl`, `datenschutzUrl` in `config.js`), wenn alle Platzhalter gefüllt sind.
- `plattform/prototyp.html`: alter Klick-Prototyp, nur zur Referenz.

## Wichtige Regel: Startseite mit dem Angebot synchron halten

Wenn sich am Kurs oder am Angebot etwas ändert (Module, Lektionen, Paketinhalt, Preis, Anzahl 1:1s, Kurszugang, Startdatum, Plätze), **immer auch die Startseite prüfen und anpassen**, vor allem in `site/config.js`:

- `setlist`: Stationen des Kurses auf der Setlist-Grafik
- `packageItems`, `priceHeadline`, `priceDetail`: Paket und Preis
- `faq`: besonders „Welche Ausstattung brauche ich?“, „Brauche ich AbleSet?“, „Wie läuft die Bezahlung?“
- `painPoints` und die drei Bausteine in `renderLanding()` in `app.js`
- `launchText`, `waitlistSpots`, `earlyBirdBonus`, `earlyBirdExtraSessions` (die Anzahl der Early-Birds steht in der Datenbankfunktion `waitlist_early_bird_slots`, Änderung nur per neuer Migration)
- Datenschutz-Entwurf, falls neue Dienste dazukommen (z. B. Bunny, Calendly, Resend, Stripe)

Kursinhalte selbst (Module, Lektionen, Drip-Regeln) pflegt der Coach im Admin-Bereich der Plattform. Sie liegen in der Datenbank, nicht im Code.

## Arbeitsweise

- Änderungen auf einem Feature-Branch, Pull Request nach `main`. Der Besitzer hat erlaubt, dass Claude Website-PRs nach dem Testen selbst zusammenführt. **Vor dem Merge von Datenbank-Migrationen den Besitzer kurz informieren.**
- Vor dem Merge testen: Migrationen gegen lokalen Postgres mit nachgebauten `auth`- und `storage`-Schemas, Oberfläche in Chromium (Playwright) gegen eine simulierte Supabase-API, hell und dunkel, Desktop und Handybreite (kein seitliches Scrollen).
- Design: ruhig und aufgeräumt mit eigener Note. Archivo, Signal-Orange als einziger Akzent, viel Weißraum, keine generischen KI-Muster (keine Karten in Karten, keine Großbuchstaben-Labels überall, keine Akzent-Seitenstriche). Nicht wie eine Apple-Verkaufsseite.
- Verknappung nur echt: keine erfundenen Zahlen, keine Fake-Countdowns.
- Sprache der Oberfläche: Deutsch, Du-Form.

## Offene Punkte (Stand November 2026)

- Impressum-Angaben und Supabase-Region fehlen noch, danach Impressum und Datenschutz veröffentlichen.
- Videos (Bunny Stream) kommen ab Dezember, Anbindung mit signierten Links steht noch aus.
- Eigener Mail-Versand (Resend als SMTP in Supabase) und deutsche Mail-Vorlagen einrichten.
- Calendly: Link für 1:1-Buchung (`calendlyUrl`) und Kennenlerngespräch (`introCallUrl`).
- Inhalte für Über mich (Video, Foto, Stichpunkte), Stimmen und Geschenk-PDF (Ableton-Shortcuts) kommen vom Coach. Vorschau mit Platzhaltern unter `#vorschau`.
