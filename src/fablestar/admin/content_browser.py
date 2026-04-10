"""Scan on-disk YAML content for the Nexus admin API."""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml

logger = logging.getLogger(__name__)

ZONES_ROOT = Path("content/world/zones")
ITEMS_DIR = Path("content/world/items")
GLYPHS_DIR = Path("content/world/glyphs")


def _safe_segment(segment: str) -> bool:
    return bool(re.match(r"^[a-zA-Z0-9_-]+$", segment))


def list_zone_ids() -> List[str]:
    if not ZONES_ROOT.is_dir():
        return []
    return sorted(p.name for p in ZONES_ROOT.iterdir() if p.is_dir() and _safe_segment(p.name))


def zone_summary(zone_id: str) -> Optional[Dict[str, Any]]:
    if not _safe_segment(zone_id):
        return None
    zpath = ZONES_ROOT / zone_id
    if not zpath.is_dir():
        return None
    rooms_dir = zpath / "rooms"
    room_files = sorted(rooms_dir.glob("*.yaml")) if rooms_dir.is_dir() else []
    meta_path = zpath / "zone.yaml"
    name = zone_id
    ztype = "exploration"
    depth = 0
    status = "active"
    if meta_path.is_file():
        try:
            with open(meta_path, encoding="utf-8") as f:
                meta = yaml.safe_load(f) or {}
            name = meta.get("name", zone_id)
            ztype = meta.get("type", ztype)
            dr = meta.get("depth_range") or meta.get("depth")
            if isinstance(dr, list) and dr:
                depth = int(dr[0])
            elif isinstance(dr, int):
                depth = dr
            status = meta.get("status", status)
        except Exception as e:
            logger.debug("zone meta %s: %s", meta_path, e)
    entities = sum(
        _room_entity_count(rooms_dir / rf.name)
        for rf in room_files
    )
    return {
        "id": zone_id,
        "name": name,
        "rooms": len(room_files),
        "entities": entities,
        "players": 0,
        "status": status,
        "type": ztype,
        "depth": depth,
    }


def _room_entity_count(path: Path) -> int:
    try:
        with open(path, encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
        return len(data.get("entity_spawns") or [])
    except Exception:
        return 0


def list_zones() -> List[Dict[str, Any]]:
    return [z for z in (zone_summary(zid) for zid in list_zone_ids()) if z]


def room_row(zone_id: str, stem: str, data: Dict[str, Any]) -> Dict[str, Any]:
    exits = data.get("exits") or {}
    hazards = data.get("hazards") or []
    spawns = data.get("entity_spawns") or []
    features = data.get("features") or []
    rid = data.get("id") or f"{zone_id}:{stem}"
    return {
        "id": rid,
        "name": stem,
        "type": data.get("type", "?"),
        "exits": list(exits.keys()) if isinstance(exits, dict) else [],
        "entities": len(spawns),
        "hazards": len(hazards),
        "features": len(features),
        "depth": data.get("depth", 0),
    }


def list_rooms(zone_id: str) -> List[Dict[str, Any]]:
    if not _safe_segment(zone_id):
        return []
    rooms_dir = ZONES_ROOT / zone_id / "rooms"
    if not rooms_dir.is_dir():
        return []
    rows: List[Dict[str, Any]] = []
    for rf in sorted(rooms_dir.glob("*.yaml")):
        try:
            with open(rf, encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
            rows.append(room_row(zone_id, rf.stem, data))
        except Exception as e:
            logger.warning("Skip room %s: %s", rf, e)
            rows.append(
                {
                    "id": f"{zone_id}:{rf.stem}",
                    "name": rf.stem,
                    "type": "?",
                    "exits": [],
                    "entities": 0,
                    "hazards": 0,
                    "features": 0,
                    "depth": 0,
                    "error": str(e),
                }
            )
    return rows


def get_room_yaml(zone_id: str, room_slug: str) -> Optional[str]:
    if not _safe_segment(zone_id) or not _safe_segment(room_slug):
        return None
    path = ZONES_ROOT / zone_id / "rooms" / f"{room_slug}.yaml"
    if not path.is_file():
        return None
    return path.read_text(encoding="utf-8")


def aggregate_entity_spawns() -> List[Dict[str, Any]]:
    """Roll up entity_spawns.template across all rooms."""
    tally: Dict[str, Dict[str, Any]] = {}
    for zone_id in list_zone_ids():
        for row in list_rooms(zone_id):
            path = ZONES_ROOT / zone_id / "rooms" / f"{row['name']}.yaml"
            try:
                with open(path, encoding="utf-8") as f:
                    data = yaml.safe_load(f) or {}
                zone_name = zone_id
                for sp in data.get("entity_spawns") or []:
                    if isinstance(sp, dict):
                        tmpl = str(sp.get("template", "unknown"))
                    else:
                        tmpl = str(sp)
                    key = tmpl
                    if key not in tally:
                        tally[key] = {
                            "id": f"tpl:{tmpl}",
                            "name": tmpl,
                            "type": "spawn",
                            "zone": zone_name,
                            "level": 0,
                            "behavior": "spawn",
                            "status": "active",
                            "count": 0,
                        }
                    tally[key]["count"] += 1
            except Exception as e:
                logger.debug("entity scan %s: %s", path, e)
    return sorted(tally.values(), key=lambda x: x["name"])


def _scan_simple_content_dir(base: Path) -> List[Dict[str, Any]]:
    if not base.is_dir():
        return []
    rows: List[Dict[str, Any]] = []
    for f in sorted(base.glob("*.yaml")):
        try:
            with open(f, encoding="utf-8") as fp:
                data = yaml.safe_load(fp) or {}
            rows.append(
                {
                    "id": data.get("id", f.stem),
                    "name": data.get("name", f.stem),
                    **{k: data.get(k) for k in ("type", "rarity", "category", "tier") if k in data},
                }
            )
        except Exception:
            rows.append({"id": f.stem, "name": f.stem, "parse_error": True})
    return rows


def list_items() -> List[Dict[str, Any]]:
    return _scan_simple_content_dir(ITEMS_DIR)


def list_glyphs() -> List[Dict[str, Any]]:
    return _scan_simple_content_dir(GLYPHS_DIR)


def content_overview() -> Dict[str, Any]:
    zones = list_zones()
    total_rooms = sum(z["rooms"] for z in zones)
    spawns = aggregate_entity_spawns()
    spawn_total = sum(int(s.get("count", 0)) for s in spawns)
    return {
        "zones": zones,
        "zone_count": len(zones),
        "room_count": total_rooms,
        "entity_templates": len(spawns),
        "entity_spawn_references": spawn_total,
        "item_count": len(list_items()),
        "glyph_count": len(list_glyphs()),
    }
