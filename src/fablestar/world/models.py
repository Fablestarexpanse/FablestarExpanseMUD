from typing import Any, Dict, List, Optional, Set

from pydantic import BaseModel, Field

class ExitModel(BaseModel):
    destination: str
    description: str
    one_way: bool = False

class FeatureModel(BaseModel):
    id: str
    name: str
    keywords: List[str]
    description: str
    interaction: Optional[str] = "examine"

class EntitySpawnModel(BaseModel):
    template: str
    chance: float = 1.0
    max_count: int = 1

class HazardModel(BaseModel):
    id: str
    type: str
    severity: int
    description: str

class RoomModel(BaseModel):
    id: str
    zone: str
    type: str
    depth: int = 1
    group: Optional[str] = None
    description: Dict[str, str] = Field(default_factory=lambda: {"base": "A featureless room."})
    exits: Dict[str, ExitModel] = Field(default_factory=dict)
    features: List[FeatureModel] = Field(default_factory=list)
    entity_spawns: List[EntitySpawnModel] = Field(default_factory=list)
    hazards: List[HazardModel] = Field(default_factory=list)
    tags: Set[str] = Field(default_factory=set)

class ZoneModel(BaseModel):
    id: str
    name: str
    description: str
    depth_range: List[int] = Field(default_factory=lambda: [1, 3])

class EntityTemplate(BaseModel):
    id: str
    name: str
    type: str = "creature"
    description: Dict[str, str] = Field(default_factory=lambda: {"short": "A creature.", "long": "A creature lurks here."})
    stats: Dict[str, int] = Field(default_factory=lambda: {"hp": 10, "max_hp": 10, "attack": 3, "defense": 1})
    tags: Set[str] = Field(default_factory=set)
    loot: List[str] = Field(default_factory=list)  # item template IDs it may drop

class ItemTemplate(BaseModel):
    id: str
    name: str
    type: str = "misc"
    description: str = ""
    value: int = 0
    weight: float = 0.0
    tags: Set[str] = Field(default_factory=set)


class StarSystemModel(BaseModel):
    """On-disk star system YAML under content/world/systems/ (flexible bodies/connections)."""

    id: str
    name: str
    coordinates: Dict[str, float] = Field(default_factory=lambda: {"x": 0.0, "y": 0.0, "z": 0.0})
    star: Dict[str, str] = Field(default_factory=dict)
    faction: str = "neutral"
    security: str = "low"
    connections: List[Dict[str, Any]] = Field(default_factory=list)
    bodies: List[Dict[str, Any]] = Field(default_factory=list)


class ShipTemplate(BaseModel):
    """Ship interior graph source (content/world/ships/)."""

    id: str
    name: str
    size: str = "small"
    rooms: List[Dict[str, Any]] = Field(default_factory=list)


class GlyphEffectModel(BaseModel):
    type: str = "damage"
    magnitude: int = 0
    duration: int = 0
    cooldown: int = 0


class GlyphCostModel(BaseModel):
    energy: int = 0


class GlyphModel(BaseModel):
    """On-disk glyph ability YAML under content/world/glyphs/."""

    id: str
    name: str
    category: str = "combat"
    tier: int = 1
    body_slot: str = "forearm"
    description: str = ""
    inscription: str = ""
    effect: GlyphEffectModel = Field(default_factory=GlyphEffectModel)
    cost: GlyphCostModel = Field(default_factory=GlyphCostModel)
    prerequisites: List[str] = Field(default_factory=list)
    tags: Set[str] = Field(default_factory=set)
