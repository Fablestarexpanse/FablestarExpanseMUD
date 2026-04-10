import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import uvicorn
import yaml
from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from pydantic import BaseModel
from sqlalchemy import text

from fablestar.admin import content_browser
from fablestar.admin.host_metrics import get_host_snapshot
from fablestar.admin.world_live import build_world_live_snapshot
from fablestar.network.websocket_protocol import WebSocketProtocol

logger = logging.getLogger(__name__)

class ServerStatus(BaseModel):
    is_running: bool
    tick_count: int
    active_sessions: int
    uptime_seconds: float

class PlayAuthBody(BaseModel):
    username: str
    password: str


class ForgeRequest(BaseModel):
    seed: str
    room_type: str = "chamber"
    depth: int = 1

class ForgeInjection(BaseModel):
    id: str
    yaml_content: str

class ForgeGenericRequest(BaseModel):
    category: str
    seed: str
    context: Dict[str, Any] = {}

class ContentInjectBody(BaseModel):
    """Write arbitrary YAML content to a file under content/world/."""
    path: str       # e.g. "entities/stalker" or "items/sword"
    yaml_content: str

class SpawnRequest(BaseModel):
    template: str   # entity template ID to spawn


class AdminBroadcastBody(BaseModel):
    message: str


class LLMSettingsBody(BaseModel):
    primary_backend: Optional[str] = None
    lm_studio_url: Optional[str] = None
    lm_studio_key: Optional[str] = None
    ollama_url: Optional[str] = None
    timeout_seconds: Optional[float] = None
    chat_model: Optional[str] = None
    temperature: Optional[float] = None
    cache_ttl: Optional[int] = None


def _llm_public_config(cfg) -> Dict[str, Any]:
    llm = cfg.llm
    key = llm.lm_studio_key or ""
    return {
        "primary_backend": llm.primary_backend,
        "lm_studio_url": llm.lm_studio_url,
        "lm_studio_key_set": bool(key and key != "not-needed"),
        "ollama_url": llm.ollama_url,
        "timeout_seconds": llm.timeout_seconds,
        "chat_model": llm.chat_model,
        "temperature": llm.temperature,
        "cache_ttl": llm.cache_ttl,
    }


