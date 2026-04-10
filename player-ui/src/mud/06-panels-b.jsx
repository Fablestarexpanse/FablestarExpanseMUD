import { useState } from "react";
import { T } from "../theme.js";
import { Tooltip } from "./01-primitives.jsx";

export function CharacterPanel({ displayName = "Kael Voss" }) {
  const [tab, setTab] = useState("vitals");
  const s = { hp: 73, hpMax: 100, mp: 45, mpMax: 80, res: 62, resMax: 100, madness: 18, madnessMax: 100 };
  const Bar = ({ label, val, max, color, icon }) => {
    const p = (val/max)*100, low = p < 25;
    return (
      <div style={{ marginBottom: 5 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 1 }}>
          <span style={{ fontSize: 10, fontFamily: T.font.body, color: T.text.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>{icon} {label}</span>
          <span style={{ fontSize: 11, fontFamily: T.font.mono, color: low ? T.text.danger : T.text.secondary }}>{val}<span style={{ opacity: 0.4 }}>/{max}</span></span>
        </div>
        <div style={{ height: 5, borderRadius: 3, background: T.bg.void, overflow: "hidden", border: `1px solid ${T.border.subtle}` }}>
          <div style={{ height: "100%", borderRadius: 3, width: `${p}%`, background: `linear-gradient(90deg,${color},${color}cc)`, boxShadow: low ? `0 0 8px ${color}60` : "none", transition: "width 0.5s" }} />
        </div>
      </div>
    );
  };
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ height: 90, position: "relative", overflow: "hidden", background: `radial-gradient(ellipse at center,${T.glyph.violetDim},${T.bg.deep})`, borderBottom: `1px solid ${T.border.subtle}` }}>
        <svg style={{ position: "absolute", inset: 0, opacity: 0.08 }} viewBox="0 0 200 90">
          {[...Array(5)].map((_,i)=><circle key={i} cx={100} cy={45} r={10+i*10} fill="none" stroke={T.glyph.violet} strokeWidth={0.5} strokeDasharray="3 5"/>)}
        </svg>
        <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 60, height: 80, background: `linear-gradient(180deg,transparent,${T.glyph.violet}20)`, borderRadius: "30px 30px 0 0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, color: T.glyph.violet+"40" }}>◈</div>
        <div style={{ position: "absolute", bottom: 4, right: 6, background: T.bg.overlay, padding: "2px 6px", borderRadius: T.radius.sm, border: `1px solid ${T.border.glyph}`, fontFamily: T.font.mono, fontSize: 9, color: T.text.accent }}>LV 14</div>
        <div style={{ position: "absolute", bottom: 4, left: 6, fontFamily: T.font.display, fontSize: 13, color: T.text.primary, textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>{displayName}</div>
      </div>
      <div style={{ display: "flex", borderBottom: `1px solid ${T.border.subtle}` }}>
        {["vitals","stats","effects"].map(t => <button key={t} type="button" onClick={()=>setTab(t)} style={{ flex: 1, padding: "5px 0", background: "none", border: "none", borderBottom: tab===t?`2px solid ${T.glyph.violet}`:"2px solid transparent", color: tab===t?T.text.accent:T.text.muted, fontFamily: T.font.body, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer" }}>{t}</button>)}
      </div>
      <div style={{ flex: 1, padding: 8, overflow: "auto" }}>
        {tab === "vitals" && <>
          <Bar label="Health" val={s.hp} max={s.hpMax} color={T.glyph.crimson} icon="♥" />
          <Bar label="Mana" val={s.mp} max={s.mpMax} color={T.glyph.cyan} icon="◆" />
          <Bar label="Resonance" val={s.res} max={s.resMax} color={T.glyph.violet} icon="✦" />
          <div style={{ height: 1, margin: "6px 0", background: T.border.subtle }} />
          <Bar label="Madness" val={s.madness} max={s.madnessMax} color={T.glyph.amber} icon="⊘" />
        </>}
        {tab === "stats" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            {[{l:"STR",v:14,m:"+2"},{l:"AGI",v:12,m:"+1"},{l:"INT",v:18,m:"+4"}].map(st=>(
              <div key={st.l} style={{ background: T.bg.surface, borderRadius: T.radius.sm, padding: "5px 7px", border: `1px solid ${T.border.subtle}`, display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 10, fontFamily: T.font.mono, color: T.text.muted }}>{st.l}</span>
                <span style={{ fontSize: 11, fontFamily: T.font.mono, color: T.text.primary }}>{st.v} <span style={{ color: T.text.accent, fontSize: 9 }}>{st.m}</span></span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function GlyphBar() {
  const [hov, setHov] = useState(null);
  const glyphs = [
    { id:1,name:"Ward of Stillness",slot:"L.Forearm",tier:2,color:T.glyph.cyan,icon:"◇",cd:0,cost:15,key:"1" },
    { id:2,name:"Searing Inscription",slot:"R.Palm",tier:3,color:T.glyph.crimson,icon:"⬡",cd:2,cost:25,key:"2" },
    { id:3,name:"Echo Thread",slot:"Spine",tier:1,color:T.glyph.violet,icon:"◈",cd:0,cost:10,key:"3" },
    { id:null,name:"Empty",slot:"—",tier:0,color:T.text.muted,icon:"○",cd:0,cost:0,key:"4" },
  ];
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${glyphs.length},1fr)`, gap: 3, padding: 6, flex: 1 }}>
        {glyphs.map((g,i) => {
          const h = hov===i, onCd = g.cd>0;
          return (
            <Tooltip key={i} text={g.name} detail={g.id ? `T${g.tier} · ${g.slot} · ${g.cost} RES` : "Empty slot"}>
              <div onMouseEnter={()=>setHov(i)} onMouseLeave={()=>setHov(null)}
                role="button" aria-label={`Glyph ${g.key}: ${g.name}`}
                style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, padding: "6px 2px", background: h&&g.id?g.color+"15":T.bg.surface, border: `1px solid ${g.id?(h?g.color+"50":g.color+"25"):T.border.subtle}`, borderRadius: T.radius.md, cursor: g.id?"pointer":"default", opacity: onCd?0.5:1, transition: "all 0.15s" }}>
                <span style={{ fontSize: 18, color: g.color, lineHeight: 1 }}>{g.icon}</span>
                <span style={{ fontSize: 7, fontFamily: T.font.body, color: T.text.muted, textAlign: "center", lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{g.name}</span>
                <span style={{ position: "absolute", top: 2, right: 3, fontSize: 7, fontFamily: T.font.mono, color: T.text.muted+"60" }}>{g.key}</span>
                {onCd && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: T.bg.overlay, borderRadius: T.radius.md, fontFamily: T.font.mono, fontSize: 14, color: T.text.muted, fontWeight: 700 }}>{g.cd}</div>}
              </div>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

export function InventoryPanel({ onContextMenu }) {
  const [filter, setFilter] = useState("all");
  const items = [
    { name: "Fractured Glyph-Shard", type: "material", rarity: "rare", icon: "◇", qty: 1 },
    { name: "Stabilizing Tincture", type: "consumable", rarity: "common", icon: "⬡", qty: 3 },
  ];
  const rc = { common: T.text.secondary, uncommon: T.glyph.emerald, rare: T.glyph.cyan, epic: T.glyph.violet, legendary: T.glyph.amber };
  const filtered = filter === "all" ? items : items.filter(i => i.type === filter);
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", padding: "3px 4px", gap: 3, borderBottom: `1px solid ${T.border.subtle}` }}>
        {["all","equipment","consumable","material"].map(f => <button key={f} type="button" onClick={()=>setFilter(f)} style={{ padding: "2px 6px", borderRadius: T.radius.sm, border: "none", background: filter===f?T.glyph.violetDim:"transparent", color: filter===f?T.text.accent:T.text.muted, fontFamily: T.font.body, fontSize: 8, textTransform: "uppercase", cursor: "pointer" }}>{f}</button>)}
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 3 }}>
        {filtered.map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px", borderRadius: T.radius.sm, cursor: "pointer" }}
            onContextMenu={(e) => { e.preventDefault(); onContextMenu?.({ x: e.clientX, y: e.clientY, items: [{ icon: "👁", label: "Examine", action:()=>{} }, { icon: "🔧", label: "Use", action:()=>{} }] }); }}
            onMouseEnter={e => e.currentTarget.style.background = T.bg.surface}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <span style={{ fontSize: 14, color: rc[item.rarity], width: 18, textAlign: "center" }}>{item.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontFamily: T.font.body, color: rc[item.rarity] }}>{item.name}</div>
            </div>
            {item.qty > 1 && <span style={{ fontSize: 9, fontFamily: T.font.mono, color: T.text.muted }}>×{item.qty}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SocialPanel({ unreadCounts }) {
  const [ch, setCh] = useState("party");
  const channels = [
    { id: "party", label: "Party", color: T.glyph.cyan },
    { id: "local", label: "Local", color: T.text.secondary },
    { id: "tells", label: "Tells", color: T.glyph.violet },
  ];
  const msgs = {
    party: [{ from: "Lyra", text: "Sentinel suppressed — go now", time: "19:43" }, { from: "You", text: "Moving to Glyph Chamber", time: "19:43" }],
    local: [{ from: "Sentinel", text: "*optics flicker*", time: "19:43", emote: true }],
    tells: [{ from: "Syra Vane", text: "Spare filaments?", time: "19:35" }],
  };
  const party = [
    { name: "You", role: "Inscriptor", hp: 73, status: "active", you: true },
    { name: "Lyra Ashfen", role: "Wardkeeper", hp: 88, status: "active" },
  ];
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: 4, borderBottom: `1px solid ${T.border.subtle}` }}>
        {party.map((p,i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, padding: "2px 4px", borderRadius: T.radius.sm, background: p.you?T.glyph.violetDim:"transparent" }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: p.status==="combat"?T.glyph.crimson:T.glyph.emerald }}/>
            <span style={{ flex: 1, fontSize: 10, fontFamily: T.font.body, color: p.you?T.text.accent:T.text.primary }}>{p.name}</span>
            <span style={{ fontSize: 8, fontFamily: T.font.mono, color: T.text.muted }}>{p.role}</span>
            <div style={{ width: 28, height: 3, borderRadius: 2, background: T.bg.void }}><div style={{ height: "100%", borderRadius: 2, width: `${p.hp}%`, background: p.hp<30?T.glyph.crimson:T.glyph.emerald }}/></div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", borderBottom: `1px solid ${T.border.subtle}` }}>
        {channels.map(c => {
          const unread = (unreadCounts||{})[c.id] || 0;
          return (
            <button key={c.id} type="button" onClick={()=>setCh(c.id)} aria-label={`${c.label} channel`}
              style={{ flex: 1, padding: "4px 0", background: "none", border: "none", borderBottom: ch===c.id?`2px solid ${c.color}`:"2px solid transparent", color: ch===c.id?c.color:T.text.muted, fontFamily: T.font.body, fontSize: 8, textTransform: "uppercase", letterSpacing: "0.06em", cursor: "pointer", position: "relative" }}>
              {c.label}
              {unread > 0 && <span style={{ position: "absolute", top: 1, right: 2, width: 8, height: 8, borderRadius: 4, background: T.glyph.crimson, fontSize: 0 }}/>}
            </button>
          );
        })}
      </div>
      <div role="log" aria-label={`${ch} messages`} style={{ flex: 1, overflow: "auto", padding: 4 }}>
        {(msgs[ch]||[]).map((m,i) => (
          <div key={i} style={{ marginBottom: 5 }}>
            <div style={{ display: "flex", gap: 4, alignItems: "baseline" }}>
              <span style={{ fontSize: 9, fontFamily: T.font.mono, color: T.text.muted, opacity: 0.4 }}>{m.time}</span>
              <span style={{ fontSize: 10, fontFamily: T.font.body, fontWeight: 600, color: m.from==="You"?T.text.accent:T.glyph.cyan }}>{m.from}</span>
            </div>
            <div style={{ fontSize: 11, fontFamily: m.emote?T.font.body:T.font.mono, fontStyle: m.emote?"italic":"normal", color: T.text.secondary, paddingLeft: 36, lineHeight: 1.4 }}>{m.text}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 4, padding: "3px 4px", borderTop: `1px solid ${T.border.subtle}` }}>
        <input placeholder={`${ch}...`} aria-label={`Send to ${ch}`}
          style={{ flex: 1, background: T.bg.surface, border: `1px solid ${T.border.subtle}`, borderRadius: T.radius.sm, padding: "3px 6px", outline: "none", color: T.text.primary, fontFamily: T.font.mono, fontSize: 10 }}/>
      </div>
    </div>
  );
}

export function ScenePanel() {
  const [state, setState] = useState("loaded");
  const [opacity, setOpacity] = useState(85);
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", position: "relative" }}>
      <div style={{ flex: 1, position: "relative", overflow: "hidden", background: `radial-gradient(ellipse at 40% 30%,${T.glyph.violetDim},${T.bg.deep})` }}>
        {state === "loaded" && (
          <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 30% 20%,${T.glyph.violet}12,transparent 50%),linear-gradient(180deg,${T.bg.void},${T.bg.deep})`, opacity: opacity/100 }}>
            <svg style={{ position: "absolute", inset: 0, opacity: 0.15 }} viewBox="0 0 400 300">
              <rect x="170" y="180" width="60" height="80" rx="3" fill={T.glyph.violet+"08"} stroke={T.glyph.violet+"30"} strokeWidth="0.5"/>
            </svg>
          </div>
        )}
        <div style={{ position: "absolute", bottom: 6, right: 6, display: "flex", alignItems: "center", gap: 4, background: T.bg.overlay, padding: "2px 6px", borderRadius: T.radius.sm }}>
          <input type="range" min={0} max={100} value={opacity} onChange={e=>setOpacity(+e.target.value)} aria-label="Image opacity" style={{ width: 50, accentColor: T.glyph.violet, height: 2 }}/>
        </div>
      </div>
      <div style={{ padding: "4px 8px", borderTop: `1px solid ${T.border.subtle}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: T.font.display, fontSize: 11, color: T.text.accent }}>Glyph Chamber Alpha</span>
        <div style={{ display: "flex", gap: 3 }}>
          {["loading","loaded","empty"].map(s => <button key={s} type="button" onClick={()=>setState(s)} style={{ padding: "1px 5px", borderRadius: T.radius.sm, border: "none", background: state===s?T.glyph.violetDim:T.bg.surface, color: state===s?T.text.accent:T.text.muted, fontFamily: T.font.mono, fontSize: 7, cursor: "pointer", textTransform: "uppercase" }}>{s}</button>)}
        </div>
      </div>
    </div>
  );
}
