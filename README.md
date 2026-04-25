# Fablestar MUD Platform

[![Repository](https://img.shields.io/badge/GitHub-FablestarExpanseMUD-181717?logo=github)](https://github.com/Fablestarexpanse/FablestarExpanseMUD)

A next-generation MUD engine built with Python, focused on rapid iteration (“vibe coding”) and optional LLM-backed narration.

**Repository:** [https://github.com/Fablestarexpanse/FablestarExpanseMUD](https://github.com/Fablestarexpanse/FablestarExpanseMUD)

## Key features

- **Deterministic engine** — Game logic in Python; narration can be augmented by an LLM.
- **Sub-second hot reload** — Edit YAML under `content/` or Python commands with minimal downtime.
- **Admin console** — React admin app with **AI Forge** and world tooling; optional **multi-staff** logins, live **team presence**, and **head-admin** control over tools and world zones.
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

TOML files in `config/` are merged at startup (see `src/fablestar/core/config.py`). Live config files are **gitignored** — copy the example files to get started:

```bash
cp config/server.example.toml config/server.toml
cp config/database.example.toml config/database.toml
```

- `config/server.toml` — Nexus port, tick rate, dev flags, `admin_auth_required`, JWT secret, and CORS origins.
- `config/database.toml` — PostgreSQL connection (must match `docker-compose.yml` / your DB credentials).

You can add more files in `config/` (for example `redis.toml`, `llm.toml`) to override Redis and LLM defaults from code.

Environment overrides use the prefix `FABLESTAR_`, e.g. `FABLESTAR_SERVER__WEBSOCKET_PORT=8001`.

Set a strong JWT secret when using staff auth: `FABLESTAR_ADMIN_JWT_SECRET` (or `admin_jwt_secret` in `server.toml`).

### Admin staff (optional)

When `admin_auth_required = true` in `config/server.toml`, the Nexus admin/content/forge/LLM HTTP routes require a **Bearer** token from `POST /admin/auth/login`. Player routes (`/play/*`, `/ws/play`) are unchanged.

1. Run migrations: `python -m alembic upgrade head`
2. Create the first **head admin**:  
   `python scripts/bootstrap_admin.py --username youradmin --password 'a-strong-password'`
3. Set `admin_auth_required = true` in `config/server.toml` and restart Nexus.
4. Sign in via the admin UI. **Head admins** use **Team & access** to add **admin** or **GM** accounts, assign allowed **tools** (sidebar areas), and **zones** (`*` for all, or comma-separated zone ids such as `test_zone`).

Live **team presence** uses WebSocket `/ws/admin` — the admin UI connects automatically and sends the JWT as the first message after the connection opens. `GET /admin/presence` returns the same snapshot over HTTP.

With `admin_auth_required = false` (opt-in, for trusted-LAN dev only), Nexus uses a synthetic full-access **Developer** context and no JWT is required.

## Running locally

### 1. Start Redis and PostgreSQL (Docker)

From the repo root:

```bash
docker compose up -d redis postgres
```

The bundled `docker-compose.yml` matches the DB user/database in `config/database.toml` (copy from `config/database.example.toml`). Optional: `ollama` service for local models.

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

The HTTP/WebSocket **Nexus** exposes the admin REST API and powers the admin UI. **`admin_auth_required = true` is the default** — staff must authenticate via `POST /admin/auth/login` before accessing any admin route. Set `admin_auth_required = false` only for development on a trusted LAN; treat that mode as fully open.

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
