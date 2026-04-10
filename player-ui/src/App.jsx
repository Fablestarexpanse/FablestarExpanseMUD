import { useState, useRef, useEffect, useCallback } from "react";
import { T } from "./theme.js";
import { playLogin, playRegister, playWebSocketUrl } from "./playApi.js";
import FablestarClient from "./mud/FablestarClient.jsx";
import { DEFAULT_NARRATIVE } from "./mud/03-narrative.jsx";

function LoginScreen({ onLoggedIn }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [registerMode, setRegisterMode] = useState(false);
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const fullScreenShell = {
    flex: 1,
    minHeight: 0,
    width: "100%",
    height: "100%",
    background: T.bg.void,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: T.font.body,
    padding: 24,
    boxSizing: "border-box",
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (registerMode) {
        if (password !== password2) {
          setError("Passwords do not match.");
          setBusy(false);
          return;
        }
        const res = await playRegister(username, password);
        if (!res.ok) {
          setError(res.error === "username_taken" ? "That name is already taken." : res.error || "Register failed");
          setBusy(false);
          return;
        }
        onLoggedIn({ username: res.username, accountId: res.account_id, characters: res.characters || [] }, password);
      } else {
        const res = await playLogin(username, password);
        if (!res.ok) {
          setError(res.error === "invalid_credentials" ? "Unknown user or wrong password." : res.error || "Login failed");
          setBusy(false);
          return;
        }
        onLoggedIn({ username: res.username, accountId: res.account_id, characters: res.characters || [] }, password);
      }
    } catch (err) {
      setError(err.message || "Network error — is the Nexus running?");
    }
    setBusy(false);
  };

  return (
    <div style={fullScreenShell}>
      <link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600&family=Cinzel:wght@700&display=swap" rel="stylesheet"/>
      <div style={{
        width: "100%", maxWidth: 400,
        background: T.bg.panel, border: `1px solid ${T.border.dim}`, borderRadius: T.radius.xl,
        boxShadow: T.shadow.panel, padding: "28px 28px 24px",
      }}>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ fontSize: 28, color: T.glyph.violet, marginBottom: 6 }}>◈</div>
          <h1 style={{ fontFamily: T.font.display, fontSize: 22, color: T.text.primary, letterSpacing: "0.12em", fontWeight: 700 }}>FABLESTAR</h1>
          <p style={{ fontSize: 11, color: T.text.muted, marginTop: 6 }}>Expanse — sign in to continue</p>
        </div>
        <form onSubmit={submit}>
          <label style={{ display: "block", fontSize: 10, color: T.text.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Username</label>
          <input
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ width: "100%", marginBottom: 14, padding: "10px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.medium}`, background: T.bg.surface, color: T.text.primary, fontFamily: T.font.mono, fontSize: 13, outline: "none" }}
          />
          <label style={{ display: "block", fontSize: 10, color: T.text.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Password</label>
          <input
            type="password"
            autoComplete={registerMode ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: "100%", marginBottom: registerMode ? 12 : 18, padding: "10px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.medium}`, background: T.bg.surface, color: T.text.primary, fontFamily: T.font.mono, fontSize: 13, outline: "none" }}
          />
          {registerMode && (
            <>
              <label style={{ display: "block", fontSize: 10, color: T.text.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Confirm password</label>
              <input
                type="password"
                autoComplete="new-password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                style={{ width: "100%", marginBottom: 18, padding: "10px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.medium}`, background: T.bg.surface, color: T.text.primary, fontFamily: T.font.mono, fontSize: 13, outline: "none" }}
              />
            </>
          )}
          {error && <div role="alert" style={{ fontSize: 12, color: T.text.danger, marginBottom: 12 }}>{error}</div>}
          <button
            type="submit"
            disabled={busy}
            style={{
              width: "100%", padding: "11px", borderRadius: T.radius.md, border: "none", cursor: busy ? "wait" : "pointer",
              background: `linear-gradient(135deg,${T.glyph.violet},${T.glyph.cyan})`, color: "#0a0a0f", fontWeight: 700, fontFamily: T.font.body, fontSize: 12, letterSpacing: "0.06em",
            }}
          >{busy ? "…" : registerMode ? "Create account" : "Sign in"}</button>
        </form>
        <button
          type="button"
          onClick={() => { setRegisterMode(!registerMode); setError(""); }}
          style={{ width: "100%", marginTop: 12, background: "none", border: "none", color: T.text.muted, fontSize: 11, cursor: "pointer", fontFamily: T.font.body }}
        >{registerMode ? "Have an account? Sign in" : "New conduit? Create account"}</button>
      </div>
    </div>
  );
}

function CharacterChooser({ auth, password, onCancel, onChosen }) {
  const { username, characters } = auth;
  const [selectedId, setSelectedId] = useState(characters[0]?.id ?? null);

  return (
    <div style={{
      flex: 1,
      minHeight: 0,
      width: "100%",
      minHeight: "100%",
      background: T.bg.void,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: T.font.body,
      padding: 24,
      boxSizing: "border-box",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600&family=Cinzel:wght@700&display=swap" rel="stylesheet"/>
      <div style={{ width: "100%", maxWidth: 480 }}>
        <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ fontFamily: T.font.display, fontSize: 18, color: T.text.primary }}>Choose a character</h2>
            <p style={{ fontSize: 11, color: T.text.muted, marginTop: 4 }}>Signed in as <span style={{ color: T.text.accent }}>{username}</span></p>
          </div>
          <button type="button" onClick={onCancel} style={{ padding: "6px 12px", borderRadius: T.radius.md, border: `1px solid ${T.border.medium}`, background: T.bg.surface, color: T.text.muted, fontSize: 10, cursor: "pointer" }}>Back</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {characters.length === 0 && (
            <div style={{ padding: 16, borderRadius: T.radius.lg, border: `1px dashed ${T.border.glyph}`, background: T.glyph.violetDim, color: T.text.secondary, fontSize: 12 }}>
              No saved characters on this account. You will create a default character when you enter the Expanse.
            </div>
          )}
          {characters.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedId(c.id)}
              style={{
                display: "flex", alignItems: "center", gap: 14, padding: 14, textAlign: "left", cursor: "pointer",
                borderRadius: T.radius.lg, border: `1px solid ${selectedId === c.id ? T.border.glyph : T.border.dim}`,
                background: selectedId === c.id ? T.glyph.violetDim : T.bg.panel, color: T.text.primary,
              }}
            >
              <div style={{ width: 44, height: 44, borderRadius: T.radius.md, background: T.bg.surface, border: `1px solid ${T.border.subtle}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: T.glyph.violet }}>◈</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: T.font.display, fontSize: 15, color: T.text.accent }}>{c.name}</div>
                <div style={{ fontSize: 10, fontFamily: T.font.mono, color: T.text.muted, marginTop: 2 }}>{c.room_id}</div>
              </div>
              {selectedId === c.id && <span style={{ fontSize: 10, color: T.text.success }}>●</span>}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            const ch = characters.find((c) => c.id === selectedId);
            onChosen({ characterId: selectedId, characterName: ch?.name ?? username, password });
          }}
          style={{
            width: "100%", marginTop: 20, padding: "12px", borderRadius: T.radius.md, border: "none", cursor: "pointer",
            background: `linear-gradient(135deg,${T.glyph.violet},${T.glyph.cyan})`, color: "#0a0a0f", fontWeight: 700, fontSize: 12,
          }}
        >Enter the Expanse</button>
      </div>
    </div>
  );
}

