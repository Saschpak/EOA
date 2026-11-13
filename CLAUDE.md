# Projektnotizen

Dieses Repo enthält zwei Dinge:

1. **Drum Sheet Editor** (`index.html` im Hauptverzeichnis, dazu die MP3s): Der Besitzer nutzt ihn aktiv. Nicht verschieben, nicht löschen. Er wird über die bestehende Netlify-Seite `darling-biscuit-788a7b` und die Vercel-Projekte aus dem Hauptverzeichnis veröffentlicht. Es darf keine `netlify.toml` im Hauptverzeichnis geben, die das ändert.
2. **Playback Masterclass von Saschpak** (Coaching-Plattform, `site/` und `supabase/`): live unter `https://coaching.saschpak.de` (Netlify-Projekt `deluxe-rabanadas-926740`, Publish directory `site`).

## Plattform: Aufbau

- `site/index.html`, `site/app.js`, `site/styles.css`: statische Single-Page-App ohne Build-Schritt. `supabase-js` liegt unter `site/vendor/`, Schriften (Archivo, JetBrains Mono, OFL) unter `site/fonts/`.
- `site/config.js`: **alle Inhalte und Einstellungen der Startseite** (Preis, Paket, Plätze, Early-Bird, Kurs-Übersicht, „Kennst du das?“, Über mich, Stimmen, FAQ, Geschenk-PDF, Calendly-Links, Impressum- und Datenschutz-Links). Texte bevorzugt hier ändern, nicht in `app.js`.
- `supabase/migrations/`: Datenbankschema. Die Supabase-GitHub-Integration spielt neue Dateien beim Merge auf `main` automatisch ins Produktionsprojekt ein. Eingespielte Migrationen nie ändern, immer eine neue Datei mit Zeitstempel anlegen.
- Preis-Test seit 12.11.2026: `showPrice: false` in config.js blendet alle Euro-Beträge auf der Startseite aus (Preis-Abschnitt „Was kostet das?“, Early-Bird ohne Betrag, FAQ „Bezahlung“ mit `faqPaymentNoPrice`). `showPrice: true` zeigt den Preis wieder.
- Startseite: Coaching steht oben (Wunsch des Coachs), das Gratis-PDF ist als Anreiz im Formular („Gratis dazu“). `giftHero: true` würde das PDF zum Hauptaufruf machen. Bestätigungs-Mail dazu: Migration `20261111150000_confirm_mail_gift_first.sql`.
- Kontakt-Status (Migration `20261113140000_contact_status.sql`): `waitlist.contact_stage` (angefragt, termin, gefuehrt, keine_antwort, abgesagt, unzustellbar), `contact_at`, `call_at`, `contact_note`. Coach pflegt im Admin, Claude setzt per `rpc/claude_contact_update` (nur mit Header `x-claude-key` = Vault-Secret `claude_key`, vom Proxy eingesetzt).
- Kurzstatistik für Claude (Migration `20261112100000_stats_summary.sql`): `rpc/stats_summary` mit `p_days` liefert nur anonyme Tagessummen (Besuche, Schritte, Einträge je Quelle), öffentlich mit dem publishable Key abrufbar, z. B. `curl -s -X POST https://rninutwcfcfgqznvfpib.supabase.co/rest/v1/rpc/stats_summary -H "apikey: <publishable key>" -H "Content-Type: application/json" -d '{"p_days":7}'`. Keine personenbezogenen Daten dort aufnehmen. Korrekturen einzelner Zählwerte (z. B. Selbsttests) per Daten-Migration wie `20261112110000_stats_fix_selftest.sql`, nie per öffentlicher Funktion.
- Schritt-Zählung (Migration `20261111120000_funnel_stats.sql`): `track_step()` zählt anonym Tagessummen (zeit_10s, zeit_30s, formular, tippen, abgeschickt, fehler, video, preis, scroll_50, scroll_90, module, faq), Auswertung im Admin unter Statistik „Wo springen die Leute ab?“. Neue Schritte nur zusammen mit der Liste in `track_step()` ergänzen.
- Push aufs Handy (Migration `20261109190000_waitlist_push.sql`): bei jedem neuen Eintrag eine ntfy-Nachricht (nur Nummer und Quelle, keine Namen), Kanal geheim im Vault als `ntfy_topic`.
- Wartelisten-Mails (Migration `20261109160000_waitlist_mail.sql`): Versand über Resend direkt aus der Datenbank (pg_net, Batch-API), Schlüssel im Supabase Vault als `resend_api_key` (nie ins Repo). Absender `masterclass@saschpak.de`, Antworten an info@saschpak.de (in `mail_config()`). Double-Opt-in (`#bestaetigen-<token>`), Abmelden (`#abmelden-<token>`), Info an den Coach bei jedem Eintrag, Einladungs-Mail beim „Einladen“, Rundmail und Mail-Protokoll im Admin. In Mails immer „Nr. X auf der Warteliste“ von den „Teilnehmerplätzen“ trennen. Die genaue Nummer wird Interessenten erst ab Platz 10 gezeigt (`waitlistShowPlaceFrom` in config.js und `public.waitlist_show_place()` gleich halten), davor „Du gehörst zu den Ersten“.
- `supabase/email-vorlagen/`: deutsche Auth-Mail-Texte zum Einfügen im Supabase-Dashboard.
- `site/impressum.html`, `site/datenschutz.html`: Impressum (Sascha Pakai, § 5 DDG, keine Steuernummer veröffentlichen) und Datenschutzerklärung, verlinkt über `impressumUrl`/`datenschutzUrl`. Bei neuen Diensten (Bunny, Calendly, Resend, Stripe) die Datenschutzerklärung ergänzen.
- `plattform/prototyp.html`: alter Klick-Prototyp, nur zur Referenz.

