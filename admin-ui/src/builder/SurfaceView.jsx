import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { COLORS, API_BASE } from "./builderConstants.js";

const inp = {
  padding: "8px 12px",
  borderRadius: 8,
  border: `1px solid ${COLORS.border}`,
  background: COLORS.bgInput,
  color: COLORS.text,
  fontSize: 13,
  fontFamily: "'DM Sans', sans-serif",
  width: "100%",
  maxWidth: 360,
  boxSizing: "border-box",
};

export default function SurfaceView({ onSelectZone }) {
  const [zones, setZones] = useState([]);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    axios
      .get(`${API_BASE}/content/zones`)
      .then((r) => setZones(r.data || []))
      .catch((e) => setErr(String(e.response?.data?.detail || e.message)));
  }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return zones;
    return zones.filter(
      (z) =>
        String(z.id || "")
          .toLowerCase()
          .includes(q) ||
        String(z.name || "")
          .toLowerCase()
          .includes(q) ||
        String(z.type || "")
          .toLowerCase()
          .includes(q)
    );
  }, [zones, filter]);

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {err && <div style={{ color: COLORS.danger, marginBottom: 12 }}>{err}</div>}
      <input
        type="search"
        placeholder="Filter zones by id, name, or type…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{ ...inp, marginBottom: 14 }}
      />
      <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 14 }}>
        Pick a zone to edit its room graph. New zones are still added on disk under <code style={{ color: COLORS.textDim }}>content/world/zones/</code>.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
        {filtered.map((z) => (
          <button
            key={z.id}
            type="button"
            onClick={() => onSelectZone(z.id, z.name || z.id)}
            style={{
              textAlign: "left",
              padding: 14,
              background: COLORS.bgCard,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 10,
              color: COLORS.text,
              cursor: "pointer",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 14 }}>{z.name}</div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace", marginTop: 4 }}>{z.id}</div>
          </button>
        ))}
      </div>
      {zones.length === 0 && !err && <div style={{ color: COLORS.textMuted }}>No zones found.</div>}
      {zones.length > 0 && filtered.length === 0 && <div style={{ color: COLORS.textMuted }}>No zones match this filter.</div>}
    </div>
  );
}
