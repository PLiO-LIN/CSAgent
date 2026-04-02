from __future__ import annotations

from importlib import import_module
import logging
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, Field

from config import BACKEND_DIR, CONFIG_FILE
from tool.base import ToolEntry, set_tool_visibility_provider

logger = logging.getLogger(__name__)


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


_TOOL_MODULE_ALIASES = {
    "search_knowledge": "knowledge",
}
_loaded_signature: tuple[str, ...] = ()
_visible_tool_names: set[str] = set()
_import_failures: dict[str, str] = {}


def _read_yaml(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    return raw if isinstance(raw, dict) else {}


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


def _plugin_settings() -> tuple[Path, set[str]]:
    raw = _read_yaml(CONFIG_FILE)
    section = raw.get("plugins") if isinstance(raw.get("plugins"), dict) else {}
    root_dir = str(section.get("root_dir", "../plugins") or "../plugins").strip() or "../plugins"
    enabled_ids = {
        str(item or "").strip()
        for item in (section.get("enabled_ids") or [])
        if str(item or "").strip()
    }
    root = (BACKEND_DIR / root_dir).resolve()
    return root, enabled_ids


def plugins_root() -> Path:
    root, _enabled_ids = _plugin_settings()
    return root


def discover_plugins() -> list[PluginManifest]:
    root, enabled_ids = _plugin_settings()
    if not root.exists():
        return []
    manifests: list[PluginManifest] = []
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


def discover_skills() -> list[SkillDescriptor]:
    skills: list[SkillDescriptor] = []
    for plugin in discover_plugins():
        plugin_dir = Path(plugin.path)
        skill_root = plugin_dir / "backend" / "skills"
        if not skill_root.exists():
            continue
        exported_names = {str(name or "").strip() for name in plugin.exports.skills if str(name or "").strip()}
        for skill_file in sorted(skill_root.rglob("SKILL.md")):
            raw = skill_file.read_text(encoding="utf-8")
            meta, _body = _parse_frontmatter(raw)
            skill_name = str(meta.get("name", skill_file.parent.name) or skill_file.parent.name).strip()
            if exported_names and skill_name not in exported_names:
                continue
            skills.append(
                SkillDescriptor(
                    plugin_id=plugin.plugin_id,
                    name=skill_name,
                    description=str(meta.get("description", "")),
                    version=str(meta.get("version", "0.1.0")),
                    tools=[str(item) for item in (meta.get("tools", []) or []) if str(item).strip()],
                    card_types=[str(item) for item in (meta.get("card_types", []) or []) if str(item).strip()],
                    global_tools=[str(item) for item in (meta.get("global_tools", []) or []) if str(item).strip()],
                    phases=[str(item) for item in (meta.get("phases", []) or []) if str(item).strip()],
                    entry_intents=[str(item) for item in (meta.get("entry_intents", []) or []) if str(item).strip()],
                    path=str(skill_file),
                )
            )
    return skills


def enabled_tool_names() -> set[str]:
    ensure_plugin_runtime_loaded()
    return set(_visible_tool_names)


def plugin_import_failures() -> dict[str, str]:
    ensure_plugin_runtime_loaded()
    return dict(_import_failures)


def ensure_plugin_runtime_loaded(force: bool = False) -> None:
    global _loaded_signature, _visible_tool_names, _import_failures

    plugins = discover_plugins()
    tool_names = {
        str(tool_name or "").strip()
        for plugin in plugins
        for tool_name in plugin.exports.tools
        if str(tool_name or "").strip()
    }
    signature = tuple(
        sorted(
            f"{plugin.plugin_id}:{plugin.version}:{','.join(sorted(plugin.exports.tools))}:{Path(plugin.path, 'plugin.yaml').stat().st_mtime_ns}"
            for plugin in plugins
        )
    )
    if not force and signature == _loaded_signature and tool_names == _visible_tool_names:
        return

    failures: dict[str, str] = {}
    visible_names: set[str] = set()
    for tool_name in sorted(tool_names):
        try:
            _import_tool_module(tool_name)
            visible_names.add(tool_name)
        except Exception as exc:
            failures[tool_name] = str(exc)
            logger.exception("Failed to import plugin tool module for %s", tool_name)

    _loaded_signature = signature
    _visible_tool_names = visible_names
    _import_failures = failures
    set_tool_visibility_provider(_is_tool_visible)


def _import_tool_module(tool_name: str) -> None:
    module_name = _TOOL_MODULE_ALIASES.get(tool_name, tool_name)
    import_module(f"tool.{module_name}")


def _is_tool_visible(entry: ToolEntry) -> bool:
    source = str(getattr(entry, "source", "") or "").strip().lower()
    if source.startswith("mcp:"):
        return True
    return entry.name in _visible_tool_names
