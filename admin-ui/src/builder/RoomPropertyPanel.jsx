import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import yaml from "js-yaml";
import { COLORS, ROOM_TYPE_COLORS } from "./builderConstants";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:4001";

const ROOM_TYPES = [
  "chamber",
  "corridor",
  "junction",
  "alcove",
  "descent",
  "danger",
  "safe",
  "boss",
  "hub",
  "command",
  "engineering",
  "airlock",
];

const EXIT_DIRS = ["north", "south", "east", "west", "up", "down"];

const inp = {
  width: "100%",
  padding: "8px 10px",
  background: COLORS.bgInput,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 6,
  color: COLORS.text,
  fontSize: 12,
  fontFamily: "'DM Sans', sans-serif",
  boxSizing: "border-box",
};

function normalizeTags(tags) {
  if (tags == null) return [];
  if (Array.isArray(tags)) return tags.map(String).filter(Boolean);
  if (typeof tags === "object") return Object.keys(tags);
  return [];
}

export default function RoomPropertyPanel({
  zoneId,
  mode = "zone",
  shipId,
  node,
  neighborSlugs = [],
  onSaved,
  onDeleted,
  onRevertRequest,
}) {
  const [raw, setRaw] = useState({});
  const [rawYaml, setRawYaml] = useState("");
  const [activeTab, setActiveTab] = useState("general");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [spawnTemplates, setSpawnTemplates] = useState([]);
  const [newTag, setNewTag] = useState("");
  const [exitDraft, setExitDraft] = useState({ direction: "north", destination: "", description: "" });

  const slug = node?.data?.slug;
  const roomLocalId = node?.data?.slug;

  const neighbors = (neighborSlugs || []).filter((s) => s && s !== slug);

  useEffect(() => {
    axios
      .get(`${API_BASE}/content/entities/spawns`)
      .then((r) => setSpawnTemplates(Array.isArray(r.data) ? r.data : []))
      .catch(() => setSpawnTemplates([]));
  }, []);

  useEffect(() => {
    if (!node?.data?.raw) {
      setRaw({});
      setRawYaml("");
      return;
    }
    setRaw({ ...node.data.raw });
    try {
      setRawYaml(yaml.dump(node.data.raw, { lineWidth: 120 }));
    } catch {
      setRawYaml("");
    }
    setMsg("");
  }, [node]);

  const changeTab = useCallback(
    (t) => {
      if (t === "yaml" && activeTab !== "yaml") {
        try {
          setRawYaml(yaml.dump(raw, { lineWidth: 120 }));
        } catch {
          /* ignore */
        }
      }
      setActiveTab(t);
    },
    [activeTab, raw]
  );

  if (!node) {
    return (
      <div style={{ color: COLORS.textMuted, fontSize: 13, padding: 12, fontFamily: "'DM Sans', sans-serif" }}>
        Select a room node to edit.
      </div>
    );
  }

  const setField = (path, value) => {
    setRaw((prev) => {
      const next = { ...prev };
      if (path === "description.base") {
        next.description = { ...(next.description || {}), base: value };
      } else {
        next[path] = value;
      }
      return next;
    });
  };

  const setTags = (tagsArr) => {
    setRaw((prev) => ({ ...prev, tags: tagsArr }));
  };

  const saveJson = async () => {
    setBusy(true);
    setMsg("");
    try {
      if (mode === "ship" && shipId) {
        await axios.put(`${API_BASE}/content/ships/${shipId}/rooms/${roomLocalId}`, { room: raw });
      } else {
        await axios.put(`${API_BASE}/content/zones/${zoneId}/rooms/${slug}`, { room: raw });
      }
      setMsg("Saved ✓");
      onSaved?.();
    } catch (e) {
      setMsg(e.response?.data?.detail || e.message || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const saveYaml = async () => {
    setBusy(true);
    setMsg("");
    try {
      const parsed = yaml.load(rawYaml);
      if (typeof parsed !== "object" || !parsed) throw new Error("Invalid YAML");
      if (mode === "ship" && shipId) {
        await axios.put(`${API_BASE}/content/ships/${shipId}/rooms/${roomLocalId}`, { room: parsed });
      } else {
        await axios.put(`${API_BASE}/content/zones/${zoneId}/rooms/${slug}`, { room: parsed });
      }
      setRaw(parsed);
      setMsg("Saved ✓");
      onSaved?.();
    } catch (e) {
      setMsg(e.message || "YAML save failed");
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    if (!window.confirm(`Delete room ${slug}?`)) return;
    setBusy(true);
    try {
      await axios.delete(`${API_BASE}/content/zones/${zoneId}/rooms/${slug}`);
      onDeleted?.();
    } catch (e) {
      window.alert(e.response?.data?.detail || e.message);
    } finally {
      setBusy(false);
    }
  };

  const revert = async () => {
    setBusy(true);
    setMsg("");
    try {
      if (mode === "zone" && zoneId && slug) {
        const { data } = await axios.get(`${API_BASE}/content/room/${zoneId}/${slug}/yaml`);
        const text = data.yaml || "";
        const parsed = yaml.load(text);
        if (typeof parsed === "object" && parsed) {
          setRaw(parsed);
          setRawYaml(text);
        }
        setMsg("Reverted from disk.");
      } else {
        setMsg("Reloaded from graph.");
      }
      onRevertRequest?.();
    } catch (e) {
      setMsg(e.response?.data?.detail || e.message || "Revert failed");
      onRevertRequest?.();
    } finally {
      setBusy(false);
    }
  };

  const aiDescribe = async () => {
    setBusy(true);
    setMsg("");
    try {
      const seed = `${raw.description?.base || ""} ${raw.type || "chamber"} ${slug}`.trim();
      const { data } = await axios.post(`${API_BASE}/forge/generate`, {
        seed,
        room_type: raw.type || "chamber",
        depth: Number(raw.depth) || 1,
      });
      const y = data.yaml || "";
      let parsed = null;
      try {
        parsed = yaml.load(y);
      } catch {
        parsed = data.data && typeof data.data === "object" ? data.data : null;
      }
      if (parsed && typeof parsed === "object") {
        const base = parsed.description?.base || parsed.description;
        if (typeof base === "string") {
          setField("description.base", base);
          setMsg("AI text merged — review and Save.");
        } else {
          setMsg("AI returned YAML; check structure.");
        }
      }
    } catch (e) {
      setMsg(e.response?.data?.detail || e.message || "Forge failed");
    } finally {
      setBusy(false);
    }
  };

  const importYaml = () => {
    try {
      const parsed = yaml.load(rawYaml);
      if (typeof parsed === "object" && parsed) {
        setRaw(parsed);
        setMsg("Imported into form — click Save.");
      }
    } catch (e) {
      setMsg(e.message || "Parse error");
    }
  };

  const exitsObj = raw.exits && typeof raw.exits === "object" ? raw.exits : {};
  const tags = normalizeTags(raw.tags);
  const freeDirs = EXIT_DIRS.filter((d) => !exitsObj[d]);

  const formatZoneDestination = (targetSlug) => {
    if (!targetSlug) return "";
    if (mode === "ship") {
      if (targetSlug.startsWith("self:") || targetSlug.startsWith("@")) return targetSlug;
      return `self:${targetSlug}`;
    }
    if (targetSlug.includes(":")) return targetSlug;
    return `${zoneId}:${targetSlug}`;
  };

  const addExit = () => {
    const dir = freeDirs.includes(exitDraft.direction) ? exitDraft.direction : freeDirs[0];
    if (!dir || exitsObj[dir]) {
      setMsg("Pick a free direction.");
      return;
    }
    const dest = formatZoneDestination(exitDraft.destination.trim());
    if (!dest) {
      setMsg("Destination required.");
      return;
    }
    setRaw((prev) => ({
      ...prev,
      exits: {
        ...(prev.exits && typeof prev.exits === "object" ? prev.exits : {}),
        [dir]: { destination: dest, description: exitDraft.description || "" },
      },
    }));
    setExitDraft((d) => ({ ...d, destination: "", description: "" }));
    setMsg("Exit added locally — Save to persist.");
  };

  const removeExit = (dir) => {
    setRaw((prev) => {
      const next = { ...prev };
      const ex = { ...(next.exits || {}) };
      delete ex[dir];
      next.exits = ex;
      return next;
    });
  };

  const updateExitDescription = (dir, description) => {
    setRaw((prev) => {
      const ex = { ...(prev.exits || {}) };
      if (ex[dir]) ex[dir] = { ...ex[dir], description };
      return { ...prev, exits: ex };
    });
  };

  const updateExitDestination = (dir, destination) => {
    setRaw((prev) => {
      const ex = { ...(prev.exits || {}) };
      if (ex[dir]) ex[dir] = { ...ex[dir], destination };
      return { ...prev, exits: ex };
    });
  };

  const addSpawn = () => {
    setRaw((prev) => ({
      ...prev,
      entity_spawns: [...(Array.isArray(prev.entity_spawns) ? prev.entity_spawns : []), { template: "", chance: 1, max_count: 1 }],
    }));
    setMsg("Spawn added — pick template and Save.");
  };

  const removeSpawn = (index) => {
    setRaw((prev) => {
      const list = [...(Array.isArray(prev.entity_spawns) ? prev.entity_spawns : [])];
      list.splice(index, 1);
      return { ...prev, entity_spawns: list };
    });
  };

  const updateSpawn = (index, patch) => {
    setRaw((prev) => {
      const list = [...(Array.isArray(prev.entity_spawns) ? prev.entity_spawns : [])];
      const cur = list[index];
      if (!cur || typeof cur !== "object") return prev;
      list[index] = { ...cur, ...patch };
      return { ...prev, entity_spawns: list };
    });
  };

  const addTag = () => {
    const t = newTag.trim();
    if (!t || tags.includes(t)) return;
    setTags([...tags, t]);
    setNewTag("");
  };

  const removeTag = (t) => {
    setTags(tags.filter((x) => x !== t));
  };

  const descBase = raw.description?.base ?? "";
  const roomName = raw.name ?? "";

  const tabBtn = (id, label) => (
    <button
      key={id}
      type="button"
      onClick={() => changeTab(id)}
      style={{
        flex: 1,
        padding: "8px 4px",
        background: "none",
        border: "none",
        borderBottom: activeTab === id ? `2px solid ${COLORS.accent}` : "2px solid transparent",
        color: activeTab === id ? COLORS.text : COLORS.textMuted,
        fontSize: 10,
        fontFamily: "'DM Sans', sans-serif",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        cursor: "pointer",
        fontWeight: activeTab === id ? 600 : 400,
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", maxHeight: "72vh", overflow: "hidden", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 8, borderBottom: `1px solid ${COLORS.border}` }}>
        <div style={{ width: 3, height: 24, borderRadius: 2, background: ROOM_TYPE_COLORS[raw.type] || COLORS.accent }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, color: COLORS.text, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {node.data?.label || slug}
          </div>
          <div style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: COLORS.textMuted }}>
            {mode === "ship" ? `${shipId}:${slug}` : `${zoneId}:${slug}`}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", borderBottom: `1px solid ${COLORS.border}` }}>
        {tabBtn("general", "General")}
        {tabBtn("exits", "Exits")}
        {tabBtn("entities", "Entities")}
        {tabBtn("yaml", "YAML")}
      </div>

      {msg && (
        <div style={{ fontSize: 10, color: msg.includes("✓") ? COLORS.success : COLORS.warning, fontFamily: "'JetBrains Mono', monospace", padding: "6px 0" }}>{msg}</div>
      )}

      <div style={{ flex: 1, overflow: "auto", paddingTop: 10 }}>
        {activeTab === "general" && (
          <>
            <label style={{ fontSize: 10, color: COLORS.textMuted }}>Display name</label>
            <input type="text" value={roomName} onChange={(e) => setField("name", e.target.value)} style={{ ...inp, marginBottom: 10 }} placeholder="Room title" />

            <label style={{ fontSize: 10, color: COLORS.textMuted }}>Type</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
              {ROOM_TYPES.map((t) => {
                const c = ROOM_TYPE_COLORS[t] || COLORS.textMuted;
                const on = (raw.type || "chamber") === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setField("type", t)}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 4,
                      fontSize: 10,
                      fontFamily: "'JetBrains Mono', monospace",
                      border: `1px solid ${on ? c : COLORS.border}`,
                      background: on ? `${c}22` : "transparent",
                      color: on ? c : COLORS.textMuted,
                      cursor: "pointer",
                    }}
                  >
                    {t}
                  </button>
                );
              })}
            </div>

            <label style={{ fontSize: 10, color: COLORS.textMuted }}>Depth</label>
            <input type="number" value={raw.depth ?? 1} onChange={(e) => setField("depth", Number(e.target.value))} style={{ ...inp, marginBottom: 10 }} />

            <label style={{ fontSize: 10, color: COLORS.textMuted }}>Description</label>
            <textarea
              value={descBase}
              onChange={(e) => setField("description.base", e.target.value)}
              rows={5}
              style={{ ...inp, resize: "vertical", marginBottom: 6 }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={aiDescribe}
              style={{
                padding: "6px 10px",
                background: COLORS.forge,
                color: "#fff",
                border: "none",
                borderRadius: 6,
                fontWeight: 600,
                cursor: "pointer",
                fontSize: 11,
                marginBottom: 10,
              }}
            >
              AI Generate description
            </button>

            <label style={{ fontSize: 10, color: COLORS.textMuted }}>Tags</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 10 }}>
              {tags.map((t) => (
                <span
                  key={t}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 600,
                    color: COLORS.success,
                    background: `${COLORS.success}18`,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {t}
                  <button type="button" onClick={() => removeTag(t)} style={{ background: "none", border: "none", color: COLORS.textMuted, cursor: "pointer", padding: 0, fontSize: 12 }}>
                    ×
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                placeholder="tag"
                style={{ ...inp, maxWidth: 100, padding: "4px 8px", fontSize: 11 }}
              />
              <button type="button" onClick={addTag} style={{ padding: "4px 8px", background: COLORS.bgHover, border: `1px dashed ${COLORS.border}`, borderRadius: 4, color: COLORS.textDim, cursor: "pointer", fontSize: 11 }}>
                + tag
              </button>
            </div>
          </>
        )}

        {activeTab === "exits" && (
          <>
            {Object.entries(exitsObj).map(([dir, ex]) => {
              const dest = typeof ex === "object" && ex ? ex.destination || "" : "";
              const dsc = typeof ex === "object" && ex ? ex.description || "" : "";
              return (
                <div key={dir} style={{ padding: 8, background: COLORS.bgPanel, border: `1px solid ${COLORS.border}`, borderRadius: 8, marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: COLORS.accent, fontFamily: "'JetBrains Mono', monospace" }}>{dir}</span>
                    <button type="button" onClick={() => removeExit(dir)} style={{ background: "none", border: "none", color: COLORS.danger, cursor: "pointer", fontSize: 11 }}>
                      Remove
                    </button>
                  </div>
                  <label style={{ fontSize: 9, color: COLORS.textDim }}>Destination</label>
                  <input type="text" value={dest} onChange={(e) => updateExitDestination(dir, e.target.value)} style={{ ...inp, marginBottom: 6 }} />
                  <label style={{ fontSize: 9, color: COLORS.textDim }}>Description</label>
                  <input type="text" value={dsc} onChange={(e) => updateExitDescription(dir, e.target.value)} style={inp} />
                </div>
              );
            })}

            <div style={{ padding: 8, border: `1px dashed ${COLORS.border}`, borderRadius: 8, marginTop: 4 }}>
              <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 6 }}>+ Add exit</div>
              {freeDirs.length === 0 ? (
                <div style={{ fontSize: 11, color: COLORS.textDim }}>All directions in use — remove one to add.</div>
              ) : (
              <select value={freeDirs.includes(exitDraft.direction) ? exitDraft.direction : freeDirs[0]} onChange={(e) => setExitDraft((d) => ({ ...d, direction: e.target.value }))} style={{ ...inp, marginBottom: 6 }}>
                {freeDirs.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              )}
              {freeDirs.length > 0 && neighbors.length > 0 && (
                <select
                  value=""
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) setExitDraft((d) => ({ ...d, destination: v }));
                    e.target.value = "";
                  }}
                  style={{ ...inp, marginBottom: 6 }}
                >
                  <option value="">Link to room…</option>
                  {neighbors.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              )}
              <input
                type="text"
                placeholder={mode === "ship" ? "Destination (self:room or @special)" : "Destination (slug or zone:slug)"}
                value={exitDraft.destination}
                onChange={(e) => setExitDraft((d) => ({ ...d, destination: e.target.value }))}
                style={{ ...inp, marginBottom: 6 }}
              />
              <input type="text" placeholder="Exit description" value={exitDraft.description} onChange={(e) => setExitDraft((d) => ({ ...d, description: e.target.value }))} style={{ ...inp, marginBottom: 6 }} />
              {freeDirs.length > 0 && (
              <button type="button" onClick={addExit} style={{ width: "100%", padding: 8, background: COLORS.accentGlow, border: `1px solid ${COLORS.borderActive}`, borderRadius: 6, color: COLORS.accent, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                Add exit
              </button>
              )}
            </div>
          </>
        )}

        {activeTab === "entities" && (
          <>
            {(Array.isArray(raw.entity_spawns) ? raw.entity_spawns : []).map((sp, index) => {
              const o = typeof sp === "object" && sp ? sp : { template: String(sp), chance: 1, max_count: 1 };
              return (
                <div key={index} style={{ padding: 8, background: COLORS.bgPanel, border: `1px solid ${COLORS.border}`, borderRadius: 8, marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 10, color: COLORS.textMuted }}>Spawn {index + 1}</span>
                    <button type="button" onClick={() => removeSpawn(index)} style={{ background: "none", border: "none", color: COLORS.danger, cursor: "pointer", fontSize: 11 }}>
                      Remove
                    </button>
                  </div>
                  <label style={{ fontSize: 9, color: COLORS.textDim }}>Template</label>
                  <input
                    type="text"
                    list={`spawn-tpl-${index}`}
                    value={o.template || ""}
                    onChange={(e) => updateSpawn(index, { template: e.target.value })}
                    placeholder="Template id"
                    style={{ ...inp, marginBottom: 6 }}
                  />
                  <datalist id={`spawn-tpl-${index}`}>
                    {spawnTemplates.map((row) => (
                      <option key={row.id || row.name} value={row.name} />
                    ))}
                  </datalist>
                  <label style={{ fontSize: 9, color: COLORS.textDim }}>Chance (0–1)</label>
                  <input
                    type="number"
                    step="0.05"
                    min={0}
                    max={1}
                    value={o.chance ?? 1}
                    onChange={(e) => updateSpawn(index, { chance: Math.min(1, Math.max(0, Number(e.target.value))) })}
                    style={{ ...inp, marginBottom: 6 }}
                  />
                  <label style={{ fontSize: 9, color: COLORS.textDim }}>Max count</label>
                  <input
                    type="number"
                    min={1}
                    value={o.max_count ?? 1}
                    onChange={(e) => updateSpawn(index, { max_count: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                    style={inp}
                  />
                </div>
              );
            })}
            <button
              type="button"
              onClick={addSpawn}
              style={{
                width: "100%",
                padding: 10,
                background: "transparent",
                border: `1px dashed ${COLORS.border}`,
                borderRadius: 8,
                color: COLORS.textMuted,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              + Add entity spawn
            </button>
          </>
        )}

        {activeTab === "yaml" && (
          <>
            <textarea value={rawYaml} onChange={(e) => setRawYaml(e.target.value)} rows={14} style={{ ...inp, fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <button type="button" onClick={importYaml} style={{ padding: "6px 10px", background: COLORS.bgHover, border: `1px solid ${COLORS.border}`, borderRadius: 6, color: COLORS.text, cursor: "pointer", fontSize: 11 }}>
                Parse into form
              </button>
              <button type="button" disabled={busy} onClick={saveYaml} style={{ padding: "6px 10px", background: COLORS.accent, border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 11 }}>
                Save YAML
              </button>
            </div>
          </>
        )}
      </div>

      {/* Undo/redo for the whole builder is deferred; single-room edit history could stack here later. */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 10, borderTop: `1px solid ${COLORS.border}`, marginTop: 8 }}>
        <button type="button" disabled={busy} onClick={saveJson} style={{ padding: "8px 12px", background: COLORS.accent, color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 12 }}>
          Save
        </button>
        <button type="button" disabled={busy} onClick={revert} style={{ padding: "8px 12px", background: COLORS.bgHover, border: `1px solid ${COLORS.border}`, borderRadius: 6, color: COLORS.text, cursor: "pointer", fontSize: 12 }}>
          Revert
        </button>
        {mode === "zone" && (
          <button type="button" disabled={busy} onClick={del} style={{ padding: "8px 12px", background: COLORS.danger, color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 12 }}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