export default function App() {
  const [step, setStep] = useState("login");
  const [auth, setAuth] = useState(null);
  const passwordRef = useRef("");
  const [playSession, setPlaySession] = useState(null);
  const [narrativeLines, setNarrativeLines] = useState(() => [...DEFAULT_NARRATIVE]);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef(null);

  const onLoggedIn = useCallback((a, pw) => {
    passwordRef.current = pw;
    setAuth(a);
    setStep("choose");
  }, []);

  const disconnectWs = useCallback(() => {
    if (wsRef.current) {
      try { wsRef.current.close(); } catch { /* ignore */ }
      wsRef.current = null;
    }
    setWsConnected(false);
  }, []);

  const onSignOut = useCallback(() => {
    disconnectWs();
    setPlaySession(null);
    setAuth(null);
    passwordRef.current = "";
    setStep("login");
    setNarrativeLines([...DEFAULT_NARRATIVE]);
  }, [disconnectWs]);

  const onChosen = useCallback(({ characterId, characterName, password }) => {
    passwordRef.current = password;
    setPlaySession({
      username: auth.username,
      accountId: auth.accountId,
      characterId,
      characterName,
    });
    setStep("play");
  }, [auth]);

  useEffect(() => {
    if (step !== "play" || !playSession) return undefined;
    const url = playWebSocketUrl();
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      const payload = {
        username: playSession.username,
        password: passwordRef.current,
      };
      if (playSession.characterId != null) payload.character_id = playSession.characterId;
      ws.send(JSON.stringify(payload));
      passwordRef.current = "";
    };

    ws.onmessage = (ev) => {
      const t = typeof ev.data === "string" ? ev.data : "";
      const trimmed = t.trim();
      try {
        const j = JSON.parse(trimmed);
        if (j && j.ok === false) {
          setNarrativeLines((prev) => [...prev, { type: "alert", text: `Connection refused: ${j.error}`, level: "danger" }]);
          ws.close();
          return;
        }
      } catch {
        /* narrative text */
      }
      const parts = t.split(/\r?\n/).filter((line) => line.length > 0);
      if (parts.length === 0) return;
      setNarrativeLines((prev) => [...prev, ...parts.map((text) => ({ type: "raw", text }))]);
    };

    ws.onclose = () => {
      setWsConnected(false);
      wsRef.current = null;
    };

    ws.onerror = () => {
      setWsConnected(false);
    };

    return () => {
      disconnectWs();
    };
  }, [step, playSession, disconnectWs]);

  const onSendCommand = useCallback((cmd) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      setNarrativeLines((prev) => [...prev, { type: "action", text: `> ${cmd}`, ts: new Date().toLocaleTimeString([], { hour12: false }) }]);
      ws.send(cmd);
    }
  }, []);

  const appShell = { flex: 1, minHeight: 0, width: "100%", height: "100%", display: "flex", flexDirection: "column" };

  if (step === "login") {
    return <div style={appShell}><LoginScreen onLoggedIn={onLoggedIn} /></div>;
  }
  if (step === "choose" && auth) {
    return (
      <div style={appShell}>
        <CharacterChooser
          auth={auth}
          password={passwordRef.current}
          onCancel={onSignOut}
          onChosen={onChosen}
        />
      </div>
    );
  }
  if (step === "play" && playSession) {
    return (
      <div style={appShell}>
        <FablestarClient
          session={{
            username: playSession.username,
            characterName: playSession.characterName,
          }}
          onSignOut={onSignOut}
          narrativeLines={narrativeLines}
          onSendCommand={onSendCommand}
          wsConnected={wsConnected}
        />
      </div>
    );
  }
  return <div style={appShell} />;
}
