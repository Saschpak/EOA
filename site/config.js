// Öffentliche Einstellungen der Plattform. Hier stehen keine geheimen Schlüssel.
window.CONFIG = {
  // Supabase-Projekt (öffentliche Adresse und publishable Key)
  supabaseUrl: "https://rninutwcfcfgqznvfpib.supabase.co",
  supabaseKey: "sb_publishable_tPjWQFLWbI78aQ7KZOQyJg_80SxD00_",

  // Link zu deiner Calendly-Buchungsseite. Leer lassen, solange es keine gibt.
  calendlyUrl: "",

  // Links zu Impressum und Datenschutzerklärung (z. B. auf saschpak.de)
  impressumUrl: "",
  datenschutzUrl: "",

  // Warteliste auf der Startseite
  waitlistSpots: 6,           // Plätze in der ersten Runde
  waitlistShowCountFrom: 5,   // Anzahl Wartender erst ab dieser Zahl anzeigen
  launchText: "Die erste Runde startet im Januar.",
  // Early-Bird-Preis für die ersten Anmeldungen (Anzahl steht in der Datenbank).
  // Wird angezeigt, solange Early-Bird-Plätze frei sind. Leer lassen = kein Early-Bird-Preis.
  earlyBirdPriceHeadline: "200\u00a0€",
  earlyBirdPriceWas: "240\u00a0€",
  earlyBirdDeal: "800\u00a0€ statt 960\u00a0€",          // Gesamtpreis für Early-Birds
  earlyBirdMonthly: "200\u00a0€ statt 240\u00a0€ im Monat",
  earlyBirdBonus: "",          // optional zusätzlich ein Bonus, z. B. "eine zusätzliche 1:1-Session"
  earlyBirdExtraSessions: 0,   // so viele 1:1s bekommen Early-Birds beim Einladen automatisch dazu

  // Kennenlerngespräch nach dem Eintragen (Calendly-Link). Leer lassen, solange es keinen gibt.
  introCallUrl: "",
  introCallMinutes: 20,

  // Preis und Paket der ersten Runde (Startseite)
  priceHeadline: "240\u00a0€",
  priceHeadlineNote: "im Monat",
  priceDetail: "4 Monate à 240\u00a0€ oder 960\u00a0€ einmalig. Alle Details besprechen wir im Kennenlerngespräch.",
  packageItems: [
    ["1:1-Sessions", "4, verteilt über 4 Monate"],
    ["Videokurs", "12 Monate Zugang"],
    ["Begleitung", "Fragen, Notizen, Aufgaben"]
  ],

  // Die Setlist auf der Startseite (Stationen des Kurses)
  setlist: ["Rig aufbauen", "Stems & Session", "Click & Cues", "In-Ear-Routing", "AbleSet", "Showtag"],

  // "Kennst du das?" auf der Startseite
  painPoints: [
    "Der Click läuft mitten im Song weg, und keiner merkt es rechtzeitig.",
    "Der Laptop hängt, und die ganze Band schaut zu dir rüber.",
    "Vor jeder Show baust du dein Set neu zusammen, weil keiner mehr weiß, wie es ging.",
    "Im In-Ear hörst du alles, nur nicht das, was du brauchst."
  ],

  // Über dich. Der Abschnitt erscheint, sobald videoUrl, photoUrl oder aboutPoints gefüllt sind.
  aboutTitle: "Hi, ich bin Sascha.",
  videoUrl: "",        // z. B. "media/intro.mp4" (Datei in site/media/ ablegen)
  photoUrl: "",        // z. B. "media/sascha.jpg" (dient auch als Vorschaubild fürs Video)
  aboutPoints: [],     // z. B. ["Seit 10 Jahren live mit Ableton unterwegs", "Playback für …"]

  // Stimmen von Teilnehmern. Erscheinen erst, wenn hier Einträge stehen.
  testimonials: [],    // z. B. [{ quote: "…", name: "Lena", role: "Keys, Bandname" }]

  // Geschenk nach dem Eintragen. Erscheint erst, wenn giftFile gesetzt ist.
  giftTitle: "Meine Ableton-Shortcuts als PDF",
  giftFile: "",        // z. B. "downloads/ableton-shortcuts.pdf" (Datei in site/downloads/ ablegen)

  // Häufige Fragen
  faq: [
    ["Ich bin kein Technik-Typ. Schaffe ich das?", "Ja. Genau dafür ist das Coaching da. Wir gehen Schritt für Schritt vor, in deinem Tempo, und bauen nur das, was du für deine Show wirklich brauchst."],
    ["Brauche ich AbleSet?", "Nicht zwingend. AbleSet ist ein Baustein im Kurs, weil es Setlists auf der Bühne sehr einfach macht. Ob es für dich Sinn ergibt, klären wir im Kennenlerngespräch."],
    ["Welche Ausstattung brauche ich?", "Einen Laptop mit Ableton Live und ein Audio-Interface. Was genau für dein Setup passt, besprechen wir im Gespräch, bevor du etwas kaufst."],
    ["Geht das auch als Solo-Artist?", "Ja. Ob Band oder Solo, Click, Cues und ein stabiles Setup braucht jeder, der mit Playback spielt."],
    ["Was passiert im Kennenlerngespräch?", "Wir sprechen etwa 20 Minuten über dein Setup, deine nächsten Shows und wo es gerade hakt. Danach weißt du, ob das Coaching zu dir passt. Kostenlos und ohne Verpflichtung."],
    ["Wie läuft die Bezahlung?", "Entweder 4 Monate à 240\u00a0€ oder 960\u00a0€ einmalig. Gezahlt wird erst, wenn du nach dem Gespräch zusagst."]
  ],

  // Kursname, wie er im Kursbereich oben steht
  courseTitle: "Playback Live-Rig"
};
