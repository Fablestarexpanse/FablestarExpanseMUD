/**
 * Nexus HTTP origin, or "" in dev to use the Vite proxy (same-origin /play, /media).
 * Set VITE_NEXUS_URL to talk to Nexus directly (remote API or no proxy).
 */
function base() {
  const explicit = (import.meta.env.VITE_NEXUS_URL || "").trim().replace(/\/$/, "");
  if (explicit) return explicit;
  if (import.meta.env.DEV) return "";
  return `http://127.0.0.1:${import.meta.env.VITE_NEXUS_PORT || "8001"}`.replace(/\/$/, "");
}

async function handlePlayResponse(r) {
  if (r.status === 404) {
    let detail = "";
    try {
      const j = await r.clone().json();
      if (typeof j?.detail === "string") detail = j.detail;
    } catch {
      /* ignore */
    }
    throw new Error(
      detail === "Not Found"
        ? "This Nexus process does not know that route (HTTP 404). Stop any old python -m fablestar on this port and start it again from the current project (python -m fablestar) so /play routes match your client."
        : "Player route not found (HTTP 404). Restart Nexus from the project root: python -m fablestar — an old process on the port will be missing newer /play routes."
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
  const b = base();
  if (!b && typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/ws/play`;
  }
  const u = new URL(b || `http://127.0.0.1:${import.meta.env.VITE_NEXUS_PORT || "8001"}`);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = "/ws/play";
  u.search = "";
  u.hash = "";
  return u.toString();
}

/** Absolute URL for a Nexus path (e.g. character portrait). Optional cacheBust avoids stale browser cache on regenerate. */
export function playMediaUrl(relativePath, cacheBust) {
  if (!relativePath) return null;
  const p = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
  let u = `${base()}${p}`;
  if (cacheBust != null && cacheBust !== "") {
    u += `${u.includes("?") ? "&" : "?"}v=${encodeURIComponent(String(cacheBust))}`;
  }
  return u;
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

/** draftPortraitPrompt: rough text from the portrait field; sent as appearance_notes for the LLM template. */
export async function playSuggestPortraitPrompt(username, password, character_name, draftPortraitPrompt) {
  const r = await fetch(`${base()}/play/characters/suggest-portrait-prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      password,
      character_name: character_name || "",
      appearance_notes: draftPortraitPrompt || "",
    }),
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

/** Re-fetch characters + account fields (is_gm, echo_credits) from Nexus. */
export async function playRefreshSession(username, password) {
  const r = await fetch(`${base()}/play/auth/characters`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return handlePlayResponse(r);
}

/** Deletes via POST /play/auth/characters so it works on Nexus builds that lack /play/characters/delete. */
async function parsePlayJson(r) {
  try {
    return await r.json();
  } catch {
    return null;
  }
}

function playHttpError(r, data) {
  if (r.status === 404) {
    const detail = typeof data?.detail === "string" ? data.detail : "";
    throw new Error(
      detail === "Not Found"
        ? "This Nexus process does not know that route (HTTP 404). Stop any old python -m fablestar on this port and start it again from the current project (python -m fablestar) so /play routes match your client."
        : "Player route not found (HTTP 404). Restart Nexus from the project root: python -m fablestar — an old process on the port will be missing newer /play routes."
    );
  }
  const msg = data?.detail
    ? typeof data.detail === "string"
      ? data.detail
      : JSON.stringify(data.detail)
    : `HTTP ${r.status}`;
  throw new Error(msg);
}

/** Detect stale Nexus: /play/auth/characters ignored suggest_scene and returned a character list. */
function assertSceneSuggestShape(data) {
  if (data && data.ok && data.prompt == null && Array.isArray(data.characters)) {
    throw new Error(
      "Scene LLM suggest is not available on this Nexus build. Restart from the project root: python -m fablestar"
    );
  }
}

function assertSceneGenerateShape(data) {
  if (data && data.ok && data.scene_image_url == null && Array.isArray(data.characters)) {
    throw new Error(
      "Scene image generate is not available on this Nexus build. Restart from the project root: python -m fablestar"
    );
  }
}

export async function playSuggestScenePrompt(username, password, narrative_context, room_hint) {
  const payload = {
    username,
    password,
    narrative_context: narrative_context || "",
    room_hint: room_hint || "",
  };
  let r = await fetch(`${base()}/play/scene/suggest-prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (r.status === 404) {
    r = await fetch(`${base()}/play/auth/characters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, suggest_scene: true }),
    });
  }
  if (!r.ok) {
    const data = await parsePlayJson(r);
    playHttpError(r, data);
  }
  const data = await parsePlayJson(r);
  assertSceneSuggestShape(data);
  return data;
}

export async function playGenerateSceneImage(username, password, scene_prompt, character_id) {
  const payload = {
    username,
    password,
    scene_prompt: scene_prompt || "",
    ...(character_id != null && character_id >= 1 ? { character_id } : {}),
  };
  let r = await fetch(`${base()}/play/scene/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (r.status === 404) {
    r = await fetch(`${base()}/play/auth/characters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, generate_scene: true }),
    });
  }
  if (!r.ok) {
    const data = await parsePlayJson(r);
    playHttpError(r, data);
  }
  const data = await parsePlayJson(r);
  assertSceneGenerateShape(data);
  return data;
}

export async function playListSceneGallery(username, password) {
  const r = await fetch(`${base()}/play/scene/gallery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return handlePlayResponse(r);
}

export async function playApplySceneFromGallery(username, password, gallery_id, character_id) {
  const r = await fetch(`${base()}/play/scene/apply-gallery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      password,
      gallery_id,
      character_id,
    }),
  });
  return handlePlayResponse(r);
}

export async function playDeleteCharacter(username, password, character_id) {
  const r = await fetch(`${base()}/play/auth/characters`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      password,
      delete_character_id: character_id,
    }),
  });
  return handlePlayResponse(r);
}
