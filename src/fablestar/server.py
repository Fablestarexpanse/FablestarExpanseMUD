import asyncio
import json
import logging
from datetime import datetime
from typing import Any, Dict, Optional

import bcrypt
from sqlalchemy import select

from fablestar.admin.llm_persist import save_llm_toml
from fablestar.core.config import Config, LLMConfig, load_config
from fablestar.core.events import EventBus
from fablestar.core.tick import TickManager
from fablestar.network.session import SessionManager, Session
from fablestar.state.redis_client import RedisState
from fablestar.state.postgres import PostgresState
from fablestar.state.persistence import PersistenceManager
from fablestar.state.models import Account, Character
from fablestar.world.loader import ContentLoader
from fablestar.world.spawner import EntitySpawnManager
from fablestar.admin.nexus import NexusApp
from fablestar.tools.hot_reload import HotReloader
from fablestar.parser.dispatcher import CommandDispatcher
from fablestar.commands.registry import registry
from fablestar.llm.client import LLMClient
from fablestar.llm.prompts import PromptManager
from fablestar import app
from pathlib import Path

logger = logging.getLogger(__name__)


def _snapshot_from_orm(character: Any) -> Any:
    """Plain snapshot usable after the SQLAlchemy session closes."""
    return type("_CharSnapshot", (), {
        "name": character.name,
        "room_id": character.room_id,
        "stats": dict(character.stats or {}),
        "inventory": list(character.inventory or []),
    })()


