import asyncio
import json
import logging
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

import bcrypt
import httpx
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
from fablestar.integration.comfyui_client import generate_portrait_png

logger = logging.getLogger(__name__)

MAX_CHARACTERS_PER_ACCOUNT = 8


async def _ping_comfyui_http(base_url: str) -> tuple[bool, str]:
    """Return (reachable, error_message). Tries /system_stats then /queue (ComfyUI versions differ)."""
    base = (base_url or "").strip().rstrip("/")
    if not base:
        return False, "empty base_url"
    timeout = httpx.Timeout(4.0, connect=3.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.get(f"{base}/system_stats")
            if r.status_code == 200:
                return True, ""
            if r.status_code == 404:
                r2 = await client.get(f"{base}/queue")
                if r2.status_code == 200:
                    return True, ""
                return False, f"ComfyUI /queue HTTP {r2.status_code}"
            return False, f"ComfyUI /system_stats HTTP {r.status_code}"
    except httpx.ConnectError as e:
        return False, f"cannot connect (is ComfyUI running?): {e}"
    except httpx.TimeoutException:
        return False, "connection timed out"
    except Exception as e:
        return False, str(e)[:400]


def _workflow_has_checkpoint_simple_node(workflow_path: Path) -> bool:
    """True if API workflow JSON includes CheckpointLoaderSimple (needs comfyui.toml checkpoint_name)."""
    if not workflow_path.is_file():
        return False
    try:
        data = json.loads(workflow_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return False
    for v in data.values():
        if isinstance(v, dict) and v.get("class_type") == "CheckpointLoaderSimple":
            return True
    return False


CHAR_NAME_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9 _-]{1,49}$")


def _character_play_dict(character: Character) -> Dict[str, Any]:
    return {
        "id": character.id,
        "name": character.name,
        "room_id": character.room_id,
        "portrait_url": character.portrait_url,
        "portrait_prompt": character.portrait_prompt,
    }


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
                await session.send(json.dumps({"ok": False, "error": "no_character"}) + "\r\n")
                return None
            if char_id is not None:
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
            chars_payload = [_character_play_dict(c) for c in characters]
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
        """REST: create account (characters are added via character creation UI)."""
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
            await db_session.commit()
            await db_session.refresh(account)
            aid = account.id
        return {
            "ok": True,
            "username": username,
            "account_id": aid,
            "characters": [],
        }

    async def play_comfyui_status(self) -> Dict[str, Any]:
        c = self.config.comfyui
        wf = Path(c.workflow_path).is_file()
        ready = bool(c.enabled and wf)
        area_wp = (c.area_workflow_path or "").strip() or c.workflow_path
        area_wf = Path(area_wp).is_file()
        area_ready = bool(c.enabled and area_wf)
        ckpt_set = bool((c.checkpoint_name or "").strip())
        area_path = Path(area_wp)
        area_uses_ckpt_loader = _workflow_has_checkpoint_simple_node(area_path)
        suggest_checkpoint_name_in_toml = bool(
            c.enabled and area_wf and area_uses_ckpt_loader and not ckpt_set
        )
        comfy_reachable = False
        comfy_ping_error = ""
        if c.enabled:
            comfy_reachable, comfy_ping_error = await _ping_comfyui_http(c.base_url)
        return {
            "ok": True,
            "enabled": c.enabled,
            "base_url": c.base_url,
            "workflow_present": wf,
            "ready": ready,
            "area_workflow_present": area_wf,
            "area_ready": area_ready,
            "area_workflow_path": area_wp,
            "area_workflow_uses_checkpoint_loader": area_uses_ckpt_loader,
            "checkpoint_name_set": ckpt_set,
            "suggest_checkpoint_name_in_toml": suggest_checkpoint_name_in_toml,
            "comfy_reachable": comfy_reachable,
            "comfy_ping_error": comfy_ping_error,
        }

    async def forge_suggest_area_image_prompt(
        self,
        room_name: str,
        room_type: str,
        depth: int,
        description_base: str,
    ) -> Dict[str, Any]:
        """LM Studio / OpenAI-compatible: short ComfyUI prompt from room fields."""
        prompt = self.prompt_manager.render(
            "forge_area_image_prompt",
            room_name=room_name or "?",
            room_type=room_type or "chamber",
            room_depth=int(depth or 1),
            description_base=(description_base or "").strip(),
        )
        raw = await self.llm_client.generate(
            prompt,
            system_prompt="You output only a single image-generation prompt for Stable Diffusion or ComfyUI. No quotes, markdown, labels, or preamble.",
            max_tokens=400,
        )
        text = (raw or "").strip().strip('"').strip("'")
        text = " ".join(text.split())
        if len(text) < 8:
            return {"ok": False, "error": "llm_prompt_too_short", "detail": text or "(empty)"}
        return {"ok": True, "prompt": text[:2000]}

    async def forge_generate_room_area_image(
        self,
        image_prompt: str,
        *,
        zone_id: str = "",
        room_slug: str = "",
    ) -> Dict[str, Any]:
        """ComfyUI: save PNG; optional zone+slug writes next to room YAML for portable world content."""
        cfg = self.config.comfyui
        area_wp = (cfg.area_workflow_path or "").strip() or cfg.workflow_path
        ip = (image_prompt or "").strip()
        zid = (zone_id or "").strip()
        rslug = (room_slug or "").strip().removesuffix(".yaml")
        seg_ok = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$")
        bundle = bool(zid and rslug and seg_ok.match(zid) and seg_ok.match(rslug))
        logger.info(
            "forge room-area-image: enabled=%s area_workflow=%s exists=%s prompt_len=%s bundle=%s",
            cfg.enabled,
            area_wp,
            Path(area_wp).is_file(),
            len(ip),
            bundle,
        )
        if not cfg.enabled or not Path(area_wp).is_file():
            return {"ok": False, "error": "comfyui_not_configured"}

        from fablestar.integration.comfyui_client import generate_comfy_png

        try:
            png, _ = await generate_comfy_png(cfg, image_prompt, kind="area")
        except Exception as e:
            logger.warning("ComfyUI area image failed: %s", e, exc_info=True)
            return {"ok": False, "error": "comfyui_failed", "detail": str(e)}
        if bundle:
            zones_root = Path("content/world/zones").resolve()
            room_art_dir = Path("content/world/zones") / zid / "rooms" / "art" / rslug
            room_art_dir.mkdir(parents=True, exist_ok=True)
            gen_name = f"gen_{uuid.uuid4().hex[:12]}.png"
            dest = (room_art_dir / gen_name).resolve()
            try:
                dest.relative_to(zones_root)
            except ValueError:
                logger.warning("forge room-area-image: rejected path escape for %s/%s", zid, rslug)
                bundle = False
            else:
                dest.write_bytes(png)
                url = f"/media/room-art/{zid}/{rslug}/v/{gen_name}"
                logger.info("forge room-area-image: bundled %s", dest)
                return {"ok": True, "area_image_url": url, "bundled": True}
        out_dir = Path("data/rooms")
        out_dir.mkdir(parents=True, exist_ok=True)
        fname = f"{uuid.uuid4().hex}.png"
        dest = out_dir / fname
        dest.write_bytes(png)
        return {"ok": True, "area_image_url": f"/media/rooms/{fname}", "bundled": False}

    async def play_generate_portrait(self, username: str, password: str, appearance_prompt: str) -> Dict[str, Any]:
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

        cfg = self.config.comfyui
        if not cfg.enabled or not Path(cfg.workflow_path).is_file():
            return {
                "ok": True,
                "portrait_url": None,
                "note": "comfyui_not_configured",
            }

        try:
            png, _ = await generate_portrait_png(cfg, appearance_prompt)
        except Exception as e:
            logger.warning("ComfyUI portrait failed: %s", e, exc_info=True)
            return {"ok": False, "error": "comfyui_failed", "detail": str(e)}

        out_dir = Path("data/portraits")
        out_dir.mkdir(parents=True, exist_ok=True)
        fname = f"{uuid.uuid4().hex}.png"
        dest = out_dir / fname
        dest.write_bytes(png)
        url = f"/media/portraits/{fname}"
        return {"ok": True, "portrait_url": url}

    async def play_create_character(
        self,
        username: str,
        password: str,
        name: str,
        portrait_prompt: str = "",
        portrait_url: str = "",
    ) -> Dict[str, Any]:
        username = (username or "").strip()
        name = (name or "").strip()
        if not username:
            return {"ok": False, "error": "username_required"}
        if not CHAR_NAME_RE.match(name):
            return {"ok": False, "error": "invalid_character_name"}

        p_url = (portrait_url or "").strip() or None
        if p_url:
            if not p_url.startswith("/media/portraits/") or ".." in p_url or len(p_url) > 2048:
                return {"ok": False, "error": "invalid_portrait_url"}

        pp = (portrait_prompt or "").strip() or None
        if pp and len(pp) > 4000:
            return {"ok": False, "error": "portrait_prompt_too_long"}

        async with self.db.session_factory() as db_session:
            result = await db_session.execute(
                select(Account).where(Account.username == username)
            )
            account = result.scalar_one_or_none()
            if not account or not bcrypt.checkpw(password.encode(), account.password_hash.encode()):
                return {"ok": False, "error": "invalid_credentials"}

            result = await db_session.execute(
                select(Character).where(Character.account_id == account.id)
            )
            existing = list(result.scalars().all())
            if len(existing) >= MAX_CHARACTERS_PER_ACCOUNT:
                return {"ok": False, "error": "character_limit"}

            taken = await db_session.execute(select(Character).where(Character.name == name))
            if taken.scalar_one_or_none():
                return {"ok": False, "error": "character_name_taken"}

            character = Character(
                account_id=account.id,
                name=name,
                room_id="test_zone:entrance",
                portrait_url=p_url,
                portrait_prompt=pp,
            )
            db_session.add(character)
            await db_session.commit()
            await db_session.refresh(character)
            payload = _character_play_dict(character)
            result = await db_session.execute(
                select(Character)
                .where(Character.account_id == account.id)
                .order_by(Character.id)
            )
            all_chars = [_character_play_dict(c) for c in result.scalars().all()]

        return {"ok": True, "character": payload, "characters": all_chars}

    async def play_refresh_characters(self, username: str, password: str) -> Dict[str, Any]:
        """Re-list characters after create (same shape as login)."""
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
            chars_payload = [_character_play_dict(c) for c in characters]
            aid = account.id
            uname = account.username
        return {"ok": True, "username": uname, "account_id": aid, "characters": chars_payload}

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
