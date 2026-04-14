import { useState } from "react";
import { usePlayTheme } from "../PlayThemeContext.jsx";

const ROOMS = [
  { id: "cj", label: "Corroded\nJunction", x: 150, y: 120, type: "junction", visited: true, current: false },
  { id: "gca", label: "Glyph Chamber\nAlpha", x: 150, y: 40, type: "chamber", visited: true, current: true },
  { id: "ms", label: "Maint.\nShaft 03", x: 260, y: 120, type: "corridor", visited: true },
  { id: "ds", label: "Deep\nStair", x: 240, y: 10, type: "descent", visited: true },
  { id: "sl", label: "???", x: 150, y: 200, type: "unknown", visited: false },
];
const EDGES = [["cj","gca"],["cj","ms"],["cj","sl"],["gca","ds"]];

export function MiniMap() {
  const { T } = usePlayTheme();
  const [hov, setHov] = useState(null);
  const [zoom, setZoom] = useState(1);
  const roomCol = (r) => {
    if (r.current) return T.glyph.violet;
    if (!r.visited) return T.text.muted + "40";
    return { danger: T.glyph.crimson, chamber: T.glyph.cyan, descent: T.glyph.amber }[r.type] || T.text.secondary;
  };
  return (
    <div style={{ height: "100%", position: "relative", overflow: "hidden" }}>
      <svg width="100%" height="100%" viewBox="-10 -10 340 230" style={{ transform: `scale(${zoom})`, transformOrigin: "center", transition: "transform 0.2s" }}>
        <defs><pattern id="g" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="10" cy="10" r="0.5" fill={T.text.muted+"20"}/></pattern></defs>
        <rect x="-10" y="-10" width="340" height="230" fill="url(#g)"/>
        {EDGES.map(([f,t],i) => { const a=ROOMS.find(r=>r.id===f),b=ROOMS.find(r=>r.id===t); return a&&b ? <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={a.visited&&b.visited?T.text.muted+"50":T.text.muted+"15"} strokeWidth={a.visited&&b.visited?1.5:1} strokeDasharray={a.visited&&b.visited?"none":"4 3"}/> : null; })}
        {ROOMS.map(r => {
          const c = roomCol(r), h = hov===r.id;
          return (
            <g key={r.id} onMouseEnter={()=>setHov(r.id)} onMouseLeave={()=>setHov(null)}
              style={{ cursor: r.visited ? "pointer" : "default" }}
              role="button" tabIndex={r.visited?0:-1} aria-label={r.visited?r.label.replace("\n"," "):"Unexplored"}>
              {r.current && <circle cx={r.x} cy={r.y} r={18} fill="none" stroke={T.glyph.violet} strokeWidth={1} opacity={0.3} style={{animation:"pulse 2s ease-in-out infinite"}}/>}
              <circle cx={r.x} cy={r.y} r={r.current?12:h?10:8} fill={r.visited?c+"20":T.bg.deep} stroke={c} strokeWidth={r.current?2:1.5} opacity={r.visited?1:0.3}/>
              {r.current && <circle cx={r.x} cy={r.y} r={4} fill={T.glyph.violet}/>}
              {r.visited && <text x={r.x} y={r.y+(r.current?22:18)} textAnchor="middle" fill={h?T.text.primary:T.text.muted} fontSize={7} fontFamily={T.font.body}>
                {r.label.split("\n").map((l,li) => <tspan key={li} x={r.x} dy={li===0?0:9}>{l}</tspan>)}
              </text>}
            </g>
          );
        })}
      </svg>
      <div style={{ position: "absolute", bottom: 6, right: 6, display: "flex", gap: 3 }}>
        {[0.8,1,1.3].map(z => <button key={z} type="button" onClick={()=>setZoom(z)} aria-label={`Zoom ${z}x`} style={{ width: 20, height: 20, borderRadius: T.radius.sm, background: zoom===z?T.glyph.violetDim:T.bg.surface, border: `1px solid ${zoom===z?T.border.glyph:T.border.subtle}`, color: zoom===z?T.text.accent:T.text.muted, cursor: "pointer", fontSize: 9, fontFamily: T.font.mono, display: "flex", alignItems: "center", justifyContent: "center" }}>{z===0.8?"−":z===1?"○":"+"}</button>)}
      </div>
    </div>
  );
}
