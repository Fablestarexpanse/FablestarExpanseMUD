import { useState, useEffect, useRef } from "react";
import { T } from "../theme.js";
import { EntitySpan } from "./02-entity.jsx";

export const DEFAULT_NARRATIVE = [
  { type: "system", text: "— Connected to Fablestar Expanse —", ts: "" },
  { type: "room_title", text: "Corroded Junction — Sector 7, Depth 2" },
  { type: "room_desc", text: "Three corridors converge beneath a fractured ceiling. Violet |item:glyph-channels:glyph_channels| glimmer in the plating." },
  { type: "exits", exits: [{ dir: "north", label: "Glyph Chamber Alpha" }, { dir: "east", label: "Maintenance Shaft 03" }, { dir: "down", label: "Sub-level Access" }] },
  { type: "entity", text: "A |npc:Corroded Sentinel:sentinel_01| stands motionless in the arch." },
  { type: "sep" },
];

export function NarrativePanel({ onContextMenu, lines }) {
  const scrollRef = useRef(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showTimestamps, setShowTimestamps] = useState(true);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [lines]);

  const parseEntities = (text) => {
    const parts = text.split(/(\|[^|]+\|)/g);
    return parts.map((part, i) => {
      const match = part.match(/^\|(\w+):([^:]+):([^|]+)\|$/);
      if (match) return <EntitySpan key={i} type={match[1]} name={match[2]} id={match[3]} onContextMenu={onContextMenu}>{match[2]}</EntitySpan>;
      return <span key={i}>{part}</span>;
    });
  };

  const Ts = ({ ts }) => showTimestamps && ts ? <span style={{ color: T.text.muted, opacity: 0.35, fontSize: 10, fontFamily: T.font.mono, marginRight: 6, minWidth: 48, display: "inline-block" }}>{ts}</span> : null;

  const renderLine = (line, i) => {
    const base = { fontFamily: T.font.mono, fontSize: 13, lineHeight: 1.7, padding: "1px 14px" };
    switch (line.type) {
      case "system": return <div key={i} role="status" style={{ ...base, color: T.text.muted, fontStyle: "italic", fontSize: 11 }}><Ts ts={line.ts} />{line.text}</div>;
      case "raw": return <div key={i} style={{ ...base, color: T.text.narrative, fontFamily: T.font.body, fontSize: 13, whiteSpace: "pre-wrap" }}>{line.text}</div>;
      case "room_title": return (
        <div key={i} style={{ padding: "10px 14px 2px", display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontFamily: T.font.display, fontSize: 18, fontWeight: 700, color: T.text.accent }}>{line.text.split("—")[0].trim()}</span>
          {line.text.includes("—") && <span style={{ fontFamily: T.font.body, fontSize: 11, color: T.text.muted }}>{line.text.split("—").slice(1).join("—").trim()}</span>}
        </div>
      );
      case "room_desc": return <div key={i} style={{ ...base, color: T.text.narrative, fontFamily: T.font.body, fontSize: 14, lineHeight: 1.75, padding: "4px 14px 8px" }}>{parseEntities(line.text)}</div>;
      case "exits": return (
        <div key={i} style={{ ...base, padding: "4px 14px 8px", fontSize: 12 }}>
          <span style={{ color: T.text.muted }}>Exits: </span>
          {line.exits.map((ex, j) => (
            <span key={j}>
              {j > 0 && <span style={{ color: T.text.muted, margin: "0 6px" }}>·</span>}
              <EntitySpan type="exit" name={ex.label} id={ex.dir} onContextMenu={onContextMenu}>{ex.dir}</EntitySpan>
              <span style={{ color: T.text.secondary, marginLeft: 4, fontSize: 11 }}>{ex.label}</span>
            </span>
          ))}
        </div>
      );
      case "entity": return <div key={i} style={{ ...base, color: T.glyph.amber, fontFamily: T.font.body, fontSize: 13 }}>⬡ {parseEntities(line.text)}</div>;
      case "sep": return <div key={i} style={{ height: 1, margin: "6px 14px", background: `linear-gradient(90deg,${T.border.dim},transparent)` }} />;
      case "action": return (
        <div key={i} style={{ ...base, color: T.text.primary, display: "flex", gap: 4 }}>
          <Ts ts={line.ts} /><span style={{ color: T.glyph.cyan }}>❯</span><span>{line.text.replace("> ", "")}</span>
        </div>
      );
      case "response": return <div key={i} style={{ ...base, color: T.text.narrative, fontFamily: T.font.body, fontSize: 14, lineHeight: 1.75, padding: "4px 14px 6px" }}>{parseEntities(line.text)}</div>;
      case "alert": {
        const cfg = { warning: { bg: T.glyph.amberDim, color: T.glyph.amber, border: T.glyph.amber, icon: "⚠" }, success: { bg: T.glyph.emeraldDim, color: T.text.success, border: T.glyph.emerald, icon: "✓" }, danger: { bg: T.glyph.crimsonDim, color: T.text.danger, border: T.glyph.crimson, icon: "✕" } }[line.level] || {};
        return <div key={i} role="alert" style={{ ...base, color: cfg.color, fontSize: 12, fontWeight: 600, background: cfg.bg, margin: "4px 14px", padding: "6px 12px", borderRadius: T.radius.sm, borderLeft: `3px solid ${cfg.border}` }}>{cfg.icon} {line.text}</div>;
      }
      case "glyph_cast": return (
        <div key={i} style={{ ...base, fontFamily: T.font.body, fontSize: 14, lineHeight: 1.75, color: T.text.glyph, padding: "6px 14px", background: `linear-gradient(90deg,${T.glyph.violetDim},transparent 70%)`, borderLeft: `2px solid ${T.glyph.violet}60`, margin: "4px 0" }}>
          {parseEntities(line.text)}
        </div>
      );
      case "image_gen": return (
        <div key={i} style={{ margin: "8px 14px", borderRadius: T.radius.md, height: 140, overflow: "hidden", position: "relative", background: `linear-gradient(135deg,${T.bg.deep},${T.glyph.violetDim})`, border: `1px solid ${T.border.glyph}` }}>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", border: `2px solid ${T.glyph.violet}50`, borderTopColor: T.glyph.violet, animation: "spin 1s linear infinite" }} />
            <span style={{ fontFamily: T.font.body, fontSize: 11, color: T.text.muted }}>Generating · {line.label}</span>
          </div>
        </div>
      );
      case "discovery": return (
        <div key={i} role="alert" style={{ ...base, fontSize: 12, fontWeight: 600, color: T.glyph.violet, background: T.glyph.violetDim, margin: "6px 14px", padding: "8px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.glyph}`, fontFamily: T.font.body }}>
          {line.text}
        </div>
      );
      default: return <div key={i} style={{ ...base, color: T.text.secondary }}>{line.text}</div>;
    }
  };

  const filtered = searchTerm.trim()
    ? lines.map((l, i) => ({ l, i })).filter(({ l }) => {
        const t = JSON.stringify(l).toLowerCase();
        return t.includes(searchTerm.toLowerCase());
      })
    : lines.map((l, i) => ({ l, i }));

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {searchOpen && (
        <div style={{ padding: "4px 8px", borderBottom: `1px solid ${T.border.subtle}`, display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: T.text.muted }}>🔍</span>
          <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} autoFocus
            placeholder="Search scrollback..." aria-label="Search scrollback"
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: T.text.primary, fontFamily: T.font.mono, fontSize: 12 }} />
          <button onClick={() => { setSearchOpen(false); setSearchTerm(""); }}
            aria-label="Close search" style={{ background: "none", border: "none", color: T.text.muted, cursor: "pointer", fontSize: 12 }}>✕</button>
        </div>
      )}
      <div ref={scrollRef} role="log" aria-live="polite" aria-label="Game narrative"
        style={{ flex: 1, overflowY: "auto", overflowX: "hidden", paddingBottom: 8 }}>
        {filtered.map(({ l, i }) => renderLine(l, i))}
      </div>
      <div style={{ display: "flex", gap: 2, padding: "2px 8px", borderTop: `1px solid ${T.border.subtle}` }}>
        {[
          { icon: "🔍", label: "Search", action: () => setSearchOpen(!searchOpen) },
          { icon: "🕐", label: "Timestamps", action: () => setShowTimestamps(!showTimestamps), active: showTimestamps },
          { icon: "📋", label: "Copy log", action: () => {} },
          { icon: "💾", label: "Save session", action: () => {} },
        ].map((btn, i) => (
          <button key={i} onClick={btn.action} title={btn.label} aria-label={btn.label}
            style={{ padding: "3px 6px", borderRadius: T.radius.sm, border: "none", background: btn.active ? T.glyph.violetDim : "transparent", color: btn.active ? T.text.accent : T.text.muted, cursor: "pointer", fontSize: 11, transition: "all 0.1s" }}
            onMouseEnter={e => e.target.style.color = T.text.primary}
            onMouseLeave={e => e.target.style.color = btn.active ? T.text.accent : T.text.muted}
          >{btn.icon}</button>
        ))}
      </div>
    </div>
  );
}