class NexusApp:
    """
    FastAPI-based administration server (The Nexus).
    Provides the backend for the World Administration Console.
    """
    def __init__(self, server: "FablestarServer"):
        self.server = server
        self.app = FastAPI(title="Fablestar Nexus API")
        self._setup_routes()
        self._setup_middleware()
        self._active_sockets: List[WebSocket] = []

    def _setup_middleware(self):
        self.app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"], # In development, allow all
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    def _setup_routes(self):
        @self.app.get("/status", response_model=ServerStatus)
        async def get_status():
            return ServerStatus(
                is_running=self.server.tick_manager.is_running,
                tick_count=self.server.tick_manager.tick_count,
                active_sessions=len(self.server.session_manager.sessions),
                uptime_seconds=self.server.tick_manager.tick_count * self.server.config.server.tick_rate
            )

        @self.app.get("/play/health")
        async def play_health():
            """Cheap check that player REST routes are live (no DB)."""
            return {"ok": True, "play_api": "v1"}

        @self.app.post("/play/auth/login")
        async def play_auth_login(body: PlayAuthBody):
            """Web player: validate credentials and list characters."""
            return await self.server.play_login(body.username, body.password)

        @self.app.post("/play/auth/register")
        async def play_auth_register(body: PlayAuthBody):
            """Web player: create account and default character."""
            return await self.server.play_register(body.username, body.password)

        @self.app.get("/players")
        async def get_players():
            players = []
            redis = self.server.redis
            for sid, session in self.server.session_manager.sessions.items():
                room_id = None
                if session.player_id and redis.client:
                    try:
                        room_id = await redis.get_player_location(session.player_id)
                    except Exception:
                        logger.debug(
                            "get_player_location failed for %s", session.player_id, exc_info=True
                        )
                players.append({
                    "session_id": sid,
                    "player_id": session.player_id,
                    "state": session.state.name,
                    "peer": session.protocol.peer_info,
                    "room_id": room_id,
                })
            return players

        @self.app.post("/admin/sessions/{session_id}/disconnect")
        async def admin_disconnect_session(session_id: str):
            if session_id not in self.server.session_manager.sessions:
                raise HTTPException(status_code=404, detail="Session not found")
            await self.server.session_manager.destroy_session(session_id)
            return {"status": "ok", "session_id": session_id}

        @self.app.post("/admin/broadcast")
        async def admin_broadcast(body: AdminBroadcastBody):
            msg = (body.message or "").strip()
            if not msg:
                raise HTTPException(status_code=400, detail="message is required")
            await self.server.session_manager.broadcast(f"[Server] {msg}")
            return {"status": "ok", "delivered_hint": "playing sessions"}

        @self.app.get("/world/live")
        async def world_live():
            if not self.server.redis.client:
                return await build_world_live_snapshot(None)
            return await build_world_live_snapshot(self.server.redis.client)

        @self.app.get("/admin/metrics")
        async def admin_metrics():
            """Lightweight process snapshot; command/tick histograms deferred."""
            tm = self.server.tick_manager
            cfg = self.server.config.server
            hz = 1.0 / cfg.tick_rate if cfg.tick_rate else 0.0
            return {
                "tick_count": tm.tick_count,
                "tick_rate_hz": hz,
                "active_sessions": len(self.server.session_manager.sessions),
                "is_running": tm.is_running,
                "uptime_seconds": tm.tick_count * cfg.tick_rate,
                "command_metrics": {
                    "note": "Not instrumented yet; hook dispatcher for per-command counts and timing.",
                },
            }

        @self.app.get("/content/overview")
        async def content_overview():
            return content_browser.content_overview()

        @self.app.get("/content/zones")
        async def content_zones():
            return content_browser.list_zones()

        @self.app.get("/content/zones/{zone_id}/rooms")
        async def content_zone_rooms(zone_id: str):
            rows = content_browser.list_rooms(zone_id)
            if not rows and zone_id not in content_browser.list_zone_ids():
                raise HTTPException(status_code=404, detail="Zone not found")
            return rows

        @self.app.get("/content/entities/spawns")
        async def content_entity_spawns():
            return content_browser.aggregate_entity_spawns()

        @self.app.get("/content/items")
        async def content_items():
            return content_browser.list_items()

        @self.app.get("/content/glyphs")
        async def content_glyphs():
            return content_browser.list_glyphs()

        @self.app.get("/content/room/{zone_id}/{room_slug}/yaml")
        async def content_room_yaml(zone_id: str, room_slug: str):
            raw = content_browser.get_room_yaml(zone_id, room_slug)
            if raw is None:
                raise HTTPException(status_code=404, detail="Room not found")
            return {"yaml": raw}

        @self.app.post("/content/cache/reload")
        async def content_cache_reload():
            self.server.content_loader.clear_cache()
            self.server.prompt_manager.reload()
            self.server.last_content_reload_at = datetime.now(timezone.utc).isoformat()
            return {"status": "ok", "message": "Content and prompt caches cleared."}

        @self.app.get("/server/info")
        async def server_info():
            cfg = self.server.config
            redis_ok = False
            try:
                if self.server.redis.client:
                    redis_ok = bool(await self.server.redis.client.ping())
            except Exception:
                redis_ok = False
            db_ok = False
            try:
                async with self.server.db.session_factory() as session:
                    await session.execute(text("SELECT 1"))
                    db_ok = True
            except Exception:
                db_ok = False
            llm_probe = await self.server.llm_client.status_dict(list_timeout=2.0)
            host = await asyncio.to_thread(get_host_snapshot)
            return {
                "tick_rate_hz": 1.0 / cfg.server.tick_rate if cfg.server.tick_rate else 0,
                "tick_interval_s": cfg.server.tick_rate,
                "nexus_port": cfg.server.websocket_port,
                "player_transport": "websocket",
                "max_connections": cfg.server.max_connections,
                "dev_mode": cfg.server.dev_mode,
                "llm_backend": cfg.llm.primary_backend,
                "llm_url": llm_probe["base_url"],
                "llm_model": cfg.llm.chat_model,
                "llm_detected_model": llm_probe.get("detected_model"),
                "llm_models_align": llm_probe.get("models_align"),
                "llm_connected": llm_probe["connected"],
                "llm_latency_ms": llm_probe["latency_ms"],
                "sessions": len(self.server.session_manager.sessions),
                "tick_count": self.server.tick_manager.tick_count,
                "redis_ok": redis_ok,
                "postgres_ok": db_ok,
                "host": host,
                "last_content_reload_at": self.server.last_content_reload_at,
            }

        @self.app.get("/llm/config")
        async def llm_config():
            return _llm_public_config(self.server.config)

        async def _compose_llm_status(*, refresh: bool) -> Dict[str, Any]:
            snap = _llm_public_config(self.server.config)
            probe = await self.server.llm_client.status_dict(bypass_cache=refresh)
            snap.update(
                {
                    "connected": probe["connected"],
                    "latency_ms": probe["latency_ms"],
                    "error": probe["error"],
                    "models": probe["models"],
                    "model_count": probe["model_count"],
                    "model_known": probe["model_known"],
                    "base_url": probe["base_url"],
                    "detected_model": probe.get("detected_model"),
                    "detected_model_source": probe.get("detected_model_source"),
                    "models_align": probe.get("models_align"),
                    "status_cached": probe.get("cached", False),
                }
            )
            return snap

        @self.app.get("/llm/status")
        async def llm_status(refresh: bool = Query(default=False)):
            return await _compose_llm_status(refresh=refresh)

        @self.app.patch("/llm/settings")
        async def llm_settings_patch(body: LLMSettingsBody, persist: bool = Query(default=True)):
            patch = body.model_dump(exclude_none=True)
            try:
                self.server.update_llm_settings(patch, persist=persist)
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e)) from e
            return await _compose_llm_status(refresh=True)

        @self.app.post("/llm/test-completion")
        async def llm_test_completion():
            """Minimal chat completion to verify the pipeline (Forge / look use the same client)."""
            text = await self.server.llm_client.generate(
                'Reply with exactly one word: "pong"',
                system_prompt="You follow instructions literally.",
                max_tokens=16,
            )
            return {"reply": text.strip(), "model": self.server.config.llm.chat_model}

        @self.app.post("/forge/generate")
        async def forge_generate(req: ForgeRequest):
            # 1. Render Prompt
            prompt = self.server.prompt_manager.render(
                "forge_room",
                user_seed=req.seed,
                room_type=req.room_type,
                room_depth=req.depth
            )
            
            # 2. Call LLM
            logger.info(f"Forge: Generating room from seed '{req.seed}'")
            raw_yaml = await self.server.llm_client.generate(prompt, max_tokens=2048)
            
            # 3. Clean and Validate
            try:
                # Ensure it's valid YAML
                parsed = yaml.safe_load(raw_yaml)
                return {"id": parsed.get("id"), "yaml": raw_yaml, "data": parsed}
            except Exception as e:
                logger.error(f"Forge: Failed to parse generated YAML: {e}")
                raise HTTPException(status_code=500, detail="LLM generated invalid YAML. Please retry.")

        @self.app.post("/forge/generate-content")
        async def forge_generate_content(req: ForgeGenericRequest):
            cat = (req.category or "misc").lower().strip().replace(" ", "_")
            if not cat.replace("_", "").isalnum():
                raise HTTPException(status_code=400, detail="Invalid category")
            prompt = self.server.prompt_manager.render(
                "forge_generic",
                category=cat,
                seed=req.seed,
                context=req.context or {},
            )
            logger.info("Forge: generic generate category=%s", cat)
            raw_yaml = await self.server.llm_client.generate(
                prompt,
                system_prompt="You output only valid YAML for a MUD. No markdown.",
                max_tokens=3072,
            )
            try:
                parsed = yaml.safe_load(raw_yaml)
            except Exception as e:
                logger.error("Forge: generic YAML parse failed: %s", e)
                raise HTTPException(status_code=500, detail="LLM returned invalid YAML") from e
            return {"yaml": raw_yaml, "data": parsed, "category": cat}

        @self.app.post("/forge/inject")
        async def forge_inject(injection: ForgeInjection):
            # 1. Validate the path
            try:
                zone_id, room_filename = injection.id.split(":", 1)
                zone_dir = Path("content/world/zones") / zone_id / "rooms"
                zone_dir.mkdir(parents=True, exist_ok=True)
                
                file_path = zone_dir / f"{room_filename}.yaml"
                
                # 2. Write to disk
                with open(file_path, "w", encoding="utf-8") as f:
                    # We use the raw YAML from the LLM or re-serialize
                    f.write(injection.yaml_content)
                
                logger.info(f"Forge: Injected room {injection.id} to {file_path}")
                return {"status": "success", "path": str(file_path)}
            except Exception as e:
                logger.error(f"Forge: Failed to inject room: {e}")
                raise HTTPException(status_code=500, detail=str(e))

        # ---- Entity Template Management ----------------------------------------

        @self.app.get("/content/entities")
        async def list_entity_templates():
            """List all entity templates defined on disk."""
            templates = self.server.content_loader.list_entity_templates()
            return [t.model_dump() for t in templates]

        @self.app.get("/content/entities/{entity_id}/yaml")
        async def get_entity_yaml(entity_id: str):
            """Return raw YAML for an entity template."""
            if not entity_id.replace("_", "").isalnum():
                raise HTTPException(status_code=400, detail="Invalid entity id")
            path = Path("content/world/entities") / f"{entity_id}.yaml"
            if not path.is_file():
                raise HTTPException(status_code=404, detail="Entity not found")
            return {"yaml": path.read_text(encoding="utf-8")}

        @self.app.put("/content/entities/{entity_id}/yaml")
        async def save_entity_yaml(entity_id: str, body: ContentInjectBody):
            """Write/overwrite an entity template YAML file."""
            if not entity_id.replace("_", "").isalnum():
                raise HTTPException(status_code=400, detail="Invalid entity id")
            path = Path("content/world/entities") / f"{entity_id}.yaml"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(body.yaml_content, encoding="utf-8")
            self.server.content_loader.clear_cache()
            return {"status": "saved", "path": str(path)}

        @self.app.post("/content/entities/inject")
        async def inject_entity(body: ContentInjectBody):
            """Save a new entity template to disk (path = 'entities/<id>')."""
            slug = body.path.lstrip("/").removeprefix("entities/").replace("/", "_")
            if not slug.replace("_", "").isalnum():
                raise HTTPException(status_code=400, detail="Invalid path")
            path = Path("content/world/entities") / f"{slug}.yaml"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(body.yaml_content, encoding="utf-8")
            self.server.content_loader.clear_cache()
            return {"status": "injected", "path": str(path)}

        # ---- Item Template Management ------------------------------------------

        @self.app.get("/content/items/{item_id}/yaml")
        async def get_item_yaml(item_id: str):
            """Return raw YAML for an item template."""
            if not item_id.replace("_", "").isalnum():
                raise HTTPException(status_code=400, detail="Invalid item id")
            path = Path("content/world/items") / f"{item_id}.yaml"
            if not path.is_file():
                raise HTTPException(status_code=404, detail="Item not found")
            return {"yaml": path.read_text(encoding="utf-8")}

        @self.app.put("/content/items/{item_id}/yaml")
        async def save_item_yaml(item_id: str, body: ContentInjectBody):
            """Write/overwrite an item template YAML file."""
            if not item_id.replace("_", "").isalnum():
                raise HTTPException(status_code=400, detail="Invalid item id")
            path = Path("content/world/items") / f"{item_id}.yaml"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(body.yaml_content, encoding="utf-8")
            self.server.content_loader.clear_cache()
            return {"status": "saved", "path": str(path)}

        @self.app.post("/content/items/inject")
        async def inject_item(body: ContentInjectBody):
            """Save a new item template to disk (path = 'items/<id>')."""
            slug = body.path.lstrip("/").removeprefix("items/").replace("/", "_")
            if not slug.replace("_", "").isalnum():
                raise HTTPException(status_code=400, detail="Invalid path")
            path = Path("content/world/items") / f"{slug}.yaml"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(body.yaml_content, encoding="utf-8")
            self.server.content_loader.clear_cache()
            return {"status": "injected", "path": str(path)}

        # ---- Room YAML editing -------------------------------------------------

        @self.app.put("/content/room/{zone_id}/{room_slug}/yaml")
        async def save_room_yaml(zone_id: str, room_slug: str, body: ContentInjectBody):
            """Write/overwrite a room YAML file and invalidate cache."""
            from re import match
            if not match(r'^[a-zA-Z0-9_-]+$', zone_id) or not match(r'^[a-zA-Z0-9_-]+$', room_slug):
                raise HTTPException(status_code=400, detail="Invalid zone or room slug")
            path = Path("content/world/zones") / zone_id / "rooms" / f"{room_slug}.yaml"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(body.yaml_content, encoding="utf-8")
            self.server.content_loader.invalidate(path)
            return {"status": "saved", "path": str(path)}

        # ---- Live World State --------------------------------------------------

        @self.app.get("/world/rooms/{zone_id}/{room_slug}/state")
        async def room_live_state(zone_id: str, room_slug: str):
            """Return the live state of a room: players, entities, floor items."""
            room_id = f"{zone_id}:{room_slug}"
            players = list(await self.server.redis.get_room_players(room_id))
            entity_ids = list(await self.server.redis.get_room_entities(room_id))
            item_ids = list(await self.server.redis.get_room_items(room_id))

            entities = []
            for eid in entity_ids:
                state = await self.server.redis.get_entity_state(eid)
                if state:
                    entities.append(state)

            items = []
            for iid in item_ids:
                state = await self.server.redis.get_item_state(iid)
                if state:
                    items.append(state)

            return {
                "room_id": room_id,
                "players": players,
                "entities": entities,
                "floor_items": items,
            }

        @self.app.post("/world/rooms/{zone_id}/{room_slug}/spawn")
        async def manual_spawn(zone_id: str, room_slug: str, body: SpawnRequest):
            """Manually spawn an entity into a room."""
            room_id = f"{zone_id}:{room_slug}"
            entity_id = await self.server.spawner.spawn_entity(room_id, body.template)
            if not entity_id:
                raise HTTPException(status_code=404, detail=f"Entity template '{body.template}' not found")
            state = await self.server.redis.get_entity_state(entity_id)
            return {"status": "spawned", "entity_id": entity_id, "state": state}

        @self.app.delete("/world/entities/{entity_id}")
        async def despawn_entity(entity_id: str):
            """Remove a live entity from the world."""
            state = await self.server.redis.get_entity_state(entity_id)
            if not state:
                raise HTTPException(status_code=404, detail="Entity not found")
            room_id = state.get("room_id", "")
            await self.server.spawner.despawn_entity(entity_id, room_id)
            return {"status": "despawned", "entity_id": entity_id}

        @self.app.get("/world/entities")
        async def list_live_entities():
            """List all live entities currently in the world (scans occupied rooms)."""
            results = []
            seen_rooms: set[str] = set()
            for player_id in self.server.session_manager.player_to_session:
                room_id = await self.server.redis.get_player_location(player_id)
                if room_id and room_id not in seen_rooms:
                    seen_rooms.add(room_id)
                    entity_ids = await self.server.redis.get_room_entities(room_id)
                    for eid in entity_ids:
                        state = await self.server.redis.get_entity_state(eid)
                        if state:
                            results.append(state)
            return results

        # ---- Websockets --------------------------------------------------------

        @self.app.websocket("/ws/play")
        async def websocket_play(websocket: WebSocket):
            """Dedicated WebSocket for the MUD game client."""
            await websocket.accept()
            protocol = WebSocketProtocol(websocket)
            # Create session and run the loop directly — the WebSocket stays
            # open as long as this handler is awaiting (FastAPI keeps it alive).
            session = await self.server.session_manager.create_session(protocol)
            await self.server._session_loop(session)

        @self.app.websocket("/ws/logs")
        async def websocket_logs(websocket: WebSocket):
            await websocket.accept()
            self._active_sockets.append(websocket)
            try:
                while True:
                    await websocket.receive_text() # Keep connection alive
            except WebSocketDisconnect:
                self._active_sockets.remove(websocket)

    async def broadcast_log(self, message: str):
        """Send a log message to all connected admin consoles."""
        for ws in self._active_sockets:
            try:
                await ws.send_json({"type": "log", "content": message})
            except Exception:
                pass

    async def start(self):
        """Run the uvicorn server in the same event loop."""
        config = uvicorn.Config(
            self.app, 
            host="0.0.0.0", 
            port=self.server.config.server.websocket_port,
            log_level="info"
        )
        server = uvicorn.Server(config)
        # Handle the server gracefully
        await server.serve()
