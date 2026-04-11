/** Mirrors admin App.jsx COLORS for standalone builder modules. */
export const COLORS = {
  bg: "#0a0b0f",
  bgPanel: "#111318",
  bgCard: "#161920",
  bgHover: "#1c1f28",
  bgInput: "#0d0e13",
  border: "#252833",
  borderActive: "#3d4158",
  text: "#c8cad4",
  textMuted: "#6b6f82",
  textDim: "#454860",
  accent: "#7c6aef",
  accentGlow: "rgba(124, 106, 239, 0.12)",
  success: "#34d399",
  warning: "#fbbf24",
  danger: "#f87171",
  info: "#60a5fa",
  cyan: "#22d3ee",
  forge: "#e879f9",
};

export const ROOM_TYPE_COLORS = {
  chamber: COLORS.cyan,
  corridor: COLORS.textMuted,
  junction: COLORS.accent,
  alcove: COLORS.info,
  descent: COLORS.warning,
  danger: COLORS.danger,
  safe: COLORS.success,
  boss: COLORS.danger,
  hub: COLORS.forge,
  command: COLORS.info,
  engineering: COLORS.warning,
  airlock: COLORS.danger,
  "?": COLORS.textDim,
};

export const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:4001";
