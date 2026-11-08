/* Playback Coaching – Schüleransicht und Admin-Bereich */
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
    const [pr, inv] = await Promise.all([q("profiles", "*", [["created_at"]]), q("invites", "*", [["created_at"]])]);
    if (pr.error) throw pr.error;
    if (inv.error) throw inv.error;
    D.profiles = pr.data; D.invites = inv.data;
  }
  S.D = D;
}
async function refreshMe() {
  const { data, error } = await sb.from("profiles").select("*").eq("id", S.session.user.id).maybeSingle();
  if (error) throw error;
  S.me = data;
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

/* ---------- Auth-Ansichten ---------- */
function renderAuth() {
  $("#bar").hidden = true;
  const v = S.ui.recovery ? "recovery" : S.authView;
  const head = `<div class="logo" style="justify-content:center;font-size:20px"><span class="logo-mark" aria-hidden="true"><i style="height:40%"></i><i style="height:100%"></i><i style="height:65%"></i><i style="height:85%"></i></span>PLAYBACK COACHING</div>`;
  let body = "";
  if (v === "login") body = `<form class="login card" data-f="login" novalidate>${head}
      <div class="field"><label class="label" for="email">E-Mail</label><input id="email" name="email" type="email" autocomplete="email" required></div>
      <div class="field"><label class="label" for="pw">Passwort</label><input id="pw" name="pw" type="password" autocomplete="current-password" required></div>
      <button class="btn primary" type="submit">Anmelden</button>
      <div class="auth-links"><button type="button" data-a="authView" data-v="register">Konto erstellen</button><button type="button" data-a="authView" data-v="forgot">Passwort vergessen?</button></div></form>`;
  if (v === "register") body = `<form class="login card" data-f="register" novalidate>${head}
      <p class="muted" style="font-size:14px">Registriere dich mit der E-Mail-Adresse, mit der dein Coach dich eingeladen hat.</p>
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

/* ---------- Kopf und Navigation ---------- */
function renderChrome() {
  $("#bar").hidden = false;
  $("#adminLink").hidden = S.me.role !== "coach";
  document.querySelectorAll("#nav a").forEach(a => {
    if (a.getAttribute("href") === "#" + S.view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
}

function render() {
  if (!S.session || S.ui.recovery) return renderAuth();
  if (!S.me) {
    $("#bar").hidden = true;
    $("#app").innerHTML = `<div class="login-screen"><div class="login card"><h2>Kein Zugang</h2><p class="muted">Zu diesem Konto gibt es kein Profil mehr. Wende dich bitte an deinen Coach.</p><button class="btn" type="button" data-a="logout">Abmelden</button></div></div>`;
    return;
  }
  if (!S.D) { $("#app").innerHTML = `<div class="loading">Lädt …</div>`; return; }
  if (S.view === "admin" && S.me.role !== "coach") S.view = "start";
  renderChrome();
  const v = { start: viewStart, kurs: viewKurs, sessions: viewSessions, news: viewNews, admin: viewAdmin }[S.view] || viewStart;
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

/* ---------- Admin ---------- */
const students = () => S.D.profiles.filter(p => p.role === "student");
function viewAdmin() {
  const openQ = S.D.questions.filter(q => !q.answer).length;
  const tabs = [["home", "Übersicht"], ["users", "Schüler"], ["kurs", "Kurs"], ["fragen", "Fragen" + (openQ ? `<span class="count">${openQ}</span>` : "")], ["news", "News"]];
  const body = { home: adminHome, users: adminUsers, kurs: adminKurs, fragen: adminFragen, news: adminNews }[S.ui.tab]();
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
    <span class="label group-label">Sessions</span>
    ${up.map(b => { const t = fmtTs(b.starts_at); return `<article class="card session"><div class="session-meta"><b class="mono">${fmt(t.date)}</b><span class="muted" style="font-size:13px">${t.time} Uhr</span><span class="label" style="color:var(--accent-hi)">Gebucht</span></div><h3>${esc(b.topic || "1:1")}</h3></article>`; }).join("")}
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
const VIEWS = ["start", "kurs", "sessions", "news", "admin"];
function route() {
  const h = location.hash.replace("#", "");
  if (/access_token|error_description|type=/.test(h)) return;
  S.view = VIEWS.includes(h) ? h : "start";
  S.ui.confirm = null;
  render(); window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);

/* ---------- Start ---------- */
sb.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") { S.ui.recovery = true; S.session = session; render(); return; }
  const had = S.session && S.session.user.id, now = session && session.user.id;
  S.session = session;
  if (!session) { S.me = null; S.D = null; S.authView = "login"; render(); return; }
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
  if (!data.session) { S.session = null; render(); }
})();
})();
