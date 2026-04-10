import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Optional

import tomli
from pydantic import BaseModel, Field, SecretStr, field_validator

class ServerConfig(BaseModel):
    """Players connect via WebSocket on `websocket_port` (Nexus /play). Telnet is not used."""
    websocket_port: int = 4001
    max_connections: int = 100
    tick_rate: float = 0.25  # 4 ticks per second
    dev_mode: bool = False

class DatabaseConfig(BaseModel):
    host: str = "localhost"
    port: int = 5432
    database: str = "fablestar"
    user: str = "fablestar"
    password: Optional[str] = None
    pool_size: int = 10

class RedisConfig(BaseModel):
    host: str = "localhost"
    port: int = 6379
    db: int = 0
    password: Optional[str] = None

class LLMConfig(BaseModel):
    primary_backend: str = "lm_studio"
    lm_studio_url: str = "http://localhost:1234/v1"
    lm_studio_key: str = "not-needed"
    ollama_url: str = "http://localhost:11434/v1"
    anthropic_key: Optional[SecretStr] = None
    timeout_seconds: float = 10.0
    cache_ttl: int = 3600
    # OpenAI-compatible chat model id (LM Studio often ignores; Ollama uses this name)
    chat_model: str = "local-model"
    temperature: float = 0.7

    @field_validator("lm_studio_url", "ollama_url")
    @classmethod
    def _normalize_openai_base(cls, v: str) -> str:
        from fablestar.llm.openai_util import normalize_openai_compatible_base

        return normalize_openai_compatible_base(v)

class Config(BaseModel):
    server: ServerConfig = Field(default_factory=ServerConfig)
    database: DatabaseConfig = Field(default_factory=DatabaseConfig)
    redis: RedisConfig = Field(default_factory=RedisConfig)
    llm: LLMConfig = Field(default_factory=LLMConfig)

def load_config(config_dir: str = "config") -> Config:
    """Load configuration from TOML files in the specified directory."""
    config_path = Path(config_dir)
    data: Dict[str, Any] = {}

    # Load all .toml files in the config directory
    if config_path.exists():
        for toml_file in config_path.glob("*.toml"):
            section_name = toml_file.stem
            with open(toml_file, "rb") as f:
                section_data = tomli.load(f)
                data[section_name] = section_data

    # Environment variables can override (e.g., FABLESTAR_SERVER__WEBSOCKET_PORT=8001)
    # This is a simplified version of env override
    for key, value in os.environ.items():
        if key.startswith("FABLESTAR_"):
            parts = key[10:].lower().split("__")
            if len(parts) == 2:
                section, field = parts
                if section not in data:
                    data[section] = {}
                data[section][field] = value

    return Config(**data)
