from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, Field

from app.config import plugins_root, settings


class PluginExports(BaseModel):
    tools: list[str] = Field(default_factory=list)
    cards: list[str] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)


class PluginManifest(BaseModel):
    plugin_id: str
    name: str
    version: str = "0.1.0"
    sdk_version: str = "0.1.0"
    kind: str = "capability"
    enabled: bool = True
    owner: str = "platform"
    summary: str = ""
    exports: PluginExports = Field(default_factory=PluginExports)
    compatibility: dict[str, Any] = Field(default_factory=dict)
    dependencies: dict[str, Any] = Field(default_factory=dict)
    path: str = ""


class SkillDescriptor(BaseModel):
    plugin_id: str
    name: str
    description: str = ""
    version: str = "0.1.0"
    tools: list[str] = Field(default_factory=list)
    card_types: list[str] = Field(default_factory=list)
    global_tools: list[str] = Field(default_factory=list)
    phases: list[str] = Field(default_factory=list)
    entry_intents: list[str] = Field(default_factory=list)
    path: str = ""


def _read_yaml(path: Path) -> dict[str, Any]:
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    return raw if isinstance(raw, dict) else {}


def discover_plugins() -> list[PluginManifest]:
    root = plugins_root()
    if not root.exists():
        return []
    manifests: list[PluginManifest] = []
    enabled_ids = set(settings.plugins.enabled_ids or [])
    for plugin_dir in sorted(p for p in root.iterdir() if p.is_dir()):
        manifest_path = plugin_dir / "plugin.yaml"
        if not manifest_path.exists():
            continue
        data = _read_yaml(manifest_path)
        data["path"] = str(plugin_dir)
        plugin = PluginManifest(**data)
        if enabled_ids and plugin.plugin_id not in enabled_ids:
            continue
        if not plugin.enabled:
            continue
        manifests.append(plugin)
    return manifests


def _parse_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    if not text.startswith("---"):
        return {}, text
    end = text.find("---", 3)
    if end == -1:
        return {}, text
    frontmatter = text[3:end].strip()
    body = text[end + 3 :].strip()
    meta = yaml.safe_load(frontmatter) or {}
    return meta if isinstance(meta, dict) else {}, body


def discover_skills() -> list[SkillDescriptor]:
    skills: list[SkillDescriptor] = []
    for plugin in discover_plugins():
        plugin_dir = Path(plugin.path)
        skill_root = plugin_dir / "backend" / "skills"
        if not skill_root.exists():
            continue
        for skill_file in sorted(skill_root.rglob("SKILL.md")):
            raw = skill_file.read_text(encoding="utf-8")
            meta, _body = _parse_frontmatter(raw)
            skills.append(
                SkillDescriptor(
                    plugin_id=plugin.plugin_id,
                    name=str(meta.get("name", skill_file.parent.name)),
                    description=str(meta.get("description", "")),
                    version=str(meta.get("version", "0.1.0")),
                    tools=[str(item) for item in (meta.get("tools", []) or [])],
                    card_types=[str(item) for item in (meta.get("card_types", []) or [])],
                    global_tools=[str(item) for item in (meta.get("global_tools", []) or [])],
                    phases=[str(item) for item in (meta.get("phases", []) or [])],
                    entry_intents=[str(item) for item in (meta.get("entry_intents", []) or [])],
                    path=str(skill_file),
                )
            )
    return skills