class FablestarServer:
    """
    Main orchestration class for the Fablestar MUD Platform.
    Ties together core systems and manages the server lifecycle.
    """
    def __init__(self, config: Optional[Config] = None):
        self.config = config or load_config()
        self.event_bus = EventBus()
        self.tick_manager = TickManager(tick_rate=self.config.server.tick_rate)
        self.session_manager = SessionManager()
        self.redis = RedisState(self.config.redis)
        self.db = PostgresState(self.config.database)
        self.persistence = PersistenceManager(self)
        self.content_loader = ContentLoader()
        self.spawner = EntitySpawnManager(self)
        self.hot_reloader = HotReloader(self._on_file_changed)
        self.dispatcher = CommandDispatcher()
        self.nexus = NexusApp(self)
        
        # LLM Subsystems
        self.llm_client = LLMClient(self.config.llm)
        self.prompt_manager = PromptManager()
        
        # Set global instance (must happen before commands import app_instance)
        app.app_instance = self
        
        # Internal state
        self._main_task: Optional[asyncio.Task] = None
        # ISO8601 UTC timestamp of last POST /content/cache/reload (for admin UI)
        self.last_content_reload_at: Optional[str] = None

    _LLM_PATCH_KEYS = frozenset({
        "primary_backend",
        "lm_studio_url",
        "lm_studio_key",
        "ollama_url",
        "timeout_seconds",
        "chat_model",
        "temperature",
        "cache_ttl",
    })

    def update_llm_settings(self, patch: Dict[str, Any], *, persist: bool = True) -> None:
        """Merge LLM fields, rebuild client, optionally write config/llm.toml."""
        data = {k: v for k, v in patch.items() if k in self._LLM_PATCH_KEYS and v is not None}
        if "primary_backend" in data:
            b = str(data["primary_backend"]).lower().strip()
            if b not in ("lm_studio", "ollama"):
                raise ValueError("primary_backend must be 'lm_studio' or 'ollama'")
            data["primary_backend"] = b
        if "timeout_seconds" in data:
            data["timeout_seconds"] = float(data["timeout_seconds"])
        if "temperature" in data:
            data["temperature"] = float(data["temperature"])
        if "cache_ttl" in data:
            data["cache_ttl"] = int(data["cache_ttl"])
        # model_copy(update=...) does not re-run field_validator; merge + validate so
        # lm_studio_url / ollama_url always get /v1 normalization (fixes GET /models on LM Studio).
        merged_llm = {**self.config.llm.model_dump(), **data}
        new_llm = LLMConfig.model_validate(merged_llm)
        self.config = self.config.model_copy(update={"llm": new_llm})
        self.llm_client.reconfigure(self.config.llm)
        if persist:
            save_llm_toml(self.config.llm)

    async def startup(self):
        """Initialize and start all sub-systems."""
        logger.info("Fablestar MUD Platform starting up...")
        
        # 0. Connect to state stores
        await self.redis.connect()
        
        # 1. Load Command Modules
        registry.reload_module("fablestar.commands.info")
        registry.reload_module("fablestar.commands.communication")
        registry.reload_module("fablestar.commands.movement")
        registry.reload_module("fablestar.commands.combat")
        registry.reload_module("fablestar.commands.items")
        registry.reload_module("fablestar.commands.admin")
        
        # 2. Register base tick handlers
        self.tick_manager.register(self._on_tick)
        self.tick_manager.register(self.spawner.on_tick)
        self.tick_manager.register(self.persistence.on_tick)
        
        # 2. Start subsystems
        await self.hot_reloader.start(["content", "src/fablestar/commands", "config", "prompts"])
        
        # 3. Start the Nexus (FastAPI) in the background
        asyncio.create_task(self.nexus.start())
        
        # 4. Start the tick loop
        self._main_task = asyncio.create_task(self.tick_manager.run())
        
        logger.info("Startup complete. Server is running.")

    async def shutdown(self):
        """Gracefully stop all sub-systems."""
        logger.info("Fablestar MUD Platform shutting down...")
        
        self.hot_reloader.stop()
        self.tick_manager.stop()
        await self.redis.disconnect()
        await self.db.close()

        if self._main_task:
            await self._main_task
            
        logger.info("Shutdown complete.")

    async def _authenticate_websocket(self, session: Session) -> Optional[Any]:
        """
        WebSocket player: first message must be JSON:
        {"username","password","character_id": optional int}
        Register accounts via POST /play/auth/register; pick a character in the UI when several exist.
        On failure, sends a JSON error line and returns None.
        """
        raw = await session.protocol.receive()
        if raw is None:
            return None
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            await session.send(json.dumps({"ok": False, "error": "invalid_handshake"}) + "\r\n")
            return None
        username = (data.get("username") or "").strip()
        password = (data.get("password") or "")
        char_id_raw = data.get("character_id")
        char_id: Optional[int] = None
        if char_id_raw is not None:
            try:
                char_id = int(char_id_raw)
            except (TypeError, ValueError):
                char_id = None
        if not username:
            await session.send(json.dumps({"ok": False, "error": "username_required"}) + "\r\n")
            return None

        async with self.db.session_factory() as db_session:
            result = await db_session.execute(
                select(Account).where(Account.username == username)
            )
            account = result.scalar_one_or_none()
            if not account or not bcrypt.checkpw(password.encode(), account.password_hash.encode()):
                await session.send(json.dumps({"ok": False, "error": "invalid_credentials"}) + "\r\n")
                return None

            result = await db_session.execute(
                select(Character)
                .where(Character.account_id == account.id)
                .order_by(Character.id)
            )
            characters = list(result.scalars().all())
            character: Optional[Character] = None
            if not characters:
                character = Character(
                    account_id=account.id,
                    name=username,
                    room_id="test_zone:entrance",
                )
                db_session.add(character)
            elif char_id is not None:
                character = next((c for c in characters if c.id == char_id), None)
                if character is None:
                    await session.send(json.dumps({"ok": False, "error": "character_not_found"}) + "\r\n")
                    return None
            elif len(characters) == 1:
                character = characters[0]
            else:
                await session.send(json.dumps({"ok": False, "error": "character_required"}) + "\r\n")
                return None

            account.last_login = datetime.utcnow()
            await db_session.commit()
            await db_session.refresh(character)

        return _snapshot_from_orm(character)

    async def play_login(self, username: str, password: str) -> Dict[str, Any]:
        """REST: validate credentials and list characters for the web UI."""
        username = (username or "").strip()
        if not username:
            return {"ok": False, "error": "username_required"}
        async with self.db.session_factory() as db_session:
            result = await db_session.execute(
                select(Account).where(Account.username == username)
            )
            account = result.scalar_one_or_none()
            if not account or not bcrypt.checkpw(password.encode(), account.password_hash.encode()):
                return {"ok": False, "error": "invalid_credentials"}
            result = await db_session.execute(
                select(Character)
                .where(Character.account_id == account.id)
                .order_by(Character.id)
            )
            characters = list(result.scalars().all())
            account.last_login = datetime.utcnow()
            chars_payload = [
                {"id": c.id, "name": c.name, "room_id": c.room_id} for c in characters
            ]
            aid = account.id
            uname = account.username
            await db_session.commit()
        return {
            "ok": True,
            "username": uname,
            "account_id": aid,
            "characters": chars_payload,
        }

    async def play_register(self, username: str, password: str) -> Dict[str, Any]:
        """REST: create account + default character."""
        username = (username or "").strip()
        if len(username) < 2:
            return {"ok": False, "error": "username_too_short"}
        if len(password) < 4:
            return {"ok": False, "error": "password_too_short"}
        async with self.db.session_factory() as db_session:
            result = await db_session.execute(
                select(Account).where(Account.username == username)
            )
            if result.scalar_one_or_none():
                return {"ok": False, "error": "username_taken"}
            pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
            account = Account(
                username=username,
                password_hash=pw_hash,
                last_login=datetime.utcnow(),
            )
            db_session.add(account)
            await db_session.flush()
            character = Character(
                account_id=account.id,
                name=username,
                room_id="test_zone:entrance",
            )
            db_session.add(character)
            await db_session.commit()
            await db_session.refresh(character)
            aid = account.id
            cid, cname, room_id = character.id, character.name, character.room_id
        return {
            "ok": True,
            "username": username,
            "account_id": aid,
            "characters": [{"id": cid, "name": cname, "room_id": room_id}],
        }

    async def _session_loop(self, session: Session):
        """Main input/output loop for a single session."""
        try:
            character = await self._authenticate_websocket(session)
            if character is None:
                return

            # Link session to the authenticated character
            self.session_manager.link_player(session.id, character.name)

            # Seed Redis with the character's current state
            await self.redis.set_player_location(character.name, character.room_id)
            await self.redis.set_player_stats(character.name, character.stats)
            await self.redis.set_player_inventory(character.name, character.inventory)

            # Initial look
            await self.dispatcher.dispatch(session, "look")
            await session.send_prompt()

            while session.protocol.is_connected:
                line = await session.protocol.receive()
                if line is None:
                    break

                if line:
                    await self.dispatcher.dispatch(session, line)

                await session.send_prompt()

        except Exception as e:
            logger.error(f"Error in session loop for {session.id}: {e}", exc_info=True)
        finally:
            # Final sync to DB before the session tears down
            if session.player_id:
                await self.persistence.sync_character(session.player_id)
            await self.session_manager.destroy_session(session.id)

    async def _on_file_changed(self, path: Path):
        """Handle hot-reload requests from the watcher."""
        logger.info(f"Hot-reload triggered for: {path}")
        
        if "content" in path.parts:
            self.content_loader.invalidate(path)
        
        if "prompts" in path.parts:
            self.prompt_manager.reload()
            
        if "commands" in path.parts:
            # path is something like f:/.../fablestar/commands/info.py
            # we need "fablestar.commands.info"
            parts = path.parts
            try:
                # Find where 'fablestar' starts to build the module path
                idx = parts.index("fablestar")
                module_path = ".".join(parts[idx:]).removesuffix(".py")
                registry.reload_module(module_path)
            except ValueError:
                logger.error(f"Could not determine module path for {path}")

    async def _on_tick(self, tick_count: int):
        """Core logic to run every tick."""
        # This will eventually trigger world updates, combat processing, etc.
        pass

async def run_server():
    """Entry point for running the server in an event loop."""
    import os
    from logging.handlers import RotatingFileHandler
    
    # Ensure logs directory
    os.makedirs("logs", exist_ok=True)
    
    # Setup dual logging (Console + File)
    log_formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s", datefmt="%H:%M:%S")
    
    # Console Handler
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(log_formatter)
    
    # File Handler (Persistent logging for the AI Architect)
    file_handler = RotatingFileHandler("logs/engine.log", maxBytes=5*1024*1024, backupCount=3)
    file_handler.setFormatter(log_formatter)
    
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    root_logger.addHandler(console_handler)
    root_logger.addHandler(file_handler)
    
    server = FablestarServer()
    await server.startup()

    # Await the tick loop task (is_running is set inside run(), so polling it races and exits immediately).
    try:
        if server._main_task:
            await server._main_task
    finally:
        await server.shutdown()
