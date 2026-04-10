# Fablestar MUD Platform

[![Repository](https://img.shields.io/badge/GitHub-FablestarExpanseMUD-181717?logo=github)](https://github.com/Fablestarexpanse/FablestarExpanseMUD)

A next-generation MUD engine built with Python, focused on rapid iteration (“vibe coding”) and optional LLM-backed narration.

**Repository:** [https://github.com/Fablestarexpanse/FablestarExpanseMUD](https://github.com/Fablestarexpanse/FablestarExpanseMUD)

## Key features

- **Deterministic engine** — Game logic in Python; narration can be augmented by an LLM.
- **Sub-second hot reload** — Edit YAML under `content/` or Python commands with minimal downtime.
- **Admin console** — React admin app with **AI Forge** and world tooling.
- **Player client** — React player UI over WebSocket (`/play` on Nexus).
- **Local LLMs** — LM Studio or Ollama (optional `config/llm.toml` or admin UI settings).

## Stack

| Layer | Technology |
|--------|------------|
| Server | Python 3.11+, FastAPI, uvicorn, Redis, PostgreSQL |
| Admin UI | React, Vite (`admin-ui/`) |
| Player UI | React, Vite (`player-ui/`) |

## Prerequisites

- **Python 3.11+**
- **Node.js** (LTS recommended) for the UIs
- **Redis** and **PostgreSQL** (or run them with Docker — see below)

## Installation

From the repository root:

```bash
pip install -e .
```

On Windows, if the `fablestar` script is not on your `PATH`, use:

```bash
python -m fablestar
```

Install UI dependencies once per app:

```bash
cd admin-ui && npm install && cd ..
cd player-ui && npm install && cd ..
```

## Configuration

TOML files in `config/` are merged at startup (see `src/fablestar/core/config.py`). This repo includes:

- `config/server.toml` — Nexus HTTP/WebSocket port, tick rate, dev flags.
- `config/database.toml` — PostgreSQL connection (aligned with `docker-compose.yml`).

You can add more files in `config/` (for example `redis.toml`, `llm.toml`) to override Redis and LLM defaults from code.

Environment overrides use the prefix `FABLESTAR_`, e.g. `FABLESTAR_SERVER__WEBSOCKET_PORT=8001`.

## Running locally

### 1. Start Redis and PostgreSQL (Docker)

From the repo root:

```bash
docker compose up -d redis postgres
```

The bundled `docker-compose.yml` matches the default DB user/database in `config/database.toml`. Optional: `ollama` service for local models.

### 2. Start the game server (Nexus)

From the repo root (so `config/` resolves correctly):

```bash
python -m fablestar
```

Default Nexus port is set in `config/server.toml` (currently **8001**). Nexus serves the REST admin API, WebSocket admin updates, and the `/play` WebSocket for clients.

### 3. Start the admin UI (development)

The admin app defaults to API port **4001** in code; if your `server.toml` uses **8001**, point Vite at Nexus:

**PowerShell**

```powershell
cd admin-ui
$env:VITE_API_BASE="http://localhost:8001"
$env:VITE_WS_BASE="ws://localhost:8001"
npm run dev -- --port 5174 --host
```

**bash**

```bash
cd admin-ui
VITE_API_BASE=http://localhost:8001 VITE_WS_BASE=ws://localhost:8001 npm run dev -- --port 5174 --host
```

Open [http://localhost:5174](http://localhost:5174).

### 4. Start the player UI (development)

**PowerShell**

```powershell
cd player-ui
$env:VITE_NEXUS_PORT="8001"
npm run dev -- --port 5173 --host
```

**bash**

```bash
cd player-ui
VITE_NEXUS_PORT=8001 npm run dev -- --port 5173 --host
```

Open [http://localhost:5173](http://localhost:5173).

### Ports (typical dev setup)

| Service | Default URL |
|--------|----------------|
| Nexus (API + WebSocket) | `http://localhost:8001` (from `config/server.toml`) |
| Admin UI (Vite) | `http://localhost:5174` |
| Player UI (Vite) | `http://localhost:5173` |
| PostgreSQL (Docker) | `localhost:5432` |
| Redis (Docker) | `localhost:6379` |

## Nexus admin API (security)

The HTTP/WebSocket **Nexus** exposes the admin REST API and powers the admin UI. **There is no authentication on these routes today.** Treat it as **development / trusted-LAN only**: bind to localhost or a private network, or put a reverse proxy with auth in front before any public exposure.

Operator-oriented endpoints used by the **Operations** console include:

- `GET /players` — live sessions plus `room_id` when Redis has a location for the character
- `POST /admin/sessions/{session_id}/disconnect` — force-close a session
- `POST /admin/broadcast` — message all **playing** sessions (prefixed with `[Server] `)
- `GET /world/live` — best-effort Redis aggregates (rooms with players, combat/entity/item key counts)
- `GET /admin/metrics` — tick/session snapshot; per-command counters are not instrumented yet

Add API keys or OIDC before exposing Nexus on the public internet.

## Philosophy

**Vibe coding** — fast feedback loops and safe iteration on content and code.

**Golden rule** — LLMs describe what happened; deterministic systems decide what happens.

## License

MIT — see `pyproject.toml`.