## Wichtige Regel: Startseite mit dem Angebot synchron halten

Wenn sich am Kurs oder am Angebot etwas ändert (Module, Lektionen, Paketinhalt, Preis, Anzahl 1:1s, Kurszugang, Startdatum, Plätze), **immer auch die Startseite prüfen und anpassen**, vor allem in `site/config.js`:

- `courseModules`, `courseIntro`, `courseFinale`: Kurs-Übersicht „Der Kurs: vom leeren Projekt bis auf die Bühne“ (Modul + kurze Beschreibung). Muss zu den Modulen im Admin passen.
- `heroImage`: optionales Bild rechts neben der Überschrift (z. B. Screenshot des eigenen Sets oder Bühnenfoto)
- `packageItems`, `priceHeadline`, `priceDetail`: Paket und Preis. Alle Preise sind Bruttopreise inkl. 19 % MwSt. (Coach hat eine USt-ID)
- `earlyBirdPriceHeadline`, `earlyBirdPriceWas`, `earlyBirdDeal`, `earlyBirdMonthly`: Early-Bird-Preis (durchgestrichen), sichtbar solange Early-Bird-Plätze frei sind. Der Early-Bird gilt für die ersten Buchungen: Er wird beim „Einladen“ im Admin (Zusage nach dem Kennenlerngespräch) vergeben, nicht beim Eintragen auf die Warteliste
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

- Impressum und Datenschutz sind online (Stand November 2026). AV-Verträge: Resend unterschrieben, Supabase und Netlify gelten automatisch über die Nutzungsbedingungen (PDFs beim Coach abgelegt, Stand November 2026).
- Videos (Bunny Stream) kommen ab Dezember, Anbindung mit signierten Links steht noch aus.
- Wartelisten-Mails laufen über Resend (Domain saschpak.de verifiziert). Noch offen: Resend auch als SMTP für die Konto-Mails in Supabase eintragen und die deutschen Vorlagen einfügen. AV-Vertrag mit Resend ist unterschrieben (November 2026).
- Calendly: Link für 1:1-Buchung (`calendlyUrl`) und Kennenlerngespräch (`introCallUrl`).
- Intro-Video (`site/media/intro.mp4`, Website-Schnitt ohne Plätze-Angabe und ohne Instagram-Aufruf) und Stichpunkte über Sascha sind drin. Geschenk-PDF ist drin (`site/downloads/ableton-shortcuts.pdf`, Quelle `plattform/geschenk/ableton-shortcuts.html`, per Chromium als A4-PDF erzeugen). Noch offen: Stimmen, Bild für `heroImage`. Vorschau mit Platzhaltern unter `#vorschau`.
- Kontra K und Oliver Tree bewusst NICHT nennen (Wunsch des Coachs). Simon Will ist drin, den Woodwalkers-2-Soundtrack bewusst nicht erwähnen (Wunsch des Coachs). „Toni“-Tour noch unbestätigt.
