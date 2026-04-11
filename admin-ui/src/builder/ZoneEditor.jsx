import { useCallback, useEffect, useState, forwardRef, useImperativeHandle } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  addEdge,
  ConnectionMode,
  MarkerType,
  useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import axios from "axios";
import RoomNode from "./RoomNode.jsx";
import ExitEdge from "./ExitEdge.jsx";
import { layoutGraph } from "./AutoLayout.js";
import ValidationPanel, { runZoneValidation } from "./ValidationPanel.jsx";
import RoomPropertyPanel from "./RoomPropertyPanel.jsx";
import { COLORS, API_BASE } from "./builderConstants.js";
import "./builder.css";

const nodeTypes = { room: RoomNode };
const edgeTypes = { exit: ExitEdge };

function ZoneEditorInner({ zoneId, onSync, forwardedRef, navigateRoomSlug, onNavigateRoomDone }) {
  const rf = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState("graph");
  const [tableRows, setTableRows] = useState([]);
  const [issues, setIssues] = useState([]);
  const [loadErr, setLoadErr] = useState("");
  const [syncMsg, setSyncMsg] = useState("");
  const [extExits, setExtExits] = useState([]);
  const [graphFind, setGraphFind] = useState("");

  const neighborSlugs = nodes.map((n) => n.data?.slug).filter(Boolean);

  const loadGraph = useCallback(
    async (opts) => {
      const keepSlug = opts?.keepSlug;
      if (!zoneId) return;
      setLoadErr("");
      try {
        const { data } = await axios.get(`${API_BASE}/content/zones/${zoneId}/graph`);
        const n = (data.nodes || []).map((x) => ({ ...x, type: "room" }));
        const e = (data.edges || []).map((x) => ({
          ...x,
          type: "exit",
          markerEnd: { type: MarkerType.ArrowClosed, color: COLORS.borderActive, width: 18, height: 18 },
        }));
        setNodes(n);
        setEdges(e);
        setExtExits(data.external_exits || []);
        setIssues(runZoneValidation(n, e, data.external_exits || []));
        if (keepSlug) {
          const found = n.find((node) => node.data?.slug === keepSlug);
          setSelected(found || null);
        }
      } catch (e) {
        setLoadErr(String(e.response?.data?.detail || e.message));
      }
    },
    [zoneId, setNodes, setEdges]
  );

  const savePositions = useCallback(async () => {
    const positions = {};
    rf.getNodes().forEach((n) => {
      if (n.data?.slug) positions[n.data.slug] = { x: n.position.x, y: n.position.y };
    });
    try {
      await axios.put(`${API_BASE}/content/zones/${zoneId}/positions`, { positions });
      setSyncMsg("Positions saved ✓");
    } catch (e) {
      window.alert(e.response?.data?.detail || e.message);
    }
  }, [rf, zoneId]);

  useImperativeHandle(
    forwardedRef,
    () => ({
      savePositions,
    }),
    [savePositions]
  );

  useEffect(() => {
    if (!zoneId) return;
    if (navigateRoomSlug) return;
    loadGraph();
  }, [zoneId, loadGraph, navigateRoomSlug]);

  useEffect(() => {
    if (!zoneId || !navigateRoomSlug) return;
    let cancelled = false;
    (async () => {
      await loadGraph({ keepSlug: navigateRoomSlug });
      if (cancelled) return;
      requestAnimationFrame(() => {
        const n = rf.getNodes().find((nd) => nd.data?.slug === navigateRoomSlug);
        if (n) {
          setSelected(n);
          try {
            rf.fitView({ nodes: [n], duration: 450, padding: 0.35, maxZoom: 1.35 });
          } catch {
            /* ignore */
          }
        }
        onNavigateRoomDone?.();
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [zoneId, navigateRoomSlug, loadGraph, rf, onNavigateRoomDone]);

  useEffect(() => {
    if (!zoneId || tab !== "table") return;
    axios
      .get(`${API_BASE}/content/zones/${zoneId}/rooms`)
      .then((r) => setTableRows(r.data))
      .catch(() => setTableRows([]));
  }, [zoneId, tab]);

  const onConnect = useCallback(
    async (p) => {
      const ns = rf.getNodes();
      const sourceNode = ns.find((n) => n.id === p.source);
      const targetNode = ns.find((n) => n.id === p.target);
      if (!sourceNode || !targetNode || !p.sourceHandle) return;
      const raw = { ...(sourceNode.data.raw || {}) };
      const exits = { ...(raw.exits || {}) };
      exits[p.sourceHandle] = {
        destination: targetNode.data.roomId,
        description: "",
      };
      raw.exits = exits;
      try {
        await axios.put(`${API_BASE}/content/zones/${zoneId}/rooms/${sourceNode.data.slug}`, { room: raw });
        setEdges((eds) =>
          addEdge(
            {
              ...p,
              type: "exit",
              markerEnd: { type: MarkerType.ArrowClosed, color: COLORS.borderActive, width: 18, height: 18 },
              data: { direction: p.sourceHandle },
            },
            eds
          )
        );
        await loadGraph({ keepSlug: sourceNode.data?.slug });
        setSyncMsg("Synced ✓");
        onSync?.();
      } catch (e) {
        window.alert(e.response?.data?.detail || e.message);
      }
    },
    [rf, zoneId, setEdges, loadGraph, onSync]
  );

  const runLayout = async () => {
    const ns = rf.getNodes();
    const es = rf.getEdges();
    const laid = await layoutGraph(ns, es, "layered");
    setNodes(laid);
  };

  const validate = () => {
    setIssues(runZoneValidation(rf.getNodes(), rf.getEdges(), extExits));
  };

  const focusRoomBySearch = () => {
    const q = graphFind.trim().toLowerCase();
    if (!q) return;
    const n = rf.getNodes().find(
      (nd) =>
        String(nd.data?.slug || "")
          .toLowerCase()
          .includes(q) ||
        String(nd.data?.label || "")
          .toLowerCase()
          .includes(q)
    );
    if (n) {
      setSelected(n);
      try {
        rf.fitView({ nodes: [n], duration: 400, padding: 0.35, maxZoom: 1.35 });
      } catch {
        /* ignore */
      }
    } else {
      window.alert("No room matches that substring.");
    }
  };

  const addRoom = () => {
    const slug = window.prompt("New room slug (e.g. alcove_02):", "");
    if (!slug || !/^[a-zA-Z0-9_-]+$/.test(slug)) return;
    axios
      .post(`${API_BASE}/content/zones/${zoneId}/rooms`, { slug, room: {} })
      .then(() => {
        loadGraph();
        setSyncMsg("Room created ✓");
        onSync?.();
      })
      .catch((e) => window.alert(e.response?.data?.detail || e.message));
  };

  const onNodesDelete = useCallback(
    async (deleted) => {
      for (const n of deleted) {
        const s = n.data?.slug;
        if (!s) continue;
        try {
          await axios.delete(`${API_BASE}/content/zones/${zoneId}/rooms/${s}`);
        } catch (e) {
          window.alert(e.response?.data?.detail || e.message);
        }
      }
      await loadGraph();
      setSelected(null);
      onSync?.();
    },
    [zoneId, loadGraph, onSync]
  );

  const btn = {
    padding: "6px 10px",
    fontSize: 11,
    fontWeight: 600,
    borderRadius: 6,
    border: `1px solid ${COLORS.border}`,
    background: COLORS.bgCard,
    color: COLORS.text,
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
  };

  if (!zoneId) {
    return <div style={{ color: COLORS.textMuted, padding: 16 }}>Pick a zone from the breadcrumb or surface view.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "100%", minHeight: 480 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" style={{ ...btn, background: tab === "graph" ? COLORS.accentGlow : COLORS.bgCard }} onClick={() => setTab("graph")}>
          Graph
        </button>
        <button type="button" style={{ ...btn, background: tab === "table" ? COLORS.accentGlow : COLORS.bgCard }} onClick={() => setTab("table")}>
          Table
        </button>
        {syncMsg && (
          <span style={{ fontSize: 11, color: COLORS.success, fontFamily: "'JetBrains Mono', monospace" }}>{syncMsg}</span>
        )}
      </div>

      {loadErr && <div style={{ color: COLORS.danger, fontSize: 12 }}>{loadErr}</div>}

      {tab === "table" && (
        <div
          style={{
            background: COLORS.bgCard,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            padding: 12,
            fontSize: 12,
            color: COLORS.textMuted,
            fontFamily: "'JetBrains Mono', monospace",
            maxHeight: 400,
            overflow: "auto",
          }}
        >
          {(tableRows || []).map((r) => (
            <div key={r.id} style={{ padding: "4px 0", borderBottom: `1px solid ${COLORS.border}` }}>
              {r.id} · {r.type} · exits {String(r.exits || [])}
            </div>
          ))}
        </div>
      )}

      {tab === "graph" && (
        <div style={{ display: "flex", flex: 1, gap: 12, minHeight: 420 }}>
          <div
            className="world-builder-flow"
            style={{
              flex: 1,
              position: "relative",
              borderRadius: 10,
              border: `1px solid ${COLORS.border}`,
              minHeight: 400,
            }}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodeDoubleClick={(_, n) => setSelected(n)}
              onSelectionChange={({ nodes: ns }) => setSelected(ns[0] || null)}
              onNodesDelete={onNodesDelete}
              fitView
              connectionMode={ConnectionMode.Loose}
              deleteKeyCode={["Backspace", "Delete"]}
            >
              <Background color={COLORS.border} gap={22} />
              <Controls />
              <MiniMap pannable zoomable />
              <Panel position="top-left">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, background: COLORS.bgPanel, padding: 8, borderRadius: 8, border: `1px solid ${COLORS.border}`, alignItems: "center" }}>
                  <input
                    type="search"
                    placeholder="Find room…"
                    value={graphFind}
                    onChange={(e) => setGraphFind(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && focusRoomBySearch()}
                    style={{
                      width: 120,
                      padding: "5px 8px",
                      fontSize: 11,
                      borderRadius: 6,
                      border: `1px solid ${COLORS.border}`,
                      background: COLORS.bgInput,
                      color: COLORS.text,
                    }}
                  />
                  <button type="button" style={btn} onClick={focusRoomBySearch}>
                    Go
                  </button>
                  <button type="button" style={btn} onClick={savePositions}>
                    Save positions
                  </button>
                  <button type="button" style={btn} onClick={runLayout}>
                    Auto layout
                  </button>
                  <button type="button" style={btn} onClick={validate}>
                    Validate
                  </button>
                  <button type="button" style={btn} onClick={addRoom}>
                    Add room
                  </button>
                  <button type="button" style={btn} onClick={() => loadGraph()}>
                    Reload
                  </button>
                </div>
              </Panel>
            </ReactFlow>
          </div>
          <div
            style={{
              width: 328,
              flexShrink: 0,
              background: COLORS.bgCard,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 10,
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, textTransform: "uppercase" }}>Validation</div>
            <ValidationPanel issues={issues} />
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, textTransform: "uppercase", marginTop: 8 }}>Properties</div>
            <RoomPropertyPanel
              zoneId={zoneId}
              mode="zone"
              node={selected}
              neighborSlugs={neighborSlugs}
              onSaved={() => {
                const s = selected?.data?.slug;
                loadGraph({ keepSlug: s });
                setSyncMsg("Synced ✓");
                onSync?.();
              }}
              onRevertRequest={() => {
                const s = selected?.data?.slug;
                loadGraph({ keepSlug: s });
              }}
              onDeleted={() => {
                setSelected(null);
                loadGraph();
                onSync?.();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

const ZoneEditor = forwardRef(function ZoneEditor(props, ref) {
  return (
    <ReactFlowProvider>
      <ZoneEditorInner {...props} forwardedRef={ref} />
    </ReactFlowProvider>
  );
});

export default ZoneEditor;
