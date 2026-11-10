/* Playback Masterclass – Schüleransicht und Admin-Bereich */
(function () {
"use strict";

const sb = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- Datum und Zeit ---------- */
const WD = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const MON = ["JAN", "FEB", "MÄR", "APR", "MAI", "JUN", "JUL", "AUG", "SEP", "OKT", "NOV", "DEZ"];
const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const today = () => iso(new Date());
const pd = s => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return iso(d); };
const fmt = s => { const d = pd(s); return d.getDate() + "." + (d.getMonth() + 1) + "."; };
const fmtY = s => fmt(s) + pd(s).getFullYear();
const fmtTs = ts => { const d = new Date(ts); return { date: iso(d), time: String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"), wd: WD[d.getDay()] }; };
const mmss = t => Math.floor(t / 60) + ":" + String(Math.floor(t % 60)).padStart(2, "0");
const parseDur = s => { const m = /^(\d{1,3}):([0-5]\d)$/.exec(String(s).trim()); return m ? (+m[1]) * 60 + (+m[2]) : null; };
const lines = s => String(s || "").split("\n").map(x => x.trim()).filter(Boolean);
const firstName = n => (n || "").trim().split(/\s+/)[0] || "";

const LOCK = '<svg class="lock" viewBox="0 0 12 14" aria-hidden="true"><rect x="1" y="6" width="10" height="7.5" rx="1.5" fill="currentColor"/><path d="M3.3 6V4.2a2.7 2.7 0 0 1 5.4 0V6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

/* ---------- Zustand ---------- */
const S = {
  session: null, me: null, D: null, view: "start", authView: "login",
  ui: { tab: "home", user: null, viewMod: null, lesson: null, editLesson: null, confirm: null, editNews: null, recovery: false, msg: {} }
};

/* ---------- Meldungen ---------- */
let toastT;
function toast(text, err) {
  const t = $("#toast"); t.textContent = text; t.className = "toast" + (err ? " err" : ""); t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, err ? 7000 : 3500);
}
function errText(e) {
  const m = (e && (e.message || e.error_description)) || String(e);
  if (/Invalid login credentials/i.test(m)) return "E-Mail oder Passwort stimmt nicht.";
  if (/Email not confirmed/i.test(m)) return "Bitte bestätige zuerst deine E-Mail-Adresse über den Link in der Mail.";
  if (/User already registered/i.test(m)) return "Für diese E-Mail-Adresse gibt es schon ein Konto. Melde dich an oder setze dein Passwort zurück.";
  if (/Password should be at least/i.test(m)) return "Das Passwort muss mindestens 6 Zeichen haben.";
  if (/rate limit|too many/i.test(m)) return "Zu viele Versuche in kurzer Zeit. Bitte warte ein paar Minuten.";
  if (/duplicate key/i.test(m)) return "Dieser Eintrag existiert schon.";
  return "Das hat nicht geklappt: " + m;
}
async function run(p, ok) {
  const res = await p;
  if (res && res.error) { toast(errText(res.error), true); return null; }
  if (ok) toast(ok);
  return res || {};
}

/* ---------- Daten laden ---------- */
async function load() {
  const q = (t, sel, ord) => { let x = sb.from(t).select(sel || "*"); if (ord) ord.forEach(o => { x = x.order(o[0], { ascending: o[1] !== false }); }); return x; };
  const [mods, lessons, files, prog, unl, sess, book, ques, news] = await Promise.all([
    q("modules", "*", [["position"], ["created_at"]]),
    q("lessons", "*", [["position"], ["created_at"]]),
    q("lesson_files", "*", [["created_at"]]),
    q("lesson_progress"),
    q("module_unlocks"),
    q("sessions", "*, session_tasks(*)", [["held_on", false], ["created_at", false]]),
    q("bookings", "*", [["starts_at"]]),
    q("questions", "*", [["created_at", false]]),
    q("news", "*", [["published_at", false]])
  ]);
  const all = [mods, lessons, files, prog, unl, sess, book, ques, news];
  const bad = all.find(r => r.error);
  if (bad) throw bad.error;
  const D = {
    modules: mods.data, lessons: lessons.data, files: files.data, progress: prog.data, unlocks: unl.data,
    sessions: sess.data.map(s => ({ ...s, session_tasks: (s.session_tasks || []).sort((a, b) => a.position - b.position) })),
    bookings: book.data, questions: ques.data, news: news.data, profiles: [], invites: []
  };
  if (S.me.role === "coach") {
    const [pr, inv, wl] = await Promise.all([q("profiles", "*", [["created_at"]]), q("invites", "*", [["created_at"]]), q("waitlist", "*", [["created_at"], ["id"]])]);
    for (const r of [pr, inv, wl]) if (r.error) throw r.error;
    D.profiles = pr.data; D.invites = inv.data; D.waitlist = wl.data;
    const vs = await q("visit_stats", "*", [["day"]]);
    D.visits = vs.error ? [] : vs.data;
    const eb = await sb.rpc("waitlist_early_bird_slots");
    D.ebSlots = eb.error ? 3 : eb.data;
    const [ml, mr] = await Promise.all([sb.rpc("mail_log_status"), sb.rpc("mail_ready")]);
    D.mailLog = ml.error ? null : ml.data; D.mailReady = mr.error ? null : mr.data;
  }
  S.D = D;
}
async function refreshMe() {
  const { data, error } = await sb.from("profiles").select("*").eq("id", S.session.user.id).maybeSingle();
  if (error) throw error;
  S.me = data;
  if (data && data.role === "coach") { try { localStorage.setItem("pc-notrack", "1"); } catch (e) { /* egal */ } }
}
async function reload() {
  try { await refreshMe(); if (S.me) await load(); render(); }
  catch (e) { toast(errText(e), true); }
}

/* ---------- Abgeleitete Werte ---------- */
const modsSorted = () => S.D.modules;
const lessonsOf = m => S.D.lessons.filter(l => l.module_id === m.id);
const allLessons = () => modsSorted().flatMap(m => lessonsOf(m));
const getLesson = id => S.D.lessons.find(l => l.id === id);
const modOf = l => S.D.modules.find(m => m.id === l.module_id);
const modIndex = m => modsSorted().indexOf(m);
const sessionsOf = uid => S.D.sessions.filter(s => s.user_id === uid);
const progressOf = uid => new Set(S.D.progress.filter(p => p.user_id === uid).map(p => p.lesson_id));
const bookingsOf = uid => S.D.bookings.filter(b => b.user_id === uid && b.status === "booked");
const upcomingOf = uid => bookingsOf(uid).filter(b => new Date(b.starts_at) >= new Date(Date.now() - 2 * 3600e3));
const leftFor = p => p.package_total - sessionsOf(p.id).length - upcomingOf(p.id).length;
const profileName = id => { const p = S.D.profiles.find(x => x.id === id); return p ? (p.full_name || p.email) : (id === S.me.id ? (S.me.full_name || S.me.email) : "Gelöschter Schüler"); };

function access(p, m) {
  if (!p.course_access) return { ok: false, why: "Kein Kurszugang", long: "Der Videokurs ist für dich noch nicht freigeschaltet." };
  if (S.D.unlocks.some(u => u.user_id === p.id && u.module_id === m.id)) return { ok: true, why: "Von dir freigeschaltet", manual: true };
  if (m.drip_type === "now") return { ok: true, why: "Sofort frei" };
  if (m.drip_type === "days") {
    const d = addDays(p.started_at, m.drip_value);
    return d <= today() ? { ok: true, why: "Frei seit " + fmt(d) } : { ok: false, why: "Ab " + fmt(d), long: "Wird am " + fmt(d) + " freigeschaltet." };
  }
  if (m.drip_type === "sessions") {
    const k = sessionsOf(p.id).length, n = m.drip_value;
    return k >= n ? { ok: true, why: "Frei nach " + n + " 1:1s" } : { ok: false, why: "Nach dem " + n + ". 1:1", long: "Wird nach deinem " + n + ". 1:1 freigeschaltet. Noch " + (n - k) + " " + (n - k === 1 ? "Session" : "Sessions") + "." };
  }
  return { ok: false, why: "Schaltet dein Coach frei", long: "Dieses Modul schaltet dein Coach für dich frei." };
}
const openFor = (p, m) => access(p, m).ok;
function nextLessonFor(p) {
  const done = progressOf(p.id);
  const av = allLessons().filter(l => openFor(p, modOf(l)));
  return { lesson: av.find(l => !done.has(l.id)) || av[av.length - 1] || null, allDone: av.length > 0 && av.every(l => done.has(l.id)) };
}
function progressHTML(p) {
  const total = allLessons().length, done = allLessons().filter(l => progressOf(p.id).has(l.id)).length;
  const pct = total ? Math.round(done / total * 100) : 0;
  return `<div class="progress"><div class="progress-top"><span class="muted">${done} von ${total} Lektionen</span><b class="mono">${pct}%</b></div><div class="track"><i style="width:${pct}%"></i></div></div>`;
}
const pctFor = p => { const t = allLessons().length; return t ? Math.round(allLessons().filter(l => progressOf(p.id).has(l.id)).length / t * 100) : 0; };

/* ---------- Startseite mit Warteliste (nicht eingeloggt) ---------- */
const WL_KEY = "pc-waitlist-token";
const wlGet = () => { try { return localStorage.getItem(WL_KEY); } catch (e) { return null; } };
const wlSet = t => { try { localStorage.setItem(WL_KEY, t); } catch (e) { /* egal */ } };
const placeLink = t => location.origin + location.pathname + "#platz-" + t;

/* Besucherzählung: ohne Cookies, nur Tag, Quelle, Gerätetyp */
function visitSource() {
  const q = new URLSearchParams(location.search);
  const p = q.get("von") || q.get("utm_source");
  if (p) return p;
  let host = "";
  try { host = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, "") : ""; } catch (e) { host = ""; }
  if (!host || host === location.hostname) return "direkt";
  const map = [[/instagram/, "instagram"], [/facebook|fb\./, "facebook"], [/tiktok/, "tiktok"], [/youtube|youtu\.be/, "youtube"], [/google\./, "google"], [/linktr\.ee/, "linktree"], [/saschpak\.de$/, "saschpak.de"], [/t\.co$|twitter|x\.com/, "x"]];
  const m = map.find(([re]) => re.test(host));
  return m ? m[1] : host;
}
const noTrack = () => { try { return !!localStorage.getItem("pc-notrack"); } catch (e) { return false; } };
let tracked = false;
function trackVisit() {
  if (tracked || S.preview) return;
  tracked = true;
  try { if (localStorage.getItem("pc-notrack")) return; } catch (e) { /* egal */ }
  S.src = visitSource();
  const device = (window.matchMedia && matchMedia("(max-width: 760px)").matches) || /Mobi|Android|iPhone/i.test(navigator.userAgent) ? "mobil" : "desktop";
  sb.rpc("track_visit", { p_source: S.src, p_device: device }).then(() => {}, () => {});
}

async function loadLanding() {
  const token = S.ui.wlToken || wlGet();
  const [st, me] = await Promise.all([
    sb.rpc("waitlist_stats"),
    token ? sb.rpc("waitlist_status", { p_token: token }) : Promise.resolve({ data: null })
  ]);
  S.wl = { stats: st.data || { waiting: 0, invited: 0 }, me: me.data || null, token: me.data ? token : null };
}

let stickyObs;
function setupSticky() {
  if (stickyObs) { stickyObs.disconnect(); stickyObs = null; }
  const bar = $("#stickyCta"), hero = $("#hero"), wl = $("#warteliste");
  if (!bar || !hero || !wl || !("IntersectionObserver" in window)) return;
  const vis = { hero: true, wl: false };
  stickyObs = new IntersectionObserver(es => {
    es.forEach(e => { vis[e.target === hero ? "hero" : "wl"] = e.isIntersecting; });
    const show = !vis.hero && !vis.wl;
    bar.classList.toggle("show", show); bar.setAttribute("aria-hidden", String(!show));
    const a = bar.querySelector("a"); if (a) a.tabIndex = show ? 0 : -1;
  }, { threshold: 0 });
  stickyObs.observe(hero); stickyObs.observe(wl);
}

function spotsInfo() {
  const st = (S.wl && S.wl.stats) || {}, n = CONFIG.waitlistSpots, taken = Math.min(n, st.invited || 0);
  return { n, taken, free: n - taken };
}
function spotsMeter() {
  const { n, taken, free } = spotsInfo();
  const st = (S.wl && S.wl.stats) || {}, ebN = ebActive() ? Math.min(n, st.early_bird_slots || 0) : 0;
  return `<div class="spots-box"><div class="spots" role="img" aria-label="Noch ${free} von ${n} Teilnehmerplätzen frei${ebN ? `, die ersten ${ebN} zum Early-Bird-Preis` : ""}" style="--n:${n}">
      ${ebN ? `<span class="eb-bracket" style="grid-column:1 / ${ebN + 1}">Early-Bird · ${esc(CONFIG.earlyBirdPriceHeadline)}/Monat</span>` : ""}
      ${Array.from({ length: n }, (_, i) => `<i class="${i < taken ? "taken" : i < ebN ? "eb" : ""}"></i>`).join("")}</div>
    <p class="spots-cap">${free > 0 ? `Noch <b>${free} von ${n}</b> Teilnehmerplätzen frei` : `Alle ${n} Teilnehmerplätze sind vergeben. Trag dich trotzdem ein, du rückst nach, wenn jemand abspringt.`}</p></div>`;
}

function roundText() {
  const st = (S.wl && S.wl.stats) || {};
  const n = CONFIG.waitlistSpots, free = Math.max(0, n - (st.invited || 0));
  let t = `Nur ${n} Teilnehmerplätze in der ersten Runde. ${esc(CONFIG.launchText)} Die Warteliste ist der erste Schritt: Ich melde mich in der Reihenfolge der Einträge für ein kostenloses Kennenlerngespräch.`;
  if (CONFIG.earlyBirdBonus && st.early_bird_slots != null && st.early_bird_left > 0)
    t += ` Die ersten ${st.early_bird_slots} Buchungen bekommen ${esc(CONFIG.earlyBirdBonus)} dazu.`;
  return t;
}
const ebActive = () => { const st = (S.wl && S.wl.stats) || {}; return !!(CONFIG.earlyBirdPriceHeadline && st.early_bird_slots != null && st.early_bird_left > 0); };
function inviteExtra(eb) {
  if (!eb || !ebText()) return "";
  return "Du gehörst zu den Early-Birds: Du zahlst " + ebText() + "." + (CONFIG.earlyBirdExtraSessions ? " " + CONFIG.earlyBirdExtraSessions + " zusätzliche 1:1-Session" + (CONFIG.earlyBirdExtraSessions > 1 ? "s sind" : " ist") + " schon in deinem Paket." : "");
}
function ebText() {
  const parts = [CONFIG.earlyBirdDeal, CONFIG.earlyBirdBonus && "plus " + CONFIG.earlyBirdBonus].filter(Boolean);
  return parts.join(" ");
}
function priceBlock() {
  const st = (S.wl && S.wl.stats) || {};
  if (ebActive()) return `<div class="price" style="margin-top:12px"><s>${esc(CONFIG.earlyBirdPriceWas)}</s>${esc(CONFIG.earlyBirdPriceHeadline)}<small>${esc(CONFIG.priceHeadlineNote || "").split(" · ").join("<br>")}</small></div>
      <p class="eb-line"><span class="eb-tag">Early-Bird</span><span>Für die ersten ${st.early_bird_slots} Buchungen: <b>${esc(CONFIG.earlyBirdDeal)}</b>. Noch ${st.early_bird_left} von ${st.early_bird_slots} frei.</span></p>
      ${CONFIG.priceDetail ? `<p class="price-sub">${esc(CONFIG.priceDetail)}</p>` : ""}`;
  return `<div class="price" style="margin-top:12px">ab ${esc(CONFIG.priceHeadline)}<small>${esc(CONFIG.priceHeadlineNote || "").split(" · ").join("<br>")}</small></div>${CONFIG.priceDetail ? `<p class="price-sub">${esc(CONFIG.priceDetail)}</p>` : ""}`;
}

function landingExtras() {
  const pv = S.preview;
  const pains = CONFIG.painPoints || [], faq = CONFIG.faq || [];
  let pts = CONFIG.aboutPoints || [], tst = CONFIG.testimonials || [];
  if (pv && !pts.length) pts = ["[Stichpunkt 1, z. B. wie lange du schon live spielst]", "[Stichpunkt 2, z. B. mit welchen Bands oder Artists]", "[Stichpunkt 3, z. B. wie viele Shows]"];
  if (pv && !tst.length) tst = [{ quote: "[Zitat einer Person, der du geholfen hast]", name: "[Vorname]", role: "[Instrument oder Band]" }, { quote: "[Zweites Zitat]", name: "[Vorname]", role: "[Instrument oder Band]" }];
  const hasAbout = CONFIG.videoUrl || CONFIG.photoUrl || pts.length;
  const media = pv && !CONFIG.videoUrl && !CONFIG.photoUrl ? `<div class="about-media ph">[Dein Video]</div>` : CONFIG.videoUrl
    ? `<video class="about-media" src="${esc(CONFIG.videoUrl)}" ${CONFIG.photoUrl ? `poster="${esc(CONFIG.photoUrl)}"` : ""} controls playsinline preload="metadata"></video>`
    : CONFIG.photoUrl ? `<img class="about-media" src="${esc(CONFIG.photoUrl)}" alt="${esc(CONFIG.aboutTitle || "")}">` : "";
  return {
    pain: pains.length ? `<section class="l-sec"><div class="l-inner">
      <h2 class="big">Kennst du das?</h2>
      <ul class="pains">${pains.map(t => `<li>${esc(t)}</li>`).join("")}</ul>
      <p class="pains-after">So muss es nicht sein. Ein gut gebautes Setup läuft jede Show gleich, und du kannst dich aufs Spielen konzentrieren.</p>
    </div></section>` : "",
    about: hasAbout ? `<section class="l-sec"><div class="l-inner"><div class="about${media ? "" : " no-media"}">
      ${media ? `<div>${media}</div>` : ""}
      <div><h2 class="big">${esc(CONFIG.aboutTitle || "Über mich")}</h2>${pts.length ? `<ul class="about-pts">${pts.map(t => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}</div>
    </div></div></section>` : "",
    voices: tst.length ? `<section class="l-sec alt"><div class="l-inner">
      <h2 class="big">Was andere sagen.</h2>
      <div class="voices">${tst.map(t => `<figure><blockquote>„${esc(t.quote)}“</blockquote><figcaption><b>${esc(t.name)}</b>${t.role ? ` · ${esc(t.role)}` : ""}</figcaption></figure>`).join("")}</div>
    </div></section>` : "",
    faq: faq.length ? `<section class="l-sec"><div class="l-inner">
      <h2 class="big">Häufige Fragen</h2>
      <div class="faq">${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</div>
    </div></section>` : ""
  };
}

function renderUnsub() {
  $("#bar").hidden = true;
  const u = S.ui.unsub, head = `<div class="logo" style="justify-content:center;font-size:20px"><span class="logo-mark" aria-hidden="true"><i style="height:40%"></i><i style="height:100%"></i><i style="height:65%"></i><i style="height:85%"></i></span>Playback Masterclass</div>`;
  const body = u.done === true ? `<h2>Du bist abgemeldet.</h2><p class="muted">Du bekommst keine Mails mehr zur Warteliste. Falls du es dir anders überlegst, trag dich einfach wieder ein.</p>`
    : u.done === false ? `<h2>Nichts zu tun</h2><p class="muted">Dieser Eintrag steht nicht (mehr) auf der Warteliste.</p>`
    : `<h2>Von der Warteliste abmelden?</h2><p class="muted">Dein Eintrag wird von der Warteliste genommen, und du bekommst keine Mails mehr dazu.</p><button class="btn primary" type="button" data-a="wlUnsub">Ja, abmelden</button>`;
  $("#app").innerHTML = `<div class="login-screen"><div class="login card">${head}${body}<div class="auth-links"><button type="button" data-a="goLanding">← Zur Startseite</button></div></div></div>`;
}

function renderLanding() {
  $("#bar").hidden = true;
  const giftFile = CONFIG.giftFile || (S.preview ? "#" : "");
  document.body.classList.add("is-landing");
  const w = S.wl || { stats: { waiting: 0, invited: 0 } }, me = w.me;
  let box;
  if (me && me.status === "waiting") box = `<div class="wl-status" id="wlBox">
      <div class="place"><b>Nr.\u00a0${me.position}</b><span>auf der Warteliste</span></div>
      ${me.early_bird && ebText() ? `<p class="eb-line"><span class="eb-tag">Early-Bird</span><span>Du zahlst ${esc(ebText())}.</span></p>`
        : ebActive() ? `<p class="eb-line"><span class="eb-tag">Early-Bird</span><span>Die ersten ${S.wl.stats.early_bird_slots} Buchungen zahlen ${esc(ebText())}. Gerade noch ${S.wl.stats.early_bird_left} frei.</span></p>` : ""}
      ${me.confirmed === false ? `<p class="confirm-hint"><b>Fast geschafft:</b> Ich habe dir eine Mail geschickt. Bitte bestätige deinen Eintrag über den Link darin. Nichts bekommen? Schau auch im Spam-Ordner nach.</p>` : ""}
      <p>Danke, ${esc(firstName(me.name))}! Als Nächstes sprechen wir kurz, unverbindlich und kostenlos, über dein Setup und schauen, ob das Coaching zu dir passt.</p>
      ${CONFIG.introCallUrl ? `<div class="actions"><a class="btn-ink" href="${esc(CONFIG.introCallUrl)}" target="_blank" rel="noopener">Termin fürs Kennenlerngespräch wählen</a></div><p class="muted" style="font-size:14px">Lieber später? Kein Problem, ich melde mich bei dir.</p>` : `<p class="muted">Ich melde mich in der Reihenfolge der Warteliste per Mail bei dir für einen Termin.</p>`}
      ${giftFile ? (me.confirmed === false ? `<div class="gift"><span class="eb-tag">Geschenk</span><span>${esc(CONFIG.giftTitle)}: Sobald du deinen Eintrag bestätigt hast, kannst du es hier herunterladen und bekommst es per Mail.</span></div>`
        : `<div class="gift"><span class="eb-tag">Geschenk</span><span>${esc(CONFIG.giftTitle)}</span><a class="btn small" href="${esc(giftFile)}" download>Herunterladen</a></div>`) : ""}
      <p class="muted" style="font-size:14px">Unter diesem Link siehst du jederzeit, auf welcher Nummer du stehst:</p>
      <div class="copyrow"><code id="placeUrl">${esc(placeLink(w.token))}</code><button class="btn-ink" type="button" data-a="copyPlace">Kopieren</button></div>
      <p class="muted" style="font-size:13px">Doch kein Interesse? <a href="#abmelden-${esc(w.token)}">Von der Warteliste abmelden</a></p></div>`;
  else if (me && me.status === "invited") box = `<div class="wl-status" id="wlBox"><p style="font-size:24px;font-weight:800;font-stretch:76%">Dein Teilnehmerplatz ist frei.</p><p class="muted">Registriere dich mit der E-Mail-Adresse, mit der du dich eingetragen hast.</p><button class="btn-ink" type="button" data-a="goAuth" data-v="register">Konto erstellen</button></div>`;
  else box = `<form class="wl-form" data-f="waitlist" id="wlBox" novalidate>
      <div class="form-grid">
        <div class="field"><label for="wlName">Name</label><input id="wlName" name="name" type="text" autocomplete="name" maxlength="100"></div>
        <div class="field"><label for="wlEmail">E-Mail</label><input id="wlEmail" name="email" type="email" autocomplete="email" maxlength="200"></div>
      </div>
      <div class="hp" aria-hidden="true"><label for="wlWebsite">Website</label><input id="wlWebsite" name="website" type="text" tabindex="-1" autocomplete="off"></div>
      <button class="btn-ink" type="submit">Kostenlos auf die Warteliste</button>
      <p class="form-note">Unverbindlich: Erst sprechen wir ${CONFIG.introCallMinutes || 20} Minuten über dein Setup, dann entscheidest du.${giftFile ? ` Als Dankeschön gibt’s ${esc(CONFIG.giftTitle.replace(/^Meine /, "meine "))}.` : ""}</p>
      <p class="consent-note">Mit dem Eintragen bist du einverstanden, dass ich deine Angaben speichere und dich per Mail über den Start informiere. Abmelden geht jederzeit.${CONFIG.datenschutzUrl ? ` <a href="${esc(CONFIG.datenschutzUrl)}" target="_blank" rel="noopener">Datenschutz</a>` : ""}</p>
    </form>`;
  const pk = CONFIG.packageItems || [], X = landingExtras();
  const signed = !!(me && me.status);
  const sp = spotsInfo();
  const round = `${sp.free > 0 ? `${sp.n} Teilnehmerplätze` : "Erste Runde ausgebucht"} · ${esc(CONFIG.launchText.replace(/^Die erste Runde startet /, "Start ").replace(/\.$/, ""))}`;
  const video = CONFIG.videoUrl ? `<video class="hero-video" src="${esc(CONFIG.videoUrl)}" ${CONFIG.photoUrl ? `poster="${esc(CONFIG.photoUrl)}"` : ""} controls playsinline preload="metadata"></video>` : "";
  const mods = CONFIG.courseModules || [], pts = CONFIG.aboutPoints || [];
  $("#app").innerHTML = `<div class="landing">
    ${S.preview ? `<div class="preview-banner">Vorschau: Platzhalter in eckigen Klammern siehst nur du unter diesem Link.</div>` : ""}
    ${signed ? "" : `<div class="sticky-cta" id="stickyCta" aria-hidden="true"><div class="sticky-inner"><span>${sp.free > 0 ? `${sp.n} Teilnehmerplätze ${esc(CONFIG.launchText.replace(/^Die erste Runde startet im /, "ab ").replace(/\.$/, ""))}` : "Warteliste offen"}</span><a class="btn-ink" href="#warteliste" data-a="toWaitlist" tabindex="-1">Kostenlos eintragen</a></div></div>`}
    <div class="l-nav"><span class="logo"><span class="logo-mark" aria-hidden="true"><i style="height:40%"></i><i style="height:100%"></i><i style="height:65%"></i><i style="height:85%"></i></span>Playback Masterclass</span><button class="lnk" type="button" data-a="goAuth" data-v="login">Anmelden</button></div>
    <section class="l-sec hero-sec" id="hero"><div class="l-inner"><div class="hero2${video ? "" : " no-video"}">
      <div class="hero-main">
        <span class="eyebrow">von Saschpak · ${esc(CONFIG.launchText.replace(/^Die erste Runde startet /, "Start ").replace(/\.$/, ""))}</span>
        <h1 class="hero">Playback, das auf der Bühne <em>einfach läuft.</em></h1>
        <p class="lead">Für Bands und Artists, die live mit Ableton spielen. In 4 Monaten bauen wir zusammen dein komplettes Set, mit meinen Templates und Workflows.</p>
        <div class="wl-box" id="warteliste">${box}</div>
      </div>
      ${video ? `<div class="hero-side">${video}</div>` : ""}
    </div></div></section>
    <section class="l-sec alt" id="kurs"><div class="l-inner"><div class="pack">
      <div><h2 class="big">Das bekommst du.</h2></div>
      <div>${pk.length ? `<ul class="incl">${pk.map(i => Array.isArray(i) ? `<li>${esc(i[0])}<span>${esc(i[1])}</span></li>` : `<li>${esc(i)}</li>`).join("")}</ul>` : ""}
        ${mods.length ? `<details class="mods-toggle"><summary>Alle ${mods.length} Kursmodule ansehen</summary>${CONFIG.courseIntro ? `<p class="muted" style="margin-top:12px">${esc(CONFIG.courseIntro)}</p>` : ""}<ol class="modules">${mods.map((m, i) => `<li><span class="mnum">${String(i + 1).padStart(2, "0")}</span><div><b>${esc(m[0])}</b><span>${esc(m[1])}</span></div></li>`).join("")}</ol>${CONFIG.courseFinale ? `<p class="finale">${esc(CONFIG.courseFinale)}</p>` : ""}</details>` : ""}
      </div>
    </div></div></section>
    ${CONFIG.priceHeadline ? `<section class="l-sec" id="paket"><div class="l-inner"><div class="pack">
      <div><span class="eyebrow">Erste Runde · ${sp.n} Teilnehmerplätze</span>${priceBlock()}</div>
      <div><h3 class="lsteps-h">So läuft es ab</h3><ol class="lsteps">
        <li><b>Eintragen</b><span>Kostenlos und unverbindlich.</span></li>
        <li><b>Kennenlerngespräch</b><span>${CONFIG.introCallMinutes || 20} Minuten über dein Setup und deine Shows. Ich melde mich in der Reihenfolge der Warteliste.</span></li>
        <li><b>Entscheiden</b><span>Erst wenn du zusagst, wird es verbindlich.</span></li>
      </ol></div>
    </div></div></section>` : ""}
    ${pts.length ? `<section class="l-sec alt"><div class="l-inner"><div class="about no-media"><div><h2 class="big">${esc(CONFIG.aboutTitle || "Über mich")}</h2><ul class="about-pts">${pts.map(t => `<li>${esc(t)}</li>`).join("")}</ul></div></div></div></section>` : ""}
    ${X.voices}
    ${X.faq}
    ${signed ? "" : `<section class="l-sec alt final-cta"><div class="l-inner"><h2 class="big">Bereit für deine nächste Show?</h2><p class="lead">Trag dich ein, und wir sprechen kostenlos über dein Setup.</p><div class="cta"><a class="btn-ink" href="#warteliste" data-a="toWaitlist">Kostenlos eintragen</a></div></div></section>`}
  </div>`;
  setupSticky();
}

/* ---------- Auth-Ansichten ---------- */
function renderAuth() {
  $("#bar").hidden = true;
  const v = S.ui.recovery ? "recovery" : S.authView;
  const head = `<div class="logo" style="justify-content:center;font-size:20px"><span class="logo-mark" aria-hidden="true"><i style="height:40%"></i><i style="height:100%"></i><i style="height:65%"></i><i style="height:85%"></i></span>Playback Masterclass</div>`;
  let body = "";
  if (v === "login") body = `<form class="login card" data-f="login" novalidate>${head}
      <div class="field"><label class="label" for="email">E-Mail</label><input id="email" name="email" type="email" autocomplete="email" required></div>
      <div class="field"><label class="label" for="pw">Passwort</label><input id="pw" name="pw" type="password" autocomplete="current-password" required></div>
      <button class="btn primary" type="submit">Anmelden</button>
      <div class="auth-links"><button type="button" data-a="authView" data-v="register">Konto erstellen</button><button type="button" data-a="authView" data-v="forgot">Passwort vergessen?</button></div>
      <div class="auth-links"><button type="button" data-a="goLanding">← Zur Startseite und Warteliste</button></div></form>`;
  if (v === "register") body = `<form class="login card" data-f="register" novalidate>${head}
      <p class="muted" style="font-size:14px">Registriere dich mit der E-Mail-Adresse, mit der dein Coach dich eingeladen hat. Noch keine Einladung? <button type="button" class="linkbtn" data-a="goLanding">Trag dich auf die Warteliste ein.</button></p>
      <div class="field"><label class="label" for="rname">Name</label><input id="rname" name="name" type="text" autocomplete="name" required></div>
      <div class="field"><label class="label" for="remail">E-Mail</label><input id="remail" name="email" type="email" autocomplete="email" required></div>
      <div class="field"><label class="label" for="rpw">Passwort (mindestens 8 Zeichen)</label><input id="rpw" name="pw" type="password" autocomplete="new-password" minlength="8" required></div>
      <button class="btn primary" type="submit">Konto erstellen</button>
      <div class="auth-links"><button type="button" data-a="authView" data-v="login">Ich habe schon ein Konto</button></div></form>`;
  if (v === "forgot") body = `<form class="login card" data-f="forgot" novalidate>${head}
      <p class="muted" style="font-size:14px">Gib deine E-Mail-Adresse ein. Wir schicken dir einen Link, mit dem du ein neues Passwort setzt.</p>
      <div class="field"><label class="label" for="femail">E-Mail</label><input id="femail" name="email" type="email" autocomplete="email" required></div>
      <button class="btn primary" type="submit">Link senden</button>
      <div class="auth-links"><button type="button" data-a="authView" data-v="login">Zurück zur Anmeldung</button></div></form>`;
  if (v === "recovery") body = `<form class="login card" data-f="recovery" novalidate>${head}
      <p class="muted" style="font-size:14px">Wähle ein neues Passwort.</p>
      <div class="field"><label class="label" for="npw">Neues Passwort (mindestens 8 Zeichen)</label><input id="npw" name="pw" type="password" autocomplete="new-password" minlength="8" required></div>
      <button class="btn primary" type="submit">Passwort speichern</button></form>`;
  if (v === "sent") body = `<div class="login card">${head}<h2>Schau in dein Postfach</h2><p class="muted">${esc(S.ui.msg.sent || "")}</p>
      <div class="auth-links"><button type="button" data-a="authView" data-v="login">Zur Anmeldung</button></div></div>`;
  $("#app").innerHTML = `<div class="login-screen">${body}</div>`;
}

/* ---------- Fuß ---------- */
function renderFoot() {
  const links = [[CONFIG.impressumUrl, "Impressum"], [CONFIG.datenschutzUrl, "Datenschutz"]].filter(x => x[0]);
  $("#foot").innerHTML = links.length ? links.map(([u, t]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${t}</a>`).join("") : "";
}

/* ---------- Kopf und Navigation ---------- */
function renderChrome() {
  $("#bar").hidden = false;
  $("#adminLink").hidden = S.me.role !== "coach";
  document.querySelectorAll("#nav a").forEach(a => {
    if (a.getAttribute("href") === "#" + S.view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
}

function render() {
  renderFoot();
  document.body.classList.remove("is-landing");
  if (S.ui.recovery) return renderAuth();
  if (!S.session) return S.ui.unsub ? renderUnsub() : S.showAuth ? renderAuth() : renderLanding();
  if (!S.me) {
    $("#bar").hidden = true;
    $("#app").innerHTML = `<div class="login-screen"><div class="login card"><h2>Kein Zugang</h2><p class="muted">Zu diesem Konto gibt es kein Profil mehr. Wende dich bitte an deinen Coach.</p><button class="btn" type="button" data-a="logout">Abmelden</button></div></div>`;
    return;
  }
  if (!S.D) { $("#app").innerHTML = `<div class="loading">Lädt …</div>`; return; }
  if (S.view === "admin" && S.me.role !== "coach") S.view = "start";
  renderChrome();
  const v = { start: viewStart, kurs: viewKurs, sessions: viewSessions, news: viewNews, konto: viewKonto, admin: viewAdmin }[S.view] || viewStart;
  $("#app").innerHTML = v();
  afterRender();
}
function afterRender() { /* Platz für Fokus-Handling */ }

/* ---------- Schüler: Übersicht ---------- */
function viewStart() {
  const me = S.me, n = nextLessonFor(me), mods = modsSorted();
  const blocked = !me.course_access && me.role !== "coach";
  let resume;
  if (blocked) resume = `<p class="muted">Dein Coach schaltet den Kurs für dich frei.</p>`;
  else if (!n.lesson) resume = `<p class="muted">Hier erscheint die nächste Lektion, sobald der Kurs Inhalte hat.</p>`;
  else if (n.allDone) {
    const lockedIx = mods.findIndex(m => !openFor(me, m));
    resume = lockedIx >= 0
      ? `<div class="lock-note">${LOCK}<span>Du hast alle freigeschalteten Lektionen geschafft. Modul ${lockedIx + 1} „${esc(mods[lockedIx].title)}“: ${esc(access(me, mods[lockedIx]).long)}</span></div>`
      : `<p>Du hast den ganzen Kurs abgeschlossen. Stark!</p>`;
  } else {
    const l = n.lesson, m = modOf(l);
    resume = `<div class="resume"><button class="thumb" type="button" data-a="openLesson" data-id="${l.id}" aria-label="Lektion öffnen"><span class="play"><span class="tri"></span></span></button>
      <div style="display:flex;flex-direction:column;gap:6px;min-width:0"><span class="muted" style="font-size:13px">Modul ${modIndex(m) + 1} · ${esc(m.title)}</span><h2>${esc(l.title)}</h2>
      <span class="muted mono" style="font-size:12px">${mmss(l.duration_seconds)} min</span>
      <div style="margin-top:6px"><button class="btn primary" type="button" data-a="openLesson" data-id="${l.id}">Weiter ansehen</button></div></div></div>`;
  }
  const up = upcomingOf(me.id)[0];
  const next = up ? (() => { const t = fmtTs(up.starts_at), d = pd(t.date); return `<div class="date-row"><div class="cal"><span>${MON[d.getMonth()]}</span><b>${d.getDate()}</b></div><div><b>${esc(up.topic || "1:1")}</b><p class="muted" style="font-size:13px">${t.wd}, ${t.time} Uhr</p></div></div>`; })()
    : `<p class="muted">Du hast gerade kein 1:1 gebucht. Noch ${Math.max(0, leftFor(me))} von ${me.package_total} Sessions offen.</p>${CONFIG.calendlyUrl && leftFor(me) > 0 ? `<a class="btn primary" href="${esc(CONFIG.calendlyUrl)}" target="_blank" rel="noopener" style="margin-top:14px">1:1 buchen</a>` : ""}`;
  const last = sessionsOf(me.id)[0];
  const tasks = last ? last.session_tasks.filter(t => !t.done) : [];
  const nw = S.D.news[0];
  return `<section class="view">
    <div class="intro"><h1>Hey${me.full_name ? " " + esc(firstName(me.full_name)) : ""}</h1></div>
    <div class="card"><span class="label">Weiter im Kurs</span>${resume}${blocked ? "" : progressHTML(me)}</div>
    <div class="two">
      <div class="card"><span class="label">Nächstes 1:1</span><div>${next}</div></div>
      <div class="card"><span class="label">Deine Aufgaben</span><div class="tasks">${tasks.length ? tasks.map(taskHTML).join("") : `<p class="muted">Keine offenen Aufgaben.</p>`}</div></div>
    </div>
    ${nw ? `<a class="card" href="#news" style="text-decoration:none;color:inherit"><span class="label">Neu · ${fmt(nw.published_at)}</span><b>${esc(nw.title)}</b></a>` : ""}
  </section>`;
}
const taskHTML = t => `<div class="task"><input class="check" type="checkbox" id="t-${t.id}" data-task="${t.id}" ${t.done ? "checked" : ""}><label for="t-${t.id}">${esc(t.body)}</label></div>`;

/* ---------- Schüler: Kurs ---------- */
function viewKurs() {
  const me = S.me, mods = modsSorted();
  if (!me.course_access) return `<section class="view"><div class="intro"><h1>${esc(CONFIG.courseTitle)}</h1></div><p class="card muted">Der Videokurs ist für dich noch nicht freigeschaltet. Sprich deinen Coach an, wenn du Zugang möchtest.</p></section>`;
  if (!mods.length) return `<section class="view"><div class="intro"><h1>${esc(CONFIG.courseTitle)}</h1></div><p class="card muted">Der Kurs hat noch keine Inhalte.</p></section>`;
  const done = progressOf(me.id);
  let sel = S.ui.lesson && getLesson(S.ui.lesson);
  if (!sel || !openFor(me, modOf(sel))) { sel = nextLessonFor(me).lesson; S.ui.lesson = sel ? sel.id : null; }
  if (S.ui.viewMod == null || !mods.some(m => m.id === S.ui.viewMod)) S.ui.viewMod = sel ? sel.module_id : mods[0].id;
  const vm = mods.find(m => m.id === S.ui.viewMod), va = access(me, vm), vls = lessonsOf(vm);
  const modsHTML = mods.map((m, mi) => {
    const a = access(me, m), ls = lessonsOf(m), dn = ls.filter(l => done.has(l.id)).length;
    return `<button type="button" class="modbtn ${sel && sel.module_id === m.id ? "here" : ""} ${a.ok ? "" : "locked"}" data-a="viewMod" data-id="${m.id}" aria-pressed="${m.id === vm.id}">
      <span class="n"><span>Modul ${mi + 1}</span>${a.ok ? `<span class="mono">${dn}/${ls.length}</span>` : LOCK}</span><b>${esc(m.title)}</b>
      ${a.ok ? `<span class="track"><i style="width:${ls.length ? dn / ls.length * 100 : 0}%"></i></span>` : `<span class="why">${esc(a.why)}</span>`}</button>`;
  }).join("");
  const where = !va.ok ? `<span class="lock-note" style="display:inline-flex;padding:6px 10px;gap:8px">${LOCK}${esc(va.long)}</span>`
    : sel && sel.module_id === vm.id ? `Du bist bei Lektion ${vls.indexOf(sel) + 1} von ${vls.length}` : sel ? `Du bist gerade in Modul ${modIndex(modOf(sel)) + 1}` : "";
  const steps = vls.length ? vls.map((l, li) => {
    if (!va.ok) return `<button type="button" class="step" disabled><span class="st">${LOCK}</span><span class="tx"><b>${esc(l.title)}</b><span class="mono">${mmss(l.duration_seconds)} min</span></span></button>`;
    const act = sel && l.id === sel.id;
    return `<button type="button" class="step ${done.has(l.id) ? "done" : ""} ${act ? "active" : ""}" data-a="openLesson" data-id="${l.id}" ${act ? 'aria-current="step"' : ""}><span class="st">${done.has(l.id) ? "" : li + 1}</span><span class="tx"><b>${esc(l.title)}</b><span class="mono">${act ? "Aktuell · " : ""}${mmss(l.duration_seconds)} min</span></span></button>`;
  }).join("") : `<p class="empty">In diesem Modul gibt es noch keine Lektionen.</p>`;
  let lessonHTML = "";
  if (sel) {
    const isDone = done.has(sel.id), order = allLessons(), nx = order[order.indexOf(sel) + 1];
    const nxt = nx && openFor(me, modOf(nx)) ? nx : null;
    const files = S.D.files.filter(f => f.lesson_id === sel.id);
    const qs = S.D.questions.filter(q => q.user_id === me.id && q.lesson_id === sel.id);
    lessonHTML = `<div class="player">
      <div class="screen">${sel.video_id ? `<p class="soon">Das Video wird gerade angebunden und ist bald hier zu sehen.</p>` : `<p class="soon">Für diese Lektion gibt es noch kein Video.</p>`}</div>
      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="lesson-head"><span class="muted" style="font-size:13px">Modul ${modIndex(modOf(sel)) + 1} · ${esc(modOf(sel).title)}</span><h2>${esc(sel.title)}</h2></div>
        ${sel.points.length ? `<ul class="points">${sel.points.map(p => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
        <div class="actions"><button class="btn ${isDone ? "" : "primary"}" type="button" data-a="toggleDone" data-id="${sel.id}">${isDone ? "✓ Erledigt" : "Als erledigt markieren"}</button>${nxt ? `<button class="btn" type="button" data-a="openLesson" data-id="${nxt.id}">Nächste Lektion</button>` : ""}</div>
        ${files.length ? `<div class="files"><span class="label">Material zur Lektion</span>${files.map(f => `<div class="file"><span class="ext">${esc((f.file_name.split(".").pop() || "").slice(0, 4))}</span><button type="button" data-a="download" data-path="${esc(f.storage_path)}">${esc(f.file_name)}</button></div>`).join("")}</div>` : ""}
        <div class="qa"><span class="label">Fragen zu dieser Lektion</span>
          ${qs.map(q => `<div class="q"><span class="meta">Du am ${fmt(q.created_at)}</span><span>${esc(q.body)}</span>${q.answer ? `<span class="a">${esc(q.answer)}</span>` : `<span class="meta">Wartet auf Antwort von deinem Coach.</span>`}</div>`).join("")}
          <form data-f="question" data-lesson="${sel.id}" novalidate style="display:flex;flex-direction:column;gap:10px">
            <div class="field"><label class="label" for="qText">Frage an deinen Coach</label><textarea id="qText" name="body" placeholder="Was ist dir bei dieser Lektion unklar?"></textarea></div>
            <div class="actions"><button class="btn" type="submit">Frage senden</button></div>
          </form>
        </div>
      </div></div>`;
  }
  return `<section class="view">
    <div class="intro"><h1>${esc(CONFIG.courseTitle)}</h1><div style="max-width:420px">${progressHTML(me)}</div></div>
    <div class="course">
      <div class="mods" role="group" aria-label="Module">${modsHTML}</div>
      <div class="where"><h2>Modul ${modIndex(vm) + 1}: ${esc(vm.title)}</h2><span class="muted" style="font-size:13px">${where}</span></div>
      <div class="steps">${steps}</div>
      ${lessonHTML}
    </div></section>`;
}

/* ---------- Schüler: 1:1s ---------- */
function viewSessions() {
  const me = S.me, l = leftFor(me), up = upcomingOf(me.id), past = sessionsOf(me.id);
  return `<section class="view">
    <div class="intro"><h1>1:1s</h1><p class="muted">Nach jeder Session findest du hier Notizen und Aufgaben.</p></div>
    <div class="card"><div class="book-head"><h2>1:1 buchen</h2><span class="muted">Noch <b>${Math.max(0, l)}</b> von ${me.package_total} Sessions in deinem Paket</span></div>
      ${l <= 0 ? `<p class="muted">Dein Paket ist aufgebraucht. Sprich deinen Coach an, wenn du weitere Sessions möchtest.</p>`
        : CONFIG.calendlyUrl ? `<div><a class="btn primary" href="${esc(CONFIG.calendlyUrl)}" target="_blank" rel="noopener">Termin auswählen</a></div>`
        : `<p class="muted">Termine machst du direkt mit deinem Coach aus. Die Online-Buchung kommt bald.</p>`}
    </div>
    ${up.length ? `<span class="label group-label">Geplant</span>${up.map(b => { const t = fmtTs(b.starts_at); return `<article class="card session"><div class="session-meta"><b class="mono">${fmt(t.date)}</b><span class="muted" style="font-size:13px">${t.wd}, ${t.time} Uhr</span><span class="label" style="color:var(--accent-hi)">Gebucht</span></div><h3>${esc(b.topic || "1:1")}</h3></article>`; }).join("")}` : ""}
    <span class="label group-label">Vergangene Sessions</span>
    ${past.length ? past.map(s => `<article class="card session"><div class="session-meta"><b class="mono">${fmt(s.held_on)}</b><span class="muted" style="font-size:13px">${WD[pd(s.held_on).getDay()]}</span></div>
      <h3>${esc(s.topic)}</h3>${s.notes ? `<p class="note" style="white-space:pre-line">${esc(s.notes)}</p>` : ""}
      ${s.session_tasks.length ? `<div class="tasks">${s.session_tasks.map(taskHTML).join("")}</div>` : ""}</article>`).join("") : `<p class="empty">Noch keine Sessions.</p>`}
  </section>`;
}

/* ---------- Schüler: News ---------- */
function viewNews() {
  return `<section class="view"><div class="intro"><h1>News</h1></div>
    ${S.D.news.length ? S.D.news.map(n => `<article class="card news"><span class="label">${fmt(n.published_at)}</span><h3>${esc(n.title)}</h3><p style="white-space:pre-line">${esc(n.body)}</p></article>`).join("") : `<p class="empty">Noch keine News.</p>`}
  </section>`;
}

/* ---------- Konto ---------- */
function viewKonto() {
  const me = S.me;
  return `<section class="view"><div class="intro"><h1>Mein Konto</h1><p class="muted">${esc(me.email)}</p></div>
    <form class="card" data-f="myName" novalidate><h2>Name</h2>
      <div class="field"><label class="label" for="myName">So spricht dich die Plattform an</label><input id="myName" name="name" type="text" autocomplete="name" value="${esc(me.full_name)}"></div>
      <div class="actions"><button class="btn" type="submit">Speichern</button></div></form>
    <form class="card" data-f="myPw" novalidate><h2>Passwort ändern</h2>
      <div class="field"><label class="label" for="myPw">Neues Passwort (mindestens 8 Zeichen)</label><input id="myPw" name="pw" type="password" autocomplete="new-password" minlength="8"></div>
      <div class="field"><label class="label" for="myPw2">Neues Passwort wiederholen</label><input id="myPw2" name="pw2" type="password" autocomplete="new-password" minlength="8"></div>
      <div class="actions"><button class="btn" type="submit">Passwort ändern</button></div></form>
    <div class="card"><h2>E-Mail-Adresse oder Konto löschen</h2><p class="muted" style="font-size:14px">Wenn du deine E-Mail-Adresse ändern oder dein Konto löschen möchtest, schreib bitte deinem Coach.</p></div>
  </section>`;
}

/* ---------- Admin ---------- */
const students = () => S.D.profiles.filter(p => p.role === "student");
function viewAdmin() {
  const openQ = S.D.questions.filter(q => !q.answer).length;
  const wlN = (S.D.waitlist || []).filter(w => w.status === "waiting").length;
  const tabs = [["home", "Übersicht"], ["warteliste", "Warteliste" + (wlN ? `<span class="count">${wlN}</span>` : "")], ["stats", "Statistik"], ["users", "Schüler"], ["kurs", "Kurs"], ["fragen", "Fragen" + (openQ ? `<span class="count">${openQ}</span>` : "")], ["news", "News"]];
  const body = { home: adminHome, warteliste: adminWaitlist, stats: adminStats, users: adminUsers, kurs: adminKurs, fragen: adminFragen, news: adminNews }[S.ui.tab]();
  return `<section class="view">
    <div class="intro"><span class="label">Nur für dich als Coach sichtbar</span><h1>Admin</h1></div>
    <div class="tabs" role="tablist">${tabs.map(([k, t]) => `<button type="button" role="tab" data-a="tab" data-v="${k}" aria-selected="${S.ui.tab === k}">${t}</button>`).join("")}</div>
    ${body}</section>`;
}

function adminHome() {
  const st = students(), openQ = S.D.questions.filter(q => !q.answer);
  const up = S.D.bookings.filter(b => b.status === "booked" && new Date(b.starts_at) >= new Date());
  const week = up.filter(b => new Date(b.starts_at) <= new Date(Date.now() + 7 * 864e5));
  const todos = [];
  const wlW = (S.D.waitlist || []).filter(w => w.status === "waiting").length;
  if (wlW) todos.push({ kind: "Warteliste", text: `${wlW} ${wlW === 1 ? "Person wartet" : "Personen warten"} auf ein Kennenlerngespräch.`, a: `data-a="tab" data-v="warteliste"`, btn: "Ansehen" });
  openQ.forEach(q => todos.push({ kind: "Frage", text: `${esc(profileName(q.user_id))}: ${q.lesson_id && getLesson(q.lesson_id) ? "Lektion „" + esc(getLesson(q.lesson_id).title) + "“" : "Allgemeine Frage"}`, a: `data-a="tab" data-v="fragen"`, btn: "Beantworten" }));
  st.forEach(p => {
    const u = `data-a="openUser" data-id="${p.id}"`;
    if (!p.invited) todos.push({ kind: "Neu", text: `${esc(p.full_name || p.email)} hat sich ohne Einladung registriert.`, a: u, btn: "Ansehen" });
    else if (leftFor(p) <= 0 && p.package_total > 0) todos.push({ kind: "Paket", text: `${esc(p.full_name || p.email)} hat alle 1:1s genutzt. Neues Paket anbieten?`, a: u, btn: "Öffnen" });
    const ss = sessionsOf(p.id);
    if (p.invited && !upcomingOf(p.id).length && ss.length && ss[0].held_on < addDays(today(), -21) && leftFor(p) > 0) todos.push({ kind: "Kontakt", text: `${esc(p.full_name || p.email)} hatte seit ${fmt(ss[0].held_on)} kein 1:1.`, a: u, btn: "Öffnen" });
    if (p.course_access && p.invited && progressOf(p.id).size === 0 && p.started_at <= addDays(today(), -3) && allLessons().length) todos.push({ kind: "Kurs", text: `${esc(p.full_name || p.email)} hat noch keine Lektion abgeschlossen.`, a: u, btn: "Öffnen" });
    modsSorted().forEach((m, mi) => {
      if (mi === 0 || m.drip_type !== "manual" || !p.course_access || access(p, m).ok) return;
      const prev = lessonsOf(modsSorted()[mi - 1]), dn = progressOf(p.id);
      if (prev.length && prev.every(l => dn.has(l.id))) todos.push({ kind: "Freischalten", text: `${esc(p.full_name || p.email)} ist bereit für Modul ${mi + 1} „${esc(m.title)}“.`, a: u, btn: "Öffnen" });
    });
  });
  return `<div class="stats">${[[st.length, "Schüler"], [week.length, "Termine in 7 Tagen"], [openQ.length, "Offene Fragen"], [st.filter(p => p.invited).reduce((a, p) => a + Math.max(0, leftFor(p)), 0), "Offene 1:1s gesamt"]].map(([v, t]) => `<div class="stat"><b>${v}</b><span>${t}</span></div>`).join("")}</div>
    <div class="card"><h2>Zu erledigen</h2><div>${todos.length ? todos.map(t => `<div class="todo"><div class="what"><span class="kind">${t.kind}</span><span>${t.text}</span></div><button class="btn small" type="button" ${t.a}>${t.btn}</button></div>`).join("") : `<p class="empty">Alles erledigt.</p>`}</div></div>
    <div class="card"><h2>Nächste Termine</h2><div>${up.length ? up.map(b => { const t = fmtTs(b.starts_at); return `<div class="todo"><div class="what"><span class="kind mono" style="color:var(--fg)">${fmt(t.date)} ${t.time}</span><span><b>${esc(profileName(b.user_id))}</b>${b.topic ? " · " + esc(b.topic) : ""}</span></div><button class="btn small quiet" type="button" data-a="openUser" data-id="${b.user_id}">Schüler öffnen</button></div>`; }).join("") : `<p class="empty">Keine Termine gebucht.</p>`}</div></div>`;
}

function adminStats() {
  const range = S.ui.statRange || 30, days = [];
  for (let i = range - 1; i >= 0; i--) days.push(addDays(today(), -i));
  const first = days[0];
  const visits = (S.D.visits || []).filter(v => v.day >= first);
  const wl = (S.D.waitlist || []).filter(w => iso(new Date(w.created_at)) >= first);
  const perDay = days.map(d => ({ d, v: visits.filter(x => x.day === d).reduce((a, x) => a + x.views, 0), s: wl.filter(w => iso(new Date(w.created_at)) === d).length }));
  const totV = perDay.reduce((a, x) => a + x.v, 0), totS = wl.length;
  const mob = visits.filter(x => x.device === "mobil").reduce((a, x) => a + x.views, 0);
  const booked = (S.D.waitlist || []).filter(w => w.status === "invited").length;
  const pct = (a, b) => b ? (Math.round(a / b * 1000) / 10).toString().replace(".", ",") + " %" : "–";
  const srcs = {};
  visits.forEach(x => { (srcs[x.source] = srcs[x.source] || { v: 0, s: 0 }).v += x.views; });
  wl.forEach(w => { const k = w.source || "unbekannt"; (srcs[k] = srcs[k] || { v: 0, s: 0 }).s += 1; });
  const srcRows = Object.entries(srcs).sort((a, b) => b[1].v - a[1].v || b[1].s - a[1].s);
  // Säulendiagramm
  const W = 760, H = 220, pl = 36, pr = 8, pt = 12, pb = 26, cw = W - pl - pr, ch = H - pt - pb;
  const maxV = Math.max(1, ...perDay.map(x => x.v));
  const step = maxV <= 5 ? 1 : maxV <= 10 ? 2 : maxV <= 25 ? 5 : maxV <= 50 ? 10 : maxV <= 100 ? 20 : Math.pow(10, Math.floor(Math.log10(maxV))) * (maxV / Math.pow(10, Math.floor(Math.log10(maxV))) > 5 ? 2 : 1);
  const top = Math.ceil(maxV / step) * step, ticks = [];
  for (let t = 0; t <= top; t += step) ticks.push(t);
  const slot = cw / days.length, bw = Math.max(2, Math.min(24, slot - 2));
  const y = v => pt + ch - v / top * ch;
  const labelEvery = days.length <= 7 ? 1 : days.length <= 31 ? 7 : 14;
  const bars = perDay.map((x, i) => {
    const cx = pl + slot * i + slot / 2, h = x.v / top * ch, r = Math.min(4, bw / 2, h);
    const yTop = pt + ch - h, x0 = cx - bw / 2;
    const path = h > 0 ? `M${x0},${pt + ch} V${yTop + r} Q${x0},${yTop} ${x0 + r},${yTop} H${x0 + bw - r} Q${x0 + bw},${yTop} ${x0 + bw},${yTop + r} V${pt + ch} Z` : "";
    const tip = `${WD[pd(x.d).getDay()].slice(0, 2)}, ${fmt(x.d)} · ${x.v} ${x.v === 1 ? "Besuch" : "Besuche"} · ${x.s} ${x.s === 1 ? "Eintrag" : "Einträge"}`;
    return `<g class="bar" tabindex="0" data-tip="${esc(tip)}" aria-label="${esc(tip)}"><rect x="${pl + slot * i}" y="${pt}" width="${slot}" height="${ch}" fill="transparent"/>${path ? `<path d="${path}" fill="var(--btn)"/>` : ""}${(days.length - 1 - i) % labelEvery === 0 ? `<text x="${cx}" y="${H - 8}" text-anchor="middle">${fmt(x.d)}</text>` : ""}</g>`;
  }).join("");
  const grid = ticks.map(t => `<line x1="${pl}" x2="${W - pr}" y1="${y(t)}" y2="${y(t)}"/><text x="${pl - 8}" y="${y(t) + 4}" text-anchor="end">${t}</text>`).join("");
  const base = location.origin + location.pathname;
  return `<p class="live-note"><span class="live-dot" aria-hidden="true"></span>Live: aktualisiert sich alle 15 Sekunden</p><div class="tabs" role="tablist" aria-label="Zeitraum">${[[7, "7 Tage"], [30, "30 Tage"], [90, "90 Tage"]].map(([v, t]) => `<button type="button" data-a="statRange" data-v="${v}" aria-selected="${range === v}">${t}</button>`).join("")}</div>
    <div class="stats">${[[totV.toLocaleString("de-DE"), "Besuche"], [totS, "Einträge Warteliste"], [pct(totS, totV), "Eintragsquote"], [booked, "Buchungen gesamt"]].map(([v, t]) => `<div class="stat"><b>${v}</b><span>${t}</span></div>`).join("")}</div>
    <div class="card"><div class="book-head"><h2>Besuche pro Tag</h2><span class="muted" style="font-size:13px">${totV ? `${pct(mob, totV)} vom Handy` : ""}</span></div>
      ${totV ? `<div class="chart-wrap"><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Besuche pro Tag in den letzten ${range} Tagen">${grid}${bars}</svg><div class="chart-tip" id="chartTip" hidden></div></div>
      <details class="tbl"><summary>Als Tabelle anzeigen</summary><div class="table-wrap"><table><thead><tr><th>Tag</th><th>Besuche</th><th>Einträge</th></tr></thead><tbody>${perDay.slice().reverse().map(x => `<tr><td>${fmtY(x.d)}</td><td>${x.v}</td><td>${x.s}</td></tr>`).join("")}</tbody></table></div></details>`
      : `<p class="empty">Noch keine Besuche in diesem Zeitraum. Sobald jemand die Startseite öffnet, erscheint er hier. Deine eigenen Besuche als Coach werden auf diesem Gerät nicht mitgezählt.</p>`}
    </div>
    <div class="card"><h2>Woher kommen die Leute?</h2>
      ${srcRows.length ? `<div class="table-wrap" style="background:var(--bg)"><table><thead><tr><th>Quelle</th><th>Besuche</th><th>Einträge</th><th>Quote</th></tr></thead><tbody>${srcRows.map(([k, x]) => `<tr><td>${esc(k)}</td><td>${x.v}</td><td>${x.s}</td><td>${pct(x.s, x.v)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="empty">Noch keine Daten.</p>`}
      <p class="muted" style="font-size:14px">Damit du siehst, was funktioniert, häng an deine Links eine Quelle an. Instagram gibt die Herkunft oft nicht weiter.</p>
      <div class="src-links">${["story", "reel", "bio", "whatsapp"].map(k => `<div class="copyrow"><code>${esc(base)}?von=${k}</code><button class="btn small" type="button" data-a="copyText" data-t="${esc(base)}?von=${k}">Kopieren</button></div>`).join("")}</div>
    </div>
    <div class="card"><h2>Eigene Besuche</h2>
      <p class="muted" style="font-size:14px">${noTrack() ? "Dieses Gerät wird nicht mitgezählt. " : ""}Öffne diesen Link einmal auf jedem Gerät, mit dem du dir die Seite ansiehst. Danach zählen deine Besuche dort nicht mehr mit. Instagram und WhatsApp haben eigene Browser: Öffne den Link am besten auch dort einmal, zum Beispiel indem du ihn dir selbst schickst.</p>
      <div class="copyrow"><code>${esc(base)}#nicht-zaehlen</code><button class="btn small" type="button" data-a="copyText" data-t="${esc(base)}#nicht-zaehlen">Kopieren</button></div>
      <div class="actions" style="align-items:center">${confirmBtn("vsdirekt", "Nur „direkt“ zurücksetzen", `data-a="statReset" data-v="direkt"`)}${confirmBtn("vsall", "Alle Besuche zurücksetzen", `data-a="statReset" data-v=""`)}</div>
      <p class="muted" style="font-size:13px">Zurücksetzen löscht nur die gezählten Besuche. Die Warteliste bleibt unverändert.</p>
    </div>`;
}

function adminWaitlist() {
  const all = S.D.waitlist || [], waiting = all.filter(w => w.status === "waiting"), invited = all.filter(w => w.status === "invited"), removed = all.filter(w => w.status === "removed");
  const li = S.ui.lastInvite;
  const mail = li ? `mailto:${encodeURIComponent(li.email)}?subject=${encodeURIComponent("Dein Teilnehmerplatz in der Playback Masterclass")}&body=${encodeURIComponent("Hey " + firstName(li.name) + ",\n\ndein Teilnehmerplatz in der Playback Masterclass ist bestätigt! Registriere dich hier mit dieser E-Mail-Adresse:\n" + location.origin + "\n\nBis bald!")}` : "";
  const del = w => confirmBtn("wldel:" + w.id, "Löschen", `data-a="wlDelete" data-id="${w.id}"`);
  const editForm = w => `<form data-f="wlEdit" data-id="${w.id}" novalidate style="display:flex;flex-direction:column;gap:10px">
      <div class="form-grid"><div class="field"><label class="label" for="we-n-${w.id}">Name</label><input id="we-n-${w.id}" name="name" type="text" value="${esc(w.full_name)}"></div>
      <div class="field"><label class="label" for="we-e-${w.id}">E-Mail</label><input id="we-e-${w.id}" name="email" type="email" value="${esc(w.email)}"></div></div>
      <div class="field"><label class="label" for="we-t-${w.id}">Nachricht</label><textarea id="we-t-${w.id}" name="note">${esc(w.note)}</textarea></div>
      <label class="inline-check" for="we-b-${w.id}"><input class="check" id="we-b-${w.id}" name="eb" type="checkbox" ${w.early_bird ? "checked" : ""} style="margin:0">Early-Bird</label>
      <div class="actions"><button class="btn primary small" type="submit">Speichern</button><button class="btn quiet small" type="button" data-a="wlEditOpen" data-id="">Abbrechen</button></div></form>`;
  const row = (w, i) => `<article class="card" style="gap:8px"><div class="session-meta">${i != null ? `<b class="mono" style="font-size:18px">#${i + 1}</b>` : ""}<b>${esc(w.full_name)}</b>${w.early_bird ? '<span class="eb-tag">Early-Bird</span>' : ""}${w.status === "waiting" ? (w.confirmed_at ? '<span class="ok-tag">bestätigt</span>' : '<span class="muted-tag">unbestätigt</span>') : ""}<span class="muted" style="font-size:13px">${esc(w.email)} · seit ${fmt(w.created_at)}</span></div>
      ${S.ui.wlEdit === w.id ? editForm(w) : `${w.note ? `<p class="muted" style="white-space:pre-line">${esc(w.note)}</p>` : ""}
      <div class="actions" style="align-items:center">${w.status === "waiting" ? `<button class="btn primary small" type="button" data-a="wlInvite" data-id="${w.id}">Einladen</button>` : w.status === "removed" ? `<button class="btn small" type="button" data-a="wlRestore" data-id="${w.id}">Wieder aufnehmen</button>` : (S.D.profiles.some(p => p.email.toLowerCase() === w.email) ? `<span class="muted" style="font-size:13px">registriert</span>` : `<span class="muted" style="font-size:13px">noch nicht registriert</span>${S.D.mailReady ? `<button class="btn small" type="button" data-a="wlInviteMail" data-id="${w.id}">Einladung erneut senden</button>` : ""}`)}
        <button class="btn small" type="button" data-a="wlEditOpen" data-id="${w.id}">Bearbeiten</button>${del(w)}</div>`}</article>`;
  return `<div class="card"><div class="book-head"><h2>Warteliste</h2><span class="muted">${waiting.length} wartend · ${invited.length} eingeladen · ${CONFIG.waitlistSpots} Teilnehmerplätze in der ersten Runde${CONFIG.earlyBirdPriceHeadline ? ` · Early-Bird ${all.filter(w => w.early_bird).length} von ${S.D.ebSlots || 3} vergeben` : ""}</span></div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:14px"><label for="wlPack" class="muted">1:1s im Paket für neue Einladungen</label><input id="wlPack" type="number" min="0" max="100" value="${S.ui.wlPack == null ? 4 : S.ui.wlPack}" data-wlpack style="width:80px;font:inherit;color:var(--fg);background:var(--bg);border:1px solid var(--line-2);border-radius:var(--r);padding:6px 8px"></div>
      <div><button class="btn small" type="button" data-a="wlAddOpen">${S.ui.wlAdd ? "Formular schließen" : "Person hinzufügen"}</button></div>
      ${S.ui.wlAdd ? `<form data-f="wlAdd" novalidate style="display:flex;flex-direction:column;gap:10px">
        <div class="form-grid"><div class="field"><label class="label" for="wa-n">Name</label><input id="wa-n" name="name" type="text"></div>
        <div class="field"><label class="label" for="wa-e">E-Mail</label><input id="wa-e" name="email" type="email"></div></div>
        <div class="field"><label class="label" for="wa-t">Nachricht (optional)</label><textarea id="wa-t" name="note"></textarea></div>
        <p class="muted" style="font-size:13px">Die Person kommt ans Ende der Warteliste. Trag nur Leute ein, die zugestimmt haben, auf die Liste zu kommen.</p>
        <div class="actions"><button class="btn primary small" type="submit">Hinzufügen</button></div></form>` : ""}
      ${li ? `<div class="notice">${esc(li.name)} ist eingeladen.${li.early ? ` <b>Early-Bird:</b> ${esc(ebText())}${CONFIG.earlyBirdExtraSessions ? ` (${CONFIG.earlyBirdExtraSessions} zusätzliche 1:1-Session${CONFIG.earlyBirdExtraSessions > 1 ? "s sind" : " ist"} schon im Paket)` : ""}.` : ""} ${li.mailed ? "Die Einladungs-Mail ist raus." : `Schick jetzt noch die Einladung: <a href="${mail}">Einladungs-Mail schreiben</a>`}</div>` : ""}
    </div>
    ${wlMailCard(waiting)}
    ${waiting.length ? waiting.map((w, i) => row(w, i)).join("") : `<p class="empty">Gerade wartet niemand. Neue Einträge von der Startseite erscheinen hier.</p>`}
    ${invited.length ? `<span class="label group-label">Eingeladen</span>${invited.map(w => row(w)).join("")}` : ""}
    ${removed.length ? `<span class="label group-label">Von der Liste genommen</span>${removed.map(w => row(w)).join("")}` : ""}`;
}

const MAIL_KIND = { geschenk: "Geschenk", bestaetigung: "Bestätigung", coach_info: "Info an dich", einladung: "Einladung", rundmail: "Rundmail" };
function wlMailCard(waiting) {
  const ready = S.D.mailReady, unconf = waiting.filter(w => !w.confirmed_at).length, conf = waiting.length - unconf;
  const d = S.ui.wlMailDraft || { subject: "", body: "", only: true }, chk = S.ui.wlMailCheck;
  const log = S.D.mailLog || [];
  const st = m => m.status === "kein_schluessel" ? `<span class="muted-tag">nicht verschickt</span>` : m.status_code == null ? (m.error ? `<span class="err-tag" title="${esc(m.error)}">Fehler</span>` : `<span class="muted-tag">übergeben</span>`) : m.status_code < 300 ? `<span class="ok-tag">verschickt</span>` : `<span class="err-tag" title="${esc(m.error || "")}">Fehler ${m.status_code}</span>`;
  const form = chk ? `<div class="mail-check"><p>Diese Nachricht geht an <b>${chk.n} ${chk.n === 1 ? "Person" : "Personen"}</b>${chk.only ? " (nur bestätigte Einträge)" : ""}:</p>
        <p><b>${esc(chk.subject)}</b></p><p class="muted" style="white-space:pre-line">${esc(chk.body)}</p>
        <div class="actions"><button class="btn primary small" type="button" data-a="wlMailSend">Jetzt senden</button><button class="btn quiet small" type="button" data-a="wlMailBack">Zurück</button></div></div>`
    : `<form data-f="wlMail" novalidate style="display:flex;flex-direction:column;gap:10px">
        <div class="field"><label class="label" for="wm-s">Betreff</label><input id="wm-s" name="subject" type="text" maxlength="150" value="${esc(d.subject)}" placeholder="z. B. Neuigkeiten zum Start im Januar"></div>
        <div class="field"><label class="label" for="wm-b">Text</label><textarea id="wm-b" name="body" rows="7" placeholder="Hey {vorname}, …">${esc(d.body)}</textarea></div>
        <p class="muted" style="font-size:13px">Platzhalter: <code>{vorname}</code> und <code>{nr}</code> (Nummer auf der Warteliste). Unter jeder Mail stehen automatisch die aktuelle Nummer und ein Abmelde-Link.</p>
        <label class="inline-check" for="wm-o"><input class="check" id="wm-o" name="only" type="checkbox" ${d.only ? "checked" : ""} style="margin:0">Nur an bestätigte Einträge (${conf})</label>
        <div class="actions"><button class="btn primary small" type="submit">Weiter</button></div></form>`;
  return `<div class="card"><div class="book-head"><h2>Mails</h2>${ready === true ? `<span class="ok-tag">Mailversand aktiv</span>` : ""}</div>
    ${ready === false ? `<div class="notice">Der Mailversand ist noch nicht eingerichtet: In Supabase fehlt der Resend-Schlüssel. Bis dahin werden Mails nur protokolliert, nicht verschickt.</div>` : ready == null ? `<div class="notice">Mail-Funktionen sind noch nicht in der Datenbank. Sie kommen mit dem nächsten Update.</div>` : ""}
    <p class="muted" style="font-size:14px">Neue Einträge bekommen automatisch eine Mail zum Bestätigen mit ihrer Nummer, und du bekommst eine Info. Beim Klick auf „Einladen“ geht die Einladungs-Mail automatisch raus.</p>
    ${ready ? `<div class="actions" style="align-items:center">${unconf ? `<button class="btn small" type="button" data-a="wlResend">Bestätigung erneut senden (${unconf} offen)</button>` : `<span class="muted" style="font-size:13px">Alle Wartenden haben bestätigt.</span>`}
      <button class="btn small" type="button" data-a="wlMailOpen">${S.ui.wlMail ? "Nachricht schließen" : "Nachricht an die Warteliste"}</button></div>
      ${S.ui.wlMail ? form : ""}` : ""}
    ${log.length ? `<details class="tbl"><summary>Letzte Mails</summary><div class="table-wrap"><table><thead><tr><th>Wann</th><th>Art</th><th>An</th><th>Status</th></tr></thead><tbody>${log.map(m => `<tr><td>${fmt(m.created_at)}</td><td>${esc(MAIL_KIND[m.kind] || m.kind)}</td><td>${esc(m.to_email)}</td><td>${st(m)}</td></tr>`).join("")}</tbody></table></div></details>` : ""}
  </div>`;
}

function adminUsers() {
  if (S.ui.user) return adminUserDetail();
  const st = students();
  return `<div class="admin-head"><h2>Schüler</h2><button class="btn primary" type="button" data-a="toggleInvite">Schüler einladen</button></div>
    <form class="card" data-f="invite" ${S.ui.inviteOpen ? "" : "hidden"} novalidate>
      <h2>Schüler einladen</h2>
      <p class="muted" style="font-size:14px">Trag die E-Mail-Adresse ein. Schick dem Schüler danach den Link <b>${esc(location.origin)}</b>. Wer sich dort mit genau dieser Adresse registriert, bekommt automatisch Paket und Kurszugang.</p>
      <div class="form-grid">
        <div class="field"><label class="label" for="iName">Name</label><input id="iName" name="name" type="text"></div>
        <div class="field"><label class="label" for="iEmail">E-Mail</label><input id="iEmail" name="email" type="email" required></div>
        <div class="field"><label class="label" for="iPack">1:1s im Paket</label><input id="iPack" name="pack" type="number" min="0" max="100" value="4"></div>
        <div class="field"><span class="label">Videokurs</span><label class="inline-check" for="iCourse"><input class="check" id="iCourse" name="course" type="checkbox" checked style="margin:0">Zugang freischalten</label></div>
      </div>
      <div class="actions"><button class="btn primary" type="submit">Einladen</button><button class="btn quiet" type="button" data-a="toggleInvite">Abbrechen</button></div>
    </form>
    ${S.D.invites.length ? `<div class="card"><h2>Offene Einladungen</h2><p class="muted" style="font-size:14px">Diese Personen haben sich noch nicht registriert.</p>${S.D.invites.map(i => `<div class="todo"><div class="what"><span><b>${esc(i.full_name || i.email)}</b> · ${esc(i.email)} · ${i.package_total} 1:1s${i.course_access ? " · mit Kurs" : ""}</span></div>${confirmBtn("inv:" + i.email, "Zurückziehen", `data-a="delInvite" data-id="${esc(i.email)}"`)}</div>`).join("")}</div>` : ""}
    <div class="table-wrap"><table><thead><tr><th>Schüler</th><th>1:1s</th><th>Videokurs</th><th>Nächster Termin</th></tr></thead><tbody>
      ${st.length ? st.map(p => { const l = leftFor(p), pc = pctFor(p), nb = upcomingOf(p.id)[0];
        return `<tr data-a="openUser" data-id="${p.id}" tabindex="0"><td><b>${esc(p.full_name || "–")}</b><span class="sub">${esc(p.email)}${p.invited ? "" : " · nicht eingeladen"}</span></td>
          <td><span class="pill ${l <= 0 ? "zero" : ""}">${Math.max(0, l)} offen</span><span class="sub">${sessionsOf(p.id).length} von ${p.package_total} genutzt</span></td>
          <td>${p.course_access ? `<div class="pct-cell"><div class="track"><i style="width:${pc}%"></i></div><span class="mono" style="font-size:12.5px">${pc}%</span></div>` : `<span class="muted">Kein Zugang</span>`}</td>
          <td>${nb ? (() => { const t = fmtTs(nb.starts_at); return `${fmt(t.date)}, ${t.time} Uhr`; })() : `<span class="muted">Kein Termin</span>`}</td></tr>`; }).join("")
        : `<tr><td colspan="4" class="muted">Noch keine Schüler. Lade den ersten über „Schüler einladen“ ein.</td></tr>`}
    </tbody></table></div>`;
}

function confirmBtn(key, label, attrs) {
  return S.ui.confirm === key
    ? `<span class="actions" style="align-items:center"><span style="font-size:14px">Sicher?</span><button class="btn small" type="button" ${attrs}>Ja, ${esc(label.toLowerCase())}</button><button class="btn small quiet" type="button" data-a="confirm" data-k="">Abbrechen</button></span>`
    : `<button class="btn small quiet" type="button" data-a="confirm" data-k="${esc(key)}">${esc(label)}</button>`;
}

function adminUserDetail() {
  const p = S.D.profiles.find(x => x.id === S.ui.user);
  if (!p) { S.ui.user = null; return adminUsers(); }
  const ss = sessionsOf(p.id), up = upcomingOf(p.id), dn = progressOf(p.id);
  const mods = modsSorted();
  return `<button class="btn quiet small back" type="button" data-a="openUser" data-id="">← Alle Schüler</button>
    <div class="intro"><h1>${esc(p.full_name || p.email)}</h1><p class="muted">${esc(p.email)} · dabei seit ${fmtY(p.started_at)}</p></div>
    ${!p.invited ? `<div class="notice">Diese Person hat sich ohne Einladung registriert und hat deshalb keinen Zugang. <button class="btn small" type="button" data-a="grant" data-id="${p.id}" style="margin-left:8px">Als Schüler aufnehmen</button></div>` : ""}
    <div class="two">
      <div class="card"><span class="label">1:1-Paket</span>
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap"><div class="stepper"><button type="button" data-a="pack" data-d="-1" aria-label="Eine Session weniger">−</button><output>${p.package_total}</output><button type="button" data-a="pack" data-d="1" aria-label="Eine Session mehr">+</button></div><span class="muted" style="font-size:14px">Sessions im Paket</span></div>
        <div class="facts"><span><b>${ss.length}</b>genutzt</span><span><b>${up.length}</b>gebucht</span><span><b style="color:var(--accent-hi)">${Math.max(0, leftFor(p))}</b>offen</span></div>
      </div>
      <div class="card"><span class="label">Videokurs</span>
        <label class="inline-check" for="courseAcc"><input class="check" id="courseAcc" type="checkbox" data-access="${p.id}" ${p.course_access ? "checked" : ""} style="margin:0">Zugang freigeschaltet</label>
        ${p.course_access ? progressHTML(p) + `<div style="display:flex;flex-direction:column;gap:8px">${mods.map((m, mi) => { const ls = lessonsOf(m), d = ls.filter(l => dn.has(l.id)).length; return `<div class="mod-line"><span>${mi + 1}. ${esc(m.title)}</span><div class="track"><i style="width:${ls.length ? d / ls.length * 100 : 0}%"></i></div><span class="mono muted" style="font-size:12px;text-align:right">${d}/${ls.length}</span></div>`; }).join("")}</div>` : `<p class="muted">Kein Zugang zum Videokurs.</p>`}
      </div>
    </div>
    ${p.course_access && mods.length ? `<div class="card"><span class="label">Freischaltung der Module</span><div>${mods.map((m, mi) => { const a = access(p, m);
      return `<div class="unlock-row"><div><b>${mi + 1}. ${esc(m.title)}</b><div class="st ${a.ok ? "ok" : ""}">${a.ok ? "Frei" : LOCK + " Gesperrt"} · ${esc(a.why)}</div></div>
        ${a.manual ? `<button class="btn small quiet" type="button" data-a="relock" data-id="${m.id}">Wieder nach Regel</button>` : a.ok ? "" : `<button class="btn small" type="button" data-a="unlock" data-id="${m.id}">Jetzt freischalten</button>`}</div>`; }).join("")}</div></div>` : ""}
    <form class="card" data-f="session" novalidate>
      <h2>Session eintragen</h2>
      <p class="muted" style="font-size:14px">Nach einem 1:1: Notiz und Aufgaben eintragen. Der Schüler sieht beides sofort unter 1:1s. Die Session zählt als genutzt.</p>
      <div class="form-grid">
        <div class="field"><label class="label" for="nDate">Datum</label><input id="nDate" name="date" type="date" value="${today()}"></div>
        <div class="field"><label class="label" for="nTopic">Thema</label><input id="nTopic" name="topic" type="text" placeholder="z. B. Setlist in AbleSet"></div>
      </div>
      <div class="field"><label class="label" for="nNotes">Notiz</label><textarea id="nNotes" name="notes" placeholder="Was habt ihr gemacht, was läuft gut, was noch nicht?"></textarea></div>
      <div class="field"><label class="label" for="nHw">Aufgaben bis zum nächsten Mal (eine pro Zeile)</label><textarea id="nHw" name="tasks"></textarea></div>
      <div class="actions"><button class="btn primary" type="submit">Session speichern</button></div>
    </form>
    <form class="card" data-f="booking" novalidate>
      <h2>Termin eintragen</h2>
      <p class="muted" style="font-size:14px">Für Termine, die ihr direkt ausgemacht habt. Der Schüler sieht den Termin unter 1:1s. Nach dem Termin trägst du oben die Session ein und löschst den Termin.</p>
      <div class="form-grid">
        <div class="field"><label class="label" for="bDate">Datum</label><input id="bDate" name="date" type="date" value="${today()}"></div>
        <div class="field"><label class="label" for="bTime">Uhrzeit</label><input id="bTime" name="time" type="time" value="18:00"></div>
      </div>
      <div class="field"><label class="label" for="bTopic">Thema (optional)</label><input id="bTopic" name="topic" type="text"></div>
      <div class="actions"><button class="btn primary" type="submit">Termin eintragen</button></div>
    </form>
    <span class="label group-label">Sessions</span>
    ${up.map(b => { const t = fmtTs(b.starts_at); return `<article class="card session"><div class="session-meta"><b class="mono">${fmt(t.date)}</b><span class="muted" style="font-size:13px">${t.wd}, ${t.time} Uhr</span><span class="label" style="color:var(--accent-hi)">Gebucht</span><span style="margin-left:auto">${confirmBtn("book:" + b.id, "Termin löschen", `data-a="delBooking" data-id="${b.id}"`)}</span></div><h3>${esc(b.topic || "1:1")}</h3></article>`; }).join("")}
    ${ss.length ? ss.map(s => `<article class="card session"><div class="session-meta"><b class="mono">${fmtY(s.held_on)}</b><span style="margin-left:auto">${confirmBtn("ses:" + s.id, "Löschen", `data-a="delSession" data-id="${s.id}"`)}</span></div><h3>${esc(s.topic)}</h3>${s.notes ? `<p class="note" style="white-space:pre-line">${esc(s.notes)}</p>` : ""}${s.session_tasks.length ? `<ul class="points">${s.session_tasks.map(t => `<li>${t.done ? "✓ " : ""}${esc(t.body)}</li>`).join("")}</ul>` : ""}</article>`).join("") : `<p class="empty">Noch keine Sessions.</p>`}
    <form class="card" data-f="editUser" novalidate><h2>Name ändern</h2>
      <div class="field"><label class="label" for="euName">Name</label><input id="euName" name="name" type="text" value="${esc(p.full_name)}"></div>
      <div class="actions"><button class="btn" type="submit">Speichern</button></div></form>
    <div class="card"><h2>Schüler entfernen</h2>
      <p class="muted" style="font-size:14px">Entfernt Profil, Sessions, Notizen, Fragen und Fortschritt endgültig. Das Login-Konto löschst du danach in Supabase unter Authentication → Users.</p>
      <div>${S.ui.confirm === "user:" + p.id ? `<span class="actions" style="align-items:center"><span style="font-size:14px">${esc(p.full_name || p.email)} wirklich entfernen?</span><button class="btn danger-btn" type="button" data-a="delUser" data-id="${p.id}">Endgültig entfernen</button><button class="btn quiet" type="button" data-a="confirm" data-k="">Abbrechen</button></span>` : `<button class="btn danger-btn" type="button" data-a="confirm" data-k="user:${p.id}">Schüler entfernen</button>`}</div>
    </div>`;
}

function adminKurs() {
  const mods = modsSorted(), ed = S.ui.editLesson;
  let editor = "";
  if (ed) {
    const l = ed.id ? getLesson(ed.id) : null, files = l ? S.D.files.filter(f => f.lesson_id === l.id) : [];
    editor = `<form class="card" data-f="lesson" novalidate>
      <h2>${l ? "Lektion bearbeiten" : "Neue Lektion"}</h2>
      <div class="form-grid">
        <div class="field"><label class="label" for="leMod">Modul</label><select id="leMod" name="module">${mods.map((m, i) => `<option value="${m.id}" ${m.id === ed.module ? "selected" : ""}>${i + 1}. ${esc(m.title)}</option>`).join("")}</select></div>
        <div class="field"><label class="label" for="leDur">Dauer (Minuten:Sekunden)</label><input id="leDur" name="dur" type="text" placeholder="10:30" value="${l ? mmss(l.duration_seconds) : ""}"></div>
      </div>
      <div class="field"><label class="label" for="leName">Titel</label><input id="leName" name="title" type="text" value="${l ? esc(l.title) : ""}"></div>
      <div class="field"><label class="label" for="leVideo">Video-ID bei Bunny Stream (optional)</label><input id="leVideo" name="video" type="text" value="${l ? esc(l.video_id || "") : ""}" placeholder="Kommt mit der Video-Anbindung"></div>
      <div class="field"><label class="label" for="lePts">Inhalte (einer pro Zeile)</label><textarea id="lePts" name="points">${l ? esc(l.points.join("\n")) : ""}</textarea></div>
      <div class="actions"><button class="btn primary" type="submit">Speichern</button><button class="btn quiet" type="button" data-a="editLesson" data-id="">Schließen</button></div>
      ${l ? `<div class="files"><span class="label">Material zum Download</span>
        ${files.map(f => `<div class="file-row"><span>${esc(f.file_name)}</span>${confirmBtn("file:" + f.id, "Entfernen", `data-a="delFile" data-id="${f.id}"`)}</div>`).join("") || `<p class="empty">Noch kein Material.</p>`}
        <label class="btn small" style="align-self:flex-start">Datei hochladen<input type="file" data-upload="${l.id}" hidden></label></div>` : `<p class="empty">Material kannst du hochladen, sobald die Lektion gespeichert ist.</p>`}
    </form>`;
  }
  const dripSel = m => `<span class="drip-inline">Freischaltung:
      <select data-drip="${m.id}" aria-label="Freischaltung für ${esc(m.title)}">${[["now", "Sofort"], ["days", "Nach Tagen ab Start"], ["sessions", "Nach Anzahl 1:1s"], ["manual", "Manuell durch mich"]].map(([v, t]) => `<option value="${v}" ${m.drip_type === v ? "selected" : ""}>${t}</option>`).join("")}</select>
      ${m.drip_type === "days" || m.drip_type === "sessions" ? `<input type="number" min="1" max="365" value="${m.drip_value || 1}" data-dripn="${m.id}" aria-label="${m.drip_type === "days" ? "Tage" : "Anzahl 1:1s"}"> ${m.drip_type === "days" ? "Tage" : "1:1s"}` : ""}</span>`;
  return `${editor}
    <div class="card">
      <div class="book-head"><h2>Inhalte</h2><button class="btn small" type="button" data-a="addModule">Modul hinzufügen</button></div>
      <p class="muted" style="font-size:14px">Bei jedem Modul legst du fest, wann es freigeschaltet wird. Tage zählen ab dem Start des Schülers, 1:1s ab dem Eintragen der Session.</p>
      <div>${mods.length ? mods.map((m, mi) => `<div class="mod-admin">
        <div class="mod-admin-head"><span class="label" style="min-width:64px">Modul ${mi + 1}</span><input data-mt="${m.id}" value="${esc(m.title)}" aria-label="Titel von Modul ${mi + 1}"><button class="btn small" type="button" data-a="newLesson" data-id="${m.id}">Lektion hinzufügen</button>${confirmBtn("mod:" + m.id, "Löschen", `data-a="delModule" data-id="${m.id}"`)}</div>
        ${dripSel(m)}
        ${lessonsOf(m).length ? lessonsOf(m).map((l, li) => { const fc = S.D.files.filter(f => f.lesson_id === l.id).length; return `<div class="les-row"><span class="num">${li + 1}</span><span>${esc(l.title)}</span><span class="info">${mmss(l.duration_seconds)} min${fc ? ` · ${fc} Datei${fc > 1 ? "en" : ""}` : ""}${l.video_id ? " · Video" : ""}</span>
          <div class="actions"><button class="btn small" type="button" data-a="editLesson" data-id="${l.id}">Bearbeiten</button>${confirmBtn("les:" + l.id, "Löschen", `data-a="delLesson" data-id="${l.id}"`)}</div></div>`; }).join("") : `<p class="empty">Noch keine Lektionen.</p>`}
      </div>`).join("") : `<p class="empty">Noch keine Module. Leg mit „Modul hinzufügen“ los.</p>`}</div>
    </div>`;
}

function adminFragen() {
  const qs = [...S.D.questions].sort((a, b) => (!!a.answer - !!b.answer) || b.created_at.localeCompare(a.created_at));
  return qs.length ? qs.map(q => `<article class="card" style="gap:10px"><div class="session-meta"><b>${esc(profileName(q.user_id))}</b><span class="muted" style="font-size:13px">${fmt(q.created_at)} · ${q.lesson_id && getLesson(q.lesson_id) ? "Lektion „" + esc(getLesson(q.lesson_id).title) + "“" : "Allgemeine Frage"}</span>${q.answer ? '<span class="label" style="color:var(--ok)">Beantwortet</span>' : '<span class="label" style="color:var(--accent-hi)">Offen</span>'}</div>
    <p style="white-space:pre-line">${esc(q.body)}</p>
    ${q.answer ? `<p class="note" style="white-space:pre-line">${esc(q.answer)}</p>` : `<form data-f="answer" data-id="${q.id}" novalidate style="display:flex;flex-direction:column;gap:10px"><div class="field"><label class="label" for="ans-${q.id}">Deine Antwort</label><textarea id="ans-${q.id}" name="answer"></textarea></div><div class="actions"><button class="btn primary small" type="submit">Antwort senden</button></div></form>`}</article>`).join("")
    : `<p class="empty">Noch keine Fragen.</p>`;
}

function adminNews() {
  const e = S.ui.editNews && S.D.news.find(n => n.id === S.ui.editNews);
  return `<form class="card" data-f="news" novalidate>
      <h2>${e ? "News bearbeiten" : "News schreiben"}</h2>
      <div class="field"><label class="label" for="nwTitle">Überschrift</label><input id="nwTitle" name="title" type="text" value="${e ? esc(e.title) : ""}"></div>
      <div class="field"><label class="label" for="nwText">Text</label><textarea id="nwText" name="body" style="min-height:120px">${e ? esc(e.body) : ""}</textarea></div>
      <div class="actions"><button class="btn primary" type="submit">${e ? "Änderungen speichern" : "Veröffentlichen"}</button>${e ? `<button class="btn quiet" type="button" data-a="editNews" data-id="">Abbrechen</button>` : ""}</div>
    </form>
    <span class="label group-label">Veröffentlicht</span>
    ${S.D.news.length ? S.D.news.map(n => `<article class="card news-admin"><span class="label">${fmtY(n.published_at)}</span><h3>${esc(n.title)}</h3><p>${esc(n.body)}</p>
      <div class="actions" style="align-items:center"><button class="btn small" type="button" data-a="editNews" data-id="${n.id}">Bearbeiten</button>${confirmBtn("news:" + n.id, "Löschen", `data-a="delNews" data-id="${n.id}"`)}</div></article>`).join("") : `<p class="empty">Noch keine News veröffentlicht.</p>`}`;
}

/* ---------- Aktionen ---------- */
const A = {
  authView: el => { S.authView = el.dataset.v; render(); },
  goAuth: el => { S.showAuth = true; S.authView = el.dataset.v || "login"; history.replaceState(null, "", location.pathname + "#login"); render(); window.scrollTo(0, 0); },
  goLanding: async () => { S.showAuth = false; S.ui.unsub = null; history.replaceState(null, "", location.pathname); await loadLanding(); render(); window.scrollTo(0, 0); },
  toKurs: () => { const el = $("#kurs") || $("#paket"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); },
  toPaket: () => { const el = $("#paket"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); },
  toWaitlist: () => { const el = $("#warteliste"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); const f = $("#wlName"); if (f) setTimeout(() => f.focus({ preventScroll: true }), 400); },
  statReset: async el => {
    let q = sb.from("visit_stats").delete();
    q = el.dataset.v ? q.eq("source", el.dataset.v) : q.gte("day", "2000-01-01");
    const r = await run(q, el.dataset.v ? "Besuche mit Quelle „direkt“ zurückgesetzt." : "Alle Besuche zurückgesetzt.");
    S.ui.confirm = null; if (r) reload(); else render();
  },
  statRange: el => { S.ui.statRange = +el.dataset.v; render(); },
  copyText: el => { const t = el.dataset.t; try { navigator.clipboard.writeText(t).then(() => toast("Link kopiert."), () => toast(t)); } catch (e) { toast(t); } },
  copyPlace: () => {
    const t = $("#placeUrl").textContent, ok = () => toast("Link kopiert.");
    const fail = () => { const r = document.createRange(); r.selectNodeContents($("#placeUrl")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast("Link markiert. Jetzt kopieren."); };
    try { navigator.clipboard.writeText(t).then(ok, fail); } catch (e) { fail(); }
  },
  logout: async () => { await sb.auth.signOut(); },
  tab: el => { S.ui.tab = el.dataset.v; S.ui.confirm = null; if (el.dataset.v !== "users") S.ui.user = null; render(); },
  confirm: el => { S.ui.confirm = el.dataset.k || null; render(); },
  viewMod: el => { S.ui.viewMod = el.dataset.id; render(); },
  openLesson: el => { const l = getLesson(el.dataset.id); if (!l) return; S.ui.lesson = l.id; S.ui.viewMod = l.module_id; if (S.view !== "kurs") location.hash = "kurs"; else render(); window.scrollTo(0, 0); },
  toggleDone: async el => {
    const id = el.dataset.id, done = progressOf(S.me.id).has(id);
    if (done) await run(sb.from("lesson_progress").delete().eq("user_id", S.me.id).eq("lesson_id", id));
    else await run(sb.from("lesson_progress").insert({ user_id: S.me.id, lesson_id: id }));
    reload();
  },
  download: async el => {
    const r = await run(sb.storage.from("lesson-files").createSignedUrl(el.dataset.path, 120, { download: true }));
    if (r && r.data) location.href = r.data.signedUrl;
  },
  openUser: el => { S.ui.tab = "users"; S.ui.user = el.dataset.id || null; S.ui.confirm = null; if (S.view !== "admin") location.hash = "admin"; else render(); window.scrollTo(0, 0); },
  toggleInvite: () => { S.ui.inviteOpen = !S.ui.inviteOpen; render(); },
  delInvite: async el => { await run(sb.from("invites").delete().eq("email", el.dataset.id), "Einladung zurückgezogen."); S.ui.confirm = null; reload(); },
  grant: async el => { await run(sb.from("profiles").update({ invited: true, course_access: true }).eq("id", el.dataset.id), "Aufgenommen. Stell jetzt noch das 1:1-Paket ein."); reload(); },
  pack: async el => {
    const p = S.D.profiles.find(x => x.id === S.ui.user), min = sessionsOf(p.id).length + upcomingOf(p.id).length;
    const v = Math.max(min, Math.min(100, p.package_total + (+el.dataset.d)));
    if (v === p.package_total) return toast("Weniger geht nicht: So viele Sessions sind schon genutzt oder gebucht.", true);
    await run(sb.from("profiles").update({ package_total: v }).eq("id", p.id)); reload();
  },
  unlock: async el => { await run(sb.from("module_unlocks").insert({ user_id: S.ui.user, module_id: el.dataset.id }), "Modul freigeschaltet."); reload(); },
  relock: async el => { await run(sb.from("module_unlocks").delete().eq("user_id", S.ui.user).eq("module_id", el.dataset.id)); reload(); },
  wlInvite: async el => {
    const w = S.D.waitlist.find(x => x.id === el.dataset.id);
    const ebSlots = S.D.ebSlots || 3, ebUsed = S.D.waitlist.filter(x => x.early_bird && x.id !== w.id).length;
    const giveEb = !!CONFIG.earlyBirdPriceHeadline && (w.early_bird || ebUsed < ebSlots);
    const pack = (S.ui.wlPack == null ? 4 : S.ui.wlPack) + (giveEb ? (CONFIG.earlyBirdExtraSessions || 0) : 0);
    if (!S.D.profiles.some(p => p.email.toLowerCase() === w.email)) {
      const r = await run(sb.from("invites").upsert({ email: w.email, full_name: w.full_name, package_total: pack, course_access: true }));
      if (!r) return;
    }
    const r2 = await run(sb.from("waitlist").update({ status: "invited", early_bird: giveEb }).eq("id", w.id));
    if (!r2) return reload();
    let mailed = false;
    if (S.D.mailReady) {
      const m = await sb.rpc("waitlist_send_invite", { p_id: w.id, p_extra: inviteExtra(giveEb) });
      mailed = !m.error && m.data > 0;
    }
    toast(w.full_name + (mailed ? " ist eingeladen. Die Einladungs-Mail ist raus." : " ist eingeladen."));
    S.ui.lastInvite = { name: w.full_name, email: w.email, early: giveEb, mailed };
    reload();
  },
  wlUnsub: async () => {
    const r = await run(sb.rpc("waitlist_unsubscribe", { p_token: S.ui.unsub.token }));
    if (!r) return;
    S.ui.unsub.done = !!r.data;
    if (r.data && wlGet() === S.ui.unsub.token) { try { localStorage.removeItem(WL_KEY); } catch (e) { /* egal */ } }
    render();
  },
  wlResend: async () => {
    const r = await run(sb.rpc("waitlist_resend_confirmations"));
    if (r) toast(r.data ? `${r.data} Bestätigungs-Mail${r.data === 1 ? "" : "s"} verschickt.` : "Alle Wartenden haben schon bestätigt.");
    S.ui.confirm = null; reload();
  },
  wlMailOpen: () => { S.ui.wlMail = !S.ui.wlMail; S.ui.wlMailCheck = null; render(); },
  wlMailBack: () => { S.ui.wlMailCheck = null; render(); },
  wlMailSend: async () => {
    const d = S.ui.wlMailCheck;
    const r = await run(sb.rpc("waitlist_broadcast", { p_subject: d.subject, p_body: d.body, p_only_confirmed: d.only }));
    if (!r) return;
    toast(`Nachricht an ${r.data} ${r.data === 1 ? "Person" : "Personen"} verschickt.`);
    S.ui.wlMail = false; S.ui.wlMailCheck = null; S.ui.wlMailDraft = null; reload();
  },
  wlInviteMail: async el => {
    const w = S.D.waitlist.find(x => x.id === el.dataset.id);
    const r = await run(sb.rpc("waitlist_send_invite", { p_id: w.id, p_extra: inviteExtra(w.early_bird) }), "Einladungs-Mail an " + w.full_name + " verschickt.");
    if (r) reload();
  },
  wlDelete: async el => {
    const r = await run(sb.from("waitlist").delete().eq("id", el.dataset.id), "Endgültig gelöscht.");
    S.ui.confirm = null; if (r && S.ui.wlEdit === el.dataset.id) S.ui.wlEdit = null; reload();
  },
  wlRestore: async el => { await run(sb.from("waitlist").update({ status: "waiting" }).eq("id", el.dataset.id), "Wieder auf der Warteliste."); reload(); },
  wlEditOpen: el => { S.ui.wlEdit = el.dataset.id || null; S.ui.confirm = null; render(); },
  wlAddOpen: () => { S.ui.wlAdd = !S.ui.wlAdd; render(); },
  delBooking: async el => { await run(sb.from("bookings").delete().eq("id", el.dataset.id), "Termin gelöscht."); S.ui.confirm = null; reload(); },
  delSession: async el => { await run(sb.from("sessions").delete().eq("id", el.dataset.id), "Session gelöscht."); S.ui.confirm = null; reload(); },
  delUser: async el => {
    const r = await run(sb.from("profiles").delete().eq("id", el.dataset.id), "Schüler entfernt. Das Login-Konto löschst du in Supabase unter Authentication → Users.");
    if (r) { S.ui.user = null; S.ui.confirm = null; } reload();
  },
  addModule: async () => {
    const pos = S.D.modules.reduce((a, m) => Math.max(a, m.position), 0) + 1;
    await run(sb.from("modules").insert({ title: "Neues Modul", position: pos, drip_type: "manual" }), "Modul angelegt. Gib ihm oben einen Namen.");
    reload();
  },
  delModule: async el => { await run(sb.from("modules").delete().eq("id", el.dataset.id), "Modul gelöscht."); S.ui.confirm = null; reload(); },
  newLesson: el => { S.ui.editLesson = { id: null, module: el.dataset.id }; render(); window.scrollTo(0, 0); },
  editLesson: el => { const l = el.dataset.id && getLesson(el.dataset.id); S.ui.editLesson = l ? { id: l.id, module: l.module_id } : null; render(); if (l) window.scrollTo(0, 0); },
  delLesson: async el => { await run(sb.from("lessons").delete().eq("id", el.dataset.id), "Lektion gelöscht."); S.ui.confirm = null; reload(); },
  delFile: async el => {
    const f = S.D.files.find(x => x.id === el.dataset.id);
    await run(sb.storage.from("lesson-files").remove([f.storage_path]));
    await run(sb.from("lesson_files").delete().eq("id", f.id), "Datei entfernt."); S.ui.confirm = null; reload();
  },
  editNews: el => { S.ui.editNews = el.dataset.id || null; render(); window.scrollTo(0, 0); },
  delNews: async el => { await run(sb.from("news").delete().eq("id", el.dataset.id), "News gelöscht."); S.ui.confirm = null; if (S.ui.editNews === el.dataset.id) S.ui.editNews = null; reload(); }
};

const F = {
  wlEdit: async f => {
    const name = f.name.value.trim(), email = f.email.value.trim().toLowerCase();
    if (!name) return toast("Bitte gib einen Namen ein.", true);
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast("Bitte gib eine gültige E-Mail-Adresse ein.", true);
    const r = await run(sb.from("waitlist").update({ full_name: name, email, note: f.note.value.trim(), early_bird: f.eb.checked }).eq("id", f.dataset.id), "Gespeichert.");
    if (r) { S.ui.wlEdit = null; reload(); }
  },
  wlAdd: async f => {
    const name = f.name.value.trim(), email = f.email.value.trim().toLowerCase();
    if (!name) return toast("Bitte gib einen Namen ein.", true);
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast("Bitte gib eine gültige E-Mail-Adresse ein.", true);
    if ((S.D.waitlist || []).some(w => w.email === email)) return toast("Diese E-Mail-Adresse steht schon auf der Warteliste.", true);
    const r = await run(sb.from("waitlist").insert({ full_name: name, email, note: f.note.value.trim() }), name + " steht jetzt auf der Warteliste.");
    if (r) { S.ui.wlAdd = false; reload(); }
  },
  wlMail: f => {
    const subject = f.subject.value.trim(), body = f.body.value.trim(), only = f.only.checked;
    S.ui.wlMailDraft = { subject, body, only };
    if (!subject || !body) return toast("Bitte Betreff und Text ausfüllen.", true);
    const n = (S.D.waitlist || []).filter(w => w.status === "waiting" && (!only || w.confirmed_at)).length;
    if (!n) return toast(only ? "Noch niemand hat bestätigt. Nimm das Häkchen raus oder schick erst die Bestätigungen." : "Gerade wartet niemand.", true);
    S.ui.wlMailCheck = { subject, body, only, n }; render();
  },
  waitlist: async f => {
    if (f.website.value) return; // Spam-Schutz
    const name = f.name.value.trim(), email = f.email.value.trim();
    if (!name) return toast("Bitte gib deinen Namen ein.", true);
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast("Bitte gib eine gültige E-Mail-Adresse ein.", true);
    const args = { p_name: name, p_email: email, p_note: f.note ? f.note.value.trim() : "" };
    let res = await sb.rpc("join_waitlist", { ...args, p_source: S.src || visitSource() });
    if (res.error && /PGRST202|Could not find the function/.test((res.error.code || "") + res.error.message)) res = await sb.rpc("join_waitlist", args);
    const r = await run(Promise.resolve(res));
    if (!r) return;
    const d = r.data;
    if (d.already) {
      toast(d.status === "waiting" ? "Diese E-Mail-Adresse steht schon auf der Warteliste, Nr. " + d.position + "." : d.status === "invited" ? "Du bist schon eingeladen! Registriere dich mit dieser E-Mail-Adresse." : "Diese E-Mail-Adresse steht nicht mehr auf der Warteliste. Schreib mir, wenn du wieder drauf möchtest.");
      return;
    }
    wlSet(d.token); S.ui.wlToken = d.token;
    await loadLanding(); render(); toast("Du bist Nr. " + d.position + " auf der Warteliste.");
    const box = $("#wlBox"); if (box) box.scrollIntoView({ behavior: "smooth", block: "center" });
  },
  myName: async f => {
    const name = f.name.value.trim();
    if (!name) return toast("Bitte gib einen Namen ein.", true);
    await run(sb.rpc("set_my_name", { p_name: name }), "Gespeichert."); reload();
  },
  myPw: async f => {
    const pw = f.pw.value, pw2 = f.pw2.value;
    if (pw.length < 8) return toast("Das Passwort muss mindestens 8 Zeichen haben.", true);
    if (pw !== pw2) return toast("Die beiden Passwörter stimmen nicht überein.", true);
    const r = await run(sb.auth.updateUser({ password: pw }), "Neues Passwort gespeichert.");
    if (r) f.reset();
  },
  booking: async f => {
    const date = f.date.value, time = f.time.value, topic = f.topic.value.trim();
    if (!date || !time) return toast("Bitte Datum und Uhrzeit angeben.", true);
    const p = S.D.profiles.find(x => x.id === S.ui.user);
    if (leftFor(p) <= 0) return toast("Das Paket ist aufgebraucht. Erhöhe zuerst die Zahl der Sessions.", true);
    const starts_at = new Date(date + "T" + time).toISOString();
    await run(sb.from("bookings").insert({ user_id: S.ui.user, starts_at, topic }), "Termin eingetragen."); reload();
  },
  login: async f => {
    const email = f.email.value.trim(), password = f.pw.value;
    if (!email || !password) return toast("Bitte E-Mail und Passwort eingeben.", true);
    await run(sb.auth.signInWithPassword({ email, password }));
  },
  register: async f => {
    const name = f.name.value.trim(), email = f.email.value.trim(), password = f.pw.value;
    if (!name) return toast("Bitte gib deinen Namen ein.", true);
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast("Bitte gib eine gültige E-Mail-Adresse ein.", true);
    if (password.length < 8) return toast("Das Passwort muss mindestens 8 Zeichen haben.", true);
    const r = await run(sb.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: location.origin + location.pathname } }));
    if (r && !(r.data && r.data.session)) { S.ui.msg.sent = "Wir haben dir eine E-Mail an " + email + " geschickt. Klick auf den Link darin, um dein Konto zu bestätigen. Danach kannst du dich anmelden."; S.authView = "sent"; render(); }
  },
  forgot: async f => {
    const email = f.email.value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast("Bitte gib eine gültige E-Mail-Adresse ein.", true);
    const r = await run(sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }));
    if (r) { S.ui.msg.sent = "Falls es ein Konto für " + email + " gibt, ist eine E-Mail mit einem Link zum Zurücksetzen unterwegs."; S.authView = "sent"; render(); }
  },
  recovery: async f => {
    const password = f.pw.value;
    if (password.length < 8) return toast("Das Passwort muss mindestens 8 Zeichen haben.", true);
    const r = await run(sb.auth.updateUser({ password }), "Neues Passwort gespeichert.");
    if (r) { S.ui.recovery = false; history.replaceState(null, "", location.pathname + "#start"); await reload(); }
  },
  question: async f => {
    const body = f.body.value.trim();
    if (!body) return f.body.focus();
    const r = await run(sb.from("questions").insert({ user_id: S.me.id, lesson_id: f.dataset.lesson, body }), "Frage gesendet. Die Antwort erscheint hier.");
    if (r) reload();
  },
  invite: async f => {
    const email = f.email.value.trim().toLowerCase(), pack = parseInt(f.pack.value, 10);
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast("Bitte gib eine gültige E-Mail-Adresse ein.", true);
    if (!(pack >= 0)) return toast("Bitte gib die Zahl der 1:1s an (0 oder mehr).", true);
    if (S.D.profiles.some(p => p.email.toLowerCase() === email)) return toast("Diese Person hat schon ein Konto. Du findest sie in der Liste.", true);
    const r = await run(sb.from("invites").insert({ email, full_name: f.name.value.trim(), package_total: pack, course_access: f.course.checked }),
      "Eingeladen. Schick " + email + " jetzt den Link " + location.origin + ".");
    if (r) { S.ui.inviteOpen = false; reload(); }
  },
  session: async f => {
    const held_on = f.date.value, topic = f.topic.value.trim(), notes = f.notes.value.trim(), tasks = lines(f.tasks.value);
    if (!held_on || !topic) return toast("Bitte Datum und Thema ausfüllen.", true);
    const r = await run(sb.from("sessions").insert({ user_id: S.ui.user, held_on, topic, notes }).select().single());
    if (!r) return;
    if (tasks.length) await run(sb.from("session_tasks").insert(tasks.map((body, i) => ({ session_id: r.data.id, body, position: i }))));
    toast("Session gespeichert."); reload();
  },
  editUser: async f => {
    const name = f.name.value.trim();
    if (!name) return toast("Bitte gib einen Namen ein.", true);
    await run(sb.from("profiles").update({ full_name: name }).eq("id", S.ui.user), "Gespeichert."); reload();
  },
  lesson: async f => {
    const title = f.title.value.trim(), dur = parseDur(f.dur.value), module_id = f.module.value;
    if (!title) return toast("Bitte gib einen Titel ein.", true);
    if (dur == null) return toast("Bitte gib die Dauer als Minuten:Sekunden ein, z. B. 10:30.", true);
    const row = { title, duration_seconds: dur, module_id, video_id: f.video.value.trim() || null, points: lines(f.points.value) };
    const ed = S.ui.editLesson;
    if (ed.id) {
      const old = getLesson(ed.id);
      if (old.module_id !== module_id) row.position = lessonsOf({ id: module_id }).reduce((a, l) => Math.max(a, l.position), 0) + 1;
      const r = await run(sb.from("lessons").update(row).eq("id", ed.id), "Gespeichert.");
      if (r) S.ui.editLesson = { id: ed.id, module: module_id };
    } else {
      row.position = lessonsOf({ id: module_id }).reduce((a, l) => Math.max(a, l.position), 0) + 1;
      const r = await run(sb.from("lessons").insert(row).select().single(), "Lektion angelegt. Jetzt kannst du Material hochladen.");
      if (r) S.ui.editLesson = { id: r.data.id, module: module_id };
    }
    reload();
  },
  answer: async f => {
    const answer = f.answer.value.trim();
    if (!answer) return f.answer.focus();
    await run(sb.from("questions").update({ answer, answered_at: new Date().toISOString() }).eq("id", f.dataset.id), "Antwort gesendet."); reload();
  },
  news: async f => {
    const title = f.title.value.trim(), body = f.body.value.trim();
    if (!title || !body) return toast("Bitte Überschrift und Text ausfüllen.", true);
    if (S.ui.editNews) await run(sb.from("news").update({ title, body }).eq("id", S.ui.editNews), "Änderungen gespeichert.");
    else await run(sb.from("news").insert({ title, body }), "Veröffentlicht.");
    S.ui.editNews = null; reload();
  }
};

/* ---------- Ereignisse ---------- */
document.addEventListener("click", e => {
  const el = e.target.closest("[data-a]");
  if (!el || el.disabled) return;
  const fn = A[el.dataset.a];
  if (fn) { e.preventDefault(); fn(el, e); }
});
function showTip(g) {
  const tip = $("#chartTip"), wrap = g && g.closest(".chart-wrap");
  if (!tip || !wrap) return;
  tip.textContent = g.dataset.tip; tip.hidden = false;
  const r = g.getBoundingClientRect(), w = wrap.getBoundingClientRect();
  const x = Math.min(Math.max(r.left + r.width / 2 - w.left, 80), w.width - 80);
  tip.style.left = x + "px"; tip.style.top = "0px";
  document.querySelectorAll(".chart .bar.on").forEach(b => b.classList.remove("on")); g.classList.add("on");
}
function hideTip() { const tip = $("#chartTip"); if (tip) tip.hidden = true; document.querySelectorAll(".chart .bar.on").forEach(b => b.classList.remove("on")); }
document.addEventListener("pointerover", e => { const g = e.target.closest && e.target.closest(".chart .bar"); if (g) showTip(g); });
document.addEventListener("pointerleave", e => { if (e.target.classList && e.target.classList.contains("chart")) hideTip(); }, true);
document.addEventListener("focusin", e => { const g = e.target.closest && e.target.closest(".chart .bar"); if (g) showTip(g); else hideTip(); });

document.addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  const tr = e.target.closest && e.target.closest("tr[data-a]");
  if (tr) A[tr.dataset.a](tr);
});
document.addEventListener("submit", async e => {
  const f = e.target.closest("form[data-f]");
  if (!f) return;
  e.preventDefault();
  const btn = f.querySelector('button[type="submit"]');
  if (btn) btn.disabled = true;
  try { await F[f.dataset.f](f); } finally { if (btn && document.contains(btn)) btn.disabled = false; }
});
document.addEventListener("change", async e => {
  const t = e.target;
  if (t.dataset.task) {
    const r = await run(sb.rpc("set_task_done", { p_task: t.dataset.task, p_done: t.checked }));
    if (r) reload(); else t.checked = !t.checked;
  } else if (t.dataset.wlpack != null) {
    const v = parseInt(t.value, 10); S.ui.wlPack = v >= 0 ? v : 4;
  } else if (t.dataset.access) {
    await run(sb.from("profiles").update({ course_access: t.checked }).eq("id", t.dataset.access)); reload();
  } else if (t.dataset.mt) {
    const v = t.value.trim(); if (!v) return;
    await run(sb.from("modules").update({ title: v }).eq("id", t.dataset.mt), "Gespeichert."); reload();
  } else if (t.dataset.drip) {
    const m = S.D.modules.find(x => x.id === t.dataset.drip), type = t.value;
    const drip_value = type === "days" ? (m.drip_value || 7) : type === "sessions" ? (m.drip_value || 1) : null;
    await run(sb.from("modules").update({ drip_type: type, drip_value }).eq("id", m.id), "Freischaltung gespeichert."); reload();
  } else if (t.dataset.dripn) {
    const v = parseInt(t.value, 10); if (!(v >= 1)) return toast("Bitte eine Zahl ab 1 eingeben.", true);
    await run(sb.from("modules").update({ drip_value: v }).eq("id", t.dataset.dripn), "Freischaltung gespeichert."); reload();
  } else if (t.dataset.upload && t.files && t.files[0]) {
    const file = t.files[0], lid = t.dataset.upload;
    if (file.size > 50 * 1024 * 1024) return toast("Die Datei ist größer als 50 MB.", true);
    const safe = file.name.replace(/[^\w.\-]+/g, "_"), path = lid + "/" + Date.now() + "-" + safe;
    toast("Lädt hoch …");
    const up = await run(sb.storage.from("lesson-files").upload(path, file, { upsert: false }));
    if (!up) return;
    await run(sb.from("lesson_files").insert({ lesson_id: lid, file_name: file.name, storage_path: path }), "Datei hochgeladen."); reload();
  }
});
$("#logout").addEventListener("click", () => A.logout());

/* ---------- Navigation ---------- */
const VIEWS = ["start", "kurs", "sessions", "news", "konto", "admin"];
function route() {
  const h = location.hash.replace("#", "");
  if (/access_token|error_description|type=/.test(h)) return;
  if (!S.session) {
    S.ui.unsub = null;
    const m = /^platz-([0-9a-f-]{36})$/.exec(h);
    if (m) { S.ui.wlToken = m[1]; wlSet(m[1]); S.showAuth = false; loadLanding().then(render); return; }
    const c = /^bestaetigen-([0-9a-f-]{36})$/.exec(h);
    if (c) {
      S.showAuth = false;
      sb.rpc("waitlist_confirm", { p_token: c[1] }).then(async res => {
        history.replaceState(null, "", location.pathname + "#platz-" + c[1]);
        if (res.data) { S.ui.wlToken = c[1]; wlSet(c[1]); }
        await loadLanding(); render();
        if (res.error) toast(errText(res.error), true);
        else if (!res.data) toast("Dieser Link ist nicht mehr gültig.", true);
        else { toast(res.data.status === "waiting" ? "Danke, dein Eintrag ist bestätigt. Du bist Nr. " + res.data.position + " auf der Warteliste." : "Danke, dein Eintrag ist bestätigt."); const box = $("#wlBox"); if (box) box.scrollIntoView({ block: "center" }); }
      });
      return;
    }
    const u = /^abmelden-([0-9a-f-]{36})$/.exec(h);
    if (u) { S.showAuth = false; S.ui.unsub = { token: u[1], done: null }; render(); return; }
    if (h === "nicht-zaehlen") {
      try { localStorage.setItem("pc-notrack", "1"); } catch (e) { /* egal */ }
      tracked = true; history.replaceState(null, "", location.pathname);
      loadLanding().then(() => { render(); toast("Erledigt: Deine Besuche auf diesem Gerät werden nicht mehr gezählt."); });
      return;
    }
    if (h === "registrieren") { S.showAuth = true; S.authView = "register"; render(); return; }
    S.showAuth = h === "login";
    if (h === "vorschau") S.preview = true;
    if (!S.showAuth) { trackVisit(); loadLanding().then(render); return; }
    render(); return;
  }
  S.view = VIEWS.includes(h) ? h : "start";
  S.ui.confirm = null;
  render(); window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);

/* ---------- Admin aktualisiert sich selbst ---------- */
let liveBusy = false;
const liveSig = () => { const D = S.D || {}; return JSON.stringify([D.visits, D.waitlist, D.questions, D.profiles, D.invites, D.mailLog]); };
async function liveRefresh() {
  if (liveBusy || document.hidden || !S.session || !S.me || S.me.role !== "coach" || S.view !== "admin" || !S.D) return;
  const ae = document.activeElement;
  if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return; // nicht beim Tippen stören
  if (S.ui.wlMail || S.ui.wlEdit || S.ui.wlAdd || S.ui.confirm || S.ui.editLesson || S.ui.editNews) return;
  liveBusy = true;
  try {
    const before = liveSig(), known = new Set((S.D.waitlist || []).map(w => w.id));
    await refreshMe(); if (!S.me) return;
    await load();
    if (liveSig() === before || S.view !== "admin") return;
    const fresh = (S.D.waitlist || []).filter(w => !known.has(w.id));
    const open = [...document.querySelectorAll("#app details")].map(d => d.open), y = window.scrollY;
    render();
    document.querySelectorAll("#app details").forEach((d, i) => { if (open[i]) d.open = true; });
    window.scrollTo(0, y);
    if (fresh.length) toast(fresh.length === 1 ? "Neu auf der Warteliste: " + fresh[0].full_name : fresh.length + " neue Einträge auf der Warteliste");
  } catch (e) { /* nächster Versuch beim nächsten Takt */ }
  finally { liveBusy = false; }
}
setInterval(liveRefresh, 15000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) liveRefresh(); });

/* ---------- Start ---------- */
sb.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") { S.ui.recovery = true; S.session = session; render(); return; }
  const had = S.session && S.session.user.id, now = session && session.user.id;
  S.session = session;
  if (!session) { S.me = null; S.D = null; S.authView = "login"; if (had) { S.showAuth = false; history.replaceState(null, "", location.pathname); route(); } return; }
  if (had !== now) {
    setTimeout(async () => {
      S.D = null; render();
      await reload();
      if (/access_token|type=/.test(location.hash)) history.replaceState(null, "", location.pathname + "#start");
      route();
    }, 0);
  }
});
(async () => {
  const { data } = await sb.auth.getSession();
  if (!data.session) { S.session = null; route(); }
})();
})();
