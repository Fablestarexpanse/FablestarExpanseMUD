import { COLORS } from "../theme.js";

const EDITORS = [
  { id: "zone", label: "Zone" },
  { id: "galaxy", label: "Galaxy" },
  { id: "ship", label: "Ship" },
  { id: "entities", label: "Entities" },
  { id: "items", label: "Items" },
  { id: "glyphs", label: "Glyphs" },
];

export default function Sidebar({
  contentRoot,
  onChangeRoot,
  activeEditor,
  onEditor,
  zoneIds,
  selectedZoneId,
  onSelectZone,
  systemIds,
  selectedSystemId,
  onSelectSystem,
  shipIds,
  selectedShipId,
  onSelectShip,
  entityIds,
  selectedEntityId,
  onSelectEntity,
  itemIds,
  selectedItemId,
  onSelectItem,
  glyphIds,
  selectedGlyphId,
  onSelectGlyph,
  search,
  onSearch,
  nexusLive,
  onOpenSettings,
  onOpenExport,
}) {
  const shortRoot = contentRoot ? (contentRoot.length > 36 ? "…" + contentRoot.slice(-34) : contentRoot) : "";

  const treeItems = () => {
    if (activeEditor === "zone")
      return zoneIds.map((id) => ({ id, label: id, active: id === selectedZoneId, onClick: () => onSelectZone(id) }));
    if (activeEditor === "galaxy")
      return systemIds.map((id) => ({ id, label: id, active: id === selectedSystemId, onClick: () => onSelectSystem(id) }));
    if (activeEditor === "ship")
      return shipIds.map((id) => ({ id, label: id, active: id === selectedShipId, onClick: () => onSelectShip(id) }));
    if (activeEditor === "entities")
      return entityIds.map((id) => ({ id, label: id, active: id === selectedEntityId, onClick: () => onSelectEntity(id) }));
    if (activeEditor === "items")
      return itemIds.map((id) => ({ id, label: id, active: id === selectedItemId, onClick: () => onSelectItem(id) }));
    if (activeEditor === "glyphs")
      return glyphIds.map((id) => ({ id, label: id, active: id === selectedGlyphId, onClick: () => onSelectGlyph(id) }));
    return [];
  };

  const filtered = treeItems().filter((t) => !search || t.label.toLowerCase().includes(search.toLowerCase()));

  return (
    <div
      style={{
        width: 240,
        minWidth: 240,
        background: COLORS.bgPanel,
        borderRight: `1px solid ${COLORS.border}`,
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      <div style={{ padding: "14px 12px", borderBottom: `1px solid ${COLORS.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L22 8v8L12 22 2 16V8L12 2z" stroke={COLORS.accent} strokeWidth="1.5" fill={`${COLORS.accent}22`} />
          </svg>
          <span style={{ fontWeight: 700, fontSize: 15, color: COLORS.text, fontFamily: "'Space Grotesk', sans-serif" }}>Fablestar WorldForger</span>
        </div>
        {contentRoot ? (
          <div style={{ fontSize: 10, color: COLORS.textDim, wordBreak: "break-all", marginBottom: 6 }} title={contentRoot}>
            {shortRoot}
          </div>
        ) : null}
        <button type="button" onClick={onChangeRoot} style={smallBtn}>
          Change folder
        </button>
      </div>

      <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 4 }}>
        {EDITORS.map((ed) => (
          <button
            key={ed.id}
            type="button"
            onClick={() => onEditor(ed.id)}
            style={{
              ...navBtn,
              background: activeEditor === ed.id ? `${COLORS.accent}28` : "transparent",
              color: activeEditor === ed.id ? COLORS.accent : COLORS.textMuted,
              border: activeEditor === ed.id ? `1px solid ${COLORS.accent}55` : "1px solid transparent",
            }}
          >
            {ed.label}
          </button>
        ))}
      </div>

      <div style={{ padding: "8px 10px" }}>
        <input
          placeholder="Search…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "6px 8px",
            borderRadius: 6,
            border: `1px solid ${COLORS.border}`,
            background: COLORS.bgInput,
            color: COLORS.text,
            fontSize: 12,
          }}
        />
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "4px 8px 8px" }}>
        {filtered.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={t.onClick}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "6px 8px",
              marginBottom: 2,
              borderRadius: 6,
              border: "none",
              background: t.active ? COLORS.bgHover : "transparent",
              color: COLORS.text,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: 10, borderTop: `1px solid ${COLORS.border}` }}>
        <button type="button" style={{ ...smallBtn, width: "100%", marginBottom: 6 }} onClick={onOpenExport}>
          Export bundle…
        </button>
        <button type="button" style={{ ...smallBtn, width: "100%", marginBottom: 8 }} onClick={onOpenSettings}>
          Settings
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: COLORS.textMuted }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: nexusLive ? COLORS.success : COLORS.textDim,
            }}
          />
          {nexusLive ? "Nexus live" : "Nexus offline"}
        </div>
      </div>
    </div>
  );
}

const smallBtn = {
  padding: "6px 10px",
  fontSize: 11,
  borderRadius: 6,
  border: `1px solid ${COLORS.border}`,
  background: COLORS.bgCard,
  color: COLORS.text,
  cursor: "pointer",
};

const navBtn = {
  textAlign: "left",
  padding: "8px 10px",
  borderRadius: 6,
  fontSize: 12,
  cursor: "pointer",
};
