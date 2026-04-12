const base = () => (import.meta.env.VITE_NEXUS_URL || `http://127.0.0.1:${import.meta.env.VITE_NEXUS_PORT || "8001"}`).replace(/\/$/, "");

async function handlePlayResponse(r) {
  if (r.status === 404) {
    throw new Error(
      "Player API not found (HTTP 404). Restart the game server from the project root: python -m fablestar — an old process on the Nexus port will not have /play routes."
    );
  }
  let data;
  try {
    data = await r.json();
  } catch {
    data = null;
  }
  if (!r.ok) {
    const msg = data?.detail ? (typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail)) : `HTTP ${r.status}`;
    throw new Error(msg);
  }
  return data;
}

export async function playLogin(username, password) {
  const r = await fetch(`${base()}/play/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return handlePlayResponse(r);
}

export async function playRegister(username, password) {
  const r = await fetch(`${base()}/play/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return handlePlayResponse(r);
}

export function playWebSocketUrl() {
  const u = new URL(base());
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = "/ws/play";
  u.search = "";
  u.hash = "";
  return u.toString();
}

/** Absolute URL for a Nexus path (e.g. character portrait). */
export function playMediaUrl(relativePath) {
  if (!relativePath) return null;
  const p = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
  return `${base()}${p}`;
}

export async function playComfyuiStatus() {
  const r = await fetch(`${base()}/play/comfyui/status`);
  return handlePlayResponse(r);
}

export async function playGeneratePortrait(username, password, appearance_prompt) {
  const r = await fetch(`${base()}/play/characters/portrait`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, appearance_prompt }),
  });
  return handlePlayResponse(r);
}

export async function playCreateCharacter(username, password, name, portrait_prompt, portrait_url) {
  const r = await fetch(`${base()}/play/characters/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      password,
      name,
      portrait_prompt: portrait_prompt || "",
      portrait_url: portrait_url || "",
    }),
  });
  return handlePlayResponse(r);
}
