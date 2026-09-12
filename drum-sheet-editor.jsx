import React, { useState, useEffect, useRef, useMemo, useContext, createContext } from "react";
import { Plus, Music, Type, Trash2, AlertCircle, Upload, Volume2, Play, Pause, Repeat, ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from "lucide-react";

/* ============================================================
   DRUM SHEET EDITOR — A4 Karopapier
   ============================================================ */

const TRACKS = [
  { key: "hh", label: "HH",    abc: "^g", percmap: "%%percmap ^g closed-hi-hat x" },
  { key: "t1", label: "Tom 1", abc: "e",  percmap: "%%percmap e  hi-tom" },
  { key: "sn", label: "Snare", abc: "c",  percmap: "%%percmap c  acoustic-snare" },
  { key: "t3", label: "Tom 3", abc: "A",  percmap: "%%percmap A  low-floor-tom" },
  { key: "kk", label: "Kick",  abc: "F",  percmap: "%%percmap F  acoustic-bass-drum" },
];

function makeEmptyGrid(div = 8, measures = 1) {
  const cells = measures * div;
  const g = { measures, div };
  TRACKS.forEach(t => { g[t.key] = Array(cells).fill(0); });
  return g;
}

function makeDefaultGroove() {
  const g = makeEmptyGrid(8, 1);
  for (let i = 0; i < 8; i++) g.hh[i] = 1;
  g.kk[0] = 1; g.kk[4] = 1;
  g.sn[2] = 1; g.sn[6] = 1;
  return g;
}

// FIX: Math.round() verhindert Array[float]-Writes beim Resampling
function resampleGrid(g, newDiv, newMeasures = g.measures) {
  const oldDiv = g.div;
  const newCells = newMeasures * newDiv;
  const next = { measures: newMeasures, div: newDiv };
  for (const t of TRACKS) {
    const oldArr = g[t.key];
    const out = Array(newCells).fill(0);
    if (newDiv === oldDiv) {
      for (let i = 0; i < Math.min(oldArr.length, newCells); i++) out[i] = oldArr[i];
    } else if (newDiv > oldDiv) {
      const ratio = newDiv / oldDiv;
      for (let i = 0; i < oldArr.length; i++) {
        const idx = Math.round(i * ratio);
        if (idx < newCells) out[idx] = oldArr[i];
      }
    } else {
      const ratio = oldDiv / newDiv;
      for (let i = 0; i < newCells; i++) {
        const idx = Math.round(i * ratio);
        if (idx < oldArr.length) out[i] = oldArr[idx];
      }
    }
    next[t.key] = out;
  }
  return next;
}

function buildAbcBody(grid) {
  const slotsPerBeat = grid.div / 4;
  const L = grid.div === 16 ? "1/16" : "1/8";
  const measureStrings = [];
  for (let m = 0; m < grid.measures; m++) {
    const beatStrings = [];
    for (let b = 0; b < 4; b++) {
      const events = [];
      for (let i = 0; i < slotsPerBeat; i++) {
        const absIdx = m * grid.div + b * slotsPerBeat + i;
        const notes = [];
        for (const t of TRACKS) if (grid[t.key][absIdx]) notes.push(t.abc);
        if (notes.length > 0) {
          const token = notes.length === 1 ? notes[0] : "[" + notes.join("") + "]";
          events.push({ slot: i, token });
        }
      }
      if (events.length === 0) beatStrings.push("z" + slotsPerBeat);
      else {
        const parts = [];
        let cursor = 0;
        for (let i = 0; i < events.length; i++) {
          const ev = events[i];
          if (ev.slot > cursor) parts.push("z" + (ev.slot - cursor));
          const nextSlot = (i + 1 < events.length) ? events[i + 1].slot : slotsPerBeat;
          parts.push(ev.token + (nextSlot - ev.slot));
          cursor = nextSlot;
        }
        beatStrings.push(parts.join(""));
      }
    }
    measureStrings.push(beatStrings.join(" "));
  }
  return { body: measureStrings.join(" | "), L };
}

function gridToABC(grid) {
  const { body, L } = buildAbcBody(grid);
  const percmaps = TRACKS.map(t => t.percmap).join("\n");
  return `X:1\nM:4/4\nL:${L}\n%%stretchlast 0\nK:C clef=perc stafflines=0\n${percmaps}\nV:1 stem=up\n${body}\n`;
}

function newSection(label = "") {
  return { id: Math.random().toString(36).slice(2, 9), label, tokens: [] };
}
function newTextToken(value = "") {
  return { id: Math.random().toString(36).slice(2, 9), type: "text", value };
}
function newGrooveToken() {
  return { id: Math.random().toString(36).slice(2, 9), type: "groove", value: makeDefaultGroove() };
}

// Auto-Format:
//   "7"  → "| - 7 - |"  (erstes Token) / "- 7 - |"  (andere)
//   "x"  → Ganztaktpause ▬
//   '"'  → Wiederholungszeichen „ (wie-zuvor / ditto)
function autoFormatTokenValue(input, isFirst = false) {
  const trimmed = (input || "").trim();
  if (!trimmed) return input;

  if (/^x$/i.test(trimmed)) {
    return isFirst ? "| - ▬ - |" : "- ▬ - |";
  }

  // Ditto / „ist gleich": einfaches oder doppeltes Anführungszeichen
  if (/^["„]$/.test(trimmed) || trimmed === "\"") {
    return isFirst ? '| - " - |' : '- " - |';
  }

  if (/^\d+$/.test(trimmed)) {
    return isFirst ? `| - ${trimmed} - |` : `- ${trimmed} - |`;
  }

  return input;
}

// FIX: ABCJS-Loader als Modul-Singleton — verhindert Race Condition
let _abcjsPromise = null;
function loadAbcjs() {
  if (window.ABCJS) return Promise.resolve();
  if (_abcjsPromise) return _abcjsPromise;
  _abcjsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/abcjs/6.5.2/abcjs-basic-min.js";
    script.async = true;
    script.onload = () => (window.ABCJS ? resolve() : reject(new Error("ABCJS nicht gefunden")));
    script.onerror = () => reject(new Error("ABCJS-Script konnte nicht geladen werden"));
    document.head.appendChild(script);
  });
  return _abcjsPromise;
}

