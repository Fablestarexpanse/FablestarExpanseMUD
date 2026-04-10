export const T = {
  bg: { void: "#08090c", deep: "#0c0e14", panel: "#111318", panelHover: "#161921", surface: "#1a1d25", elevated: "#1e2230", overlay: "rgba(8,9,12,0.92)" },
  border: { subtle: "rgba(255,255,255,0.04)", dim: "rgba(255,255,255,0.07)", medium: "rgba(255,255,255,0.12)", glyph: "rgba(167,139,250,0.25)", glyphHot: "rgba(167,139,250,0.5)", danger: "rgba(239,68,68,0.4)", success: "rgba(52,211,153,0.4)" },
  text: { primary: "#e2e4ea", secondary: "#8b8fa4", muted: "#5a5e72", accent: "#a78bfa", glyph: "#c4b5fd", danger: "#f87171", success: "#34d399", gold: "#fbbf24", info: "#60a5fa", narrative: "#d1cfe0" },
  glyph: { violet: "#a78bfa", violetDim: "rgba(167,139,250,0.15)", violetGlow: "rgba(167,139,250,0.3)", cyan: "#22d3ee", cyanDim: "rgba(34,211,238,0.15)", amber: "#f59e0b", amberDim: "rgba(245,158,11,0.15)", crimson: "#ef4444", crimsonDim: "rgba(239,68,68,0.15)", emerald: "#10b981", emeraldDim: "rgba(16,185,129,0.15)" },
  radius: { sm: 4, md: 6, lg: 10, xl: 14 },
  font: { mono: "'JetBrains Mono','Fira Code',monospace", display: "'Cinzel','Cormorant Garamond',serif", body: "'Barlow','IBM Plex Sans',sans-serif" },
  shadow: { panel: "0 2px 20px rgba(0,0,0,0.5),0 0 1px rgba(167,139,250,0.1)", panelHover: "0 4px 30px rgba(0,0,0,0.6),0 0 2px rgba(167,139,250,0.2)", glow: "0 0 20px rgba(167,139,250,0.15)" },
};
export const clamp = (v, mn, mx) => Math.max(mn, Math.min(mx, v));
