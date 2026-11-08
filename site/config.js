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
  waitlistSpots: 10,          // Plätze in der ersten Runde
  waitlistShowCountFrom: 5,   // Anzahl Wartender erst ab dieser Zahl anzeigen
  launchText: "Die erste Runde startet im Dezember.",
  earlyBirdBonus: "eine zusätzliche 1:1-Session", // was die ersten 5 bekommen
  earlyBirdExtraSessions: 1,  // so viele 1:1s bekommen Early-Birds beim Einladen automatisch dazu

  // Kursname, wie er im Kursbereich oben steht
  courseTitle: "Playback Live-Rig"
};
