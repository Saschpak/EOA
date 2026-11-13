// Öffentliche Einstellungen der Plattform. Hier stehen keine geheimen Schlüssel.
window.CONFIG = {
  // Supabase-Projekt (öffentliche Adresse und publishable Key)
  supabaseUrl: "https://rninutwcfcfgqznvfpib.supabase.co",
  supabaseKey: "sb_publishable_tPjWQFLWbI78aQ7KZOQyJg_80SxD00_",

  // Link zu deiner Calendly-Buchungsseite. Leer lassen, solange es keine gibt.
  calendlyUrl: "",

  // Links zu Impressum und Datenschutzerklärung (z. B. auf saschpak.de)
  impressumUrl: "impressum.html",
  datenschutzUrl: "datenschutz.html",

  // Warteliste auf der Startseite
  waitlistSpots: 6,           // Plätze in der ersten Runde
  waitlistShowCountFrom: 5,   // Anzahl Wartender erst ab dieser Zahl anzeigen
  waitlistShowPlaceFrom: 0,   // 0 = genaue Nummer nie zeigen, stattdessen „zu den ersten 10/20 …“. In Mails: public.waitlist_show_place()
  launchText: "Die erste Runde startet im Januar.",
  // Early-Bird-Preis für die ersten Anmeldungen (Anzahl steht in der Datenbank).
  // Wird angezeigt, solange Early-Bird-Plätze frei sind. Leer lassen = kein Early-Bird-Preis.
  earlyBirdPriceHeadline: "200\u00a0€",
  earlyBirdPriceWas: "240\u00a0€",
  earlyBirdDeal: "800\u00a0€ statt 960\u00a0€ insgesamt",          // Gesamtpreis für Early-Birds
  earlyBirdMonthly: "4 Monate à 200\u00a0€ statt 240\u00a0€",
  earlyBirdBonus: "",          // optional zusätzlich ein Bonus, z. B. "eine zusätzliche 1:1-Session"
  earlyBirdExtraSessions: 0,   // so viele 1:1s bekommen Early-Birds beim Einladen automatisch dazu

  // Kennenlerngespräch nach dem Eintragen (Calendly-Link). Leer lassen, solange es keinen gibt.
  introCallUrl: "",
  introCallMinutes: 20,

  // Preis und Paket der ersten Runde (Startseite)
  // false = Preis wird auf der Startseite nicht genannt, sondern erst im Kennenlerngespräch (Test seit 12.11.2026)
  showPrice: false,
  priceHiddenText: "Den Preis und alle Details besprechen wir im kostenlosen Kennenlerngespräch. Du kannst einmalig oder in Monatsraten zahlen, und verbindlich wird es erst, wenn du zusagst.",
  faqPaymentNoPrice: "Den Preis besprechen wir im kostenlosen Kennenlerngespräch, abgestimmt auf das, was du brauchst. Du kannst einmalig oder in Monatsraten zahlen. Gezahlt wird erst, wenn du nach dem Gespräch zusagst.",
  priceHeadline: "240\u00a0€",
  priceHeadlineNote: "im Monat · für 4\u00a0Monate",
  priceDetail: "Regulär 240\u00a0€ im Monat. Insgesamt 960\u00a0€, in 4 Monatsraten oder einmalig. Danach keine weiteren Kosten. Alle Preise inkl. 19\u00a0% MwSt.",
  packageItems: [
    ["1:1-Sessions", "4, verteilt über 4 Monate"],
    ["Videokurs", "12 Monate Zugang inklusive"],
    ["Templates & Max for Live Devices", "sofort startklar"],
    ["Begleitung", "Fragen, Notizen, Aufgaben"]
  ],

  // Kurs-Übersicht auf der Startseite: [Modul, kurze Beschreibung]
  courseModules: [
    ["Grundlagen & Setup", "Ableton-Basics, mein Setup und warum, Alternativen"],
    ["Stems", "Was sie sind, woher du sie bekommst, auch als Coverband"],
    ["Projektaufbau & Templates", "Meine Struktur, Projekt-Templates, Max for Live Devices"],
    ["Tempo & Click", "Tempo erkennen, Clicktracks bauen und routen"],
    ["Sections & Songstruktur", "Songs sauber gliedern, Sprünge vorbereiten"],
    ["AbleSet", "Setlist, Canvas für jedes Bandmitglied, Workflows mit Claude"],
    ["Ohne AbleSet", "Loops und Section-Sprünge direkt in Ableton"],
    ["MIDI-Automation", "SPD-SX, Drum-Pads, Controller, Live-Vocal-Processing wie Autotune"],
    ["Licht", "Timecode und Lightkey, so wie in einer echten Show"],
    ["Medleys & große Projekte", "Mehrere Songs in einem Projekt, Übergänge"],
    ["Redundanz & Bühne", "Zwei Rechner, Rack, Equipment, Vor- und Nachteile"]
  ],
  courseIntro: "Etwa zehn Module. Ich zeige dir dabei nicht nur das Wie, sondern auch, warum ich es so mache.",
  courseFinale: "Zugabe: dein komplettes Set, bühnenfertig.",
  heroEyebrow: "Mein 1:1-Coaching für dein Live-Setup",   // kleine Zeile über der Überschrift
  heroLead: "Für Bands und Artists, die live mit Ableton spielen. In 4 Monaten bauen wir zusammen dein komplettes Set.",
  introStripText: "In 90 Sekunden erkläre ich dir, worum es geht.",   // Video-Zeile am Handy unter der Überschrift
  heroImage: "",       // optional: Bild rechts neben der Überschrift, z. B. "media/set.jpg"

  // "Kennst du das?" auf der Startseite
  painPoints: [
    "Der Click läuft mitten im Song weg, und keiner merkt es rechtzeitig.",
    "Der Laptop hängt, und die ganze Band schaut zu dir rüber.",
    "Vor jeder Show baust du dein Set neu zusammen, weil keiner mehr weiß, wie es ging.",
    "Im In-Ear hörst du alles, nur nicht das, was du brauchst."
  ],

  // Über dich. Der Abschnitt erscheint, sobald videoUrl, photoUrl oder aboutPoints gefüllt sind.
  aboutTitle: "Hi, ich bin Sascha.",
  videoUrl: "media/intro.mp4",
  photoUrl: "media/intro-poster.jpg", // Vorschaubild fürs Video
  aboutPoints: [
    "Seit 20\u00a0Jahren Drummer, seit rund 11\u00a0Jahren live auf der Bühne",
    "Musical Direction und Playback für Kleo\u00a0mit\u00a0K und Simon\u00a0Will",
    "Von der Partyband-Bühne auf dem Oktoberfest bis zu Festivals wie dem Open\u00a0Flair",
    "Auf Tour, zuletzt mit Kleo\u00a0mit\u00a0K als Support auf der Julia\u2011Meladin\u2011Tour"
  ],

  // Stimmen von Teilnehmern. Erscheinen erst, wenn hier Einträge stehen.
  testimonials: [],    // z. B. [{ quote: "…", name: "Lena", role: "Keys, Bandname" }]

  // Geschenk nach dem Bestätigen des Eintrags (Website und Mail). Erscheint erst, wenn giftFile gesetzt ist.
  giftTitle: "Meine Ableton-Shortcuts als PDF",
  giftFile: "downloads/ableton-shortcuts.pdf", // Quelle zum Bearbeiten: plattform/geschenk/ableton-shortcuts.html
  // true = Geschenk als Hauptaufruf oben; false = Coaching oben, Geschenk als Anreiz im Formular
  giftHero: false,
  giftHeadline: "Meine Ableton-Shortcuts",
  giftHeadlineEm: "für die Bühne.",
  giftLead: "Die Tastenkürzel, die ich beim Bauen meiner Live-Sets ständig benutze. Als PDF für Mac und Windows, kostenlos.",
  giftButton: "PDF gratis holen",
  giftPreview: "downloads/ableton-shortcuts-vorschau.jpg",

  // Häufige Fragen
  faq: [
    ["Bekomme ich Vorlagen, mit denen ich direkt starten kann?", "Ja. Du bekommst meine Projekt-Templates und Max for Live Devices, mit denen ich selbst arbeite. Damit kannst du sofort loslegen, statt bei null anzufangen."],
    ["Ich bin kein Technik-Typ. Schaffe ich das?", "Ja. Genau dafür ist das Coaching da. Wir gehen Schritt für Schritt vor, in deinem Tempo, und bauen nur das, was du für deine Show wirklich brauchst."],
    ["Brauche ich AbleSet?", "Nein. Ich zeige dir beides: wie du mit AbleSet arbeitest und wie du alles komplett ohne löst, inklusive Loops und Section-Sprüngen direkt in Ableton."],
    ["Welche Ausstattung brauche ich?", "Einen Laptop mit Ableton Live und ein Audio-Interface. Geräte wie ein SPD-SX, MIDI-Controller oder Lichtsoftware sind optional. Was für dein Setup sinnvoll ist, besprechen wir im Gespräch, bevor du etwas kaufst."],
    ["Geht das auch als Solo-Artist?", "Ja. Ob Band oder Solo, Click, Cues und ein stabiles Setup braucht jeder, der mit Playback spielt."],
    ["Was passiert im Kennenlerngespräch?", "Wir sprechen etwa 20 Minuten über dein Setup, deine nächsten Shows und wo es gerade hakt. Danach weißt du, ob das Coaching zu dir passt. Kostenlos und ohne Verpflichtung."],
    ["Wie läuft die Bezahlung?", "Insgesamt 960\u00a0€: entweder 4 Monate à 240\u00a0€ oder einmalig. Danach entstehen keine weiteren Kosten, auch nicht für die 12 Monate Kurszugang. Alle Preise inkl. 19\u00a0% MwSt. Gezahlt wird erst, wenn du nach dem Gespräch zusagst."]
  ],

  // Kursname, wie er im Kursbereich oben steht
  courseTitle: "Playback Live-Rig"
};
