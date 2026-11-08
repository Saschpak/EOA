# Supabase

Datenbank der Playback-Coaching-Plattform.

- `migrations/` enthält das Datenbankschema. Die Supabase-GitHub-Integration spielt neue Dateien automatisch ein, sobald sie auf `main` landen („Deploy to production“).
- Neue Änderungen kommen immer als neue Datei mit Zeitstempel im Namen dazu. Bereits eingespielte Dateien werden nicht mehr verändert.
- Coach-Rechte bekommt beim Registrieren jede E-Mail-Adresse aus der Tabelle `coach_emails` (aktuell `info@saschpak.de`).