// =========================================================
// MAIN
// =========================================================
export default function DrumSheetEditor() {
  const [title, setTitle] = useState("");
  const [bpm, setBpm] = useState(100);

  const audioEngineRef = useRef(null);
  if (!audioEngineRef.current) audioEngineRef.current = new DrumAudioEngine();
  const [samplesVersion, setSamplesVersion] = useState(0);
  const bumpSamples = () => setSamplesVersion(v => v + 1);

  const [sections, setSections] = useState(() => [
    newSection(""), newSection(""), newSection(""), newSection(""),
    newSection(""), newSection(""), newSection(""), newSection(""),
  ]);

  function updateSection(id, patch) {
    setSections(s => s.map(sec => sec.id === id ? { ...sec, ...patch } : sec));
  }
  function updateToken(sectionId, tokenId, patch) {
    setSections(s => s.map(sec => {
      if (sec.id !== sectionId) return sec;
      return { ...sec, tokens: sec.tokens.map(t => t.id === tokenId ? { ...t, ...patch } : t) };
    }));
  }
  function addToken(sectionId, type) {
    const token = type === "groove" ? newGrooveToken() : newTextToken("");
    setSections(s => s.map(sec => {
      if (sec.id !== sectionId) return sec;
      return { ...sec, tokens: [...sec.tokens, token] };
    }));
  }
  function removeToken(sectionId, tokenId) {
    setSections(s => s.map(sec => {
      if (sec.id !== sectionId) return sec;
      const filtered = sec.tokens.filter(t => t.id !== tokenId);
      return { ...sec, tokens: reformatTokensByPosition(filtered) };
    }));
  }

  function reformatTokensByPosition(tokens) {
    return tokens.map((tok, idx) => {
      if (tok.type !== "text" || !tok.value) return tok;
      const isFirst = idx === 0;
      let v = tok.value.trim();
      v = v.replace(/^\|+\s*/, "");
      const newValue = isFirst ? `| ${v}` : v;
      if (newValue !== tok.value) return { ...tok, value: newValue };
      return tok;
    });
  }

  // FIX: direction (+1/-1) statt Index-Arithmetik
  function moveToken(sectionId, tokenId, direction) {
    setSections(s => s.map(sec => {
      if (sec.id !== sectionId) return sec;
      const oldIndex = sec.tokens.findIndex(t => t.id === tokenId);
      if (oldIndex === -1) return sec;
      const newIndex = oldIndex + direction;
      if (newIndex < 0 || newIndex >= sec.tokens.length) return sec;
      const tokens = [...sec.tokens];
      [tokens[oldIndex], tokens[newIndex]] = [tokens[newIndex], tokens[oldIndex]];
      return { ...sec, tokens: reformatTokensByPosition(tokens) };
    }));
  }

  // NEU: Abschnitte in der Reihenfolge verschieben
  function moveSection(sectionId, direction) {
    setSections(s => {
      const idx = s.findIndex(sec => sec.id === sectionId);
      if (idx === -1) return s;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= s.length) return s;
      const next = [...s];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
  }

  return (
    <AudioContext_.Provider value={{ engine: audioEngineRef.current, samplesVersion, bumpSamples, bpm }}>
    <div className="min-h-screen w-full py-6 px-3 sm:py-10 sm:px-4" style={{
      background: "#e9edf1",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Montserrat:wght@500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
        .mono { font-family: 'JetBrains Mono', ui-monospace, SF Mono, Menlo, monospace; }
        .display { font-family: 'Montserrat', 'Inter', sans-serif; }
        .graph-paper { background-color: #fff; }

        .section-row {
          display: flex; align-items: center;
          flex-wrap: nowrap; gap: 12px;
          height: 70px; margin-bottom: 32px;
        }

        /* Wrapper für section-box + Auf/Ab-Pfeile */
        .section-box-wrapper {
          position: relative;
          flex-shrink: 0;
          width: 150px; height: 70px;
        }
        .section-box {
          border: 2px solid #111; background: #fff;
          width: 150px; height: 70px;
          display: flex; align-items: center; justify-content: center;
        }
        .section-input {
          width: 100%; height: 100%;
          border: none; outline: none; background: transparent;
          font-family: 'Montserrat', 'Inter', sans-serif;
          font-size: 24px; font-weight: 700;
          letter-spacing: -0.01em; text-align: center;
          color: #111; padding: 0 6px;
        }

        /* Auf/Ab-Pfeile am Abschnitt — erscheinen beim Hover */
        .section-move-btns {
          position: absolute;
          top: 50%; transform: translateY(-50%);
          left: -28px;
          display: flex; flex-direction: column; gap: 3px;
          opacity: 0; transition: opacity .12s;
          z-index: 5;
        }
        .section-row:hover .section-move-btns { opacity: 1; }
        .section-move-btn {
          background: #fff; border: 1px solid #111;
          border-radius: 3px;
          width: 22px; height: 22px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #111; padding: 0;
          box-shadow: 0 1px 4px rgba(0,0,0,.12);
          transition: background .1s, color .1s;
        }
        .section-move-btn:hover:not(:disabled) { background: #111; color: #fff; }
        .section-move-btn:disabled { opacity: .25; cursor: not-allowed; }

        .tokens-row {
          display: flex; align-items: center;
          flex-wrap: nowrap; gap: 0;
          flex: 1; min-width: 0; height: 70px; overflow: hidden;
        }
        .add-btn-wrap { margin-left: 10px; flex-shrink: 0; padding-top: 20px; }

        .text-token {
          display: inline-flex; align-items: center; gap: 0;
          background: transparent; position: relative;
        }
        .text-token input {
          border: none; outline: none; background: transparent;
          font-family: 'JetBrains Mono', monospace;
          font-size: 22px; color: #111;
          padding: 4px 0; width: auto;
          border-bottom: 1px dotted #d6dde3;
        }
        .text-token input:focus { border-bottom-color: #111; }
        .text-token .x {
          position: absolute; top: -4px; right: -10px;
          opacity: 0; padding: 2px;
          background: #fff; border: 1px solid #ddd; border-radius: 3px;
          cursor: pointer; color: #888; display: flex; z-index: 5;
        }
        .text-token:hover .x { opacity: 1; }
        .text-token .x:hover { color: #d00; }

        .groove-token {
          display: inline-flex; align-items: center; gap: 0;
          background: transparent; border: 1px solid transparent;
          border-radius: 4px; padding: 0;
          transition: border-color .1s, background .1s;
          cursor: pointer; position: relative;
        }
        .groove-token:hover { border-color: #d6dde3; background: #fafcfd; }
        .groove-token.active { border-color: #111; background: #f7fafd; }
        .groove-preview {
          display: inline-block; padding: 0;
          overflow: hidden; position: relative; height: 90px;
        }
        .groove-preview svg { display: block; position: absolute; left: -34px; top: 8px; }
        .groove-preview .abcjs-clef, .groove-preview .abcjs-meter,
        .groove-preview .abcjs-meter-top, .groove-preview .abcjs-meter-bottom,
        .groove-preview .abcjs-time-signature, .groove-preview .abcjs-bar { display: none !important; }
        .remove-tiny {
          position: absolute; top: 2px; right: 2px; padding: 1px 3px;
          background: #fff; border: 1px solid #ddd; border-radius: 3px;
          cursor: pointer; color: #888; display: flex; align-items: center;
          opacity: 0; transition: opacity .1s; z-index: 3;
        }
        .groove-token:hover .remove-tiny { opacity: 0.9; }
        .remove-tiny:hover { color: #d00; opacity: 1; }

        .groove-expanded {
          position: absolute; top: 100%; left: 0;
          background: #fff; border: 1px solid #111; border-radius: 6px;
          padding: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.15);
          z-index: 50; margin-top: 6px;
          width: max-content; max-width: 90vw; overflow-x: auto;
        }
        .groove-expanded-wrapper { position: relative; display: inline-block; }
        .groove-with-repeats { display: inline-flex; align-items: center; gap: 4px; }
        .groove-repeat-bar {
          font-family: 'JetBrains Mono', monospace; font-size: 18px; font-weight: 700;
          color: #111; user-select: none; line-height: 1; letter-spacing: -2px;
          margin-top: -4px; padding: 2px 4px;
          background: rgba(220, 38, 38, 0.5); border-radius: 2px;
          box-decoration-break: clone; -webkit-box-decoration-break: clone;
        }
        .groove-repeat-bar.right { margin-right: 14px; }
        .groove-repeat-bar.left { margin-left: 2px; }
        .groove-side-bar {
          font-family: 'JetBrains Mono', monospace; font-size: 22px;
          color: #111; user-select: none; line-height: 1; margin-top: -4px; padding: 0 2px;
        }
        .groove-side-bar.right { margin-right: 8px; }

        .cell {
          border: 1px solid #d6dde3; background: #fff;
          width: 20px; height: 20px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; user-select: none; transition: background-color .08s;
        }
        .cell:hover { background: #f0f4f8; }
        .cell.beat-start { border-left: 2px solid #111; }
        .cell.measure-start { border-left: 2.5px solid #111; }
        .cell.active { background: #111; }
        .cell.active .dot { width: 6px; height: 6px; background: #fff; border-radius: 50%; }

        .cell-edit {
          border: 1px solid #d6dde3; background: #fff;
          width: 32px; height: 32px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; user-select: none; transition: background-color .08s;
        }
        .cell-edit:hover { background: #f0f4f8; }
        .cell-edit.beat-start { border-left: 2px solid #111; }
        .cell-edit.measure-start { border-left: 2.5px solid #111; }
        .cell-edit.active { background: #111; }
        .cell-edit.active .dot { width: 10px; height: 10px; background: #fff; border-radius: 50%; }
        .cell-edit.highlight { box-shadow: inset 0 0 0 2px #f59e0b; }
        .cell-edit.active.highlight { background: #f59e0b; }

        .gs-toolbar-btn {
          background: #fff; border: 1px solid #c5d1dd;
          border-radius: 3px; padding: 2px 7px;
          font-size: 11px; cursor: pointer;
          font-family: 'Inter', sans-serif; color: #5a6978; transition: all .1s;
        }
        .gs-toolbar-btn:hover { border-color: #111; color: #111; }
        .gs-toolbar-btn.active { background: #111; color: #fff; border-color: #111; }

        .add-btn {
          display: inline-flex; align-items: center; gap: 4px;
          background: transparent; border: 1px dashed #bcc8d4;
          border-radius: 4px; padding: 5px 10px;
          font-size: 13px; color: #5a6978; cursor: pointer;
          font-family: 'Inter', sans-serif;
        }
        .add-btn:hover { border-color: #111; color: #111; background: #f7fafd; }

        .token-with-arrows { display: inline-flex; align-items: center; position: relative; }
        .move-arrows-overlay {
          position: absolute; top: -8px; left: 50%; transform: translateX(-50%);
          display: flex; gap: 6px; z-index: 10; pointer-events: none;
        }
        .move-arrows-overlay .move-arrow { pointer-events: auto; }
        .move-arrow {
          background: #fff; border: 1px solid #111; border-radius: 50%;
          width: 26px; height: 26px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #111; padding: 0;
          box-shadow: 0 2px 6px rgba(0,0,0,0.15);
          transition: background .12s, color .12s, transform .08s;
        }
        .move-arrow:hover { background: #111; color: #fff; }
        .move-arrow:active { transform: scale(0.92); }

        .token-with-note {
          display: inline-flex; flex-direction: column;
          align-items: flex-start; position: relative;
        }
        .note-row {
          position: absolute; top: 0; left: 0; height: 18px;
          display: flex; align-items: center; padding-left: 4px;
          z-index: 2; white-space: nowrap;
        }
        .note-row-empty .note-add-trigger {
          opacity: 0; font-size: 10px; color: #aaa;
          background: #fff; border: 1px dashed transparent; border-radius: 3px;
          padding: 0 4px; cursor: pointer; font-family: 'Inter', sans-serif;
          transition: opacity .1s, border-color .1s, color .1s;
        }
        .token-with-note:hover .note-add-trigger { opacity: 1; }
        .note-add-trigger:hover { border-color: #aaa; color: #555; }
        .token-with-note > .text-token,
        .token-with-note > .groove-expanded-wrapper { margin-top: 20px; }

        .note-add-menu {
          display: flex; gap: 3px; align-items: center;
          background: #fff; border: 1px solid #111; border-radius: 4px;
          padding: 2px; box-shadow: 0 4px 12px rgba(0,0,0,.1);
        }
        .note-add-btn {
          font-size: 11px; background: transparent;
          border: 1px dashed transparent; border-radius: 3px;
          padding: 2px 6px; cursor: pointer;
          font-family: 'Inter', sans-serif;
          display: inline-flex; align-items: center; color: #333;
        }
        .note-add-btn:hover { background: #f7fafd; }
        .note-display {
          font-family: 'Inter', sans-serif; font-size: 12px; font-weight: 600;
          padding: 1px 6px; border: none; border-radius: 3px;
          cursor: pointer; line-height: 1.3; white-space: nowrap;
        }
        .note-edit { display: inline-flex; align-items: center; padding: 1px 4px; border-radius: 3px; }
        .note-edit input {
          font-family: 'Inter', sans-serif; font-size: 12px; font-weight: 600;
          background: transparent; border: none; outline: none;
          padding: 0 2px; min-width: 80px; color: inherit;
        }
        .note-yellow { background: #fde68a; color: #92400e; }
        .note-yellow input::placeholder { color: #b07209; }
        .note-red { background: #fecaca; color: #991b1b; }
        .note-red input::placeholder { color: #b04545; }

        .bpm-overlay {
          display: flex; align-items: center; gap: 4px;
          font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #555;
          width: 150px; margin-bottom: 4px; padding-left: 0; justify-content: center;
        }
        .top-header-input {
          border: none; outline: none; background: transparent;
          font-family: 'Montserrat', 'Inter', sans-serif;
          font-size: 38px; font-weight: 700; letter-spacing: -0.01em;
          color: #111; border-bottom: 1px solid transparent;
          padding: 2px 8px; text-align: center; min-width: 300px;
        }
        .top-header-input:hover { border-bottom-color: #c5d1dd; }
        .top-header-input:focus { border-bottom-color: #111; }
        .top-header-input::placeholder { color: #c5d1dd; font-weight: 600; }
        .bpm-input {
          width: 60px; border: none; outline: none; background: transparent;
          font-family: 'JetBrains Mono', monospace; font-size: 15px; font-weight: 500;
          text-align: right; color: #555; border-bottom: 1px solid #c5d1dd;
        }

        .player-btn {
          display: inline-flex; align-items: center; justify-content: center;
          width: 36px; height: 36px;
          background: #fff; border: 1px solid #111; border-radius: 6px;
          cursor: pointer; color: #111; transition: all .1s;
        }
        .player-btn:hover:not(:disabled) { background: #111; color: #fff; }
        .player-btn:disabled { opacity: .4; cursor: not-allowed; }
        .player-btn.primary { background: #111; color: #fff; }
        .player-btn.primary:disabled { background: #ccc; border-color: #ccc; color: #fff; }
        .player-btn.active { background: #111; color: #fff; }

        .sample-row {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 10px; background: #fff;
          border: 1px solid #d6dde3; border-radius: 5px;
        }
        .sample-row:hover { border-color: #111; }
      `}</style>

      <A4Wrapper>
        <div className="graph-paper shadow-xl" style={{
          width: "210mm", height: "297mm",
          padding: "50px 50px 60px",
          boxSizing: "border-box", overflow: "visible",
        }}>
          <div className="flex flex-col items-center mb-10">
            <input
              type="text" value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titel" className="top-header-input"
            />
          </div>
          <div className="bpm-overlay">
            <input
              type="number" value={bpm}
              onChange={(e) => setBpm(Number(e.target.value))}
              className="bpm-input" min="20" max="300"
            />
            <span>BPM</span>
          </div>
          <div>
            {sections.map((section, idx) => (
              <SectionRow key={section.id}
                section={section}
                canMoveUp={idx > 0}
                canMoveDown={idx < sections.length - 1}
                onMoveSection={(dir) => moveSection(section.id, dir)}
                onUpdateLabel={(label) => updateSection(section.id, { label })}
                onUpdateSection={(patch) => updateSection(section.id, patch)}
                onUpdateToken={(tokenId, patch) => updateToken(section.id, tokenId, patch)}
                onAddToken={(type) => addToken(section.id, type)}
                onRemoveToken={(tokenId) => removeToken(section.id, tokenId)}
                onMoveToken={(tokenId, direction) => moveToken(section.id, tokenId, direction)}
              />
            ))}
          </div>
        </div>
      </A4Wrapper>

      <div style={{ maxWidth: "794px", margin: "24px auto 0" }}>
        <AudioPanel />
      </div>

    </div>
    </AudioContext_.Provider>
  );
}

// =========================================================
// Section Row
// =========================================================
function SectionRow({ section, canMoveUp, canMoveDown, onMoveSection, onUpdateLabel, onUpdateToken, onAddToken, onRemoveToken, onMoveToken }) {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [selectedTokenId, setSelectedTokenId] = useState(null);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!selectedTokenId) return;
    function onDocClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setSelectedTokenId(null);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [selectedTokenId]);

  return (
    <div className="section-row" ref={wrapperRef}>
      {/* Section-Kästchen mit Auf/Ab-Pfeilen */}
      <div className="section-box-wrapper">
        <div className="section-move-btns">
          <button
            className="section-move-btn"
            disabled={!canMoveUp}
            onClick={() => onMoveSection(-1)}
            title="Abschnitt nach oben"
          >
            <ChevronUp size={12} />
          </button>
          <button
            className="section-move-btn"
            disabled={!canMoveDown}
            onClick={() => onMoveSection(+1)}
            title="Abschnitt nach unten"
          >
            <ChevronDown size={12} />
          </button>
        </div>
        <div className="section-box">
          <input
            type="text"
            value={section.label}
            onChange={(e) => onUpdateLabel(e.target.value)}
            className="section-input"
          />
        </div>
      </div>

      <div className="tokens-row">
        {section.tokens.map((token, idx) => {
          const needsLeadingBar = idx === 0;
          const canMoveLeft = idx > 0;
          const canMoveRight = idx < section.tokens.length - 1;
          const isSelected = selectedTokenId === token.id;
          return (
            <div
              key={token.id}
              className="token-with-arrows"
              onClick={(e) => {
                if (e.target.closest(".move-arrow")) return;
                setSelectedTokenId(token.id);
              }}
            >
              {isSelected && (
                <div className="move-arrows-overlay">
                  {canMoveLeft && (
                    <button className="move-arrow"
                      onClick={(e) => { e.stopPropagation(); onMoveToken(token.id, -1); }}
                      title="Nach links">
                      <ChevronLeft size={14} />
                    </button>
                  )}
                  {canMoveRight && (
                    <button className="move-arrow"
                      onClick={(e) => { e.stopPropagation(); onMoveToken(token.id, +1); }}
                      title="Nach rechts">
                      <ChevronRight size={14} />
                    </button>
                  )}
                </div>
              )}
              <TokenView
                token={token}
                isFirst={needsLeadingBar}
                onUpdate={(patch) => onUpdateToken(token.id, patch)}
                onRemove={() => onRemoveToken(token.id)}
              />
            </div>
          );
        })}
        {section.label && (
          <div className="add-btn-wrap">
            {showAddMenu ? (
              <div className="flex items-center gap-1">
                <button onClick={() => { onAddToken("text"); setShowAddMenu(false); }} className="add-btn">
                  <Type size={13} /> Text
                </button>
                <button onClick={() => { onAddToken("groove"); setShowAddMenu(false); }} className="add-btn">
                  <Music size={13} /> Groove
                </button>
                <button onClick={() => setShowAddMenu(false)} className="add-btn" style={{ borderStyle: "solid" }}>×</button>
              </div>
            ) : (
              <button onClick={() => setShowAddMenu(true)} className="add-btn">
                <Plus size={13} /> Hinzufügen
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TokenView({ token, isFirst, onUpdate, onRemove }) {
  useEffect(() => {
    if (token.type === "text" && token.value && token.value.includes("𝄻")) {
      onUpdate({ value: token.value.replace(/𝄻/g, "▬") });
    }
  }, [token.value, token.type]);

  return (
    <div className="token-with-note">
      <NoteOverlay note={token.note} onChange={(note) => onUpdate({ note })} />
      {token.type === "text" && (
        <div className="text-token">
          <input
            type="text"
            value={token.value}
            autoFocus={token.value === ""}
            onChange={(e) => onUpdate({ value: e.target.value })}
            onBlur={(e) => {
              const formatted = autoFormatTokenValue(e.target.value, isFirst);
              if (formatted !== e.target.value) onUpdate({ value: formatted });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const formatted = autoFormatTokenValue(e.target.value, isFirst);
                if (formatted !== e.target.value) onUpdate({ value: formatted });
                e.target.blur();
              }
            }}
            placeholder='z.B. 8, X oder "'
            style={{ width: `${(token.value.length || 8) * 13 + 8}px` }}
          />
          <button className="x" onClick={onRemove} title="Entfernen">
            <Trash2 size={10} />
          </button>
        </div>
      )}
      {token.type === "groove" && (
        <GrooveToken
          grid={token.value}
          isFirst={isFirst}
          onUpdate={(grid) => onUpdate({ value: grid })}
          onRemove={onRemove}
        />
      )}
    </div>
  );
}

function NoteOverlay({ note, onChange }) {
  const [editing, setEditing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  useEffect(() => {
    if (!showAdd && !editing) return;
    function onClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowAdd(false); setEditing(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [showAdd, editing]);

  function addNote(color) { onChange({ text: "", color }); setShowAdd(false); setEditing(true); }
  function deleteNote() { onChange(undefined); setEditing(false); }

  if (note) {
    return (
      <div className="note-row" ref={wrapperRef}>
        {editing ? (
          <div className={`note-edit note-${note.color}`}>
            <input
              ref={inputRef} type="text" value={note.text}
              onChange={(e) => onChange({ ...note, text: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setEditing(false); }}
              placeholder={note.color === "yellow" ? "Hinweis..." : "Achtung..."}
            />
            <button onClick={deleteNote} title="Notiz löschen"
              style={{ background: "transparent", border: "none", cursor: "pointer", padding: "0 4px", color: "#888", display: "flex" }}>
              <Trash2 size={11} />
            </button>
          </div>
        ) : (
          <button className={`note-display note-${note.color}`} onClick={() => setEditing(true)}>
            {note.text || (note.color === "yellow" ? "Hinweis..." : "Achtung...")}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="note-row note-row-empty" ref={wrapperRef}>
      {showAdd ? (
        <div className="note-add-menu">
          <button onClick={() => addNote("yellow")} className="note-add-btn note-yellow" title="Hinweis (gelb)">
            <span style={{ width: 8, height: 8, background: "#fbbf24", borderRadius: "50%", display: "inline-block", marginRight: 4 }} />
            Hinweis
          </button>
          <button onClick={() => addNote("red")} className="note-add-btn note-red" title="Wichtig (rot)">
            <span style={{ width: 8, height: 8, background: "#dc2626", borderRadius: "50%", display: "inline-block", marginRight: 4 }} />
            Wichtig
          </button>
          <button onClick={() => setShowAdd(false)} className="note-add-btn" style={{ borderStyle: "solid" }}>×</button>
        </div>
      ) : (
        <button className="note-add-trigger" onClick={() => setShowAdd(true)} title="Notiz hinzufügen">
          + Notiz
        </button>
      )}
    </div>
  );
}

// =========================================================
// AUDIO ENGINE
// =========================================================
class DrumAudioEngine {
  constructor() {
    this.ctx = null;
    this.samples = {};
    this.scheduler = { timerId: null, nextSlotTime: 0, currentSlot: 0 };
    this.bpm = 100; this.loop = true; this.grid = null;
    this.onSlotChange = null; this.onStop = null; this.isPlaying = false;
  }

  async ensureContext() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error("AudioContext nicht unterstützt");
      this.ctx = new AC();
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
    return this.ctx;
  }

  async loadSample(trackKey, file) {
    const ctx = await this.ensureContext();
    const audioBuffer = await ctx.decodeAudioData((await file.arrayBuffer()).slice(0));
    this.samples[trackKey] = { buffer: audioBuffer, name: file.name };
    return this.samples[trackKey];
  }

  removeSample(trackKey) { delete this.samples[trackKey]; }
  getSamples() { return this.samples; }

  playOne(trackKey, when) {
    const ctx = this.ctx; if (!ctx) return;
    const t = when;
    const sample = this.samples[trackKey];
    if (sample) {
      try { const src = ctx.createBufferSource(); src.buffer = sample.buffer; src.connect(ctx.destination); src.start(t); } catch (e) { console.error(e); }
      return;
    }
    if (trackKey === "kk") {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.frequency.setValueAtTime(150, t); osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      gain.gain.setValueAtTime(0.9, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.connect(gain).connect(ctx.destination); osc.start(t); osc.stop(t + 0.3);
    } else if (trackKey === "sn") {
      const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource(); noise.buffer = noiseBuf;
      const filter = ctx.createBiquadFilter(); filter.type = "highpass"; filter.frequency.value = 1000;
      const ng = ctx.createGain(); ng.gain.setValueAtTime(0.6, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      noise.connect(filter).connect(ng).connect(ctx.destination); noise.start(t); noise.stop(t + 0.2);
      const osc = ctx.createOscillator(); const og = ctx.createGain(); osc.frequency.value = 200;
      og.gain.setValueAtTime(0.5, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.connect(og).connect(ctx.destination); osc.start(t); osc.stop(t + 0.15);
    } else if (trackKey === "hh") {
      const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource(); noise.buffer = noiseBuf;
      const filter = ctx.createBiquadFilter(); filter.type = "highpass"; filter.frequency.value = 7000;
      const gain = ctx.createGain(); gain.gain.setValueAtTime(0.25, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      noise.connect(filter).connect(gain).connect(ctx.destination); noise.start(t); noise.stop(t + 0.06);
    } else if (trackKey === "t1") {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.frequency.setValueAtTime(220, t); osc.frequency.exponentialRampToValueAtTime(120, t + 0.15);
      gain.gain.setValueAtTime(0.7, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.connect(gain).connect(ctx.destination); osc.start(t); osc.stop(t + 0.35);
    } else if (trackKey === "t3") {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.frequency.setValueAtTime(110, t); osc.frequency.exponentialRampToValueAtTime(60, t + 0.18);
      gain.gain.setValueAtTime(0.8, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.connect(gain).connect(ctx.destination); osc.start(t); osc.stop(t + 0.45);
    }
  }

  async previewOne(trackKey) { await this.ensureContext(); this.playOne(trackKey, this.ctx.currentTime); }

  tick() {
    const ctx = this.ctx; if (!ctx || !this.grid) return;
    const sch = this.scheduler; const LOOKAHEAD = 0.1;
    while (sch.nextSlotTime < ctx.currentTime + LOOKAHEAD) {
      const g = this.grid; const totalSlots = g.measures * g.div;
      const slot = sch.currentSlot % totalSlots;
      for (const t of TRACKS) { if (g[t.key][slot]) this.playOne(t.key, sch.nextSlotTime); }
      if (this.onSlotChange) this.onSlotChange(slot);
      sch.currentSlot++;
      sch.nextSlotTime += (1 / (this.bpm / 60)) / (g.div / 4);
      if (sch.currentSlot >= totalSlots) {
        if (this.loop) sch.currentSlot = 0; else { this.stop(); return; }
      }
    }
  }

  async start(grid, bpm, loop) {
    if (this.isPlaying) this.stop();
    this.grid = grid; this.bpm = bpm; this.loop = loop;
    const ctx = await this.ensureContext();
    this.scheduler.currentSlot = 0; this.scheduler.nextSlotTime = ctx.currentTime + 0.08;
    this.isPlaying = true;
    const tick = () => { this.tick(); this.scheduler.timerId = setTimeout(tick, 25); };
    tick();
  }

  updateLive({ grid, bpm, loop }) {
    if (grid !== undefined) this.grid = grid;
    if (bpm !== undefined) this.bpm = bpm;
    if (loop !== undefined) this.loop = loop;
  }

  stop() {
    if (this.scheduler.timerId) { clearTimeout(this.scheduler.timerId); this.scheduler.timerId = null; }
    this.isPlaying = false;
    if (this.onStop) this.onStop();
  }
}

const AudioContext_ = createContext(null);
function useAudioEngine() { return useContext(AudioContext_); }

// =========================================================
// A4 Wrapper
// =========================================================
const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;

function A4Wrapper({ children }) {
  const outerRef = useRef(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    let raf = null;
    function update() {
      if (!outerRef.current) return;
      const target = Math.max(outerRef.current.clientWidth - 16, 100);
      setScale(target >= A4_WIDTH_PX ? 1 : target / A4_WIDTH_PX);
    }
    raf = requestAnimationFrame(update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => { if (raf) cancelAnimationFrame(raf); window.removeEventListener("resize", update); window.removeEventListener("orientationchange", update); };
  }, []);

  return (
    <div ref={outerRef} style={{ width: "100%" }}>
      <div style={{ width: (A4_WIDTH_PX * scale) + "px", height: (A4_HEIGHT_PX * scale) + "px", margin: "0 auto", position: "relative" }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: A4_WIDTH_PX + "px", height: A4_HEIGHT_PX + "px", position: "absolute", top: 0, left: 0 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// =========================================================
// Groove Token
// =========================================================
function GrooveToken({ grid, isFirst, onUpdate, onRemove }) {
  const [expanded, setExpanded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loopOn, setLoopOn] = useState(true);
  const [highlightSlot, setHighlightSlot] = useState(-1);
  const wrapperRef = useRef(null);
  const audioCtx = useAudioEngine();
  const engine = audioCtx?.engine;
  const bpm = audioCtx?.bpm ?? 100;

  useEffect(() => {
    if (!expanded) return;
    function onClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setExpanded(false);
        if (engine && engine.isPlaying) engine.stop();
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [expanded, engine]);

  useEffect(() => {
    if (!engine || !isPlaying) return;
    engine.updateLive({ grid, bpm });
  }, [grid, bpm, engine, isPlaying]);

  const abc = useMemo(() => gridToABC(grid), [grid]);
  const toggleCell = (track, idx) => { const arr = [...grid[track]]; arr[idx] = arr[idx] ? 0 : 1; onUpdate({ ...grid, [track]: arr }); };
  const setDiv = (d) => onUpdate(resampleGrid(grid, d, grid.measures));

  async function handlePlay(e) {
    e.stopPropagation(); if (!engine) return;
    if (engine.isPlaying) { engine.stop(); setIsPlaying(false); setHighlightSlot(-1); return; }
    engine.onSlotChange = (slot) => setHighlightSlot(slot);
    engine.onStop = () => { setIsPlaying(false); setHighlightSlot(-1); };
    setIsPlaying(true);
    await engine.start(grid, bpm, loopOn);
  }

  function handleLoopToggle(e) {
    e.stopPropagation(); const next = !loopOn; setLoopOn(next);
    if (engine && engine.isPlaying) engine.updateLive({ loop: next });
  }

  const leftSymbol = grid.repeatStart ? "‖:" : (isFirst ? "|" : null);
  const rightSymbol = grid.repeatEnd ? ":‖" : "|";

  return (
    <div className="groove-expanded-wrapper" ref={wrapperRef}>
      <div className="groove-with-repeats">
        {leftSymbol && <span className={grid.repeatStart ? "groove-repeat-bar left" : "groove-side-bar left"}>{leftSymbol}</span>}
        <div className={`groove-token ${expanded ? "active" : ""}`} onClick={() => setExpanded(!expanded)}>
          <div className="groove-preview"><AbcPreview abc={abc} small /></div>
          <button className="remove-tiny" onClick={(e) => { e.stopPropagation(); onRemove(); }} title="Entfernen">
            <Trash2 size={10} />
          </button>
        </div>
        <span className={grid.repeatEnd ? "groove-repeat-bar right" : "groove-side-bar right"}>{rightSymbol}</span>
      </div>

      {expanded && (
        <div className="groove-expanded" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2 pb-2 mb-2 flex-wrap" style={{ borderBottom: "1px solid #e5eaef" }}>
            <button onClick={handlePlay} className="player-btn primary" style={{ width: "32px", height: "32px" }} title={isPlaying ? "Stop" : "Play"}>
              {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
            </button>
            <button onClick={handleLoopToggle} className={`player-btn ${loopOn ? "active" : ""}`} style={{ width: "32px", height: "32px" }} title="Loop">
              <Repeat size={12} />
            </button>
            <div style={{ width: "1px", height: "20px", background: "#e5eaef", margin: "0 4px" }} />
            <span style={{ fontSize: "11px", color: "#5a6978", marginRight: "4px" }}>Subdivision:</span>
            {[8, 16].map(d => (
              <button key={d} onClick={() => setDiv(d)} className={`gs-toolbar-btn ${grid.div === d ? "active" : ""}`}>{d}tel</button>
            ))}
            <div style={{ width: "1px", height: "20px", background: "#e5eaef", margin: "0 4px" }} />
            <button onClick={() => onUpdate({ ...grid, repeatStart: !grid.repeatStart })}
              className={`gs-toolbar-btn ${grid.repeatStart ? "active" : ""}`}
              style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 600, fontSize: "13px" }}>‖:</button>
            <button onClick={() => onUpdate({ ...grid, repeatEnd: !grid.repeatEnd })}
              className={`gs-toolbar-btn ${grid.repeatEnd ? "active" : ""}`}
              style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 600, fontSize: "13px" }}>:‖</button>
            <span style={{ marginLeft: "auto", fontSize: "11px", color: "#888" }}>{bpm} BPM</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <div style={{ display: "inline-block", minWidth: "max-content" }}>
              <div className="flex">
                <div style={{ width: "60px", flexShrink: 0 }} />
                {Array.from({ length: grid.measures * grid.div }).map((_, i) => {
                  const sub = grid.div === 16 ? 4 : 2; const isBeat = i % sub === 0;
                  const l8 = ["1","&","2","&","3","&","4","&"]; const l16 = ["1","e","&","a","2","e","&","a","3","e","&","a","4","e","&","a"];
                  const l = grid.div === 16 ? l16[i % 16] : l8[i % 8];
                  return <div key={i} style={{ width: "32px", height: "18px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", color: isBeat ? "#111" : "#aab", fontWeight: isBeat ? 600 : 400, fontFamily: "JetBrains Mono, monospace" }}>{l}</div>;
                })}
              </div>
              {TRACKS.map(track => (
                <div key={track.key} className="flex items-center">
                  <div style={{ width: "60px", flexShrink: 0, fontSize: "13px", color: "#333", fontWeight: 500, paddingRight: "8px", textAlign: "right" }}>{track.label}</div>
                  {grid[track.key].map((v, i) => {
                    const isMeasure = i % grid.div === 0; const sub = grid.div === 16 ? 4 : 2; const isBeat = i % sub === 0;
                    const isHighlight = i === highlightSlot;
                    const cls = `cell-edit ${isMeasure ? "measure-start" : isBeat ? "beat-start" : ""} ${v ? "active" : ""} ${isHighlight ? "highlight" : ""}`;
                    return <div key={i} className={cls} onClick={() => toggleCell(track.key, i)}>{v ? <div className="dot" /> : null}</div>;
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =========================================================
// ABC Preview
// =========================================================
function AbcPreview({ abc, small }) {
  const ref = useRef(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    loadAbcjs().then(() => setStatus("ready")).catch(() => setStatus("error"));
  }, []);

  useEffect(() => {
    if (status !== "ready" || !ref.current || !window.ABCJS) return;
    try {
      ref.current.innerHTML = "";
      window.ABCJS.renderAbc(ref.current, abc, {
        staffwidth: small ? 200 : 320, scale: small ? 0.75 : 0.85,
        paddingleft: 0, paddingright: 0, paddingtop: 0, paddingbottom: 0, add_classes: true,
      });
      if (small) {
        const svg = ref.current.querySelector("svg");
        if (svg) {
          const parent = ref.current.closest(".groove-preview");
          if (parent) {
            try {
              let maxRight = 0;
              svg.querySelectorAll("path, line, rect, text, ellipse, circle, polygon").forEach(el => {
                try { const bb = el.getBBox(); const r = bb.x + bb.width; if (r > maxRight) maxRight = r; } catch (e) {}
              });
              if (maxRight > 0) parent.style.width = Math.max(maxRight - 34 - 60, 100) + "px";
              else throw new Error("no elements");
            } catch (e) {
              const w = parseFloat(svg.getAttribute("width"));
              if (isFinite(w) && w > 0) parent.style.width = Math.max(w - 34, 100) + "px";
            }
          }
        }
      }
    } catch (e) {}
  }, [abc, status, small]);

  if (status === "loading") return <span style={{ fontSize: "10px", color: "#888" }}>…</span>;
  if (status === "error") return <span style={{ fontSize: "10px", color: "#d00" }}>!</span>;
  return <div ref={ref} style={{ display: "inline-block" }} />;
}

// =========================================================
// Audio Panel
// =========================================================
function AudioPanel() {
  const audioCtx = useAudioEngine();
  const engine = audioCtx?.engine;
  const samplesVersion = audioCtx?.samplesVersion ?? 0;
  const bumpSamples = audioCtx?.bumpSamples;
  const [errMsg, setErrMsg] = useState("");
  const samples = engine ? engine.getSamples() : {};
  const loadedCount = Object.keys(samples).length;
  // eslint-disable-next-line no-unused-vars
  const _ = samplesVersion;

  async function handleUpload(trackKey, file) {
    if (!engine || !file) return;
    try { setErrMsg(""); await engine.loadSample(trackKey, file); bumpSamples?.(); }
    catch (e) { console.error(e); setErrMsg("Konnte Sample nicht laden (" + file.name + "): " + (e.message || e)); }
  }
  function handleRemove(trackKey) { engine?.removeSample(trackKey); bumpSamples?.(); }
  async function handlePreview(trackKey) { await engine?.previewOne(trackKey); }

  return (
    <div style={{ background: "#fff", border: "1px solid #d6dde3", borderRadius: "8px", padding: "20px" }}>
      <div style={{ fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", color: "#5a6978", marginBottom: "4px" }}>Samples</div>
      <div style={{ fontSize: "11px", color: "#888", marginBottom: "12px" }}>
        {loadedCount === 0 ? "Standard-Sounds aktiv. Lade eigene Samples hoch um sie zu ersetzen." : `${loadedCount} eigene Sample${loadedCount === 1 ? "" : "s"} geladen, Rest = Standard.`}
        {" "}Play-Button findest du im Groove-Editor (auf einen Groove klicken).
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "6px" }}>
        {TRACKS.map(track => (
          <SampleSlot key={track.key} track={track} sample={samples[track.key]}
            onUpload={(file) => handleUpload(track.key, file)}
            onRemove={() => handleRemove(track.key)}
            onPreview={() => handlePreview(track.key)} />
        ))}
      </div>
      {errMsg && (
        <div style={{ marginTop: "10px", display: "flex", alignItems: "flex-start", gap: "6px", fontSize: "12px", color: "#c00", lineHeight: 1.4 }}>
          <AlertCircle size={13} style={{ marginTop: "1px", flexShrink: 0 }} /><span>{errMsg}</span>
        </div>
      )}
    </div>
  );
}

function SampleSlot({ track, sample, onUpload, onRemove, onPreview }) {
  const inputRef = useRef(null);
  const isLoaded = !!sample;
  const openPicker = () => { if (inputRef.current) { inputRef.current.value = ""; inputRef.current.click(); } };

  return (
    <div className="sample-row">
      <div style={{ width: "42px", fontSize: "12px", fontWeight: 500, color: "#333", flexShrink: 0 }}>{track.label}</div>
      <input ref={inputRef} type="file" accept=".wav,.mp3,.ogg,.m4a,.aac,.flac,audio/*" style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) onUpload(f); }} />
      {isLoaded ? (
        <>
          <button onClick={onPreview} style={{ border: "none", background: "transparent", cursor: "pointer", color: "#333", padding: 0, display: "flex" }} title="Vorhören">
            <Volume2 size={14} />
          </button>
          <div style={{ flex: 1, minWidth: 0, fontSize: "11px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#333" }}>{sample.name}</div>
          <button onClick={openPicker} style={{ fontSize: "10px", color: "#5a6978", background: "transparent", border: "none", cursor: "pointer" }}>Ändern</button>
          <button onClick={onRemove} style={{ fontSize: "14px", color: "#c00", background: "transparent", border: "none", cursor: "pointer", lineHeight: 1 }}>×</button>
        </>
      ) : (
        <button onClick={openPicker} style={{ flex: 1, textAlign: "left", fontSize: "11px", color: "#5a6978", background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
          <Upload size={12} /><span>hochladen (.wav, .mp3, …)</span>
        </button>
      )}
    </div>
  );
}
