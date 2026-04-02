"""
Skill 规约系统（v2）：从 .md 文件加载技能定义。

技能文件位于 backend/skill/skills/<name>/SKILL.md，使用 YAML frontmatter：
---
name: query
description: 查询技能
tools:
  - query_package
  - query_balance
---
<markdown prompt content>

工具分为两类：
- 全局工具（scope="global"）：始终可用，如 load_skills
- 技能工具（scope="skill"）：仅当对应技能被加载后才可用
"""
import os
import logging
from pathlib import Path
from dataclasses import dataclass, field
from provider.base import ToolDef
from tool.base import get_tool, ToolEntry, global_tool_defs

logger = logging.getLogger(__name__)

SKILLS_DIR = Path(__file__).parent / "skills"


@dataclass
class Skill:
    name: str
    description: str
    tools: list[str] = field(default_factory=list)
    prompt: str = ""

    def available_tools(self) -> list[ToolDef]:
        """返回该技能声明的工具定义列表"""
        result = []
        for name in self.tools:
            entry = get_tool(name)
            if entry:
                result.append(entry.to_def())
        return result

    def get_entries(self) -> list[ToolEntry]:
        result = []
        for name in self.tools:
            entry = get_tool(name)
            if entry:
                result.append(entry)
        return result


# ─── 技能加载 ───

_skill_cache: dict[str, Skill] = {}


def _parse_frontmatter(text: str) -> tuple[dict, str]:
    """解析 YAML frontmatter + markdown body"""
    if not text.startswith("---"):
        return {}, text
    end = text.find("---", 3)
    if end == -1:
        return {}, text
    fm_text = text[3:end].strip()
    body = text[end + 3:].strip()
    meta: dict = {}
    current_key = None
    current_list: list[str] | None = None
    for line in fm_text.split("\n"):
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("- ") and current_list is not None:
            current_list.append(stripped[2:].strip())
        elif ":" in stripped:
            if current_key and current_list is not None:
                meta[current_key] = current_list
            key, val = stripped.split(":", 1)
            key = key.strip()
            val = val.strip()
            if val:
                meta[key] = val
                current_key = None
                current_list = None
            else:
                current_key = key
                current_list = []
        else:
            if current_key and current_list is not None:
                current_list.append(stripped)
    if current_key and current_list is not None:
        meta[current_key] = current_list
    return meta, body


def _load_all_skills() -> dict[str, Skill]:
    """扫描 skills 目录，加载所有 SKILL.md"""
    if _skill_cache:
        return _skill_cache
    if not SKILLS_DIR.is_dir():
        logger.warning("Skills directory not found: %s", SKILLS_DIR)
        return {}
    for entry in SKILLS_DIR.iterdir():
        if not entry.is_dir():
            continue
        skill_file = entry / "SKILL.md"
        if not skill_file.exists():
            continue
        try:
            raw = skill_file.read_text(encoding="utf-8")
            meta, body = _parse_frontmatter(raw)
            name = meta.get("name", entry.name)
            desc = meta.get("description", "")
            enabled = str(meta.get("enabled", "true")).strip().lower() not in {"false", "0", "no"}
            tools = meta.get("tools", [])
            if isinstance(tools, str):
                tools = [tools]
            tools = [t for t in tools if str(t).strip()]
            if not enabled:
                logger.info("Skip disabled skill: %s", name)
                continue
            if not tools:
                logger.info("Skip non-scenario skill without tools: %s", name)
                continue
            skill = Skill(name=name, description=desc, tools=tools, prompt=body)
            _skill_cache[name] = skill
            logger.info("Loaded skill: %s (tools=%s)", name, tools)
        except Exception as e:
            logger.error("Failed to load skill from %s: %s", skill_file, e)
    return _skill_cache


def list_skills() -> list[Skill]:
    """返回所有可用技能"""
    return list(_load_all_skills().values())


def get_skill(name: str) -> Skill | None:
    """按名称获取技能"""
    skills = _load_all_skills()
    return skills.get(name)


def resolve(name: str | None = None) -> Skill:
    """兼容旧接口：按名称解析技能，找不到返回 None 而不是默认"""
    if not name:
        return Skill(name="default", description="默认（无技能加载）")
    skill = get_skill(name)
    return skill if skill else Skill(name="default", description="默认（无技能加载）")


def reload_skills() -> None:
    """清除缓存，重新加载所有技能"""
    _skill_cache.clear()
    _load_all_skills()
