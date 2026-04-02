from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, Field


class AppSettings(BaseModel):
    name: str = "CSAgent"
    version: str = "0.1.0"
    mode: str = "legacy_bridge"


class ServerSettings(BaseModel):
    host: str = "0.0.0.0"
    port: int = 8200
    cors_origins: list[str] = Field(default_factory=lambda: ["*"])


class LegacyBridgeSettings(BaseModel):
    enabled: bool = True
    base_url: str = "http://127.0.0.1:8000"
    timeout_seconds: int = 120


class PluginSettings(BaseModel):
    root_dir: str = "../plugins"
    enabled_ids: list[str] = Field(default_factory=list)


class LLMSettings(BaseModel):
    provider: str = "openai_compatible"
    base_url: str = "https://api.siliconflow.cn/v1"
    api_key: str = ""
    chat_model: str = "Qwen/Qwen3-32B"


class NoteSettings(BaseModel):
    config_entry: str = "backend/config.yaml"
    purpose: str = "初版通用客服智能体框架骨架"


class Settings(BaseModel):
    app: AppSettings = Field(default_factory=AppSettings)
    server: ServerSettings = Field(default_factory=ServerSettings)
    legacy_bridge: LegacyBridgeSettings = Field(default_factory=LegacyBridgeSettings)
    plugins: PluginSettings = Field(default_factory=PluginSettings)
    llm: LLMSettings = Field(default_factory=LLMSettings)
    notes: NoteSettings = Field(default_factory=NoteSettings)


def project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def backend_root() -> Path:
    return Path(__file__).resolve().parents[1]


def config_path() -> Path:
    return backend_root() / "config.yaml"


def _read_yaml(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    return raw if isinstance(raw, dict) else {}


@lru_cache(maxsize=1)
def load_settings() -> Settings:
    return Settings(**_read_yaml(config_path()))


settings = load_settings()


def plugins_root() -> Path:
    return (backend_root() / settings.plugins.root_dir).resolve()