export function CommandInput({ onSubmitCommand }) {
  const [value, setValue] = useState("");
  const [history, setHistory] = useState([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [suggestions, setSuggestions] = useState([]);
  const inputRef = useRef(null);
  const CMDS = ["look","examine","inventory","north","south","east","west","up","down","inscribe","attack","cast","say","tell","whisper","get","drop","use","equip","unequip","map","who","score","help","glyphs","delve","rest","quest","journal","stats","keybinds","triggers","config"];
  const handleKey = (e) => {
    if (e.key === "Enter" && value.trim()) {
      const cmd = value.trim();
      onSubmitCommand?.(cmd);
      setHistory(h => [cmd, ...h.filter(x => x !== cmd)].slice(0, 50));
      setValue(""); setHistIdx(-1); setSuggestions([]);
    }
    else if (e.key === "ArrowUp") { e.preventDefault(); const n = Math.min(histIdx + 1, history.length - 1); setHistIdx(n); setValue(history[n] || ""); }
    else if (e.key === "ArrowDown") { e.preventDefault(); const n = histIdx - 1; if (n < 0) { setHistIdx(-1); setValue(""); } else { setHistIdx(n); setValue(history[n] || ""); } }
    else if (e.key === "Tab") { e.preventDefault(); if (suggestions.length === 1) { setValue(suggestions[0] + " "); setSuggestions([]); } }
    else if (e.key === "Escape") { setSuggestions([]); }
  };
  useEffect(() => {
    if (value.trim() && !value.includes(" ")) { setSuggestions(CMDS.filter(c => c.startsWith(value.toLowerCase())).slice(0, 6)); }
    else setSuggestions([]);
  }, [value]);

  return (
    <div style={{ position: "relative" }}>
      {suggestions.length > 0 && (
        <div role="listbox" aria-label="Command suggestions" style={{ position: "absolute", bottom: "100%", left: 0, right: 0, background: T.bg.elevated, border: `1px solid ${T.border.medium}`, borderBottom: "none", borderRadius: `${T.radius.md}px ${T.radius.md}px 0 0`, padding: "4px 0" }}>
          {suggestions.map((s, i) => (
            <div key={i} role="option" onClick={() => { setValue(s + " "); setSuggestions([]); inputRef.current?.focus(); }}
              style={{ padding: "4px 14px", fontFamily: T.font.mono, fontSize: 12, color: T.text.secondary, cursor: "pointer" }}
              onMouseEnter={e => { e.target.style.background = T.glyph.violetDim; e.target.style.color = T.text.accent; }}
              onMouseLeave={e => { e.target.style.background = "transparent"; e.target.style.color = T.text.secondary; }}
            ><span style={{ color: T.text.accent }}>{s.slice(0, value.length)}</span>{s.slice(value.length)}</div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.bg.surface, padding: "6px 12px", borderTop: `1px solid ${T.border.dim}` }}>
        <span style={{ color: T.glyph.violet, fontFamily: T.font.mono, fontSize: 14, fontWeight: 700 }}>❯</span>
        <input ref={inputRef} value={value} onChange={e => setValue(e.target.value)} onKeyDown={handleKey}
          role="textbox" aria-label="Command input" placeholder="Enter command..."
          style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: T.text.primary, fontFamily: T.font.mono, fontSize: 13, caretColor: T.glyph.violet }} />
        <span style={{ fontFamily: T.font.mono, fontSize: 9, color: T.text.muted, opacity: 0.35 }}>↑↓ Tab Esc</span>
      </div>
    </div>
  );
}
